"""Configuration and shared fixtures for tool_manager unit tests.

Provides fast retry settings and common test fixtures for tool providers,
tools, and mock clients used across tool manager unit tests.
"""

from collections.abc import Callable, Generator, Iterator
from contextlib import contextmanager
from typing import Any
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

import httpx
import pytest
import respx
from langchain_core.tools import BaseTool

from nexus.agent_orchestrator.tool_manager.tool_manager_client import ToolManagerClient
from nexus.agent_orchestrator.tool_manager.types import NamespacedBaseTool
from nexus.core.config import AdapterRetrySettings
from nexus.tool_manager.models.tool import ToolWithParameters
from nexus.tool_manager.models.tool_provider import ToolProviderWithConfiguration
from nexus.tool_manager.models.tool_provider_configuration import MCPConfiguration


@pytest.fixture(autouse=True)
def fast_retry_settings() -> Generator[AdapterRetrySettings, None, None]:
    """Configure fast retry settings for all tool_manager tests.

    This fixture automatically applies to all tests in this directory
    and makes retry operations run much faster for testing.
    """
    fast_settings = AdapterRetrySettings(
        adapter_max_retries=3,  # Keep max retries for testing retry logic
        adapter_initial_backoff_seconds=0.001,  # Very fast: 1ms
        adapter_backoff_growth_factor=2.0,  # Standard exponential backoff
        adapter_max_backoff_seconds=0.1,  # Cap at 100ms
        adapter_request_timeout_seconds=1.0,  # Short timeout: 1s
    )

    with patch("nexus.agent_orchestrator.utils.retry.get_settings", return_value=fast_settings):
        yield fast_settings


class PaginationMockFactory:
    """Factory for creating paginated API response mocks."""

    @staticmethod
    def create_paginated_response(pages: list[dict[str, Any]]) -> Callable[[Any], httpx.Response]:
        """Create a mock response function for paginated API calls.

        Args:
            pages: List of page data, each containing:
                - resources: List of resource objects for this page
                - total_count: Total number of resources across all pages
                - next: Next cursor (None for last page)

        Returns:
            Mock response function that can be used with respx.mock(side_effect=...)

        Example:
            pages = [
                {"resources": [item1], "total_count": 2, "next": "cursor_123"},
                {"resources": [item2], "total_count": 2, "next": None}
            ]
            mock_response = PaginationMockFactory.create_paginated_response(pages)
            respx.get(...).mock(side_effect=mock_response)

        """
        call_count = 0

        def mock_response(request) -> httpx.Response:
            nonlocal call_count
            call_count += 1

            if call_count <= len(pages):
                page_data = pages[call_count - 1]
                return httpx.Response(200, json=page_data)

            # If we somehow get more requests than pages, return empty last page
            return httpx.Response(200, json={"resources": [], "total_count": 0, "next": None})

        return mock_response


@contextmanager
def mock_paginated_api(url_pattern: str, pages: list[dict[str, Any]]) -> Iterator[None]:
    """Context manager for mocking paginated API responses.

    Args:
        url_pattern: URL pattern to match (regex string)
        pages: List of page data dictionaries

    Example:
        pages = [
            {"resources": [provider1], "total_count": 2, "next": "cursor_123"},
            {"resources": [provider2], "total_count": 2, "next": None}
        ]

        with mock_paginated_api(r".*tool-providers.*", pages):
            # Test code that makes paginated requests
            result = await client.get_all_tool_providers()

    """
    mock_response = PaginationMockFactory.create_paginated_response(pages)

    with respx.mock:
        respx.get(url__regex=url_pattern).mock(side_effect=mock_response)
        yield


@pytest.fixture
def sample_tool_providers() -> list[ToolProviderWithConfiguration]:
    """Sample tool providers with MCP configurations for testing."""
    user_id = uuid4()
    return [
        ToolProviderWithConfiguration(
            id=uuid4(),
            name="dev_tools",
            enabled=True,
            status="available",
            created_by=user_id,
            configuration=MCPConfiguration(provider_type="mcp", base_url="http://localhost:3001/mcp", api_key=None),
        ),
        ToolProviderWithConfiguration(
            id=uuid4(),
            name="file_tools",
            enabled=True,
            status="available",
            created_by=user_id,
            configuration=MCPConfiguration(provider_type="mcp", base_url="http://localhost:3002/mcp", api_key=None),
        ),
    ]


@pytest.fixture
def mock_langchain_base_tools() -> list[Mock]:
    """Mock LangChain BaseTools from MCP servers."""
    tool1 = Mock(spec=BaseTool)
    tool1.name = "code_search"
    tool1.description = "Search for code patterns"

    tool2 = Mock(spec=BaseTool)
    tool2.name = "file_read"
    tool2.description = "Read file contents"

    tool3 = Mock(spec=BaseTool)
    tool3.name = "build_project"
    tool3.description = "Build the project"

    # Tool exists in MCP but not in Tool Manager registry
    tool4 = Mock(spec=BaseTool)
    tool4.name = "unregistered_tool"
    tool4.description = "Tool not in Tool Manager"

    return [tool1, tool2, tool3, tool4]


@pytest.fixture
def mock_namespaced_tools(mock_langchain_base_tools: list[Mock]) -> list[NamespacedBaseTool]:
    """Mock NamespacedBaseTool tuples from MCP servers."""
    return [
        ("dev_tools::code_search", mock_langchain_base_tools[0]),
        ("file_tools::file_read", mock_langchain_base_tools[1]),
        ("dev_tools::build_project", mock_langchain_base_tools[2]),
        ("dev_tools::unregistered_tool", mock_langchain_base_tools[3]),
    ]


@pytest.fixture
def sample_tools() -> list[ToolWithParameters]:
    """Sample tools from Tool Manager for testing."""
    user_id = uuid4()
    provider_1_id = uuid4()
    provider_2_id = uuid4()
    return [
        ToolWithParameters(
            id=uuid4(),
            name="code_search",
            namespaced_name="dev_tools::code_search",
            description="Search for code patterns",
            provider_id=provider_1_id,
            enabled=True,
            status="available",
            parameters=[],
            created_by=user_id,
        ),
        ToolWithParameters(
            id=uuid4(),
            name="file_read",
            namespaced_name="file_tools::file_read",
            description="Read file contents",
            provider_id=provider_2_id,
            enabled=True,
            status="available",
            parameters=[],
            created_by=user_id,
        ),
        ToolWithParameters(
            id=uuid4(),
            name="disabled_tool",
            namespaced_name="dev_tools::disabled_tool",
            description="A disabled tool",
            provider_id=provider_1_id,
            enabled=False,
            status="available",
            parameters=[],
            created_by=user_id,
        ),
        ToolWithParameters(
            id=uuid4(),
            name="missing_tool",
            namespaced_name="dev_tools::missing_tool",
            description="Tool missing from MCP server",
            provider_id=provider_1_id,
            enabled=True,
            status="available",
            parameters=[],
            created_by=user_id,
        ),
    ]


@pytest.fixture
async def tool_manager_client() -> Mock:
    """Mock Tool Manager client for testing."""
    client = Mock(spec=ToolManagerClient)
    client.get_all_tool_providers = AsyncMock()
    client.get_all_tools = AsyncMock()
    client.update_tool_status = AsyncMock()
    client.close = AsyncMock()
    return client
