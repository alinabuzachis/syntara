"""Tool Service for database operations and business logic.

This module provides the service layer for Tool management, wrapping
core domain logic with database persistence and transaction management.
"""

import logging
from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlmodel.sql._expression_select_cls import SelectOfScalar

from nexus.core.models import User
from nexus.core.services import BaseService
from nexus.core.services.extensions import ConvertResourceMixin, EnrichQueryMixin
from nexus.tool_manager.lib.exceptions import (
    ToolNotFoundError,
    ValidationError,
)
from nexus.tool_manager.models.tool import (
    Tool,
    ToolListResponse,
    ToolWithParameters,
)
from nexus.tool_manager.models.tool_bulk_update import MAX_BULK_UPDATES

SelectTool = Select[tuple[Tool]] | SelectOfScalar[tuple[Tool]]

logger = logging.getLogger(__name__)


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

        result = await self.session.execute(query)
        tool = result.scalar_one_or_none()

        if not tool:
            msg = f"Tool {tool_id} not found"
            raise ToolNotFoundError(msg)

        return ToolWithParameters.model_validate(tool)

    async def update_tool(self, tool_id: UUID, *, enabled: bool) -> ToolWithParameters:
        """Enable/disable individual tool by changing status.

        Args:
            tool_id: UUID of the tool to update
            enabled: Enable/disable the tool

        Returns:
            Updated Tool instance

        Raises:
            ToolNotFoundError: If tool doesn't exist
            ValidationError: If update data is invalid

        """
        query = (
            select(Tool).options(selectinload(Tool.parameters)).filter(Tool.id == tool_id, Tool.deleted_at.is_(None))  # type: ignore[union-attr,arg-type]
        )

        result = await self.session.execute(query)
        tool = result.scalar_one_or_none()

        if not tool:
            msg = f"Tool {tool_id} not found"
            raise ToolNotFoundError(msg)

        tool.enabled = enabled
        tool.updated_by = self.user.id
        tool.updated_at = datetime.now(UTC)

        return await self.get_tool_detail(tool.id)

    async def bulk_update_tools(self, tool_ids: list[UUID], *, enabled: bool) -> dict[str, Any]:
        """Batch enable/disable operations with transaction management.

        Args:
            tool_ids: List of tool UUIDs to update (max 50)
            enabled: Enable/disable the tools

        Returns:
            Dict with updated_count, skipped_count, and updated_at

        Raises:
            ValidationError: If tool_ids list is invalid

        """
        if not tool_ids:
            msg = "tool_ids cannot be empty"
            raise ValidationError(msg)

        if len(tool_ids) > MAX_BULK_UPDATES:
            msg = f"Cannot update more than {MAX_BULK_UPDATES} tools at once"
            raise ValidationError(msg)

        # Remove duplicates while preserving order
        unique_tool_ids = list(dict.fromkeys(tool_ids))
        duplicate_count = len(tool_ids) - len(unique_tool_ids)

        if duplicate_count > 0:
            logger.info(
                "Bulk update request contained %d duplicate tool_ids, removed duplicates",
                duplicate_count,
                extra={"user_id": self.user.id, "original_count": len(tool_ids), "unique_count": len(unique_tool_ids)},
            )

        # Query active/enabled tools
        active_query = select(Tool).filter(Tool.id.in_(unique_tool_ids), Tool.deleted_at.is_(None))  # type: ignore[union-attr,attr-defined]
        active_result = await self.session.execute(active_query)
        active_tools = active_result.scalars().all()
        active_tool_ids = {tool.id for tool in active_tools}

        # Query soft-deleted tools
        deleted_query = select(Tool).filter(Tool.id.in_(unique_tool_ids), Tool.deleted_at.is_not(None))  # type: ignore[union-attr,attr-defined]
        deleted_result = await self.session.execute(deleted_query)
        deleted_tools = deleted_result.scalars().all()
        deleted_tool_ids = {tool.id for tool in deleted_tools}

        # Identify tool_ids that don't exist at all
        found_tool_ids = active_tool_ids | deleted_tool_ids
        not_found_tool_ids = set(unique_tool_ids) - found_tool_ids

        # Log soft-deleted tools
        if deleted_tool_ids:
            logger.warning(
                "Bulk update request included %d soft-deleted tool_ids that will be skipped",
                len(deleted_tool_ids),
                extra={
                    "user_id": self.user.id,
                    "deleted_tool_ids": [str(tool_id) for tool_id in deleted_tool_ids],
                    "enabled": enabled,
                },
            )

        # Log tools that don't exist
        if not_found_tool_ids:
            logger.warning(
                "Bulk update request included %d tool_ids that do not exist in database",
                len(not_found_tool_ids),
                extra={
                    "user_id": self.user.id,
                    "not_found_tool_ids": [str(tool_id) for tool_id in not_found_tool_ids],
                    "enabled": enabled,
                },
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

        logger.info(
            "Bulk update completed: %d tools updated, %d skipped",
            updated_count,
            skipped_count,
            extra={
                "user_id": self.user.id,
                "enabled": enabled,
                "total_requested": len(tool_ids),
                "unique_requested": len(unique_tool_ids),
                "duplicates": duplicate_count,
                "soft_deleted": len(deleted_tool_ids),
                "not_found": len(not_found_tool_ids),
            },
        )

        return {
            "updated_count": updated_count,
            "skipped_count": skipped_count,
            "updated_at": current_time,
        }
