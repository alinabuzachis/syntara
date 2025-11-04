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


def _create_tool_provider_service(db: AsyncSession, current_user: User) -> ToolProviderService:
    """Create a ToolProviderService instance.

    This function can be patched in tests to return a service with mock providers registered.

    Args:
        db: Database session
        current_user: Current authenticated user

    Returns:
        ToolProviderService instance

    """
    return ToolProviderService(db, current_user)


def _is_duplicate_name_error(e: IntegrityError) -> bool:
    """Check if IntegrityError is due to duplicate provider name.

    Args:
        e: The IntegrityError to check

    Returns:
        True if error is due to duplicate provider name constraint

    """
    error_str = str(e)
    return (
        "ix_tool_providers_name_unique" in error_str
        or "tool_providers.name" in error_str
        or ("duplicate key" in error_str.lower() and "name" in error_str.lower())
    )


def _handle_integrity_error(e: IntegrityError, provider_name: str | None = None) -> HTTPException:
    """Handle IntegrityError and convert to appropriate HTTPException.

    Args:
        e: The IntegrityError to handle
        provider_name: Name of the provider (for specific error messages)

    Returns:
        HTTPException with appropriate status code and message

    """
    if _is_duplicate_name_error(e):
        if provider_name:
            detail = f"Provider with name '{provider_name}' already exists"
        else:
            detail = "Provider name already exists"
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("")
async def list_tool_providers(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
    cursor: Annotated[str | None, Query()] = None,
    sort: Annotated[str | None, Query()] = None,
    include_total: Annotated[bool, Query()] = False,  # noqa: FBT002
) -> ToolProviderListResponse:
    """List all registered Tool Providers with filtering and pagination.

    Supports keyset pagination and bracket filter notation for advanced filtering.

    Args:
        request: FastAPI request object containing query parameters
        db: Database session
        current_user: Authenticated user (admin access required)
        limit: Maximum number of providers to return (1-100)
        cursor: Cursor token for pagination
        sort: Sort parameter (e.g., "name", "-created_at")
        include_total: Whether to include total count in response

    Returns:
        Dictionary with providers list and pagination metadata

    Raises:
        HTTPException: 403 if user lacks admin access

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797  # noqa: FIX002
    # For now, allowing all authenticated users

    service = _create_tool_provider_service(db, current_user)

    # Extract all query parameters (excluding pagination/sorting params)
    excluded_params = {"limit", "cursor", "sort", "include_total"}
    query_params: dict[str, str] = {
        key: value for key, value in request.query_params.items() if key not in excluded_params
    }

    try:
        return await service.list_providers(
            limit=limit, cursor=cursor, sort=sort, include_total=include_total, **query_params
        )
    except ValidationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message) from e
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
) -> ToolProvider:
    """Register a new Tool Provider.

    Creates a new tool provider with the specified configuration.
    The provider starts in 'validating' status.

    Args:
        provider_create: Provider configuration and metadata
        db: Database session
        current_user: Authenticated user (admin access required)

    Returns:
        Created ToolProvider instance

    Raises:
        HTTPException: 400 for validation errors, 409 for name conflicts, 403 for auth

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797  # noqa: FIX002
    # For now, allowing all authenticated users

    service = _create_tool_provider_service(db, current_user)

    try:
        return await service.create_provider(provider_create)
    except ValidationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message) from e
    except IntegrityError as e:
        raise _handle_integrity_error(e, provider_create.name) from e
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
) -> ToolProvider:
    """Get Tool Provider details by ID.

    Returns detailed information about a specific Tool Provider including
    configuration, status, and metadata.

    Args:
        provider_id: UUID of the provider to retrieve
        db: Database session
        current_user: Authenticated user (admin access required)

    Returns:
        ToolProvider instance with full details

    Raises:
        HTTPException: 404 if provider not found, 403 for auth, 400 for invalid UUID

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797  # noqa: FIX002
    # For now, allowing all authenticated users

    service = _create_tool_provider_service(db, current_user)

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
) -> ToolProvider:
    """Update Tool Provider configuration (complete replacement).

    Performs a complete replacement of the provider configuration.
    All fields in the request body will replace existing values.

    Args:
        provider_id: UUID of the provider to update
        provider_update: New provider configuration
        db: Database session
        current_user: Authenticated user (admin access required)

    Returns:
        Updated ToolProvider instance

    Raises:
        HTTPException: 400 for validation errors, 404 if not found, 409 for conflicts, 403 for auth

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797  # noqa: FIX002
    # For now, allowing all authenticated users

    service = _create_tool_provider_service(db, current_user)

    try:
        return await service.update_provider(provider_id, provider_update)
    except ProviderNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=e.message) from e
    except ValidationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message) from e
    except IntegrityError as e:
        raise _handle_integrity_error(e, provider_update.name) from e
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
) -> ToolProvider:
    """Patch Tool Provider.

    Performs a partial update of the provider configuration.
    Only provided fields are updated, configuration objects are replaced.

    Args:
        provider_id: UUID of the provider to patch
        provider_patch: Partial update data
        db: Database session
        current_user: Authenticated user (admin access required)

    Returns:
        Updated ToolProvider instance

    Raises:
        HTTPException: 400 for validation errors, 404 if not found, 409 for conflicts, 403 for auth

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797  # noqa: FIX002
    # For now, allowing all authenticated users

    service = _create_tool_provider_service(db, current_user)

    try:
        return await service.patch_provider(provider_id, provider_patch)
    except ProviderNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=e.message) from e
    except ValidationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message) from e
    except IntegrityError as e:
        raise _handle_integrity_error(e) from e
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
) -> None:
    """Remove Tool Provider and all associated tools.

    Performs a soft delete of the provider and cascades to associated tools.
    The provider will no longer be accessible but remains in the database.

    Args:
        provider_id: UUID of the provider to delete
        db: Database session
        current_user: Authenticated user (admin access required)

    Raises:
        HTTPException: 404 if provider not found, 403 for auth

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797  # noqa: FIX002
    # For now, allowing all authenticated users

    service = _create_tool_provider_service(db, current_user)

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
) -> ToolProviderValidationResult:
    """Validate Tool Provider connection and capabilities.

    Tests the connection to the tool provider and validates compatibility.
    Updates the provider status based on validation results.

    Args:
        provider_id: UUID of the provider to validate
        db: Database session
        current_user: Authenticated user (admin access required)

    Returns:
        Validation result with status and capability details

    Raises:
        HTTPException: 400 for validation failure, 404 if not found, 403 for auth

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797  # noqa: FIX002
    # For now, allowing all authenticated users

    service = _create_tool_provider_service(db, current_user)

    try:
        return await service.validate_provider(provider_id)
    except ProviderNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except ProviderError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    except Exception as e:
        logger.exception("Unexpected error validating tool provider", exc_info=e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unexpected error validating tool provider"
        ) from e


@router.post("/{provider_id}/refresh-tools")
async def refresh_provider_tools(
    provider_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ToolProviderRefreshResult:
    """Refresh tools from Tool Provider.

    Connects to the tool provider and refreshes the list of available tools.
    Creates new tools, updates existing ones, and disables missing tools.

    Args:
        provider_id: UUID of the provider to refresh
        db: Database session
        current_user: Authenticated user (admin access required)

    Returns:
        Refresh statistics including counts and timestamp

    Raises:
        HTTPException: 400 for refresh failure, 404 if not found, 403 for auth

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797  # noqa: FIX002
    # For now, allowing all authenticated users

    service = _create_tool_provider_service(db, current_user)

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
