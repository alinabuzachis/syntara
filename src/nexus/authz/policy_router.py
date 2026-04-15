"""Policy CRUD API endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Request, status
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.auth import get_current_user
from nexus.authz.dependencies import PermissionChecker
from nexus.authz.schemas import PolicyCreate, PolicyListParams, PolicyListResponse, PolicyRead, PolicyUpdate
from nexus.authz.services.policy_service import PolicyService
from nexus.core.database.session import get_db
from nexus.core.models import User
from nexus.core.nexus_router import NO_PERMISSION, NexusRouter

router = NexusRouter(prefix="/policies", tags=["policies"])


def get_policy_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PolicyService:
    """Dependency provider for PolicyService."""
    return PolicyService(db, current_user)


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(PermissionChecker("policy", "create", roles=["admin"]))],
)
async def create_policy(
    body: PolicyCreate,
    service: Annotated[PolicyService, Depends(get_policy_service)],
) -> PolicyRead:
    """Create a custom policy. Requires: policy:create permission."""
    policy = await service.create_policy(
        name=body.name,
        description=body.description,
        statements=[s.model_dump(exclude_none=True) for s in body.statements],
        labels=body.labels,
        project_id=body.project_id,
    )
    return PolicyRead.model_validate(policy)


@router.get("", dependencies=[NO_PERMISSION])
async def list_policies(
    request: Request,
    params: Annotated[PolicyListParams, Depends()],
    service: Annotated[PolicyService, Depends(get_policy_service)],
) -> PolicyListResponse:
    """List policies with filtering and pagination."""
    return await service.list_policies(
        limit=params.limit,
        cursor=params.cursor,
        sort=params.sort,
        query_params_items=request.query_params.items(),
        include_total=params.include_total,
    )


@router.get("/{policy_id}", dependencies=[NO_PERMISSION])
async def get_policy(
    policy_id: UUID,
    service: Annotated[PolicyService, Depends(get_policy_service)],
) -> PolicyRead:
    """Get a policy by ID."""
    policy = await service.get_policy(policy_id)
    return PolicyRead.model_validate(policy)


async def _do_update_policy(
    policy_id: UUID,
    body: PolicyUpdate,
    service: PolicyService,
) -> PolicyRead:
    """Shared implementation for PATCH and PUT policy updates."""
    statements = None
    if body.statements is not None:
        statements = [s.model_dump(exclude_none=True) for s in body.statements]
    policy = await service.update_policy(
        policy_id=policy_id,
        name=body.name,
        description=body.description,
        statements=statements,
        labels=body.labels,
    )
    return PolicyRead.model_validate(policy)


@router.patch(
    "/{policy_id}",
    dependencies=[Depends(PermissionChecker("policy", "update", roles=["admin"]))],
)
async def update_policy(
    policy_id: UUID,
    body: PolicyUpdate,
    service: Annotated[PolicyService, Depends(get_policy_service)],
) -> PolicyRead:
    """Patch a policy. Builtin policies cannot be modified. Requires: policy:update permission."""
    return await _do_update_policy(policy_id, body, service)


@router.put(
    "/{policy_id}",
    dependencies=[Depends(PermissionChecker("policy", "update", roles=["admin"]))],
)
async def replace_policy(
    policy_id: UUID,
    body: PolicyUpdate,
    service: Annotated[PolicyService, Depends(get_policy_service)],
) -> PolicyRead:
    """Replace a policy. Builtin policies cannot be modified. Requires: policy:update permission."""
    return await _do_update_policy(policy_id, body, service)


@router.delete(
    "/{policy_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(PermissionChecker("policy", "delete", roles=["admin"]))],
)
async def delete_policy(
    policy_id: UUID,
    service: Annotated[PolicyService, Depends(get_policy_service)],
) -> None:
    """Delete a policy. Builtin policies cannot be deleted. Requires: policy:delete permission."""
    await service.delete_policy(policy_id)
