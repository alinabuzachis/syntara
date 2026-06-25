"""Tool Manager API endpoints."""

from typing import Annotated, Any
from uuid import UUID

import structlog
from fastapi import Depends, Query, Request
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.audit.decorators import audit
from nexus.audit.models.audit_event import EventCategory
from nexus.auth import get_current_user
from nexus.authz.dependencies import PermissionChecker
from nexus.core.database.session import get_db
from nexus.core.models import User
from nexus.core.nexus_router import NexusRouter
from nexus.tool_manager.models import ToolListParams
from nexus.tool_manager.models.tool import (
    ToolListResponse,
    ToolUpdate,
    ToolWithParameters,
)
from nexus.tool_manager.models.tool_bulk_update import ToolBulkUpdate
from nexus.tool_manager.services.tool_service import ToolService

router = NexusRouter(prefix="/tool_manager", tags=["ToolManager"])

_perm_read = PermissionChecker("tool", "read")
_perm_update = PermissionChecker("tool", "update")

logger = structlog.stdlib.get_logger(__name__)


# ============================================================================
# Dependency Injection Providers
# ============================================================================


def get_tool_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ToolService:
    """Dependency provider for ToolService."""
    return ToolService(db, current_user)


@router.get("/tools", dependencies=[Depends(_perm_read)], operation_id="get_tools")
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
    - integration_id: Filter by integration ID (integration_id=uuid)
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
    return await service.list_tools(
        limit=params.limit,
        cursor=params.cursor,
        sort=params.sort,
        query_params_items=request.query_params.items(),
        include_total=params.include_total,
    )


@router.get("/tools/{tool_id}", dependencies=[Depends(_perm_read)], operation_id="get_tool")
async def get_tool(
    tool_id: UUID,
    service: Annotated[ToolService, Depends(get_tool_service)],
) -> ToolWithParameters:
    """Get tool details by ID."""
    return await service.get_tool_detail(tool_id)


@router.patch("/tools/bulk_update", dependencies=[Depends(_perm_update)], operation_id="bulk_update_tools")
@audit(EventCategory.USER_ACTION, event_action="tool_bulk_update")
async def bulk_update_tools(
    bulk_update: ToolBulkUpdate,
    service: Annotated[ToolService, Depends(get_tool_service)],
) -> dict[str, Any]:
    """Bulk update tool status (enable/disable multiple tools)."""
    return await service.bulk_update_tools(bulk_update.tool_ids, enabled=bulk_update.enabled)


@router.patch("/tools/{tool_id}", dependencies=[Depends(_perm_update)], operation_id="patch_tool")
@audit(EventCategory.USER_ACTION, event_action="tool_update", capture_args={"tool_id"})
async def patch_tool(
    tool_id: UUID,
    tool_update: ToolUpdate,
    service: Annotated[ToolService, Depends(get_tool_service)],
) -> ToolWithParameters:
    """Update tool status (enable/disable)."""
    return await service.update_tool(
        tool_id,
        tool_update,
    )
