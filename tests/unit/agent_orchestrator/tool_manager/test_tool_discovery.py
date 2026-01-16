"""Tests for ToolManagerClient tool provider discovery functionality."""

from typing import Any
from uuid import uuid4

import httpx
import pytest
import respx

from nexus.agent_orchestrator.tool_manager.tool_manager_client import ToolManagerClient
from nexus.tool_manager.models.tool_provider import ProviderStatus, ToolProviderWithConfiguration

from .conftest import mock_paginated_api


class TestToolProviderDiscovery:
    """Test tool provider discovery scenarios."""

    @pytest.fixture
    def sample_provider_response(self) -> dict[str, Any]:
        """Sample provider response from Tool Manager API."""
        provider_id = str(uuid4())
        return {
            "id": provider_id,
            "name": "test_provider",
            "description": "Test provider for unit tests",
            "enabled": True,
            "status": "available",
            "configuration": {
                "provider_type": "mcp",
                "base_url": "http://localhost:3000",
                "api_key": "test-api-key-123",
            },
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
            "created_by": str(uuid4()),
            "labels": {},
        }

    @pytest.fixture
    def client(self) -> ToolManagerClient:
        """Create client instance for testing."""
        return ToolManagerClient(base_url="http://test-api/api/v1", timeout=30.0)

    @respx.mock
    async def test_get_all_tool_providers_success(
        self, client: ToolManagerClient, sample_provider_response: dict[str, Any]
    ) -> None:
        """Test successful retrieval of all tool providers."""
        # Mock successful API response
        respx.get("http://test-api/api/v1/tool_manager/tool_providers").mock(
            return_value=httpx.Response(
                200, json={"resources": [sample_provider_response], "total_count": 1, "next": None}
            )
        )

        providers = await client.get_all_tool_providers()

        assert len(providers) == 1
        provider = providers[0]
        assert isinstance(provider, ToolProviderWithConfiguration)
        assert provider.name == "test_provider"
        assert provider.enabled is True
        assert provider.status == ProviderStatus.AVAILABLE
        assert provider.configuration.provider_type == "mcp"

    @respx.mock
    async def test_get_all_tool_providers_no_filter(self, client: ToolManagerClient) -> None:
        """Test that all providers are requested without enabled filter."""
        # Mock API response
        respx.get("http://test-api/api/v1/tool_manager/tool_providers").mock(
            return_value=httpx.Response(200, json={"resources": [], "total_count": 0})
        )

        await client.get_all_tool_providers()

        # Verify the API was called without enabled filter
        request = respx.calls.last.request
        assert "enabled=true" not in str(request.url)

    @respx.mock
    async def test_get_all_tool_providers_empty_response(self, client: ToolManagerClient) -> None:
        """Test handling of empty provider list."""
        respx.get("http://test-api/api/v1/tool_manager/tool_providers").mock(
            return_value=httpx.Response(200, json={"resources": [], "total_count": 0})
        )

        providers = await client.get_all_tool_providers()

        assert providers == []

    @respx.mock
    @pytest.mark.usefixtures("fast_retry_settings")
    async def test_get_all_tool_providers_api_error(self, client: ToolManagerClient) -> None:
        """Test handling of API errors during provider discovery."""
        respx.get("http://test-api/api/v1/tool_manager/tool_providers").mock(
            return_value=httpx.Response(500, text="Internal server error")
        )

        with pytest.raises(httpx.HTTPStatusError):
            await client.get_all_tool_providers()

    @respx.mock
    @pytest.mark.usefixtures("fast_retry_settings")
    async def test_get_all_tool_providers_timeout(self, client: ToolManagerClient) -> None:
        """Test handling of timeout during provider discovery."""
        respx.get("http://test-api/api/v1/tool_manager/tool_providers").mock(
            side_effect=httpx.TimeoutException("Request timeout")
        )

        with pytest.raises(httpx.TimeoutException):
            await client.get_all_tool_providers()

    @respx.mock
    @pytest.mark.usefixtures("fast_retry_settings")
    async def test_get_all_tool_providers_network_error(self, client: ToolManagerClient) -> None:
        """Test handling of network errors during provider discovery."""
        respx.get("http://test-api/api/v1/tool_manager/tool_providers").mock(
            side_effect=httpx.ConnectError("Connection failed")
        )

        with pytest.raises(httpx.ConnectError):
            await client.get_all_tool_providers()

    async def test_get_all_tool_providers_pagination(self, client: ToolManagerClient) -> None:
        """Test handling of paginated provider responses."""
        # Define paginated response data
        providers_page1 = [
            {
                "id": str(uuid4()),
                "name": "provider_1",
                "description": "First provider",
                "enabled": True,
                "status": "available",
                "configuration": {"provider_type": "mcp", "base_url": "http://localhost:3001", "api_key": "test-key-1"},
                "created_at": "2024-01-01T00:00:00Z",
                "updated_at": "2024-01-01T00:00:00Z",
                "created_by": str(uuid4()),
                "labels": {},
            }
        ]

        providers_page2 = [
            {
                "id": str(uuid4()),
                "name": "provider_2",
                "description": "Second provider",
                "enabled": True,
                "status": "available",
                "configuration": {"provider_type": "mcp", "base_url": "http://localhost:3002", "api_key": "test-key-2"},
                "created_at": "2024-01-01T00:00:00Z",
                "updated_at": "2024-01-01T00:00:00Z",
                "created_by": str(uuid4()),
                "labels": {},
            }
        ]

        # Use the context manager for cleaner pagination mocking
        pages = [
            {"resources": providers_page1, "total_count": 2, "next": "cursor_123"},
            {"resources": providers_page2, "total_count": 2, "next": None},
        ]

        with mock_paginated_api(r".*tool_providers.*", pages):
            providers = await client.get_all_tool_providers()

        assert len(providers) == 2
        assert providers[0].name == "provider_1"
        assert providers[1].name == "provider_2"
