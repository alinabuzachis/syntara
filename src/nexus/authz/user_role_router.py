"""System-level user→role assignment API endpoints."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import Depends, status
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.auth import get_current_user
from nexus.authz.dependencies import PermissionChecker
from nexus.authz.services.user_role_service import UserRoleService
from nexus.core.database.session import get_db
from nexus.core.models import User
from nexus.core.nexus_router import NO_PERMISSION, NexusRouter

router = NexusRouter(prefix="/user-role-assignments", tags=["UserRoleAssignments"])


class UserRoleAssignmentCreate(SQLModel):
    """Request body for assigning a role to a user."""

    user_id: UUID
    role_id: UUID


class UserRoleAssignmentRead(SQLModel):
    """Response body for a user→role assignment."""

    id: str
    user_id: str
    username: str
    role_id: str
    role_name: str
    created_at: datetime | None = None


def get_user_role_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> UserRoleService:
    """Dependency provider for UserRoleService."""
    return UserRoleService(db, current_user)


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(PermissionChecker("user-role", "assign", roles=["admin"]))],
    operation_id="assign_user_role",
    response_description="Role assigned to user",
)
async def assign_user_role(
    body: UserRoleAssignmentCreate,
    service: Annotated[UserRoleService, Depends(get_user_role_service)],
) -> UserRoleAssignmentRead:
    """Assign a role directly to a user (system-level). Requires: admin permission."""
    assignment = await service.assign_role(
        user_id=body.user_id,
        role_id=body.role_id,
    )
    assignments = await service.list_assignments()
    match = next((a for a in assignments if a["id"] == str(assignment.id)), None)
    if match:
        return UserRoleAssignmentRead(**match)
    return UserRoleAssignmentRead(
        id=str(assignment.id),
        user_id=str(assignment.user_id),
        username="",
        role_id=str(assignment.role_id),
        role_name="",
        created_at=assignment.created_at,
    )


@router.get(
    "",
    dependencies=[NO_PERMISSION],
    operation_id="list_user_role_assignments",
    response_description="List of user-role assignments",
)
async def list_user_role_assignments(
    service: Annotated[UserRoleService, Depends(get_user_role_service)],
) -> list[UserRoleAssignmentRead]:
    """List all system-level user→role assignments."""
    assignments = await service.list_assignments()
    return [UserRoleAssignmentRead(**a) for a in assignments]


@router.delete(
    "/{assignment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(PermissionChecker("user-role", "revoke", roles=["admin"]))],
    operation_id="revoke_user_role_assignment",
    response_description="Assignment removed",
)
async def revoke_user_role_assignment(
    assignment_id: UUID,
    service: Annotated[UserRoleService, Depends(get_user_role_service)],
) -> None:
    """Remove a user→role assignment. Requires: admin permission."""
    await service.revoke_assignment(assignment_id)
