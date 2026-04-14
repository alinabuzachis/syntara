"""System-level group→role assignment API endpoints."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import Depends, status
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.auth import get_current_user
from nexus.authz.dependencies import PermissionChecker
from nexus.authz.services.group_role_service import GroupRoleService
from nexus.core.database.session import get_db
from nexus.core.models import User
from nexus.core.nexus_router import NO_PERMISSION, NexusRouter

router = NexusRouter(prefix="/group-role-assignments", tags=["group-role-assignments"])


class GroupRoleAssignmentCreate(SQLModel):
    """Request body for assigning a role to a group."""

    group_id: UUID
    role_id: UUID


class GroupRoleAssignmentRead(SQLModel):
    """Response body for a group→role assignment."""

    id: str
    group_id: str
    group_name: str
    role_id: str
    role_name: str
    created_at: datetime | None = None


def get_group_role_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> GroupRoleService:
    """Dependency provider for GroupRoleService."""
    return GroupRoleService(db, current_user)


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(PermissionChecker("group-role", "assign", roles=["admin"]))],
)
async def assign_group_role(
    body: GroupRoleAssignmentCreate,
    service: Annotated[GroupRoleService, Depends(get_group_role_service)],
) -> GroupRoleAssignmentRead:
    """Assign a role to a group (system-level). Requires: admin permission."""
    assignment = await service.assign_role(
        group_id=body.group_id,
        role_id=body.role_id,
    )
    # Resolve names for the response
    assignments = await service.list_assignments()
    match = next((a for a in assignments if a["id"] == str(assignment.id)), None)
    if match:
        return GroupRoleAssignmentRead(**match)
    return GroupRoleAssignmentRead(
        id=str(assignment.id),
        group_id=str(assignment.group_id),
        group_name="",
        role_id=str(assignment.role_id),
        role_name="",
        created_at=assignment.created_at,
    )


@router.get("", dependencies=[NO_PERMISSION])
async def list_group_role_assignments(
    service: Annotated[GroupRoleService, Depends(get_group_role_service)],
) -> list[GroupRoleAssignmentRead]:
    """List all system-level group→role assignments."""
    assignments = await service.list_assignments()
    return [GroupRoleAssignmentRead(**a) for a in assignments]


@router.delete(
    "/{assignment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(PermissionChecker("group-role", "revoke", roles=["admin"]))],
)
async def revoke_group_role_assignment(
    assignment_id: UUID,
    service: Annotated[GroupRoleService, Depends(get_group_role_service)],
) -> None:
    """Remove a group→role assignment. Requires: admin permission."""
    await service.revoke_assignment(assignment_id)
