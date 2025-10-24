"""Mock cache adapter for testing purposes."""

from typing import Any

from nexus.tool_manager.lib.interfaces import CacheAdapter


class MockCacheAdapter(CacheAdapter):
    """Mock cache adapter for testing purposes."""

    def __init__(self) -> None:
        """Initialize mock cache with in-memory storage."""
        self._cache: dict[str, Any] = {}

    async def get(self, key: str) -> Any | None:  # noqa: ANN401
        """Get value from cache."""
        return self._cache.get(key)

    async def set(self, key: str, value: Any, ttl: int | None = None) -> None:  # noqa: ANN401, ARG002
        """Set value in cache with optional TTL."""
        # TTL is ignored in mock implementation
        self._cache[key] = value

    async def delete(self, key: str) -> None:
        """Delete value from cache."""
        self._cache.pop(key, None)

    async def clear_pattern(self, pattern: str) -> int:
        """Clear all keys matching pattern."""
        # Simple pattern matching for mock
        keys_to_delete = [k for k in self._cache if pattern in k]
        for key in keys_to_delete:
            del self._cache[key]
        return len(keys_to_delete)
