"""Role CRUD API endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Request, status
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.audit.decorators import audit
from nexus.audit.models.audit_event import EventCategory
from nexus.auth import get_current_user
from nexus.authz.dependencies import PermissionChecker
from nexus.authz.schemas import RoleCreate, RoleListParams, RoleListResponse, RoleRead, RoleUpdate
from nexus.authz.services.role_service import RoleService
from nexus.core.database.session import get_db
from nexus.core.models import User
from nexus.core.nexus_router import NO_PERMISSION, NexusRouter

router = NexusRouter(prefix="/roles", tags=["Roles"])


def get_role_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> RoleService:
    """Dependency provider for RoleService."""
    return RoleService(db, current_user)


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(PermissionChecker("role", "create"))],
    operation_id="create_role",
)
@audit(EventCategory.SECURITY_EVENT)
async def create_role(
    body: RoleCreate,
    service: Annotated[RoleService, Depends(get_role_service)],
) -> RoleRead:
    """Create a custom role. Requires: role:create permission."""
    role = await service.create_role(
        name=body.name,
        description=body.description,
        policies=body.policies,
        labels=body.labels,
        project_id=body.project_id,
    )
    return await service.to_role_read(role)


@router.get("", dependencies=[NO_PERMISSION], operation_id="list_roles")
async def list_roles(
    request: Request,
    params: Annotated[RoleListParams, Depends()],
    service: Annotated[RoleService, Depends(get_role_service)],
) -> RoleListResponse:
    """List roles with filtering and pagination."""
    return await service.list_roles(
        limit=params.limit,
        cursor=params.cursor,
        sort=params.sort,
        query_params_items=request.query_params.items(),
        include_total=params.include_total,
    )


@router.get("/{role_id}", dependencies=[NO_PERMISSION], operation_id="get_role")
async def get_role(
    role_id: UUID,
    service: Annotated[RoleService, Depends(get_role_service)],
) -> RoleRead:
    """Get a role by ID."""
    return await service.get_role_or_builtin(role_id)


async def _do_update_role(
    role_id: UUID,
    body: RoleUpdate,
    service: RoleService,
) -> RoleRead:
    """Shared implementation for PATCH and PUT role updates."""
    role = await service.update_role(
        role_id=role_id,
        name=body.name,
        description=body.description,
        policies=body.policies,
        labels=body.labels,
    )
    return await service.to_role_read(role)


@router.patch(
    "/{role_id}",
    dependencies=[Depends(PermissionChecker("role", "update"))],
    operation_id="update_role",
)
@audit(EventCategory.SECURITY_EVENT)
async def update_role(
    role_id: UUID,
    body: RoleUpdate,
    service: Annotated[RoleService, Depends(get_role_service)],
) -> RoleRead:
    """Patch a role. Builtin roles cannot be modified. Requires: role:update permission."""
    return await _do_update_role(role_id, body, service)


@router.put(
    "/{role_id}",
    dependencies=[Depends(PermissionChecker("role", "update"))],
    operation_id="replace_role",
)
@audit(EventCategory.SECURITY_EVENT)
async def replace_role(
    role_id: UUID,
    body: RoleUpdate,
    service: Annotated[RoleService, Depends(get_role_service)],
) -> RoleRead:
    """Replace a role. Builtin roles cannot be modified. Requires: role:update permission."""
    return await _do_update_role(role_id, body, service)


@router.delete(
    "/{role_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(PermissionChecker("role", "delete"))],
    operation_id="delete_role",
)
@audit(EventCategory.SECURITY_EVENT)
async def delete_role(
    role_id: UUID,
    service: Annotated[RoleService, Depends(get_role_service)],
) -> None:
    """Delete a role. Builtin roles cannot be deleted. Requires: role:delete permission."""
    await service.delete_role(role_id)
