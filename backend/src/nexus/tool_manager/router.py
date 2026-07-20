"""Tool Manager API endpoints."""

from typing import Annotated, Any
from uuid import UUID

import structlog
from fastapi import Depends, Query, Request
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.audit.decorators import audit
from nexus.audit.models.audit_event import EventCategory
from nexus.auth import get_current_user
from nexus.authz.dependencies import PermissionChecker, VisibilityFilter
from nexus.authz.engine import AllowedProjectsResult
from nexus.authz.exceptions import AuthorizationDeniedError
from nexus.core.database.session import get_db
from nexus.core.models import User
from nexus.core.nexus_router import NexusRouter
from nexus.integrations.router import _resolve_visible_integration_ids, integration_read_visibility
from nexus.tool_manager.exceptions import ToolNotFoundError
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


_tool_read_gate = VisibilityFilter("tool", "read")


async def tool_read_visibility(
    request: Request,
    current_user: User = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> AllowedProjectsResult:
    """Gate + scope for tool read endpoints.

    Checks tool:read for access (403 if denied), then uses
    integration_read_visibility to scope results by parent integration.
    """
    gate_result = await _tool_read_gate(request, current_user, db)
    if not gate_result.unrestricted and not gate_result.allowed_project_ids:
        msg = "Not authorized to perform read on tool"
        raise AuthorizationDeniedError(msg)

    return await integration_read_visibility(request, current_user, db)


@router.get("/tools", dependencies=[Depends(_tool_read_gate)], operation_id="get_tools")
async def get_tools(
    request: Request,
    service: Annotated[ToolService, Depends(get_tool_service)],
    params: Annotated[ToolListParams, Query()],
    db: Annotated[AsyncSession, Depends(get_db)],
    allowed_projects: Annotated[AllowedProjectsResult, Depends(tool_read_visibility)],
) -> ToolListResponse:
    """List tools with filtering, sorting, and pagination.

    Tools are filtered by the caller's integration visibility — only tools
    belonging to visible integrations are returned.
    """
    visible_ids = await _resolve_visible_integration_ids(db, allowed_projects)
    return await service.list_tools(
        limit=params.limit,
        cursor=params.cursor,
        sort=params.sort,
        query_params_items=request.query_params.items(),
        include_total=params.include_total,
        visible_integration_ids=visible_ids,
    )


@router.get("/tools/{tool_id}", dependencies=[Depends(_tool_read_gate)], operation_id="get_tool")
async def get_tool(
    tool_id: UUID,
    service: Annotated[ToolService, Depends(get_tool_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
    allowed_projects: Annotated[AllowedProjectsResult, Depends(tool_read_visibility)],
) -> ToolWithParameters:
    """Get tool details by ID."""
    tool = await service.get_tool_detail(tool_id)
    visible_ids = await _resolve_visible_integration_ids(db, allowed_projects)
    if visible_ids is not None and tool.integration_id not in set(visible_ids):
        raise ToolNotFoundError(str(tool_id))
    return tool


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
