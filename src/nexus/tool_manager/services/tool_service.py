"""Tool Service for database operations and business logic.

This module provides the service layer for Tool management, wrapping
core domain logic with database persistence and transaction management.
"""

from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy import Select
from sqlalchemy.orm import selectinload
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel.sql._expression_select_cls import SelectOfScalar

from nexus.audit.dispatcher import AuditEventDispatcher
from nexus.core.models import User
from nexus.core.services import BaseService
from nexus.core.services.extensions import ConvertResourceMixin, EnrichQueryMixin
from nexus.tool_manager.audit.tool_bulk_update import ToolBulkUpdateEvent
from nexus.tool_manager.audit.tool_update import ToolUpdateEvent
from nexus.tool_manager.exceptions import (
    ToolBulkUpdateValidationError,
    ToolNotFoundError,
)
from nexus.tool_manager.models.tool import (
    Tool,
    ToolListResponse,
    ToolUpdate,
    ToolWithParameters,
)
from nexus.tool_manager.models.tool_bulk_update import MAX_BULK_UPDATES

SelectTool = Select[tuple[Tool]] | SelectOfScalar[tuple[Tool]]

logger = structlog.stdlib.get_logger(__name__)


class ToolServiceEnrichQuery(EnrichQueryMixin):
    """Tool-specific query enrichment to eager load tool parameters."""

    def enrich(  # type: ignore[override]
        self, query: Select[tuple[Tool]] | SelectOfScalar[tuple[Tool]]
    ) -> Select[tuple[Tool]] | SelectOfScalar[tuple[Tool]]:
        """Extend the query to eager load tool parameters."""
        return query.options(selectinload(Tool.parameters))  # type: ignore[arg-type]


class ToolServiceConvertResourceMixin(ConvertResourceMixin):
    """Mixin for converting Tool resources to ToolWithParameters format."""

    def convert_resource(self, resource: Tool) -> ToolWithParameters:  # type: ignore[override]
        """Convert Tool to ToolWithParameters format."""
        return ToolWithParameters.model_validate(resource)


