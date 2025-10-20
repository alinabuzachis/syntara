"""Test fixtures for nexus.tool_manager."""

from tests.fixtures.mock_cache_adapter import MockCacheAdapter
from tests.fixtures.mock_execution_repository import MockExecutionRepository
from tests.fixtures.mock_provider import MockProvider
from tests.fixtures.mock_provider_repository import MockProviderRepository
from tests.fixtures.mock_shared_resources import (
    MockBaseResource,
    MockNamedResource,
    MockResource,
    MockSoftDeletableResource,
    MockUserOwnedResource,
)
from tests.fixtures.mock_tool_repository import MockToolRepository

__all__ = [
    "MockBaseResource",
    "MockCacheAdapter",
    "MockExecutionRepository",
    "MockNamedResource",
    "MockProvider",
    "MockProviderRepository",
    "MockResource",
    "MockSoftDeletableResource",
    "MockToolRepository",
    "MockUserOwnedResource",
]
