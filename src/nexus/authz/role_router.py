"""Role CRUD API endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Request, status
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.auth import get_current_user
from nexus.authz.dependencies import PermissionChecker
from nexus.authz.schemas import RoleCreate, RoleListParams, RoleListResponse, RoleRead, RoleUpdate
from nexus.authz.services.role_service import RoleService
from nexus.core.database.session import get_db
from nexus.core.models import User
from nexus.core.nexus_router import NO_PERMISSION, NexusRouter

router = NexusRouter(prefix="/roles", tags=["roles"])


def get_role_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> RoleService:
    """Dependency provider for RoleService."""
    return RoleService(db, current_user)


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(PermissionChecker("role", "create", roles=["admin"]))],
)
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


@router.get("", dependencies=[NO_PERMISSION])
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


@router.get("/{role_id}", dependencies=[NO_PERMISSION])
async def get_role(
    role_id: UUID,
    service: Annotated[RoleService, Depends(get_role_service)],
) -> RoleRead:
    """Get a role by ID."""
    role = await service.get_role(role_id)
    return await service.to_role_read(role)


@router.api_route(
    "/{role_id}",
    methods=["PATCH", "PUT"],
    dependencies=[Depends(PermissionChecker("role", "update", roles=["admin"]))],
)
async def update_role(
    role_id: UUID,
    body: RoleUpdate,
    service: Annotated[RoleService, Depends(get_role_service)],
) -> RoleRead:
    """Update a role. Builtin roles cannot be modified. Requires: role:update permission."""
    role = await service.update_role(
        role_id=role_id,
        name=body.name,
        description=body.description,
        policies=body.policies,
        labels=body.labels,
    )
    return await service.to_role_read(role)


@router.delete(
    "/{role_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(PermissionChecker("role", "delete", roles=["admin"]))],
)
async def delete_role(
    role_id: UUID,
    service: Annotated[RoleService, Depends(get_role_service)],
) -> None:
    """Delete a role. Builtin roles cannot be deleted. Requires: role:delete permission."""
    await service.delete_role(role_id)
