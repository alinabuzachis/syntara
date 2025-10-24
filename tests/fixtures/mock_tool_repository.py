"""Mock tool repository for testing purposes."""

import copy
from datetime import UTC, datetime
from uuid import UUID

from nexus.core.utils.cursor import CursorData, SortDirection, extract_sort_from_cursor
from nexus.core.utils.filters import Filter, FilterOperator
from nexus.tool_manager.lib.exceptions import ToolNotFoundError, ValidationError
from nexus.tool_manager.lib.interfaces import ToolRepository
from nexus.tool_manager.models import Tool


class MockToolRepository(ToolRepository):
    """Mock tool repository for testing purposes."""

    def __init__(self) -> None:
        """Initialize mock repository with in-memory storage."""
        self._tools: dict[UUID, Tool] = {}
        self._tools_by_name: dict[str, Tool] = {}

    async def create(self, tool: Tool) -> Tool:
        """Create a new tool."""
        if tool.namespaced_name in self._tools_by_name:
            msg = f"Tool with namespaced name '{tool.namespaced_name}' already exists"
            raise ValidationError(msg)

        tool.created_at = datetime.now(UTC)
        tool.updated_at = tool.created_at
        self._tools[tool.id] = tool
        self._tools_by_name[tool.namespaced_name] = tool
        return tool

    async def get_by_id(self, tool_id: UUID) -> Tool | None:
        """Get tool by ID."""
        return self._tools.get(tool_id)

    async def get_by_namespaced_name(self, namespaced_name: str) -> Tool | None:
        """Get tool by namespaced name."""
        return self._tools_by_name.get(namespaced_name)

    def _apply_filters(self, items: list[Tool], filters: list[Filter] | None) -> list[Tool]:
        """Apply filtering to the list of tools."""
        if not filters:
            return items

        filtered_items = items
        for filter_obj in filters:
            if filter_obj.field == "name" and filter_obj.operator == FilterOperator.CONTAINS:
                filtered_items = [t for t in filtered_items if str(filter_obj.value).lower() in t.name.lower()]
            elif filter_obj.field == "enabled" and filter_obj.operator == FilterOperator.EQ:
                filter_value = filter_obj.value
                if isinstance(filter_value, str):
                    filter_value = filter_value.lower() == "true"
                filtered_items = [t for t in filtered_items if t.enabled == filter_value]
            elif filter_obj.field == "provider_id" and filter_obj.operator == FilterOperator.EQ:
                provider_id = UUID(filter_obj.value) if isinstance(filter_obj.value, str) else filter_obj.value
                filtered_items = [t for t in filtered_items if t.provider_id == provider_id]

        return filtered_items

    def _apply_sorting(self, items: list[Tool], cursor_data: CursorData | None) -> list[Tool]:
        """Apply sorting to the list of tools."""
        sort_field = "created_at"
        sort_direction = SortDirection.DESC

        if cursor_data:
            sort_field, sort_direction = extract_sort_from_cursor(cursor_data)

        # Handle different sort fields
        if sort_field == "name":
            items.sort(key=lambda x: x.name, reverse=(sort_direction == SortDirection.DESC))
        elif sort_field == "updated_at":
            items.sort(key=lambda x: x.updated_at, reverse=(sort_direction == SortDirection.DESC))
        else:  # Default to created_at
            items.sort(key=lambda x: x.created_at, reverse=(sort_direction == SortDirection.DESC))

        return items

    def _apply_pagination(self, items: list[Tool], cursor_data: CursorData | None, limit: int) -> list[Tool]:
        """Apply cursor-based pagination to the list of tools."""
        start_index = 0
        if cursor_data and "id" in cursor_data:
            # Find the position of the cursor ID in the sorted list
            cursor_id = cursor_data["id"]
            try:
                cursor_uuid = UUID(cursor_id)
                for i, item in enumerate(items):
                    if item.id == cursor_uuid:
                        # Start from next item for pagination
                        start_index = i + 1
                        break
            except (ValueError, TypeError):
                # Invalid cursor ID, start from beginning
                start_index = 0

        # Return the requested page
        end_index = start_index + limit
        return items[start_index:end_index]

    async def list_tools(
        self,
        filters: list[Filter] | None = None,
        cursor_data: CursorData | None = None,
        limit: int = 20,
    ) -> list[Tool]:
        """List tools with optional filtering and pagination."""
        items = list(self._tools.values())

        # Apply filtering, sorting, and pagination in sequence
        items = self._apply_filters(items, filters)
        items = self._apply_sorting(items, cursor_data)
        items = self._apply_pagination(items, cursor_data, limit)

        return items  # noqa: RET504

    async def update(self, tool: Tool) -> Tool:
        """Update an existing tool."""
        if tool.id not in self._tools:
            msg = f"Tool with ID '{tool.id}' not found"
            raise ToolNotFoundError(msg)

        # Clone the existing tool to avoid modifying the original instance
        old_tool = self._tools[tool.id]
        updated_tool = copy.deepcopy(tool)

        # Update name mapping if name changed
        if old_tool.namespaced_name != updated_tool.namespaced_name:
            del self._tools_by_name[old_tool.namespaced_name]
            self._tools_by_name[updated_tool.namespaced_name] = updated_tool

        updated_tool.updated_at = datetime.now(UTC)
        self._tools[updated_tool.id] = updated_tool
        return updated_tool

    async def delete(self, tool_id: UUID) -> bool:
        """Delete a tool."""
        tool = self._tools.get(tool_id)
        if not tool:
            return False

        del self._tools[tool_id]
        del self._tools_by_name[tool.namespaced_name]
        return True

    async def bulk_update_enabled(self, tool_ids: list[UUID], *, enabled: bool) -> int:
        """Bulk update enabled status for multiple tools."""
        updated_count = 0
        for tool_id in tool_ids:
            if tool_id in self._tools:
                self._tools[tool_id].enabled = enabled
                self._tools[tool_id].updated_at = datetime.now(UTC)
                updated_count += 1
        return updated_count
