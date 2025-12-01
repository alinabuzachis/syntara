"""Tool Provider API endpoints."""

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.exc import IntegrityError
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.api.auth import get_current_user
from nexus.api.db import get_db
from nexus.core.models import User
from nexus.tool_manager.lib.exceptions import (
    ProviderError,
    ProviderNameConflictError,
    ProviderNotFoundError,
    ValidationError,
)
from nexus.tool_manager.lib.providers import ProviderFactory, get_provider_factory
from nexus.tool_manager.models import ToolProviderListParams
from nexus.tool_manager.models.tool_provider import (
    ToolProviderCreate,
    ToolProviderListResponse,
    ToolProviderPatch,
    ToolProviderWithConfiguration,
)
from nexus.tool_manager.models.tool_provider_refresh_result import ToolProviderRefreshResult
from nexus.tool_manager.models.tool_provider_validation_result import ToolProviderValidationResult
from nexus.tool_manager.services.tool_provider_service import ToolProviderService

router = APIRouter(prefix="/tool-providers", tags=["tool-providers"])

logger = logging.getLogger(__name__)


@router.get("")
async def list_tool_providers(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    provider_factory: Annotated[ProviderFactory, Depends(get_provider_factory)],
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
        db: Database session
        current_user: Current authenticated user
        provider_factory: Tool Provider factory
        params: Query parameters for pagination and filtering

    Returns:
        ToolProviderListResponse with providers, pagination metadata, and optional total

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    service = ToolProviderService(db, current_user, provider_factory)

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


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_tool_provider(
    provider_create: ToolProviderCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    provider_factory: Annotated[ProviderFactory, Depends(get_provider_factory)],
) -> ToolProviderWithConfiguration:
    """Register a new Tool Provider.

    Creates a new tool provider with the specified configuration.
    The provider starts in 'validating' status.

    Args:
        provider_create: Provider configuration and metadata
        db: Database session
        current_user: Authenticated user (admin access required)
        provider_factory: Tool Provider factory

    Returns:
        Created ToolProvider instance

    Raises:
        HTTPException: 400 for validation errors, 409 for name conflicts, 403 for auth

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    service = ToolProviderService(db, current_user, provider_factory)

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


@router.get("/{provider_id}")
async def get_tool_provider(
    provider_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    provider_factory: Annotated[ProviderFactory, Depends(get_provider_factory)],
) -> ToolProviderWithConfiguration:
    """Get Tool Provider details by ID.

    Returns detailed information about a specific Tool Provider including
    configuration, status, and metadata.

    Args:
        provider_id: UUID of the provider to retrieve
        db: Database session
        current_user: Authenticated user (admin access required)
        provider_factory: Tool Provider factory

    Returns:
        ToolProvider instance with full details

    Raises:
        HTTPException: 404 if provider not found, 403 for auth, 400 for invalid UUID

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    service = ToolProviderService(db, current_user, provider_factory)

    try:
        return await service.get_provider(provider_id)
    except ProviderNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except Exception as e:
        logger.exception("Unexpected error getting tool provider details", exc_info=e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unexpected error getting tool provider details"
        ) from e


@router.put("/{provider_id}")
async def update_tool_provider(
    provider_id: UUID,
    provider_update: ToolProviderCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    provider_factory: Annotated[ProviderFactory, Depends(get_provider_factory)],
) -> ToolProviderWithConfiguration:
    """Update Tool Provider configuration (complete replacement).

    Performs a complete replacement of the provider configuration.
    All fields in the request body will replace existing values.

    Args:
        provider_id: UUID of the provider to update
        provider_update: New provider configuration
        db: Database session
        current_user: Authenticated user (admin access required)
        provider_factory: Tool Provider factory

    Returns:
        Updated ToolProvider instance

    Raises:
        HTTPException: 400 for validation errors, 404 if not found, 409 for conflicts, 403 for auth

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    service = ToolProviderService(db, current_user, provider_factory)

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


@router.patch("/{provider_id}")
async def patch_tool_provider(
    provider_id: UUID,
    provider_patch: ToolProviderPatch,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    provider_factory: Annotated[ProviderFactory, Depends(get_provider_factory)],
) -> ToolProviderWithConfiguration:
    """Patch Tool Provider.

    Performs a partial update of the provider configuration.
    Only provided fields are updated, configuration objects are replaced.

    Args:
        provider_id: UUID of the provider to patch
        provider_patch: Partial update data
        db: Database session
        current_user: Authenticated user (admin access required)
        provider_factory: Tool Provider factory

    Returns:
        Updated ToolProvider instance

    Raises:
        HTTPException: 400 for validation errors, 404 if not found, 409 for conflicts, 403 for auth

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    service = ToolProviderService(db, current_user, provider_factory)

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


@router.delete("/{provider_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tool_provider(
    provider_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    provider_factory: Annotated[ProviderFactory, Depends(get_provider_factory)],
) -> None:
    """Remove Tool Provider and all associated tools.

    Performs a soft delete of the provider and cascades to associated tools.
    The provider will no longer be accessible but remains in the database.

    Args:
        provider_id: UUID of the provider to delete
        db: Database session
        current_user: Authenticated user (admin access required)
        provider_factory: Tool Provider factory

    Raises:
        HTTPException: 404 if provider not found, 403 for auth

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    service = ToolProviderService(db, current_user, provider_factory)

    try:
        await service.delete_provider(provider_id)
    except ProviderNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except Exception as e:
        logger.exception("Unexpected error deleting tool provider", exc_info=e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unexpected error deleting tool provider"
        ) from e


@router.post("/{provider_id}/validate")
async def validate_tool_provider(
    provider_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    provider_factory: Annotated[ProviderFactory, Depends(get_provider_factory)],
) -> ToolProviderValidationResult:
    """Validate Tool Provider connection and capabilities.

    Tests the connection to the tool provider and validates compatibility.
    Updates the provider status based on validation results.

    Args:
        provider_id: UUID of the provider to validate
        db: Database session
        current_user: Authenticated user (admin access required)
        provider_factory: Tool Provider factory

    Returns:
        Validation result with status and capability details (always 200)

    Raises:
        HTTPException: 404 if not found, 403 for auth, 500 for unexpected errors

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    service = ToolProviderService(db, current_user, provider_factory)

    try:
        return await service.validate_provider(provider_id)
    except ProviderNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except Exception as e:
        logger.exception("Unexpected error validating tool provider", exc_info=e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unexpected error validating tool provider"
        ) from e


@router.post("/test")
async def validate_tool_provider_definition(
    provider_create: ToolProviderCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    provider_factory: Annotated[ProviderFactory, Depends(get_provider_factory)],
) -> ToolProviderValidationResult:
    """Test Tool Provider definition without saving to database.

    Validates the provider configuration and tests connectivity using the appropriate adapter.
    This endpoint allows testing provider definitions before registering them.

    Args:
        provider_create: Provider configuration to test
        db: Database session (used for adapter resolution)
        current_user: Authenticated user (admin access required)
        provider_factory: Tool Provider factory

    Returns:
        ToolProviderValidationResult with test results (always 200)

    Raises:
        HTTPException: 403 for auth, 500 for unexpected errors

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    service = ToolProviderService(db, current_user, provider_factory)

    try:
        return await service.validate_provider_definition(provider_create)
    except Exception as e:
        logger.exception("Unexpected error validating tool provider definition", exc_info=e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected error validating tool provider definition",
        ) from e


@router.post("/{provider_id}/refresh-tools")
async def refresh_provider_tools(
    provider_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    provider_factory: Annotated[ProviderFactory, Depends(get_provider_factory)],
) -> ToolProviderRefreshResult:
    """Refresh tools from Tool Provider.

    Connects to the tool provider and refreshes the list of available tools.
    Creates new tools, updates existing ones, and disables missing tools.

    Args:
        provider_id: UUID of the provider to refresh
        db: Database session
        current_user: Authenticated user (admin access required)
        provider_factory: Tool Provider factory

    Returns:
        Refresh statistics including counts and timestamp

    Raises:
        HTTPException: 400 for refresh failure, 404 if not found, 403 for auth

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    service = ToolProviderService(db, current_user, provider_factory)

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
