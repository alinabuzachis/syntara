"""Integration tests for ToolManagerClient tool providers with real backend."""

import pytest
import pytest_asyncio
from httpx import AsyncClient

from nexus.agent_orchestrator.tool_manager.client import ToolManagerClient
from nexus.tool_manager.models import ToolProvider
from nexus.tool_manager.models.tool_provider_configuration import MCPConfiguration


@pytest_asyncio.fixture
async def tool_manager_client(base_client: AsyncClient) -> ToolManagerClient:
    """Create ToolManagerClient that uses the test server with small page size.

    The base_client fixture provides an AsyncClient connected to the test FastAPI
    application via ASGI transport. We reuse this transport for ToolManagerClient.
    Uses a small page size (3) to test pagination with 6 total providers.
    """
    # Create ToolManagerClient with small page size to test pagination
    client = ToolManagerClient(base_url="http://test", limit=3)
    await client.close()

    # Replace the default HTTP client with the test client's transport
    # Use the same transport as base_client (which connects to the test app)
    client.session = base_client

    return client


class TestToolManagerClientProvidersIntegration:
    """Integration tests for ToolManagerClient tool providers with real backend."""

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("multiple_test_providers")
    async def test_get_enabled_tool_providers_filters_and_paginates_correctly(
        self,
        tool_manager_client: ToolManagerClient,
        multiple_test_providers: list[ToolProvider],
    ) -> None:
        """Test ToolManagerClient correctly filters and paginates enabled tool providers.

        Uses the existing multiple_test_providers fixture which creates 6 providers:
        4 enabled (Alpha, Gamma, Delta, Foxtrot) + 2 disabled (Beta, Echo).
        With page size of 3, this tests pagination with 2 pages of enabled providers.
        This proves both filtering and pagination work correctly.
        """
        # Use ToolManagerClient to retrieve providers
        retrieved_providers = await tool_manager_client.get_enabled_tool_providers()

        # Count enabled providers from fixture
        enabled_providers = [p for p in multiple_test_providers if p.enabled]
        expected_count = len(enabled_providers)

        # Verify we got exactly the enabled providers (should be 4)
        assert len(retrieved_providers) == expected_count

        # Create mapping of expected enabled provider names
        expected_enabled_names = {p.name for p in enabled_providers}
        retrieved_names = {provider.name for provider in retrieved_providers}

        # Verify all expected enabled providers are present
        assert retrieved_names == expected_enabled_names

        # Verify all returned providers are enabled (filtering verification)
        for provider in retrieved_providers:
            assert provider.enabled is True
            assert provider.name in expected_enabled_names

        # Verify providers have the expected structure
        for provider in retrieved_providers:
            # ToolProviderWithConfiguration should have configuration attribute
            assert hasattr(provider, "configuration")
            assert isinstance(provider.configuration, MCPConfiguration)
            assert provider.configuration.provider_type == "mcp"

            # Verify core provider fields
            assert provider.id is not None
            assert provider.name is not None
            assert provider.description is not None
            assert provider.configuration is not None
            assert provider.created_at is not None
            assert provider.updated_at is not None
            assert provider.created_by is not None
