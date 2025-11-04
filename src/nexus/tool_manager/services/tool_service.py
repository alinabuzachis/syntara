"""Tool Service for database operations and business logic.

This module provides the service layer for Tool management, wrapping
core domain logic with database persistence and transaction management.
"""

import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel.sql._expression_select_cls import SelectOfScalar

from nexus.core.models import User
from nexus.core.utils import (
    Filter,
    PaginationDirection,
    SortDirection,
    apply_filters,
    apply_sorting,
    decode_cursor,
    extract_pagination_from_cursor,
    generate_response,
    parse_filters,
    parse_sort,
)
from nexus.tool_manager.lib.exceptions import (
    ToolNotFoundError,
    ValidationError,
)
from nexus.tool_manager.models.tool import (
    Tool,
    ToolListResponse,
)
from nexus.tool_manager.models.tool_bulk_update import MAX_BULK_UPDATES

SelectTool = Select[tuple[Tool]] | SelectOfScalar[tuple[Tool]]

logger = logging.getLogger(__name__)


class ToolService:
    """Service for Tool CRUD operations and business logic.

    This service handles database persistence, transaction management, and provides
    all core tool management functions with proper filtering and pagination.
    """

    def __init__(self, session: AsyncSession, user: User) -> None:
        """Initialize service with database session and current user.

        Args:
            session: Async database session for operations
            user: Current authenticated user for audit tracking

        """
        self.session = session
        self.user = user

    def _apply_filters_to_query(
        self, query: SelectTool, query_params: dict[str, str]
    ) -> tuple[SelectTool, list[Filter]]:
        """Apply filters to query and return modified query and filter objects.

        Args:
            query: SQLAlchemy query to filter
            query_params: Query parameters for filtering

        Returns:
            Tuple of (filtered_query, filter_objects)

        Raises:
            ValidationError: If filter parameters are invalid

        """
        try:
            # Define allowed fields with bracket notation support
            allowed_filter_fields = [
                "name",
                "enabled",
                "status",
                "provider_id",
                "namespaced_name",
            ]
            filters = parse_filters(query_params, allowed_filter_fields)

            # Apply filters using standard apply_filters function
            query = apply_filters(query, filters, Tool)

            return query, filters
        except ValueError as e:
            msg = f"Invalid filter parameter: {e}"
            raise ValidationError(msg) from e

    def _apply_sorting_to_query(self, query: SelectTool, sort: str | None) -> tuple[SelectTool, SortDirection]:
        """Apply sorting to query and return modified query and sort direction.

        Args:
            query: SQLAlchemy query to sort
            sort: Sort parameter

        Returns:
            Tuple of (sorted_query, sort_direction)

        Raises:
            ValidationError: If sort parameter is invalid

        """
        try:
            allowed_sort_fields = ["name", "created_at", "updated_at", "status"]
            sort_field, sort_direction = parse_sort(sort, allowed_sort_fields)
            query = apply_sorting(query, [(sort_field, sort_direction)], Tool)
            return query, sort_direction
        except ValueError as e:
            msg = f"Invalid sort parameter: {e}"
            raise ValidationError(msg) from e

    def _apply_cursor_pagination_to_query(
        self,
        query: SelectTool,
        cursor: str | None,
        sort_direction: SortDirection,
    ) -> SelectTool:
        """Apply cursor-based pagination to query.

        Args:
            query: SQLAlchemy query to paginate
            cursor: Cursor token for pagination
            sort_direction: Sort direction from sorting step

        Returns:
            Query with cursor-based pagination applied

        """
        if not cursor:
            return query

        try:
            cursor_data = decode_cursor(cursor)
            resource_id, created_at, direction = extract_pagination_from_cursor(cursor_data)

            if resource_id and created_at:
                # Convert cursor data to proper types
                cursor_id = UUID(resource_id)
                cursor_timestamp = datetime.fromisoformat(created_at)

                # Apply cursor-based filtering based on sort direction and pagination direction
                if direction == PaginationDirection.NEXT:
                    if sort_direction.value == "desc":
                        query = query.filter(
                            (Tool.created_at < cursor_timestamp)  # type: ignore[arg-type]
                            | ((Tool.created_at == cursor_timestamp) & (Tool.id < cursor_id))
                        )
                    else:
                        query = query.filter(
                            (Tool.created_at > cursor_timestamp)  # type: ignore[arg-type]
                            | ((Tool.created_at == cursor_timestamp) & (Tool.id > cursor_id))
                        )
                elif sort_direction.value == "desc":
                    query = query.filter(
                        (Tool.created_at > cursor_timestamp)  # type: ignore[arg-type]
                        | ((Tool.created_at == cursor_timestamp) & (Tool.id > cursor_id))
                    )
                else:
                    query = query.filter(
                        (Tool.created_at < cursor_timestamp)  # type: ignore[arg-type]
                        | ((Tool.created_at == cursor_timestamp) & (Tool.id < cursor_id))
                    )
        except (ValueError, KeyError):
            # Invalid cursor - ignore and continue without cursor filtering
            pass

        return query

    async def _get_total_count(self, filters: list[Filter]) -> int | None:
        """Get total count of tools matching filters.

        Args:
            filters: List of filter objects to apply

        Returns:
            Total count of matching tools

        """
        count_query = select(func.count()).select_from(Tool).filter(Tool.deleted_at.is_(None))  # type: ignore[union-attr]

        # Apply the same filters to count query
        for filter_obj in filters:
            single_filter_count_query = apply_filters(count_query, [filter_obj], Tool)
            count_query = single_filter_count_query  # type: ignore[assignment]

        total_result = await self.session.execute(count_query)
        return total_result.scalar()

    async def list_tools(
        self,
        limit: int = 100,
        cursor: str | None = None,
        sort: str | None = None,
        include_total: bool = False,  # noqa: FBT001,FBT002
        **query_params: Any,  # noqa: ANN401
    ) -> ToolListResponse:
        """List tools with filtering, sorting, and pagination.

        Args:
            limit: Maximum number of tools to return (max 100)
            cursor: Cursor token for pagination
            sort: Sort parameter (e.g., "name", "-created_at")
            include_total: Whether to include total count in response
            **query_params: Additional query parameters for filtering

        Returns:
            Dict with tools list, pagination metadata, and optional total

        """
        # Build base query with soft delete filter
        query: SelectTool = select(Tool).filter(Tool.deleted_at.is_(None))  # type: ignore[union-attr]

        # Apply filters, sorting, and pagination
        query, filters = self._apply_filters_to_query(query, query_params)
        query, sort_direction = self._apply_sorting_to_query(query, sort)
        query = self._apply_cursor_pagination_to_query(query, cursor, sort_direction)

        # Apply limit and execute query
        query = query.limit(limit)
        result = await self.session.execute(query)
        tools = result.scalars().all()

        # Get total count if requested
        total_count = None
        if include_total:
            total_count = await self._get_total_count(filters)

        # Generate pagination response
        pagination_metadata = generate_response(
            items=tools,
            limit=limit,
            cursor=cursor,
            include_total=include_total,
            total_count=total_count,
        )

        return ToolListResponse(
            resources=tools,
            next=pagination_metadata["next"],
            prev=pagination_metadata["prev"],
            total=pagination_metadata["total"],
        )

    async def get_tool_detail(self, tool_id: UUID) -> Tool:
        """Get a tool by ID with full details including parameters.

        Args:
            tool_id: UUID of the tool

        Returns:
            Tool instance with full schema and parameters

        Raises:
            ToolNotFoundError: If tool doesn't exist or is deleted

        """
        query = select(Tool).filter(Tool.id == tool_id, Tool.deleted_at.is_(None))  # type: ignore[union-attr,arg-type]

        result = await self.session.execute(query)
        tool = result.scalar_one_or_none()

        if not tool:
            msg = f"Tool {tool_id} not found"
            raise ToolNotFoundError(msg)

        return tool

    async def update_tool(self, tool_id: UUID, *, enabled: bool) -> Tool:
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
        tool = await self.get_tool_detail(tool_id)

        tool.enabled = enabled
        tool.updated_by = self.user.id
        tool.updated_at = datetime.now(UTC)

        await self.session.flush()
        await self.session.refresh(tool)
        return tool

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
