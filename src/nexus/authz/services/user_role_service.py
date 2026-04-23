"""Service for system-level user→role assignments."""

from uuid import UUID

import structlog
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.authz.models.assignments import UserRoleAssignment
from nexus.authz.models.project import Project
from nexus.authz.role_conventions import is_builtin_role
from nexus.core.exceptions import SafeValueError
from nexus.core.models import User

logger = structlog.stdlib.get_logger(__name__)


class UserRoleService:
    """Service for managing system-level user→role assignments."""

    def __init__(self, session: AsyncSession, user: User) -> None:
        """Initialize with database session and current user."""
        self.session = session
        self.user = user

    async def assign_role(self, user_id: UUID, role_name: str) -> UserRoleAssignment:
        """Assign a role directly to a user.

        Args:
            user_id: The user to assign the role to.
            role_name: The role name to assign.

        Returns:
            The created assignment.

        Raises:
            SafeValueError: If user not found, role unknown, or already assigned.

        """
        target_user = await self.session.get(User, user_id)
        if not target_user:
            msg = f"User {user_id} not found"
            raise SafeValueError(msg)

        if not await self._role_exists(role_name):
            msg = f"Role '{role_name}' not found"
            raise SafeValueError(msg)

        existing = await self.session.exec(
            select(UserRoleAssignment).where(
                UserRoleAssignment.user_id == user_id,
                UserRoleAssignment.role_name == role_name,
            )
        )
        if existing.one_or_none():
            msg = f"Role '{role_name}' is already assigned to user '{target_user.username}'"
            raise SafeValueError(msg)

        assignment = UserRoleAssignment(user_id=user_id, role_name=role_name)
        self.session.add(assignment)
        await self.session.commit()
        await self.session.refresh(assignment)

        logger.info(
            "Assigned role to user",
            user_id=str(user_id),
            username=target_user.username,
            role_name=role_name,
        )
        return assignment

    async def list_assignments(self, *, user_id: UUID | None = None) -> list[dict[str, str | None]]:
        """List user→role assignments with usernames and project info resolved.

        Args:
            user_id: If provided, only return assignments for this user.

        """
        stmt = (
            select(UserRoleAssignment, User.username, Project.name)
            .join(User, UserRoleAssignment.user_id == User.id)  # type: ignore[arg-type]
            .outerjoin(Project, UserRoleAssignment.project_id == Project.id)  # type: ignore[arg-type]
        )
        if user_id is not None:
            stmt = stmt.where(UserRoleAssignment.user_id == user_id)
        result = await self.session.exec(stmt)
        return [
            {
                "id": str(a.id),
                "user_id": str(a.user_id),
                "username": username,
                "role_name": a.role_name,
                "project_id": str(a.project_id) if a.project_id else None,
                "project_name": project_name,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a, username, project_name in result.all()
        ]

    async def revoke_assignment(self, assignment_id: UUID) -> None:
        """Remove a user→role assignment.

        Args:
            assignment_id: The assignment to remove.

        Raises:
            SafeValueError: If assignment not found.

        """
        assignment = await self.session.get(UserRoleAssignment, assignment_id)
        if not assignment:
            msg = f"User role assignment {assignment_id} not found"
            raise SafeValueError(msg)

        await self.session.delete(assignment)
        await self.session.commit()

        logger.info("Revoked user role assignment", assignment_id=str(assignment_id))

    async def _role_exists(self, role_name: str) -> bool:
        """Check if a role exists as a builtin or custom role in the DB."""
        if is_builtin_role(role_name):
            return True
        from nexus.authz.models.role import Role  # noqa: PLC0415

        result = await self.session.exec(select(Role).where(Role.name == role_name))
        return result.first() is not None
