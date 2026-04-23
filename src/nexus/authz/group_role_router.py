"""System-level group→role assignment API endpoints."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Request, status
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.auth import get_current_user
from nexus.authz.dependencies import PermissionChecker, get_opa_client
from nexus.authz.engine import AuthzRequest, authorize
from nexus.authz.resolver import get_user_group_ids
from nexus.authz.services.group_role_service import GroupRoleService
from nexus.core.database.session import get_db
from nexus.core.models import User
from nexus.core.nexus_router import NO_PERMISSION, NexusRouter

router = NexusRouter(prefix="/group-role-assignments", tags=["Group Role Assignments"])


class GroupRoleAssignmentCreate(SQLModel):
    """Request body for assigning a role to a group."""

    group_id: UUID
    role_name: str


class GroupRoleAssignmentRead(SQLModel):
    """Response body for a group-to-role assignment."""

    id: str
    group_id: str
    group_name: str
    role_name: str
    project_id: str | None = None
    project_name: str | None = None
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
    dependencies=[Depends(PermissionChecker("group-role", "assign"))],
    operation_id="assign_group_role",
    response_description="Role assigned to group",
)
async def assign_group_role(
    body: GroupRoleAssignmentCreate,
    service: Annotated[GroupRoleService, Depends(get_group_role_service)],
) -> GroupRoleAssignmentRead:
    """Assign a role to a group (system-level). Requires: admin permission."""
    assignment = await service.assign_role(
        group_id=body.group_id,
        role_name=body.role_name,
    )
    assignments = await service.list_assignments()
    match = next((a for a in assignments if a["id"] == str(assignment.id)), None)
    if match:
        return GroupRoleAssignmentRead(**match)
    return GroupRoleAssignmentRead(
        id=str(assignment.id),
        group_id=str(assignment.group_id),
        group_name="",
        role_name=assignment.role_name,
        created_at=assignment.created_at,
    )


@router.get(
    "",
    dependencies=[NO_PERMISSION],
    operation_id="list_group_role_assignments",
    response_description="List of group-role assignments",
)
async def list_group_role_assignments(
    request: Request,
    service: Annotated[GroupRoleService, Depends(get_group_role_service)],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[GroupRoleAssignmentRead]:
    """List system-level group→role assignments.

    Admin/auditor see all assignments; other users see only assignments
    for groups they belong to.
    """
    opa_client = get_opa_client(request)
    authz_result = await authorize(
        db,
        opa_client,
        AuthzRequest(
            user_id=current_user.id,
            action="read",
            resource_type="group-role",
            resource_id="",
            user_labels=current_user.labels,
            user_metadata=current_user.authz_metadata,
        ),
    )
    group_ids = None
    if not authz_result.allowed:
        group_ids = await get_user_group_ids(db, current_user.id)
    assignments = await service.list_assignments(group_ids=group_ids)
    return [GroupRoleAssignmentRead(**a) for a in assignments]


@router.delete(
    "/{assignment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(PermissionChecker("group-role", "revoke"))],
    operation_id="revoke_group_role_assignment",
    response_description="Assignment removed",
)
async def revoke_group_role_assignment(
    assignment_id: UUID,
    service: Annotated[GroupRoleService, Depends(get_group_role_service)],
) -> None:
    """Remove a group→role assignment. Requires: admin permission."""
    await service.revoke_assignment(assignment_id)
