"""Tool Provider API endpoints."""

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.api.auth import get_current_user
from nexus.api.db import get_db
from nexus.core.models import User
from nexus.tool_manager.lib.exceptions import (
    ProviderError,
    ProviderNameConflictError,
    ProviderNotFoundError,
    ValidationError,
)
from nexus.tool_manager.models.tool_provider import (
    ToolProvider,
    ToolProviderCreate,
    ToolProviderListResponse,
    ToolProviderPatch,
)
from nexus.tool_manager.models.tool_provider_refresh_result import ToolProviderRefreshResult
from nexus.tool_manager.models.tool_provider_validation_result import ToolProviderValidationResult
from nexus.tool_manager.services.tool_provider_service import ToolProviderService

router = APIRouter(prefix="/tool-providers", tags=["tool-providers"])

logger = logging.getLogger(__name__)


def _create_tool_provider_service(db: AsyncSession, current_user: User, request: Request) -> ToolProviderService:
    """Create a ToolProviderService instance.

    This function can be patched in tests to return a service with mock providers registered.

    Args:
        db: Database session
        current_user: Current authenticated user
        request: FastAPI request object (to access app.state.provider_factory)

    Returns:
        ToolProviderService instance

    """
    provider_factory = request.app.state.provider_factory
    return ToolProviderService(db, current_user, provider_factory)