class ToolService(BaseService):
    """Service for Tool CRUD operations and business logic.

    This service handles database persistence, transaction management, and provides
    all core tool management functions with proper filtering and pagination.
    """

    def __init__(self, session: AsyncSession, user: User) -> None:
        """Initialize ToolService with database session and user context."""
        super().__init__(
            session,
            user,
            enrich_query_mixin=ToolServiceEnrichQuery(),
            convert_resource_mixin=ToolServiceConvertResourceMixin(),
        )

    async def list_tools(
        self,
        limit: int = 100,
        cursor: str | None = None,
        sort: str | None = None,
        query_params_items: Iterable[tuple[str, str]] | None = None,
        *,
        include_total: bool = False,
    ) -> ToolListResponse:
        """List tools with filtering, sorting, and pagination.

        Args:
            limit: Maximum number of tools to return (max 100)
            cursor: Cursor token for pagination
            sort: Sort parameter (e.g., "name", "-created_at")
            query_params_items: Raw query parameter items from request (for filtering)
            include_total: Whether to include total count in response

        Returns:
            ToolListResponse with tools, pagination metadata, and optional total

        """
        # Use unified list_resources method with _extend_query for parameter loading
        return await self.list_resources(
            model=Tool,
            response_type=ToolListResponse,
            limit=limit,
            cursor=cursor,
            sort=sort,
            query_params_items=query_params_items,
            include_total=include_total,
        )

    async def get_tool_detail(self, tool_id: UUID) -> ToolWithParameters:
        """Get a tool by ID with full details including parameters.

        Args:
            tool_id: UUID of the tool

        Returns:
            Tool instance with full schema and parameters

        Raises:
            ToolNotFoundError: If tool doesn't exist or is deleted

        """
        query = (
            select(Tool).options(selectinload(Tool.parameters)).filter(Tool.id == tool_id, Tool.deleted_at.is_(None))  # type: ignore[union-attr,arg-type]
        )

        result = await self.session.exec(query)
        tool = result.one_or_none()

        if not tool:
            msg = f"Tool {tool_id} not found"
            raise ToolNotFoundError(msg)

        return ToolWithParameters.model_validate(tool)

    async def update_tool(
        self,
        tool_id: UUID,
        tool_update: ToolUpdate,
    ) -> ToolWithParameters:
        """Update tool enabled state, status, and refresh error.

        Args:
            tool_id: UUID of the tool to update
            tool_update: Tool update data with optional fields

        Returns:
            Updated Tool instance

        Raises:
            ToolNotFoundError: If tool doesn't exist
            pydantic.ValidationError: If update data is invalid

        """
        query = (
            select(Tool).options(selectinload(Tool.parameters)).filter(Tool.id == tool_id, Tool.deleted_at.is_(None))  # type: ignore[union-attr,arg-type]
        )

        result = await self.session.exec(query)
        tool = result.one_or_none()

        if not tool:
            msg = f"Tool {tool_id} not found"
            AuditEventDispatcher.dispatch(
                ToolUpdateEvent(
                    tool_id=tool_id,
                    tool_name="<unknown>",
                    namespaced_name="<unknown>",
                    provider_id=UUID("00000000-0000-0000-0000-000000000000"),
                    error_type="ToolNotFoundError",
                )
            )
            raise ToolNotFoundError(msg)

        # Track which fields are being updated
        updated_fields: list[str] = []
        if tool_update.enabled is not None:
            tool.enabled = tool_update.enabled
            updated_fields.append("enabled")

        if tool_update.status is not None:
            tool.status = tool_update.status
            updated_fields.append("status")

        # Handle refresh_error - check if field was explicitly provided (including None)
        if "refresh_error" in tool_update.model_fields_set:
            tool.refresh_error = tool_update.refresh_error
            updated_fields.append("refresh_error")

        tool.updated_by = self.user.id
        tool.updated_at = datetime.now(UTC)

        await self.session.flush()

        AuditEventDispatcher.dispatch(
            ToolUpdateEvent(
                tool_id=tool.id,
                tool_name=tool.name,
                namespaced_name=tool.namespaced_name,
                provider_id=tool.provider_id,
                updated_fields=updated_fields,
            )
        )

        return await self.get_tool_detail(tool.id)

    async def bulk_update_tools(self, tool_ids: list[UUID], *, enabled: bool) -> dict[str, Any]:
        """Batch enable/disable operations with transaction management.

        Args:
            tool_ids: List of tool UUIDs to update (max 50)
            enabled: Enable/disable the tools

        Returns:
            Dict with updated_count, skipped_count, and updated_at

        Raises:
            pydantic.ValidationError: If tool_ids list is invalid

        """
        if not tool_ids:
            msg = "tool_ids cannot be empty"
            AuditEventDispatcher.dispatch(
                ToolBulkUpdateEvent(
                    tool_ids=[],
                    enabled=enabled,
                    error_type="ToolBulkUpdateValidationError",
                )
            )
            raise ToolBulkUpdateValidationError(msg)

        if len(tool_ids) > MAX_BULK_UPDATES:
            msg = f"Cannot update more than {MAX_BULK_UPDATES} tools at once"
            AuditEventDispatcher.dispatch(
                ToolBulkUpdateEvent(
                    tool_ids=tool_ids,
                    enabled=enabled,
                    error_type="ToolBulkUpdateValidationError",
                )
            )
            raise ToolBulkUpdateValidationError(msg)

        # Remove duplicates while preserving order
        unique_tool_ids = list(dict.fromkeys(tool_ids))
        duplicate_count = len(tool_ids) - len(unique_tool_ids)

        if duplicate_count > 0:
            logger.info(
                "Bulk update request contained duplicate tool_ids, removed duplicates",
                duplicate_count=duplicate_count,
                user_id=self.user.id,
                original_count=len(tool_ids),
                unique_count=len(unique_tool_ids),
            )

        # Query active/enabled tools
        active_query = select(Tool).filter(Tool.id.in_(unique_tool_ids), Tool.deleted_at.is_(None))  # type: ignore[union-attr,attr-defined]
        active_result = await self.session.exec(active_query)
        active_tools = active_result.all()
        active_tool_ids = {tool.id for tool in active_tools}

        # Query soft-deleted tools
        deleted_query = select(Tool).filter(Tool.id.in_(unique_tool_ids), Tool.deleted_at.is_not(None))  # type: ignore[union-attr,attr-defined]
        deleted_result = await self.session.exec(deleted_query)
        deleted_tools = deleted_result.all()
        deleted_tool_ids = {tool.id for tool in deleted_tools}

        # Identify tool_ids that don't exist at all
        found_tool_ids = active_tool_ids | deleted_tool_ids
        not_found_tool_ids = set(unique_tool_ids) - found_tool_ids

        # Log soft-deleted tools
        if deleted_tool_ids:
            logger.warning(
                "Bulk update request included soft-deleted tool_ids that will be skipped",
                deleted_count=len(deleted_tool_ids),
                user_id=self.user.id,
                deleted_tool_ids=[str(tool_id) for tool_id in deleted_tool_ids],
                enabled=enabled,
            )

        # Log tools that don't exist
        if not_found_tool_ids:
            logger.warning(
                "Bulk update request included tool_ids that do not exist in database",
                not_found_count=len(not_found_tool_ids),
                user_id=self.user.id,
                not_found_tool_ids=[str(tool_id) for tool_id in not_found_tool_ids],
                enabled=enabled,
            )

        updated_count = 0
        current_time = datetime.now(UTC)

        # Update each active tool
        for tool in active_tools:
            tool.enabled = enabled
            tool.updated_by = self.user.id
            tool.updated_at = current_time
            updated_count += 1

        skipped_count = len(unique_tool_ids) - updated_count

        await self.session.flush()

        AuditEventDispatcher.dispatch(
            ToolBulkUpdateEvent(
                tool_ids=tool_ids,
                enabled=enabled,
                updated_count=updated_count,
                skipped_count=skipped_count,
                duplicate_count=duplicate_count,
                deleted_count=len(deleted_tool_ids),
                not_found_count=len(not_found_tool_ids),
            )
        )

        logger.info(
            "Bulk update completed",
            updated_count=updated_count,
            skipped_count=skipped_count,
            user_id=self.user.id,
            enabled=enabled,
            total_requested=len(tool_ids),
            unique_requested=len(unique_tool_ids),
            duplicates=duplicate_count,
            soft_deleted=len(deleted_tool_ids),
            not_found=len(not_found_tool_ids),
        )

        return {
            "updated_count": updated_count,
            "skipped_count": skipped_count,
            "updated_at": current_time,
        }
