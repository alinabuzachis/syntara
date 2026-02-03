"""Tool Provider API endpoints."""

from typing import Annotated, Any
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.exc import IntegrityError
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.api.auth import get_current_user
from nexus.core.database.session import get_db
from nexus.core.models import User
from nexus.tool_manager.lib.exceptions import (
    ProviderError,
    ProviderNameConflictError,
    ProviderNotFoundError,
    ToolNotFoundError,
    ValidationError,
)
from nexus.tool_manager.lib.providers import ProviderFactory, get_provider_factory
from nexus.tool_manager.models import ToolListParams, ToolProviderListParams
from nexus.tool_manager.models.tool import (
    ToolListResponse,
    ToolUpdate,
    ToolWithParameters,
)
from nexus.tool_manager.models.tool_bulk_update import ToolBulkUpdate
from nexus.tool_manager.models.tool_provider import (
    ToolProviderCreate,
    ToolProviderListResponse,
    ToolProviderPatch,
    ToolProviderWithConfiguration,
)
from nexus.tool_manager.models.tool_provider_refresh_result import ToolProviderRefreshResult
from nexus.tool_manager.models.tool_provider_validation_result import ToolProviderValidationResult
from nexus.tool_manager.services.tool_provider_service import ToolProviderService
from nexus.tool_manager.services.tool_service import ToolService

router = APIRouter(prefix="/tool_manager", tags=["tools", "tool_providers"])

logger = structlog.stdlib.get_logger(__name__)


# ============================================================================
# Dependency Injection Providers
# ============================================================================


def get_tool_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ToolService:
    """Dependency provider for ToolService.

    FastAPI will call this function automatically, injecting all dependencies.
    This centralizes ToolService creation across all endpoints.

    Args:
        db: Database session
        current_user: Current authenticated user

    Returns:
        ToolService configured with database session and user

    """
    return ToolService(db, current_user)


def get_tool_provider_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    provider_factory: Annotated[ProviderFactory, Depends(get_provider_factory)],
) -> ToolProviderService:
    """Dependency provider for ToolProviderService.

    FastAPI will call this function automatically, injecting all dependencies.
    This centralizes ToolProviderService creation across all endpoints.

    Args:
        db: Database session
        current_user: Current authenticated user
        provider_factory: Provider factory

    Returns:
        ToolProviderService configured with database session, user, and provider factory

    """
    return ToolProviderService(db, current_user, provider_factory)


@router.get("/tools")
async def get_tools(
    request: Request,
    service: Annotated[ToolService, Depends(get_tool_service)],
    params: Annotated[ToolListParams, Query()],
) -> ToolListResponse:
    """List tools with filtering, sorting, and pagination.

    Supports filtering using query parameters with standard operators:
    - name: Filter by tool name (name=tool_name, name[contains]=text)
    - enabled: Filter by enabled status (enabled=true|false)
    - status: Filter by tool status (status=available|missing|error)
    - provider_id: Filter by provider ID (provider_id=uuid)
    - namespaced_name: Filter by namespaced name (namespaced_name[contains]=text)
    - labels: Filter by labels using bracket notation (labels[environment]=production)

    Uses cursor-based pagination for scalability and consistency.

    Args:
        request: FastAPI request object containing query parameters
        service: Tool service
        params: Query parameters for pagination and filtering

    Returns:
        ToolListResponse with tools, pagination metadata, and optional total

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    try:
        return await service.list_tools(
            limit=params.limit,
            cursor=params.cursor,
            sort=params.sort,
            query_params_items=request.query_params.items(),
            include_total=params.include_total,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(e)) from e
    except Exception as e:
        logger.exception("Unexpected error listing tools", exc_info=e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unexpected error listing tools"
        ) from e


@router.get("/tools/{tool_id}")
async def get_tool(
    tool_id: UUID,
    service: Annotated[ToolService, Depends(get_tool_service)],
) -> ToolWithParameters:
    """Get tool details by ID.

    Returns detailed information about a specific tool including
    parameters, status, and metadata.

    Args:
        tool_id: UUID of the tool to retrieve
        service: Tool service

    Returns:
        ToolWithParameters instance with full details

    Raises:
        HTTPException: 404 if tool not found, 403 for auth, 400 for invalid UUID

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    try:
        return await service.get_tool_detail(tool_id)

    except ToolNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=e.message) from e
    except Exception as e:
        logger.exception("Unexpected error getting tool details", exc_info=e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unexpected error getting tool details"
        ) from e


