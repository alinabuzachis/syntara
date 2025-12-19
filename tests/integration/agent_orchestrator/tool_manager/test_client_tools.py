"""Integration tests for ToolManagerClient with real backend."""

from typing import TYPE_CHECKING

import pytest
import pytest_asyncio
from httpx import AsyncClient

from nexus.agent_orchestrator.tool_manager.client import ToolManagerClient
from nexus.tool_manager.models import Tool

if TYPE_CHECKING:
    from tests.conftest import ToolFactory


@pytest_asyncio.fixture
async def mixed_test_tools(tool_factory: "ToolFactory") -> list[Tool]:
    """Create test tools with mixed enabled/disabled states for filtering verification."""
    return await tool_factory.create_tools(
        count=15,  # Total tools: 10 enabled + 5 disabled
        name_prefix="Client Test Tool",
        namespace_prefix="client_test",
        statuses=None,  # All AVAILABLE
        enabled_states=[
            True,
            True,
            True,
            True,
            True,
            True,
            True,
            True,
            True,
            True,
            False,
            False,
            False,
            False,
            False,
        ],  # 10 enabled, 5 disabled
    )


@pytest_asyncio.fixture
async def tool_manager_client(base_client: AsyncClient) -> ToolManagerClient:
    """Create ToolManagerClient that uses the test server with small page size.

    The base_client fixture provides an AsyncClient connected to the test FastAPI
    application via ASGI transport. We reuse this transport for ToolManagerClient.
    Uses a small page size (5) to test pagination with 15 total tools.
    """
    # Create ToolManagerClient with small page size to test pagination
    client = ToolManagerClient(base_url="http://test", limit=5)
    await client.close()

    # Replace the default HTTP client with the test client's transport
    # Use the same transport as base_client (which connects to the test app)
    client.session = base_client

    return client


class TestToolManagerClientIntegration:
    """Integration tests for ToolManagerClient with real backend."""

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("mixed_test_tools")
    async def test_get_enabled_tools_filters_and_paginates_correctly(
        self,
        tool_manager_client: ToolManagerClient,
    ) -> None:
        """Test ToolManagerClient correctly filters and paginates enabled tools.

        Creates 15 total tools (10 enabled + 5 disabled) with page size of 5.
        Verifies that get_enabled_tools() returns only the 10 enabled ones
        by making multiple paginated requests (2 pages of 5 each).
        This proves both filtering and pagination work correctly.
        """
        # Use ToolManagerClient to retrieve tools
        retrieved_tools = await tool_manager_client.get_enabled_tools()

        # Verify we got exactly 10 enabled tools (not all 15)
        assert len(retrieved_tools) == 10

        # Create mapping of expected enabled tool names (tools 1-10 are enabled)
        expected_enabled_names = {f"Client Test Tool {i + 1}" for i in range(10)}
        retrieved_names = {tool.name for tool in retrieved_tools}

        # Verify all expected enabled tools are present
        assert retrieved_names == expected_enabled_names

        # Verify all returned tools are enabled (filtering verification)
        for tool in retrieved_tools:
            assert tool.enabled is True
            assert tool.status.value == "available"
            assert tool.name.startswith("Client Test Tool")
            assert tool.namespaced_name.startswith("client_test::")

        # Verify tools have the expected structure with parameters
        for tool in retrieved_tools:
            # ToolWithParameters should have parameters attribute
            assert hasattr(tool, "parameters")
            assert isinstance(tool.parameters, list)

            # Verify core tool fields
            assert tool.id is not None
            assert tool.provider_id is not None
            assert tool.name is not None
            assert tool.description is not None
            assert tool.namespaced_name is not None
            assert tool.created_at is not None
            assert tool.updated_at is not None
