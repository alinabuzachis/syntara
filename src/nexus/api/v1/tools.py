"""Tool API endpoints."""

import logging
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.api.auth import get_current_user
from nexus.api.db import get_db
from nexus.core.models import User
from nexus.tool_manager.lib.exceptions import (
    ToolNotFoundError,
    ValidationError,
)
from nexus.tool_manager.models import ToolListParams
from nexus.tool_manager.models.tool import (
    ToolListResponse,
    ToolUpdate,
    ToolWithParameters,
)
from nexus.tool_manager.models.tool_bulk_update import ToolBulkUpdate
from nexus.tool_manager.services.tool_service import ToolService

router = APIRouter(prefix="/tools", tags=["tools"])

logger = logging.getLogger(__name__)


@router.get("")
async def list_tools(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
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
        db: Database session
        current_user: Current authenticated user
        params: Query parameters for pagination and filtering

    Returns:
        ToolListResponse with tools, pagination metadata, and optional total

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    service = ToolService(db, current_user)

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


@router.get("/{tool_id}")
async def get_tool(
    tool_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ToolWithParameters:
    """Get tool details by ID.

    Returns detailed information about a specific tool including
    parameters, status, and metadata.

    Args:
        tool_id: UUID of the tool to retrieve
        db: Database session
        current_user: Authenticated user (admin access required)

    Returns:
        ToolWithParameters instance with full details

    Raises:
        HTTPException: 404 if tool not found, 403 for auth, 400 for invalid UUID

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    service = ToolService(db, current_user)

    try:
        return await service.get_tool_detail(tool_id)

    except ToolNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=e.message) from e
    except Exception as e:
        logger.exception("Unexpected error getting tool details", exc_info=e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unexpected error getting tool details"
        ) from e


@router.patch("/bulk-update")
async def bulk_update_tools(
    bulk_update: ToolBulkUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    """Bulk update tool status (enable/disable multiple tools).

    Updates the status of multiple tools in a single operation.
    Only admin-controllable status changes are allowed (available/disabled).

    Args:
        bulk_update: Bulk update request with tool IDs and status
        db: Database session
        current_user: Authenticated user (admin access required)

    Returns:
        Dictionary with update statistics and timestamp

    Raises:
        HTTPException: 400 for validation errors, 403 for auth

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    service = ToolService(db, current_user)

    try:
        return await service.bulk_update_tools(bulk_update.tool_ids, enabled=bulk_update.enabled)
    except ValidationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message) from e
    except Exception as e:
        logger.exception("Unexpected error bulk updating tools", exc_info=e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unexpected error bulk updating tools"
        ) from e


@router.patch("/{tool_id}")
async def update_tool(
    tool_id: UUID,
    tool_update: ToolUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ToolWithParameters:
    """Update tool status (enable/disable).

    Updates the tool's status to enable or disable it for use.
    Only admin-controllable status changes are allowed (available/disabled).

    Args:
        tool_id: UUID of the tool to update
        tool_update: Tool update data with status
        db: Database session
        current_user: Authenticated user (admin access required)

    Returns:
        Updated Tool instance

    Raises:
        HTTPException: 400 for validation errors, 404 if not found, 403 for auth

    """
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    service = ToolService(db, current_user)

    try:
        return await service.update_tool(tool_id, enabled=tool_update.enabled)

    except ToolNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=e.message) from e
    except ValidationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.message) from e
    except Exception as e:
        logger.exception("Unexpected error updating tool", exc_info=e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unexpected error updating tool"
        ) from e