@router.patch("/tools/bulk_update")
async def bulk_update_tools(
    bulk_update: ToolBulkUpdate,
    service: Annotated[ToolService, Depends(get_tool_service)],
) -> dict[str, Any]:
    """Bulk update tool status (enable/disable multiple tools).

    Updates the status of multiple tools in a single operation.
    Only admin-controllable status changes are allowed (available/disabled).

    Args:
        bulk_update: Bulk update request with tool IDs and status
        service: Tool service

    Returns:
        Dictionary with update statistics and timestamp

    Raises:
        HTTPException: 400 for validation errors, 403 for auth

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    try:
        return await service.bulk_update_tools(bulk_update.tool_ids, enabled=bulk_update.enabled)
    except ValidationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message) from e
    except Exception as e:
        logger.exception("Unexpected error bulk updating tools", exc_info=e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unexpected error bulk updating tools"
        ) from e


@router.patch("/tools/{tool_id}")
async def patch_tool(
    tool_id: UUID,
    tool_update: ToolUpdate,
    service: Annotated[ToolService, Depends(get_tool_service)],
) -> ToolWithParameters:
    """Update tool status (enable/disable).

    Updates the tool's status to enable or disable it for use.
    Only admin-controllable status changes are allowed (available/disabled).

    Args:
        tool_id: UUID of the tool to update
        tool_update: Tool update data with status
        service: Tool service

    Returns:
        Updated Tool instance

    Raises:
        HTTPException: 400 for validation errors, 404 if not found, 403 for auth

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    try:
        return await service.update_tool(
            tool_id,
            tool_update,
        )

    except ToolNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=e.message) from e
    except ValidationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message) from e
    except Exception as e:
        logger.exception("Unexpected error updating tool", exc_info=e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unexpected error updating tool"
        ) from e


@router.get("/tool_providers")
async def get_tool_providers(
    request: Request,
    service: Annotated[ToolProviderService, Depends(get_tool_provider_service)],
    params: Annotated[ToolProviderListParams, Query()],
) -> ToolProviderListResponse:
    """List tool providers with filtering, sorting, and pagination.

    Supports filtering using query parameters with standard operators:
    - name: Filter by provider name (name=provider_name, name[contains]=text)
    - status: Filter by provider status (status=validating|available|error)
    - enabled: Filter by enabled status (enabled=true|false)
    - provider_type: Filter by provider type (provider_type=openapi)
    - labels: Filter by labels using bracket notation (labels[environment]=production)

    Uses cursor-based pagination for scalability and consistency.

    Args:
        request: FastAPI request object containing query parameters
        service: Tool provider service
        params: Query parameters for pagination and filtering

    Returns:
        ToolProviderListResponse with providers, pagination metadata, and optional total

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    try:
        return await service.list_providers(
            limit=params.limit,
            cursor=params.cursor,
            sort=params.sort,
            query_params_items=request.query_params.items(),
            include_total=params.include_total,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(e)) from e
    except Exception as e:
        logger.exception("Unexpected error listing tool providers", exc_info=e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unexpected error listing tool providers"
        ) from e


@router.post("/tool_providers", status_code=status.HTTP_201_CREATED)
async def register_tool_provider(
    provider_create: ToolProviderCreate,
    service: Annotated[ToolProviderService, Depends(get_tool_provider_service)],
) -> ToolProviderWithConfiguration:
    """Register a new Tool Provider.

    Creates a new tool provider with the specified configuration.
    The provider starts in 'validating' status.

    Args:
        provider_create: Provider configuration and metadata
        service: Tool provider service

    Returns:
        Created ToolProvider instance

    Raises:
        HTTPException: 400 for validation errors, 409 for name conflicts, 403 for auth

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    try:
        return await service.create_provider(provider_create)
    except ValidationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message) from e
    except IntegrityError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    except ProviderNameConflictError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=e.message) from e
    except Exception as e:
        logger.exception("Unexpected error creating tool provider", exc_info=e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unexpected error creating tool provider"
        ) from e


@router.get("/tool_providers/{provider_id}")
async def get_tool_provider(
    provider_id: UUID,
    service: Annotated[ToolProviderService, Depends(get_tool_provider_service)],
) -> ToolProviderWithConfiguration:
    """Get Tool Provider details by ID.

    Returns detailed information about a specific Tool Provider including
    configuration, status, and metadata.

    Args:
        provider_id: UUID of the provider to retrieve
        service: Tool provider service

    Returns:
        ToolProvider instance with full details

    Raises:
        HTTPException: 404 if provider not found, 403 for auth, 400 for invalid UUID

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    try:
        return await service.get_provider(provider_id)
    except ProviderNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except Exception as e:
        logger.exception("Unexpected error getting tool provider details", exc_info=e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unexpected error getting tool provider details"
        ) from e


@router.put("/tool_providers/{provider_id}")
async def update_tool_provider(
    provider_id: UUID,
    provider_update: ToolProviderCreate,
    service: Annotated[ToolProviderService, Depends(get_tool_provider_service)],
) -> ToolProviderWithConfiguration:
    """Update Tool Provider configuration (complete replacement).

    Performs a complete replacement of the provider configuration.
    All fields in the request body will replace existing values.

    Args:
        provider_id: UUID of the provider to update
        provider_update: New provider configuration
        service: Tool provider service

    Returns:
        Updated ToolProvider instance

    Raises:
        HTTPException: 400 for validation errors, 404 if not found, 409 for conflicts, 403 for auth

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    try:
        return await service.update_provider(provider_id, provider_update)
    except ProviderNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=e.message) from e
    except ValidationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message) from e
    except ProviderNameConflictError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=e.message) from e
    except Exception as e:
        logger.exception("Unexpected error updating tool provider", exc_info=e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unexpected error updating tool provider"
        ) from e


