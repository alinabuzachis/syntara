"""Mock execution repository for testing purposes."""

from datetime import UTC, datetime
from uuid import UUID

from nexus_tool_manager.lib.tool_core import (
    ExecutionRepository,
    FilterParam,
    PaginationParams,
    PaginationResult,
    ToolExecution,
)


class MockExecutionRepository(ExecutionRepository):
    """Mock execution repository for testing purposes."""

    def __init__(self) -> None:
        """Initialize mock repository with in-memory storage."""
        self._executions: dict[UUID, ToolExecution] = {}

    async def create(self, execution: ToolExecution) -> ToolExecution:
        """Create a new execution record."""
        execution.executed_at = datetime.now(UTC)
        self._executions[execution.id] = execution
        return execution

    async def get_by_id(self, execution_id: UUID) -> ToolExecution | None:
        """Get execution by ID."""
        return self._executions.get(execution_id)

    async def list_executions(
        self,
        filters: list[FilterParam] | None = None,
        pagination: PaginationParams | None = None,
    ) -> PaginationResult:
        """List executions with optional filtering and pagination."""
        items = list(self._executions.values())

        # Apply basic filtering (simplified for mock)
        if filters:
            for filter_param in filters:
                if filter_param.field == "tool_id" and filter_param.operator == "eq":
                    tool_id = UUID(filter_param.value) if isinstance(filter_param.value, str) else filter_param.value
                    items = [e for e in items if e.tool_id == tool_id]
                elif filter_param.field == "status" and filter_param.operator == "eq":
                    items = [e for e in items if e.status.value == filter_param.value]

        # Sort by executed_at for consistent ordering
        items.sort(key=lambda x: x.executed_at, reverse=True)

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
