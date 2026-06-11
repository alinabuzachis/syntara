"""Integration Management API endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Query, Request, status
from sqlmodel.ext.asyncio.session import AsyncSession

import nexus.integrations.adapters.mcp_server  # noqa: F401 — register MCP adapter
from nexus.audit.decorators import audit
from nexus.audit.models.audit_event import EventCategory
from nexus.auth import get_current_user
from nexus.authz.dependencies import PermissionChecker, VisibilityFilter
from nexus.authz.engine import VisibilityResult
from nexus.core.database.session import get_db
from nexus.core.models import User
from nexus.core.nexus_router import NexusRouter
from nexus.core.services.secret_service import create_secret_service
from nexus.integrations.adapters.protocol import HealthCheckResult
from nexus.integrations.models import (
    IntegrationCreate,
    IntegrationListParams,
    IntegrationListResponse,
    IntegrationPatch,
    IntegrationRead,
)
from nexus.integrations.models.integration import IntegrationTestConnection
from nexus.integrations.services.integration_service import IntegrationService

router = NexusRouter(tags=["Integrations"])


# ============================================================================
# Permission Checkers
# ============================================================================

_perm_create = PermissionChecker("integration", "create")
_perm_update = PermissionChecker("integration", "update")
_perm_delete = PermissionChecker("integration", "delete")
_perm_validate = PermissionChecker("integration", "validate")


# ============================================================================
# Dependency Injection
# ============================================================================


def get_integration_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> IntegrationService:
    """Dependency provider for IntegrationService."""
    secret_service = create_secret_service(db)
    return IntegrationService(db, current_user, secret_service)


# ============================================================================
# Integration Endpoints
# ============================================================================


@router.post(
    "/integrations",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_perm_create)],
    operation_id="create_integration",
)
@audit(EventCategory.USER_ACTION, event_action="integration_create")
async def create_integration(
    data: IntegrationCreate,
    service: Annotated[IntegrationService, Depends(get_integration_service)],
) -> IntegrationRead:
    """Create a new integration."""
    return await service.create_integration(data)


@router.get("/integrations", operation_id="list_integrations")
async def list_integrations(
    request: Request,
    service: Annotated[IntegrationService, Depends(get_integration_service)],
    params: Annotated[IntegrationListParams, Query()],
    visibility: Annotated[VisibilityResult, Depends(VisibilityFilter("integration", "read"))],
) -> IntegrationListResponse:
    """List integrations with filtering and pagination."""
    return await service.list_integrations(
        limit=params.limit,
        cursor=params.cursor,
        sort=params.sort,
        query_params_items=request.query_params.items(),
        include_total=params.include_total,
        allowed_projects=visibility.to_allowed_projects(),
    )


@router.get(
    "/integrations/{integration_id}",
    operation_id="get_integration",
)
async def get_integration(
    integration_id: UUID,
    service: Annotated[IntegrationService, Depends(get_integration_service)],
    visibility: Annotated[VisibilityResult, Depends(VisibilityFilter("integration", "read"))],
) -> IntegrationRead:
    """Get an integration by ID."""
    return await service.get_integration(integration_id, allowed_projects=visibility.to_allowed_projects())


# No VisibilityFilter on update/delete: these are admin-only permissions,
# and admins have unrestricted project access (all_projects=True).
@router.patch(
    "/integrations/{integration_id}",
    dependencies=[Depends(_perm_update)],
    operation_id="update_integration",
)
@audit(EventCategory.USER_ACTION, event_action="integration_update", capture_args={"integration_id"})
async def update_integration(
    integration_id: UUID,
    data: IntegrationPatch,
    service: Annotated[IntegrationService, Depends(get_integration_service)],
) -> IntegrationRead:
    """Update an integration."""
    return await service.patch_integration(integration_id, data)


@router.delete(
    "/integrations/{integration_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(_perm_delete)],
    operation_id="delete_integration",
)
@audit(EventCategory.USER_ACTION, event_action="integration_delete", capture_args={"integration_id"})
async def delete_integration(
    integration_id: UUID,
    service: Annotated[IntegrationService, Depends(get_integration_service)],
) -> None:
    """Delete an integration."""
    await service.delete_integration(integration_id)


@router.post(
    "/integrations/validate",
    dependencies=[Depends(_perm_validate)],
    operation_id="test_integration_connection",
)
@audit(EventCategory.USER_ACTION, event_action="integration_test_connection")
async def test_integration_connection(
    data: IntegrationTestConnection,
    service: Annotated[IntegrationService, Depends(get_integration_service)],
) -> HealthCheckResult:
    """Test a connection without saving an integration.

    Accepts integration configuration and a credential ID, resolves the
    credential, runs the health check adapter, and returns the result.
    No integration is persisted.
    """
    return await service.test_connection(data)


@router.post(
    "/integrations/{integration_id}/validate",
    dependencies=[Depends(_perm_validate)],
    operation_id="validate_integration",
)
@audit(EventCategory.USER_ACTION, event_action="integration_validate", capture_args={"integration_id"})
async def validate_integration(
    integration_id: UUID,
    service: Annotated[IntegrationService, Depends(get_integration_service)],
) -> HealthCheckResult:
    """Validate a saved integration by running a health check.

    Resolves the management credential, dispatches to the type-specific
    health check adapter, updates the integration's status fields, and
    returns the health check result.
    """
    return await service.validate_integration(integration_id)
