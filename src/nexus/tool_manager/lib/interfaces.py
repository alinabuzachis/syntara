"""Interfaces and protocols for tool management."""

from abc import abstractmethod
from typing import Any, Protocol
from uuid import UUID

from nexus.core.utils.cursor import CursorData
from nexus.core.utils.filters import Filter
from nexus.tool_manager.models import (
    Tool,
    ToolExecution,
    ToolProvider,
)


# Repository Interfaces
class ToolProviderRepository(Protocol):
    """Repository interface for provider data persistence."""

    @abstractmethod
    async def create(self, provider: ToolProvider) -> ToolProvider:
        """Create a new provider."""

    @abstractmethod
    async def get_by_id(self, provider_id: UUID) -> ToolProvider | None:
        """Get provider by ID."""

    @abstractmethod
    async def get_by_name(self, name: str) -> ToolProvider | None:
        """Get provider by name."""

    @abstractmethod
    async def list_providers(
        self,
        filters: list[Filter] | None = None,
        cursor_data: CursorData | None = None,
        limit: int = 20,
    ) -> list[ToolProvider]:
        """List providers with optional filtering and pagination."""

    @abstractmethod
    async def update(self, provider: ToolProvider) -> ToolProvider:
        """Update an existing provider."""

    @abstractmethod
    async def delete(self, provider_id: UUID) -> bool:
        """Delete a provider."""


class ToolRepository(Protocol):
    """Repository interface for tool data persistence."""

    @abstractmethod
    async def create(self, tool: Tool) -> Tool:
        """Create a new tool."""

    @abstractmethod
    async def get_by_id(self, tool_id: UUID) -> Tool | None:
        """Get tool by ID."""

    @abstractmethod
    async def get_by_namespaced_name(self, namespaced_name: str) -> Tool | None:
        """Get tool by namespaced name."""

    @abstractmethod
    async def list_tools(
        self,
        filters: list[Filter] | None = None,
        cursor_data: CursorData | None = None,
        limit: int = 20,
    ) -> list[Tool]:
        """List tools with optional filtering and pagination."""

    @abstractmethod
    async def update(self, tool: Tool) -> Tool:
        """Update an existing tool."""

    @abstractmethod
    async def delete(self, tool_id: UUID) -> bool:
        """Delete a tool."""

    @abstractmethod
    async def bulk_update_enabled(self, tool_ids: list[UUID], *, enabled: bool) -> int:
        """Bulk update enabled status for multiple tools."""


class ExecutionRepository(Protocol):
    """Repository interface for tool execution data persistence."""

    @abstractmethod
    async def create(self, execution: ToolExecution) -> ToolExecution:
        """Create a new execution record."""

    @abstractmethod
    async def get_by_id(self, execution_id: UUID) -> ToolExecution | None:
        """Get execution by ID."""

    @abstractmethod
    async def list_executions(
        self,
        filters: list[Filter] | None = None,
        cursor_data: CursorData | None = None,
        limit: int = 20,
    ) -> list[ToolExecution]:
        """List executions with optional filtering and pagination."""


# Cache Adapter Interface
class CacheAdapter(Protocol):
    """Interface for caching operations."""

    @abstractmethod
    async def get(self, key: str) -> Any | None:  # noqa: ANN401
        """Get value from cache."""

    @abstractmethod
    async def set(self, key: str, value: Any, ttl: int | None = None) -> None:  # noqa: ANN401
        """Set value in cache with optional TTL."""

    @abstractmethod
    async def delete(self, key: str) -> None:
        """Delete value from cache."""

    @abstractmethod
    async def clear_pattern(self, pattern: str) -> int:
        """Clear all keys matching pattern."""