@router.patch("/tool_providers/{provider_id}")
async def patch_tool_provider(
    provider_id: UUID,
    provider_patch: ToolProviderPatch,
    service: Annotated[ToolProviderService, Depends(get_tool_provider_service)],
) -> ToolProviderWithConfiguration:
    """Patch Tool Provider.

    Performs a partial update of the provider configuration.
    Only provided fields are updated, configuration objects are replaced.

    Args:
        provider_id: UUID of the provider to patch
        provider_patch: Partial update data
        service: Tool provider service

    Returns:
        Updated ToolProvider instance

    Raises:
        HTTPException: 400 for validation errors, 404 if not found, 409 for conflicts, 403 for auth

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    try:
        return await service.patch_provider(provider_id, provider_patch)
    except ProviderNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=e.message) from e
    except ValidationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message) from e
    except IntegrityError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    except ProviderNameConflictError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=e.message) from e
    except Exception as e:
        logger.exception("Unexpected error patching tool provider", exc_info=e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unexpected error patching tool provider"
        ) from e


@router.delete("/tool_providers/{provider_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tool_provider(
    provider_id: UUID,
    service: Annotated[ToolProviderService, Depends(get_tool_provider_service)],
) -> None:
    """Remove Tool Provider and all associated tools.

    Performs a soft delete of the provider and cascades to associated tools.
    The provider will no longer be accessible but remains in the database.

    Args:
        provider_id: UUID of the provider to delete
        service: Tool provider service

    Raises:
        HTTPException: 404 if provider not found, 403 for auth

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    try:
        await service.delete_provider(provider_id)
    except ProviderNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except Exception as e:
        logger.exception("Unexpected error deleting tool provider", exc_info=e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unexpected error deleting tool provider"
        ) from e


@router.post("/tool_providers/{provider_id}/validate")
async def validate_tool_provider(
    provider_id: UUID,
    service: Annotated[ToolProviderService, Depends(get_tool_provider_service)],
) -> ToolProviderValidationResult:
    """Validate Tool Provider connection and capabilities.

    Tests the connection to the tool provider and validates compatibility.
    Updates the provider status based on validation results.

    Args:
        provider_id: UUID of the provider to validate
        service: Tool provider service

    Returns:
        Validation result with status and capability details (always 200)

    Raises:
        HTTPException: 404 if not found, 403 for auth, 500 for unexpected errors

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    try:
        return await service.validate_provider(provider_id)
    except ProviderNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except Exception as e:
        logger.exception("Unexpected error validating tool provider", exc_info=e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unexpected error validating tool provider"
        ) from e


@router.post("/tool_providers/test")
async def test_tool_provider(
    provider_create: ToolProviderCreate,
    service: Annotated[ToolProviderService, Depends(get_tool_provider_service)],
) -> ToolProviderValidationResult:
    """Test Tool Provider definition without saving to database.

    Validates the provider configuration and tests connectivity using the appropriate adapter.
    This endpoint allows testing provider definitions before registering them.

    Args:
        provider_create: Provider configuration to test
        service: Tool provider service

    Returns:
        ToolProviderValidationResult with test results (always 200)

    Raises:
        HTTPException: 403 for auth, 500 for unexpected errors

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    try:
        return await service.validate_provider_definition(provider_create)
    except Exception as e:
        logger.exception("Unexpected error validating tool provider definition", exc_info=e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected error validating tool provider definition",
        ) from e


@router.post("/tool_providers/{provider_id}/refresh_tools")
async def refresh_tool_provider(
    provider_id: UUID,
    service: Annotated[ToolProviderService, Depends(get_tool_provider_service)],
) -> ToolProviderRefreshResult:
    """Refresh tools from Tool Provider.

    Connects to the tool provider and refreshes the list of available tools.
    Creates new tools, updates existing ones, and disables missing tools.

    Args:
        provider_id: UUID of the provider to refresh
        service: Tool provider service

    Returns:
        Refresh statistics including counts and timestamp

    Raises:
        HTTPException: 400 for refresh failure, 404 if not found, 403 for auth

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    try:
        return await service.refresh_tools(provider_id)
    except ProviderNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except ProviderError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    except Exception as e:
        logger.exception("Unexpected error refreshing tools from provider", exc_info=e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unexpected error refreshing tools from provider"
        ) from e
