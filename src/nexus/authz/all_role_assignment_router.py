"""Unified role-assignment list: user + group assignments in a single paginated stream."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Request
from sqlmodel import Field, SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.auth import get_current_user
from nexus.authz.dependencies import get_opa_client
from nexus.authz.engine import AuthzRequest, authorize
from nexus.authz.resolver import get_user_group_ids
from nexus.authz.services.all_role_assignment_service import AllRoleAssignmentService
from nexus.core.database.session import get_db
from nexus.core.models import User
from nexus.core.models.base import BaseListParams
from nexus.core.models.pagination import ResourcesResponse
from nexus.core.nexus_router import NO_PERMISSION, NexusRouter

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class AllRoleAssignmentRead(SQLModel):
    """A single role assignment (user or group)."""

    id: str
    principal_id: str
    principal_name: str
    principal_type: str
    role_name: str
    project_id: str | None = None
    project_name: str | None = None
    created_at: datetime | None = None


class AllRoleAssignmentListResponse(ResourcesResponse[AllRoleAssignmentRead]):
    """Paginated response for all role assignments."""


class AllRoleAssignmentListParams(BaseListParams):
    """Query parameters for listing all role assignments."""

    principal_type: str | None = Field(default=None, description="Filter by principal type: user or group")
    principal_name: str | None = Field(default=None, description="Filter by principal name (username or group name)")
    role_name: str | None = Field(default=None, description="Filter by role name")
    project_id: UUID | None = Field(default=None, description="Filter by project ID")


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = NexusRouter(prefix="/all-role-assignments", tags=["All Role Assignments"])


def _get_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> AllRoleAssignmentService:
    return AllRoleAssignmentService(db, current_user)


@router.get(
    "",
    dependencies=[NO_PERMISSION],
    operation_id="list_all_role_assignments",
    response_description="Paginated list of role assignments",
)
async def list_all_role_assignments(
    request: Request,
    params: Annotated[AllRoleAssignmentListParams, Depends()],
    service: Annotated[AllRoleAssignmentService, Depends(_get_service)],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AllRoleAssignmentListResponse:
    """List all role assignments (user and group) with filtering, sorting, and pagination.

    Admins see all assignments; other users see only their own user
    assignments and assignments for groups they belong to.
    """
    restrict_user_id, restrict_group_ids = await _resolve_visibility(
        db,
        request,
        current_user,
        resource_project=None,
    )

    result = await service.list_all(
        limit=params.limit,
        cursor=params.cursor,
        sort=params.sort,
        principal_type=params.principal_type,
        principal_name=params.principal_name,
        role_name=params.role_name,
        project_id=params.project_id,
        include_total=params.include_total,
        restrict_user_id=restrict_user_id,
        restrict_group_ids=restrict_group_ids,
    )
    return AllRoleAssignmentListResponse(
        resources=[AllRoleAssignmentRead(**r) for r in result["resources"]],
        next=result["next"],
        prev=result["prev"],
        total=result["total"],
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _resolve_visibility(
    db: AsyncSession,
    request: Request,
    current_user: User,
    *,
    resource_project: str | None,
) -> tuple[UUID | None, list[UUID] | None]:
    """Determine what the caller is allowed to see.

    Returns ``(restrict_user_id, restrict_group_ids)``.
    Both ``None`` means "show everything".
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
            resource_project=resource_project or "",
            user_labels=current_user.labels,
            user_metadata=current_user.authz_metadata,
        ),
    )
    if authz_result.allowed:
        return None, None
    group_ids = await get_user_group_ids(db, current_user.id)
    return current_user.id, group_ids
