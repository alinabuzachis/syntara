"""Credential Management API endpoints."""

from typing import Annotated
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.auth import get_current_user
from nexus.core.database.session import get_db
from nexus.core.models import User
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

router = APIRouter(tags=["credentials"])

logger = structlog.stdlib.get_logger(__name__)


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


@router.post("/credentials", status_code=status.HTTP_201_CREATED)
async def create_credential(
    data: CredentialCreate,
    service: Annotated[CredentialService, Depends(get_credential_service)],
) -> CredentialRead:
    """Create a new Credential with encrypted inputs."""
    return await service.create_credential(data)


@router.get("/credentials")
async def list_credentials(
    service: Annotated[CredentialService, Depends(get_credential_service)],
    params: Annotated[CredentialListParams, Query()],
) -> CredentialListResponse:
    """List Credentials with filtering and pagination. Metadata only, no secrets."""
    return await service.list_credentials(
        limit=params.limit,
        cursor=params.cursor,
        sort=params.sort,
        query_params_items=params.model_dump(
            exclude_none=True, exclude={"limit", "cursor", "sort", "include_total"}
        ).items(),
        include_total=params.include_total,
    )


@router.get("/credentials/{credential_id}")
async def get_credential(
    credential_id: UUID,
    service: Annotated[CredentialService, Depends(get_credential_service)],
) -> CredentialRead:
    """Get a Credential. Secret fields masked as $encrypted$."""
    return await service.get_credential(credential_id)


@router.patch("/credentials/{credential_id}")
async def update_credential(
    credential_id: UUID,
    data: CredentialPatch,
    service: Annotated[CredentialService, Depends(get_credential_service)],
) -> CredentialRead:
    """Update a Credential. Fields set to $encrypted$ retain existing values."""
    return await service.update_credential(credential_id, data)


@router.delete("/credentials/{credential_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_credential(
    credential_id: UUID,
    service: Annotated[CredentialService, Depends(get_credential_service)],
) -> None:
    """Soft-delete a Credential."""
    await service.delete_credential(credential_id)


@router.get("/credentials/{credential_id}/workflows")
async def get_credential_workflows(
    credential_id: UUID,
    service: Annotated[CredentialService, Depends(get_credential_service)],
) -> list[CredentialWorkflowRef]:
    """Get workflows that reference this credential.

    Returns empty list until Epic 3 adds credentialId to executor configs.
    """
    return await service.get_credential_workflows(credential_id)


# ============================================================================
# Credential Type Endpoints (read-only for GA)
# ============================================================================


@router.get("/credential_types")
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


@router.get("/credential_types/{credential_type_id}")
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
