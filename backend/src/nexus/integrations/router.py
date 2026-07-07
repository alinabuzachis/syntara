"""Integration Management API endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Query, Request, status
from sqlmodel.ext.asyncio.session import AsyncSession

import nexus.integrations.adapters.aap  # register AAP adapter
import nexus.integrations.adapters.llm_provider  # register LLM provider adapter
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
from nexus.integrations.adapters.protocol import DiscoverResult, ValidateResult
from nexus.integrations.exceptions import IntegrationNotFoundError, IntegrationTypeMismatchError
from nexus.integrations.models import (
    IntegrationCreate,
    IntegrationListParams,
    IntegrationListResponse,
    IntegrationPatch,
    IntegrationRead,
    IntegrationStatusPatch,
)
from nexus.integrations.models.integration import Integration, IntegrationTestConnection, IntegrationType, RefreshResult
from nexus.integrations.models.llm_model import (
    LLMModelBulkUpdate,
    LLMModelBulkUpdateResponse,
    LLMModelListParams,
    LLMModelListResponse,
    LLMModelRead,
    LLMModelUpdate,
)
from nexus.integrations.services.integration_service import IntegrationService
from nexus.integrations.services.llm_model_service import LLMModelService

router = NexusRouter(tags=["Integrations"])


# ============================================================================
# Permission Checkers
# ============================================================================

_perm_create = PermissionChecker("integration", "create")
_perm_update = PermissionChecker("integration", "update")
_perm_delete = PermissionChecker("integration", "delete")
_perm_discover = PermissionChecker("integration", "discover")
_perm_validate = PermissionChecker("integration", "validate")
_perm_refresh = PermissionChecker("integration", "refresh")
_perm_model_read = PermissionChecker("llm_model", "read")
_perm_model_update = PermissionChecker("llm_model", "update")


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


@router.patch(
    "/integrations/{integration_id}/status",
    dependencies=[Depends(_perm_update)],
    operation_id="update_integration_status",
)
async def update_integration_status(
    integration_id: UUID,
    data: IntegrationStatusPatch,
    service: Annotated[IntegrationService, Depends(get_integration_service)],
) -> IntegrationRead:
    """Update integration enabled/validation_status/validation_error (service-to-service only)."""
    return await service.update_system_status(integration_id, data)


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
    "/integrations/discover",
    dependencies=[Depends(_perm_discover)],
    operation_id="discover_integration_connection",
)
@audit(EventCategory.USER_ACTION, event_action="integration_discover")
async def discover_integration_connection(
    data: IntegrationTestConnection,
    service: Annotated[IntegrationService, Depends(get_integration_service)],
) -> DiscoverResult:
    """Test a connection and discover resources without saving an integration.

    Accepts integration configuration and a credential ID, resolves the
    credential, runs the adapter's discover() method, and returns the result
    including discovered tools (with parameters) or models. No integration
    is persisted.
    """
    return await service.discover(data)


@router.post(
    "/integrations/{integration_id}/validate",
    dependencies=[Depends(_perm_validate)],
    operation_id="validate_integration",
)
@audit(EventCategory.USER_ACTION, event_action="integration_validate", capture_args={"integration_id"})
async def validate_integration(
    integration_id: UUID,
    service: Annotated[IntegrationService, Depends(get_integration_service)],
) -> ValidateResult:
    """Validate a saved integration with a lightweight connectivity ping.

    Resolves the management credential, dispatches to the type-specific
    adapter's validate() method, updates the integration's status fields,
    and returns the result. No tool sync is performed.
    """
    return await service.validate_integration(integration_id)


@router.post(
    "/integrations/{integration_id}/refresh",
    dependencies=[Depends(_perm_refresh)],
    operation_id="refresh_resources",
)
@audit(EventCategory.USER_ACTION, event_action="integration_refresh", capture_args={"integration_id"})
async def refresh_resources(
    integration_id: UUID,
    service: Annotated[IntegrationService, Depends(get_integration_service)],
) -> RefreshResult:
    """Sync resources (tools) for a saved integration from the external service.

    Connects to the MCP server, fetches the current tool list, and upserts
    Tool records in the database. Updates refresh_status and last_refreshed_at
    on the integration. Only supported for mcp_server integration types.
    """
    return await service.refresh_resources(integration_id)


# ============================================================================
# Integration Model Endpoints
# ============================================================================


def get_llm_model_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> LLMModelService:
    """Dependency provider for LLMModelService."""
    return LLMModelService(db, current_user)


async def _require_llm_provider(
    integration_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Verify the integration exists and is an LLM provider."""
    integration = await db.get(Integration, integration_id)
    if not integration or integration.deleted_at is not None:
        raise IntegrationNotFoundError(integration_id)
    if integration.integration_type != IntegrationType.LLM_PROVIDER:
        raise IntegrationTypeMismatchError(
            integration_id,
            expected_type=IntegrationType.LLM_PROVIDER.value,
            actual_type=integration.integration_type.value,
        )


@router.get(
    "/integrations/{integration_id}/models",
    dependencies=[Depends(_perm_model_read), Depends(_require_llm_provider)],
    operation_id="list_integration_models",
)
async def list_integration_models(
    integration_id: UUID,
    request: Request,
    service: Annotated[LLMModelService, Depends(get_llm_model_service)],
    params: Annotated[LLMModelListParams, Query()],
) -> LLMModelListResponse:
    """List LLM models for an integration with filtering, sorting, and pagination."""
    query_items = [*request.query_params.items(), ("integration_id", str(integration_id))]
    return await service.list_models(
        limit=params.limit,
        cursor=params.cursor,
        sort=params.sort,
        query_params_items=query_items,
        include_total=params.include_total,
    )


@router.patch(
    "/integrations/{integration_id}/models/bulk_update",
    dependencies=[Depends(_perm_model_update), Depends(_require_llm_provider)],
    operation_id="bulk_update_integration_models",
)
@audit(EventCategory.USER_ACTION, event_action="model_bulk_update")
async def bulk_update_integration_models(
    integration_id: UUID,
    data: LLMModelBulkUpdate,
    service: Annotated[LLMModelService, Depends(get_llm_model_service)],
) -> LLMModelBulkUpdateResponse:
    """Bulk enable/disable LLM models."""
    return await service.bulk_update_models(integration_id, data.model_ids, enabled=data.enabled)


@router.get(
    "/integrations/{integration_id}/models/{model_id}",
    dependencies=[Depends(_perm_model_read), Depends(_require_llm_provider)],
    operation_id="get_integration_model",
)
async def get_integration_model(
    integration_id: UUID,
    model_id: UUID,
    service: Annotated[LLMModelService, Depends(get_llm_model_service)],
) -> LLMModelRead:
    """Get an LLM model by ID."""
    return await service.get_model_detail(integration_id, model_id)


@router.patch(
    "/integrations/{integration_id}/models/{model_id}",
    dependencies=[Depends(_perm_model_update), Depends(_require_llm_provider)],
    operation_id="update_integration_model",
)
@audit(EventCategory.USER_ACTION, event_action="model_update", capture_args={"model_id"})
async def update_integration_model(
    integration_id: UUID,
    model_id: UUID,
    data: LLMModelUpdate,
    service: Annotated[LLMModelService, Depends(get_llm_model_service)],
) -> LLMModelRead:
    """Update an LLM model (enable/disable)."""
    return await service.update_model(integration_id, model_id, data)
