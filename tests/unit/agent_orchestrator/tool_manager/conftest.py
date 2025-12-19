"""Configuration for tool_manager tests to run with fast retry settings."""

from collections.abc import Callable, Generator, Iterator
from contextlib import contextmanager
from typing import Any
from unittest.mock import patch

import httpx
import pytest
import respx

from nexus.core.config import AdapterRetrySettings


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
            result = await client.get_enabled_tool_providers()

    """
    mock_response = PaginationMockFactory.create_paginated_response(pages)

    with respx.mock:
        respx.get(url__regex=url_pattern).mock(side_effect=mock_response)
        yield
