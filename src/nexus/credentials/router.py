"""Credential Management API endpoints."""

from typing import Annotated
from uuid import UUID

import structlog
from fastapi import Depends, Query, Request, status
from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.auth import get_current_user
from nexus.authz.dependencies import PermissionChecker, ProjectScopeFilter
from nexus.authz.engine import AllowedProjectsResult
from nexus.core.database.session import get_db
from nexus.core.models import User
from nexus.core.nexus_router import NexusRouter
from nexus.core.services.secret_service import create_secret_service
from nexus.credentials.exceptions import CredentialNotFoundError
from nexus.credentials.models import (
    CredentialCreate,
    CredentialListParams,
    CredentialListResponse,
    CredentialPatch,
    CredentialRead,
    CredentialType,
    CredentialTypeListResponse,
    CredentialTypeRead,
)
from nexus.credentials.models.credential import Credential, CredentialWorkflowRef
from nexus.credentials.services.credential_service import CredentialService

router = NexusRouter(tags=["Credentials"])

logger = structlog.stdlib.get_logger(__name__)


# ============================================================================
# Permission Checkers
# ============================================================================

_cred_perm_read = PermissionChecker(
    "credential",
    "read",
    resource_model=Credential,
    resource_id_param="credential_id",
)
_cred_perm_create = PermissionChecker(
    "credential",
    "create",
    body_project_field="project_id",
)
_cred_perm_update = PermissionChecker(
    "credential",
    "update",
    resource_model=Credential,
    resource_id_param="credential_id",
)
_cred_perm_delete = PermissionChecker(
    "credential",
    "delete",
    resource_model=Credential,
    resource_id_param="credential_id",
)


# ============================================================================
# Dependency Injection
# ============================================================================


def get_credential_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> CredentialService:
    """Dependency provider for CredentialService."""
    return CredentialService(db, current_user, create_secret_service(db))


# ============================================================================
# Credential Endpoints
# ============================================================================


@router.post(
    "/credentials",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_cred_perm_create)],
    operation_id="create_credential",
)
async def create_credential(
    data: CredentialCreate,
    service: Annotated[CredentialService, Depends(get_credential_service)],
) -> CredentialRead:
    """Create a new Credential with encrypted inputs."""
    return await service.create_credential(data)


@router.get("/credentials", operation_id="list_credentials")
async def list_credentials(
    request: Request,
    service: Annotated[CredentialService, Depends(get_credential_service)],
    params: Annotated[CredentialListParams, Query()],
    allowed_projects: Annotated[AllowedProjectsResult, Depends(ProjectScopeFilter("credential", "read"))],
) -> CredentialListResponse:
    """List Credentials with filtering and pagination. Metadata only, no secrets."""
    return await service.list_credentials(
        limit=params.limit,
        cursor=params.cursor,
        sort=params.sort,
        query_params_items=request.query_params.items(),
        include_total=params.include_total,
        allowed_projects=allowed_projects,
    )


@router.get("/credentials/{credential_id}", dependencies=[Depends(_cred_perm_read)], operation_id="get_credential")
async def get_credential(
    credential_id: UUID,
    service: Annotated[CredentialService, Depends(get_credential_service)],
) -> CredentialRead:
    """Get a Credential. Secret fields masked as $encrypted$."""
    return await service.get_credential(credential_id)


@router.patch(
    "/credentials/{credential_id}", dependencies=[Depends(_cred_perm_update)], operation_id="update_credential"
)
async def update_credential(
    credential_id: UUID,
    data: CredentialPatch,
    service: Annotated[CredentialService, Depends(get_credential_service)],
) -> CredentialRead:
    """Update a Credential. Fields set to $encrypted$ retain existing values."""
    return await service.update_credential(credential_id, data)


@router.delete(
    "/credentials/{credential_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(_cred_perm_delete)],
    operation_id="delete_credential",
)
async def delete_credential(
    credential_id: UUID,
    service: Annotated[CredentialService, Depends(get_credential_service)],
) -> None:
    """Soft-delete a Credential."""
    await service.delete_credential(credential_id)


@router.get(
    "/credentials/{credential_id}/workflows",
    dependencies=[Depends(_cred_perm_read)],
    operation_id="get_credential_workflows",
)
async def get_credential_workflows(
    credential_id: UUID,
    service: Annotated[CredentialService, Depends(get_credential_service)],
) -> list[CredentialWorkflowRef]:
    """Get workflows that reference this credential.

    Returns workflows with nodes that have credential_id in their executor configs.
    """
    return await service.get_credential_workflows(credential_id)


# ============================================================================
# Credential Type Endpoints (read-only for GA, auth-only, no RBAC needed)
# ============================================================================


@router.get("/credential_types", operation_id="list_credential_types")
async def list_credential_types(
    db: Annotated[AsyncSession, Depends(get_db)],
    _current_user: Annotated[User, Depends(get_current_user)],
) -> CredentialTypeListResponse:
    """List all Credential Types including preseeded managed types.

    Each type includes a credential_count of non-deleted credentials using it.
    """
    # Subquery: count non-deleted credentials per type
    count_subq = (
        select(
            Credential.credential_type_id,
            func.count(Credential.id).label("credential_count"),  # type: ignore[arg-type]
        )
        .where(Credential.deleted_at.is_(None))  # type: ignore[union-attr]
        .group_by(Credential.credential_type_id)  # type: ignore[arg-type]
        .subquery()
    )

    stmt = select(
        CredentialType,
        func.coalesce(count_subq.c.credential_count, 0).label("credential_count"),
    ).outerjoin(
        count_subq,
        CredentialType.id == count_subq.c.credential_type_id,  # type: ignore[arg-type]
    )

    result = await db.exec(stmt)
    rows = result.all()

    resources = []
    for row in rows:
        cred_type, count = row[0], row[1]
        read = CredentialTypeRead.model_validate(cred_type)
        read.credential_count = count
        resources.append(read)

    return CredentialTypeListResponse(resources=resources)


@router.get("/credential_types/{credential_type_id}", operation_id="get_credential_type")
async def get_credential_type(
    credential_type_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _current_user: Annotated[User, Depends(get_current_user)],
) -> CredentialTypeRead:
    """Get a single Credential Type with credential_count."""
    cred_type = await db.get(CredentialType, credential_type_id)
    if not cred_type:
        msg = f"Credential type with ID '{credential_type_id}' not found"
        raise CredentialNotFoundError(msg)

    # Count non-deleted credentials for this type
    count_stmt = select(func.count(Credential.id)).where(  # type: ignore[arg-type]
        Credential.credential_type_id == credential_type_id,
        Credential.deleted_at.is_(None),  # type: ignore[union-attr]
    )
    count_result = await db.exec(count_stmt)
    credential_count = count_result.one()

    read = CredentialTypeRead.model_validate(cred_type)
    read.credential_count = credential_count
    return read