@router.get("")
async def list_tool_providers(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
    cursor: Annotated[str | None, Query()] = None,
    sort: Annotated[str | None, Query()] = None,
    *,
    include_total: Annotated[bool, Query()] = False,
) -> ToolProviderListResponse:
    """List tool providers with filtering, sorting, and pagination.

    Supports filtering using query parameters with standard operators:
    - name: Filter by provider name (name=provider_name, name[contains]=text)
    - status: Filter by provider status (status=validating|available|error)
    - enabled: Filter by enabled status (enabled=true|false)
    - provider_type: Filter by provider type (provider_type=openapi)
    - configuration.base_url: Filter by base URL (configuration.base_url[contains]=localhost)
    - labels: Filter by labels using bracket notation (labels[environment]=production)

    Uses cursor-based pagination for scalability and consistency.

    Args:
        request: FastAPI request object containing query parameters
        db: Database session
        current_user: Current authenticated user
        limit: Maximum results per page (default 100, max 100)
        cursor: Base64-encoded pagination cursor from previous response
        sort: Sort parameter (e.g., 'name', '-created_at')
        include_total: Whether to include total count (default false, expensive)

    Returns:
        ToolProviderListResponse with providers, pagination metadata, and optional total

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    service = _create_tool_provider_service(db, current_user, request)

    try:
        return await service.list_providers(
            limit=limit,
            cursor=cursor,
            sort=sort,
            query_params_items=request.query_params.items(),
            include_total=include_total,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)) from e
    except Exception as e:
        logger.exception("Unexpected error listing tool providers", exc_info=e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unexpected error listing tool providers"
        ) from e


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_tool_provider(
    request: Request,
    provider_create: ToolProviderCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ToolProvider:
    """Register a new Tool Provider.

    Creates a new tool provider with the specified configuration.
    The provider starts in 'validating' status.

    Args:
        request: FastAPI request object containing query parameters
        provider_create: Provider configuration and metadata
        db: Database session
        current_user: Authenticated user (admin access required)

    Returns:
        Created ToolProvider instance

    Raises:
        HTTPException: 400 for validation errors, 409 for name conflicts, 403 for auth

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    service = _create_tool_provider_service(db, current_user, request)

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
    request: Request,
    provider_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ToolProvider:
    """Get Tool Provider details by ID.

    Returns detailed information about a specific Tool Provider including
    configuration, status, and metadata.

    Args:
        request: FastAPI request object containing query parameters
        provider_id: UUID of the provider to retrieve
        db: Database session
        current_user: Authenticated user (admin access required)

    Returns:
        ToolProvider instance with full details

    Raises:
        HTTPException: 404 if provider not found, 403 for auth, 400 for invalid UUID

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    service = _create_tool_provider_service(db, current_user, request)

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
    request: Request,
    provider_id: UUID,
    provider_update: ToolProviderCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ToolProvider:
    """Update Tool Provider configuration (complete replacement).

    Performs a complete replacement of the provider configuration.
    All fields in the request body will replace existing values.

    Args:
        request: FastAPI request object containing query parameters
        provider_id: UUID of the provider to update
        provider_update: New provider configuration
        db: Database session
        current_user: Authenticated user (admin access required)

    Returns:
        Updated ToolProvider instance

    Raises:
        HTTPException: 400 for validation errors, 404 if not found, 409 for conflicts, 403 for auth

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    service = _create_tool_provider_service(db, current_user, request)

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
    request: Request,
    provider_id: UUID,
    provider_patch: ToolProviderPatch,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ToolProvider:
    """Patch Tool Provider.

    Performs a partial update of the provider configuration.
    Only provided fields are updated, configuration objects are replaced.

    Args:
        request: FastAPI request object containing query parameters
        provider_id: UUID of the provider to patch
        provider_patch: Partial update data
        db: Database session
        current_user: Authenticated user (admin access required)

    Returns:
        Updated ToolProvider instance

    Raises:
        HTTPException: 400 for validation errors, 404 if not found, 409 for conflicts, 403 for auth

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    service = _create_tool_provider_service(db, current_user, request)

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
    request: Request,
    provider_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    """Remove Tool Provider and all associated tools.

    Performs a soft delete of the provider and cascades to associated tools.
    The provider will no longer be accessible but remains in the database.

    Args:
        request: FastAPI request object containing query parameters
        provider_id: UUID of the provider to delete
        db: Database session
        current_user: Authenticated user (admin access required)

    Raises:
        HTTPException: 404 if provider not found, 403 for auth

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    service = _create_tool_provider_service(db, current_user, request)

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
    request: Request,
    provider_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ToolProviderValidationResult:
    """Validate Tool Provider connection and capabilities.

    Tests the connection to the tool provider and validates compatibility.
    Updates the provider status based on validation results.

    Args:
        request: FastAPI request object containing query parameters
        provider_id: UUID of the provider to validate
        db: Database session
        current_user: Authenticated user (admin access required)

    Returns:
        Validation result with status and capability details (always 200)

    Raises:
        HTTPException: 404 if not found, 403 for auth, 500 for unexpected errors

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    service = _create_tool_provider_service(db, current_user, request)

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
    request: Request,
    provider_create: ToolProviderCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ToolProviderValidationResult:
    """Test Tool Provider definition without saving to database.

    Validates the provider configuration and tests connectivity using the appropriate adapter.
    This endpoint allows testing provider definitions before registering them.

    Args:
        request: FastAPI request object containing query parameters
        provider_create: Provider configuration to test
        db: Database session (used for adapter resolution)
        current_user: Authenticated user (admin access required)

    Returns:
        ToolProviderValidationResult with test results (always 200)

    Raises:
        HTTPException: 403 for auth, 500 for unexpected errors

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    service = _create_tool_provider_service(db, current_user, request)

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
    request: Request,
    provider_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ToolProviderRefreshResult:
    """Refresh tools from Tool Provider.

    Connects to the tool provider and refreshes the list of available tools.
    Creates new tools, updates existing ones, and disables missing tools.

    Args:
        request: FastAPI request object containing query parameters
        provider_id: UUID of the provider to refresh
        db: Database session
        current_user: Authenticated user (admin access required)

    Returns:
        Refresh statistics including counts and timestamp

    Raises:
        HTTPException: 400 for refresh failure, 404 if not found, 403 for auth

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    service = _create_tool_provider_service(db, current_user, request)

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
