"""Unified role-assignment API endpoints (global scope)."""

from datetime import datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import Depends, Request, status
from sqlmodel import Field, SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.audit.decorators import audit
from nexus.audit.models.audit_event import EventCategory
from nexus.auth import get_current_user
from nexus.authz.dependencies import PermissionChecker, VisibilityFilter, get_authz_evaluator
from nexus.authz.engine import VisibilityResult, resolve_visibility
from nexus.authz.models.assignments import RoleAssignment, RolePrincipalType
from nexus.authz.services.role_assignment_service import RoleAssignmentService
from nexus.core.database.session import get_db
from nexus.core.exceptions import SafeValueError
from nexus.core.models import User
from nexus.core.models.base import BaseListParams
from nexus.core.models.pagination import ResourcesResponse
from nexus.core.nexus_router import NO_PERMISSION, NexusRouter

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class RoleAssignmentCreate(SQLModel):
    """Request body for creating a role assignment."""

    principal_type: RolePrincipalType
    principal_id: UUID
    role_name: str
    project_id: UUID | None = None


class RoleAssignmentRead(SQLModel):
    """Response body for a role assignment."""

    id: UUID
    principal_type: str
    principal_id: UUID
    principal_name: str
    role_name: str
    role_description: str | None = None
    role_policies: list[str] = []
    project_id: UUID | None = None
    project_name: str | None = None
    is_builtin: bool = False
    created_at: datetime | None = None


class SubResourceRoleAssignmentCreate(SQLModel):
    """Request body for creating a role assignment from a sub-resource endpoint.

    principal_type and principal_id come from the URL path.
    """

    role_name: str
    project_id: UUID | None = None


class RoleAssignmentListResponse(ResourcesResponse[RoleAssignmentRead]):
    """Paginated response for role assignments."""


class RoleAssignmentListParams(BaseListParams):
    """Query parameters for listing role assignments (global endpoint)."""

    principal_type: str | None = Field(default=None, description="Filter by principal type: user or group")
    principal_id: UUID | None = Field(default=None, description="Filter by principal ID (user or group UUID)")
    principal_name: str | None = Field(default=None, description="Filter by principal name")
    role_name: str | None = Field(default=None, description="Filter by role name")
    project_id: UUID | None = Field(default=None, description="Filter by project ID")


class ProjectRoleAssignmentListParams(BaseListParams):
    """Query parameters for listing role assignments under a project (project_id comes from URL)."""

    principal_type: str | None = Field(default=None, description="Filter by principal type: user or group")
    principal_id: UUID | None = Field(default=None, description="Filter by principal ID (user or group UUID)")
    principal_name: str | None = Field(default=None, description="Filter by principal name")
    role_name: str | None = Field(default=None, description="Filter by role name")


class PrincipalRoleAssignmentListParams(BaseListParams):
    """Query parameters for listing role assignments under a user or group (principal comes from URL)."""

    role_name: str | None = Field(default=None, description="Filter by role name")
    project_id: UUID | None = Field(default=None, description="Filter by project ID")


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

_CONTAINS_FIELDS = {"principal_name", "role_name"}


def _parse_contains_filters(request: Request) -> dict[str, str]:
    """Extract bracket-notation contains filters from raw query params.

    Parses e.g. ``?role_name[contains]=admin`` into ``{"role_name_contains": "admin"}``.
    """
    result: dict[str, str] = {}
    for key, value in request.query_params.items():
        if "[contains]" in key:
            field = key.replace("[contains]", "")
            if field in _CONTAINS_FIELDS:
                result[f"{field}_contains"] = value
    return result


# ---------------------------------------------------------------------------
# Project-name redaction helper (prevents leaking names to unauthorized users)
# ---------------------------------------------------------------------------


def _redact_project_names(
    resources: list[dict[str, Any]],
    readable_project_ids: set[UUID] | None,
) -> None:
    """Strip project_name for projects the caller cannot read."""
    if readable_project_ids is None:
        return
    for r in resources:
        pid = r.get("project_id")
        if pid and pid not in readable_project_ids:
            r["project_name"] = None


async def _resolve_role_assignment_visibility(
    request: Request,
    current_user: User,
    db: AsyncSession,
) -> "VisibilityResult":
    """Resolve role-assignment:read visibility for the current user."""
    evaluator = get_authz_evaluator(request)
    return await resolve_visibility(
        db=db,
        evaluator=evaluator,
        user_id=current_user.id,
        resource_type="role-assignment",
        action="read",
        user_labels=current_user.labels,
        user_metadata=current_user.authz_metadata,
    )


# ---------------------------------------------------------------------------
# Shared helpers for principal sub-resource routers (users, groups)
# ---------------------------------------------------------------------------


async def list_principal_assignments(
    *,
    principal_type: RolePrincipalType,
    principal_id: UUID,
    request: Request,
    params: "PrincipalRoleAssignmentListParams",
    service: RoleAssignmentService,
    current_user: User,
    db: AsyncSession,
) -> "RoleAssignmentListResponse":
    """Shared list logic for user/group role assignment sub-resources."""
    visibility = await _resolve_role_assignment_visibility(request, current_user, db)

    result = await service.list(
        limit=params.limit,
        cursor=params.cursor,
        sort=params.sort,
        principal_type=principal_type.value,
        principal_id=principal_id,
        role_name=params.role_name,
        role_name_contains=_parse_contains_filters(request).get("role_name_contains"),
        project_id=params.project_id,
        include_total=params.include_total,
        restrict_user_id=visibility.self_user_id if not visibility.unrestricted else None,
        restrict_group_ids=(
            list(visibility.self_group_ids) if visibility.has_self_scope and not visibility.unrestricted else None
        ),
        allowed_project_ids=visibility.allowed_project_ids if not visibility.unrestricted else None,
    )

    _redact_project_names(result["resources"], visibility.readable_project_ids)

    return RoleAssignmentListResponse(
        resources=[RoleAssignmentRead.model_validate(r) for r in result["resources"]],
        next=result["next"],
        prev=result["prev"],
        total=result["total"],
    )


