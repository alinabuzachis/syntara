"""Tool Provider API endpoints."""

from typing import Annotated, Any
from uuid import UUID

import structlog
from fastapi import Depends, Query, Request, status
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.auth import get_current_user
from nexus.core.database.session import get_db
from nexus.core.models import User
from nexus.core.nexus_router import NO_PERMISSION, NexusRouter
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

router = NexusRouter(prefix="/tool_manager", tags=["ToolManager"])

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


def get_tool_provider_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    provider_factory: Annotated[ProviderFactory, Depends(get_provider_factory)],
) -> ToolProviderService:
    """Dependency provider for ToolProviderService."""
    return ToolProviderService(db, current_user, provider_factory)


@router.get("/tools", dependencies=[NO_PERMISSION], operation_id="get_tools")
async def get_tools(
    request: Request,
    service: Annotated[ToolService, Depends(get_tool_service)],
    params: Annotated[ToolListParams, Query()],
) -> ToolListResponse:
    """List tools with filtering, sorting, and pagination."""
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    return await service.list_tools(
        limit=params.limit,
        cursor=params.cursor,
        sort=params.sort,
        query_params_items=request.query_params.items(),
        include_total=params.include_total,
    )


@router.get("/tools/{tool_id}", dependencies=[NO_PERMISSION], operation_id="get_tool")
async def get_tool(
    tool_id: UUID,
    service: Annotated[ToolService, Depends(get_tool_service)],
) -> ToolWithParameters:
    """Get tool details by ID."""
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    return await service.get_tool_detail(tool_id)


@router.patch("/tools/bulk_update", dependencies=[NO_PERMISSION], operation_id="bulk_update_tools")
async def bulk_update_tools(
    bulk_update: ToolBulkUpdate,
    service: Annotated[ToolService, Depends(get_tool_service)],
) -> dict[str, Any]:
    """Bulk update tool status (enable/disable multiple tools)."""
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    return await service.bulk_update_tools(bulk_update.tool_ids, enabled=bulk_update.enabled)


@router.patch("/tools/{tool_id}", dependencies=[NO_PERMISSION], operation_id="patch_tool")
async def patch_tool(
    tool_id: UUID,
    tool_update: ToolUpdate,
    service: Annotated[ToolService, Depends(get_tool_service)],
) -> ToolWithParameters:
    """Update tool status (enable/disable)."""
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    return await service.update_tool(
        tool_id,
        tool_update,
    )


@router.get("/tool_providers", dependencies=[NO_PERMISSION], operation_id="get_tool_providers")
async def get_tool_providers(
    request: Request,
    service: Annotated[ToolProviderService, Depends(get_tool_provider_service)],
    params: Annotated[ToolProviderListParams, Query()],
) -> ToolProviderListResponse:
    """List tool providers with filtering, sorting, and pagination."""
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    return await service.list_providers(
        limit=params.limit,
        cursor=params.cursor,
        sort=params.sort,
        query_params_items=request.query_params.items(),
        include_total=params.include_total,
    )


@router.post(
    "/tool_providers",
    status_code=status.HTTP_201_CREATED,
    dependencies=[NO_PERMISSION],
    operation_id="register_tool_provider",
)
async def register_tool_provider(
    provider_create: ToolProviderCreate,
    service: Annotated[ToolProviderService, Depends(get_tool_provider_service)],
) -> ToolProviderWithConfiguration:
    """Register a new Tool Provider."""
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    return await service.create_provider(provider_create)


@router.get("/tool_providers/{provider_id}", dependencies=[NO_PERMISSION], operation_id="get_tool_provider")
async def get_tool_provider(
    provider_id: UUID,
    service: Annotated[ToolProviderService, Depends(get_tool_provider_service)],
) -> ToolProviderWithConfiguration:
    """Get Tool Provider details by ID."""
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    return await service.get_provider(provider_id)


@router.put("/tool_providers/{provider_id}", dependencies=[NO_PERMISSION], operation_id="update_tool_provider")
async def update_tool_provider(
    provider_id: UUID,
    provider_update: ToolProviderCreate,
    service: Annotated[ToolProviderService, Depends(get_tool_provider_service)],
) -> ToolProviderWithConfiguration:
    """Update Tool Provider configuration (complete replacement)."""
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    return await service.update_provider(provider_id, provider_update)


@router.patch("/tool_providers/{provider_id}", dependencies=[NO_PERMISSION], operation_id="patch_tool_provider")
async def patch_tool_provider(
    provider_id: UUID,
    provider_patch: ToolProviderPatch,
    service: Annotated[ToolProviderService, Depends(get_tool_provider_service)],
) -> ToolProviderWithConfiguration:
    """Patch Tool Provider."""
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    return await service.patch_provider(provider_id, provider_patch)


@router.delete(
    "/tool_providers/{provider_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[NO_PERMISSION],
    operation_id="delete_tool_provider",
)
async def delete_tool_provider(
    provider_id: UUID,
    service: Annotated[ToolProviderService, Depends(get_tool_provider_service)],
) -> None:
    """Remove Tool Provider and all associated tools."""
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    await service.delete_provider(provider_id)


@router.post(
    "/tool_providers/{provider_id}/validate", dependencies=[NO_PERMISSION], operation_id="validate_tool_provider"
)
async def validate_tool_provider(
    provider_id: UUID,
    service: Annotated[ToolProviderService, Depends(get_tool_provider_service)],
) -> ToolProviderValidationResult:
    """Validate Tool Provider connection and capabilities."""
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    return await service.validate_provider(provider_id)


@router.post("/tool_providers/test", dependencies=[NO_PERMISSION], operation_id="test_tool_provider")
async def test_tool_provider(
    provider_create: ToolProviderCreate,
    service: Annotated[ToolProviderService, Depends(get_tool_provider_service)],
) -> ToolProviderValidationResult:
    """Test Tool Provider definition without saving to database."""
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    return await service.validate_provider_definition(provider_create)


@router.post(
    "/tool_providers/{provider_id}/refresh_tools", dependencies=[NO_PERMISSION], operation_id="refresh_tool_provider"
)
async def refresh_tool_provider(
    provider_id: UUID,
    service: Annotated[ToolProviderService, Depends(get_tool_provider_service)],
) -> ToolProviderRefreshResult:
    """Refresh tools from Tool Provider."""
    # TODO(manstis): Implement proper admin role checking: AAP-56797
    # For now, allowing all authenticated users

    return await service.refresh_tools(provider_id)
