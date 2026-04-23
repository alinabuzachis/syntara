"""Service for system-level group→role assignments."""

from uuid import UUID

import structlog
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.authz.models.assignments import GroupRoleAssignment
from nexus.authz.models.project import Project
from nexus.authz.role_conventions import is_builtin_role
from nexus.core.exceptions import SafeValueError
from nexus.core.models import User
from nexus.core.models.group import Group

logger = structlog.stdlib.get_logger(__name__)


class GroupRoleService:
    """Service for managing system-level group→role assignments."""

    def __init__(self, session: AsyncSession, user: User) -> None:
        """Initialize with database session and current user."""
        self.session = session
        self.user = user

    async def assign_role(self, group_id: UUID, role_name: str) -> GroupRoleAssignment:
        """Assign a role to a group.

        Args:
            group_id: The group to assign the role to.
            role_name: The role name to assign.

        Returns:
            The created assignment.

        Raises:
            SafeValueError: If group not found, role unknown, or already assigned.

        """
        group = await self._get_group(group_id)

        if not await self._role_exists(role_name):
            msg = f"Role '{role_name}' not found"
            raise SafeValueError(msg)

        existing = await self.session.exec(
            select(GroupRoleAssignment).where(
                GroupRoleAssignment.group_id == group_id,
                GroupRoleAssignment.role_name == role_name,
            )
        )
        if existing.one_or_none():
            msg = f"Role '{role_name}' is already assigned to group '{group.name}'"
            raise SafeValueError(msg)

        assignment = GroupRoleAssignment(group_id=group_id, role_name=role_name)
        self.session.add(assignment)
        await self.session.commit()
        await self.session.refresh(assignment)

        logger.info(
            "Assigned role to group",
            group_id=str(group_id),
            group_name=group.name,
            role_name=role_name,
        )
        return assignment

    async def list_assignments(self, *, group_ids: list[UUID] | None = None) -> list[dict[str, str | None]]:
        """List group→role assignments with group names and project info resolved.

        Args:
            group_ids: If provided, only return assignments for these groups.

        """
        stmt = (
            select(GroupRoleAssignment, Group.name, Project.name)
            .join(Group, GroupRoleAssignment.group_id == Group.id)  # type: ignore[arg-type]
            .outerjoin(Project, GroupRoleAssignment.project_id == Project.id)  # type: ignore[arg-type]
        )
        if group_ids is not None:
            stmt = stmt.where(GroupRoleAssignment.group_id.in_(group_ids))  # type: ignore[attr-defined]
        result = await self.session.exec(stmt)
        return [
            {
                "id": str(a.id),
                "group_id": str(a.group_id),
                "group_name": group_name,
                "role_name": a.role_name,
                "project_id": str(a.project_id) if a.project_id else None,
                "project_name": project_name,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a, group_name, project_name in result.all()
        ]

    async def revoke_assignment(self, assignment_id: UUID) -> None:
        """Remove a group→role assignment.

        Args:
            assignment_id: The assignment to remove.

        Raises:
            SafeValueError: If assignment not found.

        """
        assignment = await self.session.get(GroupRoleAssignment, assignment_id)
        if not assignment:
            msg = f"Group role assignment {assignment_id} not found"
            raise SafeValueError(msg)

        await self.session.delete(assignment)
        await self.session.commit()

        logger.info("Revoked group role assignment", assignment_id=str(assignment_id))

    async def _role_exists(self, role_name: str) -> bool:
        """Check if a role exists as a builtin or custom role in the DB."""
        if is_builtin_role(role_name):
            return True
        from nexus.authz.models.role import Role  # noqa: PLC0415

        result = await self.session.exec(select(Role).where(Role.name == role_name))
        return result.first() is not None

    async def _get_group(self, group_id: UUID) -> Group:
        group = await self.session.get(Group, group_id)
        if not group:
            msg = f"Group {group_id} not found"
            raise SafeValueError(msg)
        return group
