"""Mock tool repository for testing purposes."""

import copy
from datetime import UTC, datetime
from uuid import UUID

from nexus.tool_manager.lib.tool_core import (
    FilterParam,
    PaginationParams,
    PaginationResult,
    Tool,
    ToolNotFoundError,
    ToolRepository,
    ValidationError,
)


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

    async def list_tools(
        self,
        filters: list[FilterParam] | None = None,
        pagination: PaginationParams | None = None,
    ) -> PaginationResult:
        """List tools with optional filtering and pagination."""
        items = list(self._tools.values())

        # Apply basic filtering (simplified for mock)
        if filters:
            for filter_param in filters:
                if filter_param.field == "name" and filter_param.operator == "contains":
                    items = [t for t in items if filter_param.value.lower() in t.name.lower()]
                elif filter_param.field == "enabled" and filter_param.operator == "eq":
                    items = [t for t in items if t.enabled == filter_param.value]
                elif filter_param.field == "provider_id" and filter_param.operator == "eq":
                    provider_id = (
                        UUID(filter_param.value) if isinstance(filter_param.value, str) else filter_param.value
                    )
                    items = [t for t in items if t.provider_id == provider_id]

        # Sort by created_at for consistent ordering
        items.sort(key=lambda x: x.created_at)

        # Apply pagination (simplified)
        pagination = pagination or PaginationParams()
        start = 0
        if pagination.cursor:
            try:
                start = int(pagination.cursor)
            except (ValueError, TypeError):
                start = 0

        end = start + pagination.limit
        page_items = items[start:end]
        has_more = end < len(items)
        next_cursor = str(end) if has_more else None
        total = len(items) if pagination.include_total else None

        return PaginationResult(
            items=page_items,
            next_cursor=next_cursor,
            has_more=has_more,
            total=total,
        )

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