async def delete_principal_assignment(
    *,
    principal_type: RolePrincipalType,
    principal_id: UUID,
    assignment_id: UUID,
    service: RoleAssignmentService,
) -> None:
    """Shared delete logic for user/group role assignment sub-resources."""
    assignment = await service.get(assignment_id)
    if assignment["principal_type"] != principal_type.value or assignment["principal_id"] != principal_id:
        label = principal_type.value
        msg = f"Role assignment {assignment_id} not found for {label} {principal_id}"
        raise SafeValueError(msg)
    await service.revoke(assignment_id)


# ---------------------------------------------------------------------------
# Global role-assignment router
# ---------------------------------------------------------------------------

router = NexusRouter(prefix="/role_assignments", tags=["Role Assignments"])


def _get_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> RoleAssignmentService:
    return RoleAssignmentService(db, current_user)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(PermissionChecker("role-assignment", "assign", body_project_field="project_id"))],
    operation_id="create_role_assignment",
    response_description="Role assignment created",
)
@audit(EventCategory.SECURITY_EVENT)
async def create_role_assignment(
    body: RoleAssignmentCreate,
    service: Annotated[RoleAssignmentService, Depends(_get_service)],
) -> RoleAssignmentRead:
    """Assign a role to a user or group.

    When project_id is provided the assignment is project-scoped;
    otherwise it is a global (system-level) assignment.
    """
    result = await service.assign(
        principal_type=body.principal_type,
        principal_id=body.principal_id,
        role_name=body.role_name,
        project_id=body.project_id,
    )
    return RoleAssignmentRead.model_validate(result)


@router.get(
    "",
    dependencies=[NO_PERMISSION],
    operation_id="list_role_assignments",
    response_description="List of role assignments",
)
async def list_role_assignments(
    request: Request,
    params: Annotated[RoleAssignmentListParams, Depends()],
    service: Annotated[RoleAssignmentService, Depends(_get_service)],
    visibility: Annotated[VisibilityResult, Depends(VisibilityFilter("role-assignment", "read"))],
) -> RoleAssignmentListResponse:
    """List role assignments with policy-driven visibility.

    Users with ``role-assignment:read:any`` see all.
    Users with ``role-assignment:read:project`` see assignments in their projects.
    Users with ``role-assignment:read:self`` see their own (direct and via groups).
    """
    contains = _parse_contains_filters(request)

    result = await service.list(
        limit=params.limit,
        cursor=params.cursor,
        sort=params.sort,
        principal_type=params.principal_type,
        principal_id=params.principal_id,
        principal_name=params.principal_name,
        principal_name_contains=contains.get("principal_name_contains"),
        role_name=params.role_name,
        role_name_contains=contains.get("role_name_contains"),
        project_id=params.project_id,
        include_total=params.include_total,
        restrict_user_id=visibility.self_user_id if not visibility.unrestricted else None,
        restrict_group_ids=(
            list(visibility.self_group_ids) if visibility.has_self_scope and not visibility.unrestricted else None
        ),
        allowed_project_ids=visibility.allowed_project_ids if not visibility.unrestricted else None,
    )

    _redact_project_names(result["resources"], visibility.readable_project_ids)

    return RoleAssignmentListResponse(
        resources=[RoleAssignmentRead.model_validate(r) for r in result["resources"]],
        next=result["next"],
        prev=result["prev"],
        total=result["total"],
    )


@router.get(
    "/{assignment_id}",
    dependencies=[NO_PERMISSION],
    operation_id="get_role_assignment",
    response_description="Role assignment detail",
)
async def get_role_assignment(
    assignment_id: UUID,
    request: Request,
    service: Annotated[RoleAssignmentService, Depends(_get_service)],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RoleAssignmentRead:
    """Get a single role assignment by ID.

    Visibility rules match the list endpoint: admins see all,
    project-admins see their projects, users see their own.
    """
    assignment = await service.get(assignment_id)

    visibility = await _resolve_role_assignment_visibility(request, current_user, db)

    if not visibility.unrestricted and not service.is_visible(
        assignment,
        all_projects=False,
        user_id=current_user.id,
        group_ids=list(visibility.self_group_ids),
        allowed_project_ids=visibility.allowed_project_ids if not visibility.unrestricted else None,
    ):
        from nexus.core.exceptions import SafeValueError  # noqa: PLC0415

        msg = f"Role assignment {assignment_id} not found"
        raise SafeValueError(msg)

    _redact_project_names([assignment], visibility.readable_project_ids)

    return RoleAssignmentRead.model_validate(assignment)


@router.delete(
    "/{assignment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[
        Depends(
            PermissionChecker(
                "role-assignment",
                "revoke",
                resource_model=RoleAssignment,
                resource_id_param="assignment_id",
            )
        )
    ],
    operation_id="delete_role_assignment",
    response_description="Assignment removed",
)
@audit(EventCategory.SECURITY_EVENT)
async def delete_role_assignment(
    assignment_id: UUID,
    service: Annotated[RoleAssignmentService, Depends(_get_service)],
) -> None:
    """Remove a role assignment."""
    await service.revoke(assignment_id)
