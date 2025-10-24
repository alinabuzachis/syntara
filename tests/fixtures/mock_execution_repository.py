"""Mock execution repository for testing purposes."""

from datetime import UTC, datetime
from uuid import UUID

from nexus.core.utils.cursor import CursorData, SortDirection, extract_sort_from_cursor
from nexus.core.utils.filters import Filter, FilterOperator
from nexus.tool_manager.lib.interfaces import ExecutionRepository
from nexus.tool_manager.models import ToolExecution


class MockExecutionRepository(ExecutionRepository):
    """Mock execution repository for testing purposes."""

    def __init__(self) -> None:
        """Initialize mock repository with in-memory storage."""
        self._executions: dict[UUID, ToolExecution] = {}

    async def create(self, execution: ToolExecution) -> ToolExecution:
        """Create a new execution record."""
        execution.created_at = datetime.now(UTC)
        execution.updated_at = execution.created_at
        self._executions[execution.id] = execution
        return execution

    async def get_by_id(self, execution_id: UUID) -> ToolExecution | None:
        """Get execution by ID."""
        return self._executions.get(execution_id)

    def _apply_filters(self, items: list[ToolExecution], filters: list[Filter] | None) -> list[ToolExecution]:
        """Apply filtering to the list of executions."""
        if not filters:
            return items

        filtered_items = items
        for filter_obj in filters:
            if filter_obj.field == "tool_id" and filter_obj.operator == FilterOperator.EQ:
                tool_id = UUID(filter_obj.value) if isinstance(filter_obj.value, str) else filter_obj.value
                filtered_items = [e for e in filtered_items if e.tool_id == tool_id]
            elif filter_obj.field == "status" and filter_obj.operator == FilterOperator.EQ:
                filtered_items = [e for e in filtered_items if e.status.value == filter_obj.value]

        return filtered_items

    def _apply_sorting(self, items: list[ToolExecution], cursor_data: CursorData | None) -> list[ToolExecution]:
        """Apply sorting to the list of executions."""
        sort_field = "execution_start"
        sort_direction = SortDirection.DESC

        if cursor_data:
            sort_field, sort_direction = extract_sort_from_cursor(cursor_data)

        # Handle different sort fields
        if sort_field == "created_at":
            items.sort(key=lambda x: x.created_at, reverse=(sort_direction == SortDirection.DESC))
        elif sort_field == "execution_end":
            items.sort(
                key=lambda x: x.execution_end or datetime.min.replace(tzinfo=UTC),
                reverse=(sort_direction == SortDirection.DESC),
            )
        else:  # Default to execution_start
            items.sort(key=lambda x: x.execution_start, reverse=(sort_direction == SortDirection.DESC))

        return items

    def _apply_pagination(
        self, items: list[ToolExecution], cursor_data: CursorData | None, limit: int
    ) -> list[ToolExecution]:
        """Apply cursor-based pagination to the list of executions."""
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

    async def list_executions(
        self,
        filters: list[Filter] | None = None,
        cursor_data: CursorData | None = None,
        limit: int = 20,
    ) -> list[ToolExecution]:
        """List executions with optional filtering and pagination."""
        items = list(self._executions.values())

        # Apply filtering, sorting, and pagination in sequence
        items = self._apply_filters(items, filters)
        items = self._apply_sorting(items, cursor_data)
        items = self._apply_pagination(items, cursor_data, limit)

        return items  # noqa: RET504
