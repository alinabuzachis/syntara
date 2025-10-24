"""Test fixtures for nexus.tool_manager."""

from tests.fixtures.mock_cache_adapter import MockCacheAdapter
from tests.fixtures.mock_execution_repository import MockExecutionRepository
from tests.fixtures.mock_provider_repository import MockToolProviderRepository
from tests.fixtures.mock_shared_resources import (
    MockBaseResource,
    MockNamedResource,
    MockResource,
    MockSoftDeletableResource,
    MockUserOwnedResource,
)
from tests.fixtures.mock_tool_provider_adapter import MockProvider
from tests.fixtures.mock_tool_repository import MockToolRepository

__all__ = [
    "MockBaseResource",
    "MockCacheAdapter",
    "MockExecutionRepository",
    "MockNamedResource",
    "MockProvider",
    "MockResource",
    "MockSoftDeletableResource",
    "MockToolProviderRepository",
    "MockToolRepository",
    "MockUserOwnedResource",
]
