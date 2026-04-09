"""Integration tests for ToolManagerClient tool providers with real backend."""

import pytest
import pytest_asyncio
from httpx import AsyncClient

from nexus.agent_orchestrator.tool_manager.tool_manager_client import ToolManagerClient
from nexus.tool_manager.models import ToolProvider
from nexus.tool_manager.models.tool_provider_configuration import MCPConfiguration


@pytest_asyncio.fixture
async def tool_manager_client(jwt_client: AsyncClient) -> ToolManagerClient:
    """Create ToolManagerClient that uses the test server with small page size.

    The jwt_client fixture provides an AsyncClient connected to the test FastAPI
    application via ASGI transport with JWT authentication. We reuse this transport
    and headers for ToolManagerClient.
    Uses a small page size (3) to test pagination with 6 total providers.
    """
    # Create ToolManagerClient with small page size to test pagination
    client = ToolManagerClient(base_url="http://test/api/v1", limit=3)
    await client.close()

    # Replace the default HTTP client with the test client's transport and auth headers
    # Use the same transport as jwt_client (which connects to the test app)
    # Create a new session using the test transport but with the correct base URL
    client.session = AsyncClient(
        transport=jwt_client._transport,
        base_url="http://test/api/v1",
        headers=dict(jwt_client.headers),  # Copy JWT auth headers
    )

    return client


class TestToolManagerClientProvidersIntegration:
    """Integration tests for ToolManagerClient tool providers with real backend."""

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("multiple_test_providers")
    async def test_get_all_tool_providers_returns_all_providers(
        self,
        tool_manager_client: ToolManagerClient,
        multiple_test_providers: list[ToolProvider],
    ) -> None:
        """Test ToolManagerClient returns all tool providers without client-side filtering.

        Uses the existing multiple_test_providers fixture which creates 6 providers:
        4 enabled (Alpha, Gamma, Delta, Foxtrot) + 2 disabled (Beta, Echo).
        Client should return ALL 6 providers - filtering is done at service layer.
        """
        # Use ToolManagerClient to retrieve providers
        retrieved_providers = await tool_manager_client.get_all_tool_providers()

        # Client should return ALL providers (enabled + disabled)
        expected_count = len(multiple_test_providers)

        # Verify we got all providers (should be 6 total)
        assert len(retrieved_providers) == expected_count

        # Create mapping of all provider names
        expected_names = {p.name for p in multiple_test_providers}
        retrieved_names = {provider.name for provider in retrieved_providers}

        # Verify all providers are present (no client-side filtering)
        assert retrieved_names == expected_names

        # Verify we have both enabled and disabled providers
        enabled_providers = [p for p in retrieved_providers if p.enabled]
        disabled_providers = [p for p in retrieved_providers if not p.enabled]
        assert len(enabled_providers) == 4  # Expected enabled count from fixture
        assert len(disabled_providers) == 2  # Expected disabled count from fixture

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
