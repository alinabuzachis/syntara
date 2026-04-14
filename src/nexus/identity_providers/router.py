"""Identity Provider API endpoints."""

from typing import Annotated
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, Query, Request, status
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.auth import get_current_user
from nexus.authz.dependencies import PermissionChecker
from nexus.core.database.session import get_db
from nexus.core.models import User
from nexus.identity_providers.models import IdentityProviderListParams
from nexus.identity_providers.models.identity_provider import (
    IdentityProviderCreate,
    IdentityProviderListResponse,
    IdentityProviderPatch,
    IdentityProviderResponse,
)
from nexus.identity_providers.services.identity_provider_service import IdentityProviderService
from nexus.identity_providers.services.oidc_discovery import OIDCTestResult, test_oidc_connection

router = APIRouter(prefix="/identity_providers", tags=["identity_providers"])

_idp_create = PermissionChecker("identity-provider", "create", roles=["admin"])
_idp_read = PermissionChecker("identity-provider", "read", roles=["admin"])
_idp_update = PermissionChecker("identity-provider", "update", roles=["admin"])
_idp_delete = PermissionChecker("identity-provider", "delete", roles=["admin"])
_idp_test = PermissionChecker("identity-provider", "test", roles=["admin"])

logger = structlog.stdlib.get_logger(__name__)


# ============================================================================
# Dependency Injection Providers
# ============================================================================


def get_identity_provider_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> IdentityProviderService:
    """Dependency provider for IdentityProviderService."""
    return IdentityProviderService(db, current_user)


# ============================================================================
# Test Connection
# ============================================================================


class OIDCTestRequest(IdentityProviderCreate):
    """Request body for testing an OIDC connection."""


@router.post("/test", dependencies=[Depends(_idp_test)])
async def test_identity_provider(
    provider_create: OIDCTestRequest,
    current_user: Annotated[User, Depends(get_current_user)],  # noqa: ARG001
) -> OIDCTestResult:
    """Test identity provider connection without saving. Requires authentication."""
    return await test_oidc_connection(provider_create.configuration.issuer_url)


# ============================================================================
# CRUD Endpoints
# ============================================================================


@router.get("/", dependencies=[Depends(_idp_read)])
async def list_identity_providers(
    request: Request,
    service: Annotated[IdentityProviderService, Depends(get_identity_provider_service)],
    params: Annotated[IdentityProviderListParams, Query()],
) -> IdentityProviderListResponse:
    """List identity providers with filtering, sorting, and pagination."""
    return await service.list_providers(
        limit=params.limit,
        cursor=params.cursor,
        sort=params.sort,
        query_params_items=request.query_params.items(),
        include_total=params.include_total,
    )


@router.post("/", status_code=status.HTTP_201_CREATED, dependencies=[Depends(_idp_create)])
async def create_identity_provider(
    provider_create: IdentityProviderCreate,
    service: Annotated[IdentityProviderService, Depends(get_identity_provider_service)],
) -> IdentityProviderResponse:
    """Create a new identity provider."""
    return await service.create_provider(provider_create)


@router.get("/{provider_id}", dependencies=[Depends(_idp_read)])
async def get_identity_provider(
    provider_id: UUID,
    service: Annotated[IdentityProviderService, Depends(get_identity_provider_service)],
) -> IdentityProviderResponse:
    """Get identity provider details by ID."""
    return await service.get_provider(provider_id)


@router.patch("/{provider_id}", dependencies=[Depends(_idp_update)])
async def patch_identity_provider(
    provider_id: UUID,
    provider_patch: IdentityProviderPatch,
    service: Annotated[IdentityProviderService, Depends(get_identity_provider_service)],
) -> IdentityProviderResponse:
    """Patch an identity provider."""
    return await service.patch_provider(provider_id, provider_patch)


@router.delete("/{provider_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(_idp_delete)])
async def delete_identity_provider(
    provider_id: UUID,
    service: Annotated[IdentityProviderService, Depends(get_identity_provider_service)],
) -> None:
    """Soft delete an identity provider."""
    await service.delete_provider(provider_id)
