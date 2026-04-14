"""Service for system-level user→role assignments."""

from uuid import UUID

import structlog
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.authz.models.assignments import UserRoleAssignment
from nexus.authz.models.role import Role
from nexus.core.exceptions import SafeValueError
from nexus.core.models import User

logger = structlog.stdlib.get_logger(__name__)


class UserRoleService:
    """Service for managing system-level user→role assignments."""

    def __init__(self, session: AsyncSession, user: User) -> None:
        """Initialize with database session and current user."""
        self.session = session
        self.user = user

    async def assign_role(self, user_id: UUID, role_id: UUID) -> UserRoleAssignment:
        """Assign a role directly to a user.

        Args:
            user_id: The user to assign the role to.
            role_id: The role to assign.

        Returns:
            The created assignment.

        Raises:
            SafeValueError: If user or role not found, or already assigned.

        """
        target_user = await self.session.get(User, user_id)
        if not target_user:
            msg = f"User {user_id} not found"
            raise SafeValueError(msg)

        role = await self.session.get(Role, role_id)
        if not role:
            msg = f"Role {role_id} not found"
            raise SafeValueError(msg)

        existing = await self.session.exec(
            select(UserRoleAssignment).where(
                UserRoleAssignment.user_id == user_id,
                UserRoleAssignment.role_id == role_id,
            )
        )
        if existing.one_or_none():
            msg = f"Role '{role.name}' is already assigned to user '{target_user.username}'"
            raise SafeValueError(msg)

        assignment = UserRoleAssignment(user_id=user_id, role_id=role_id)
        self.session.add(assignment)
        await self.session.commit()
        await self.session.refresh(assignment)

        logger.info(
            "Assigned role to user",
            user_id=str(user_id),
            username=target_user.username,
            role_id=str(role_id),
            role_name=role.name,
        )
        return assignment

    async def list_assignments(self) -> list[dict[str, str | None]]:
        """List all user→role assignments with names resolved."""
        result = await self.session.exec(
            select(UserRoleAssignment, User.username, Role.name)
            .join(User, UserRoleAssignment.user_id == User.id)  # type: ignore[arg-type]
            .join(Role, UserRoleAssignment.role_id == Role.id)  # type: ignore[arg-type]
        )
        return [
            {
                "id": str(a.id),
                "user_id": str(a.user_id),
                "username": username,
                "role_id": str(a.role_id),
                "role_name": role_name,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a, username, role_name in result.all()
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
