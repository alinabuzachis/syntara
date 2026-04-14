"""Service for system-level group→role assignments."""

from uuid import UUID

import structlog
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.authz.models.assignments import GroupRoleAssignment
from nexus.authz.models.role import Role
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

    async def assign_role(self, group_id: UUID, role_id: UUID) -> GroupRoleAssignment:
        """Assign a role to a group.

        Args:
            group_id: The group to assign the role to.
            role_id: The role to assign.

        Returns:
            The created assignment.

        Raises:
            SafeValueError: If group or role not found, or already assigned.

        """
        group = await self._get_group(group_id)
        role = await self._get_role(role_id)

        # Check for duplicate
        existing = await self.session.exec(
            select(GroupRoleAssignment).where(
                GroupRoleAssignment.group_id == group_id,
                GroupRoleAssignment.role_id == role_id,
            )
        )
        if existing.one_or_none():
            msg = f"Role '{role.name}' is already assigned to group '{group.name}'"
            raise SafeValueError(msg)

        assignment = GroupRoleAssignment(group_id=group_id, role_id=role_id)
        self.session.add(assignment)
        await self.session.commit()
        await self.session.refresh(assignment)

        logger.info(
            "Assigned role to group",
            group_id=str(group_id),
            group_name=group.name,
            role_id=str(role_id),
            role_name=role.name,
        )
        return assignment

    async def list_assignments(self) -> list[dict[str, str | None]]:
        """List all group→role assignments with names resolved."""
        result = await self.session.exec(
            select(GroupRoleAssignment, Group.name, Role.name)
            .join(Group, GroupRoleAssignment.group_id == Group.id)  # type: ignore[arg-type]
            .join(Role, GroupRoleAssignment.role_id == Role.id)  # type: ignore[arg-type]
        )
        return [
            {
                "id": str(a.id),
                "group_id": str(a.group_id),
                "group_name": group_name,
                "role_id": str(a.role_id),
                "role_name": role_name,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a, group_name, role_name in result.all()
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

    async def _get_group(self, group_id: UUID) -> Group:
        group = await self.session.get(Group, group_id)
        if not group:
            msg = f"Group {group_id} not found"
            raise SafeValueError(msg)
        return group

    async def _get_role(self, role_id: UUID) -> Role:
        role = await self.session.get(Role, role_id)
        if not role:
            msg = f"Role {role_id} not found"
            raise SafeValueError(msg)
        return role
