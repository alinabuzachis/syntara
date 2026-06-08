"""Unit tests for tool services in Agent Orchestrator.

Tests the tool discovery, synchronization, and error reporting functions
in the tool_services module.
"""

from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

import pytest
from langchain_core.tools import BaseTool

from nexus.agent_orchestrator.tool_manager import tool_services
from nexus.tool_manager.lib.providers.factory import ProviderFactory
from nexus.tool_manager.models.tool import ToolWithParameters
from nexus.tool_manager.models.tool_provider import ProviderStatus, ToolProviderWithConfiguration
from nexus.tool_manager.models.tool_provider_configuration import MCPConfiguration


class TestToolServices:
    """Test tool services functions."""

    async def test_tool_discovery_functions(
        self,
        tool_manager_client: Mock,
        sample_tool_providers: list[ToolProviderWithConfiguration],
        sample_tools: list[ToolWithParameters],
    ) -> None:
        """Test that tool discovery functions work correctly."""
        # Setup mock responses
        tool_manager_client.get_all_tool_providers.return_value = sample_tool_providers
        tool_manager_client.get_all_tools.return_value = sample_tools

        # Mock the ToolManagerClient context manager
        with patch("nexus.agent_orchestrator.tool_manager.tool_services.ToolManagerClient") as mock_client_class:
            mock_client_class.return_value.__aenter__.return_value = tool_manager_client
            mock_client_class.return_value.__aexit__.return_value = None

            # Test tool discovery functions directly
            all_providers = await tool_services._discover_tool_providers()
            enabled_tools, disabled_tools = await tool_services._discover_tools()

            assert len(all_providers) == 2  # All sample providers returned
            assert len(enabled_tools) == 3  # 4 total tools - 1 disabled = 3 enabled
            assert len(disabled_tools) == 1  # 1 disabled tool in fixtures
            tool_manager_client.get_all_tool_providers.assert_called_once()
            tool_manager_client.get_all_tools.assert_called_once()

    async def test_tool_status_update_on_execution_failure(
        self, tool_manager_client: Mock, sample_tools: list[ToolWithParameters]
    ) -> None:
        """Test that tool status update function works correctly."""
        tool_manager_client.get_all_tools.return_value = sample_tools

        # Mock the ToolManagerClient context manager
        with patch("nexus.agent_orchestrator.tool_manager.tool_services.ToolManagerClient") as mock_client_class:
            mock_client_class.return_value.__aenter__.return_value = tool_manager_client
            mock_client_class.return_value.__aexit__.return_value = None

            # Test tool status update function directly
            await tool_services.report_tool_execution_failure(tool_id=uuid4(), error_message="Connection timeout")

            tool_manager_client.update_tool_status.assert_called_once()

    async def test_graceful_handling_of_tool_manager_unavailability(self, tool_manager_client: Mock) -> None:
        """Test graceful handling of Tool Manager API unavailability."""
        # Setup Tool Manager client to raise connection error
        tool_manager_client.get_all_tool_providers.side_effect = ConnectionError("Tool Manager unavailable")

        # Mock the ToolManagerClient context manager
        with patch("nexus.agent_orchestrator.tool_manager.tool_services.ToolManagerClient") as mock_client_class:
            mock_client_class.return_value.__aenter__.return_value = tool_manager_client
            mock_client_class.return_value.__aexit__.return_value = None

            # This should return empty list when Tool Manager is unavailable (graceful handling)
            all_providers = await tool_services._discover_tool_providers()

            # Should return empty list when Tool Manager is unavailable
            assert all_providers == []

    async def test_tool_synchronization_integration(
        self,
        tool_manager_client: Mock,
        sample_tool_providers: list[ToolProviderWithConfiguration],
        sample_tools: list[ToolWithParameters],
    ) -> None:
        """Test the full tool synchronization workflow."""
        # Setup successful responses
        tool_manager_client.get_all_tool_providers.return_value = sample_tool_providers
        tool_manager_client.get_all_tools.return_value = sample_tools

        # Mock MCP client to return some tools
        mock_tool = Mock(spec=BaseTool)
        mock_tool.name = "code_search"

        with (
            patch("nexus.agent_orchestrator.tool_manager.tool_services.ToolManagerClient") as mock_client_class,
            patch("nexus.tool_manager.lib.providers.mcp.mcp_provider.MultiServerMCPClient") as mock_mcp_client_class,
        ):
            # Setup Tool Manager client
            mock_client_class.return_value.__aenter__.return_value = tool_manager_client
            mock_client_class.return_value.__aexit__.return_value = None

            # Setup MCP client (mocked at the provider level)
            mock_mcp_instance = Mock()
            mock_mcp_client_class.return_value = mock_mcp_instance
            mock_mcp_instance.get_tools = AsyncMock(return_value=[mock_tool])

            # Test the full synchronization process
            session_id = "session-abc"
            invocation_id = uuid4()
            execution_id = uuid4()
            synchronizer = tool_services.ToolSynchronizer(session_id, invocation_id, execution_id=execution_id)
            result = await synchronizer.synchronize_tools()

            # Should return filtered tools
            assert isinstance(result, list)
            # Verify the synchronization process was executed
            tool_manager_client.get_all_tool_providers.assert_called_once()
            tool_manager_client.get_all_tools.assert_called_once()

    @pytest.mark.asyncio
    async def test_process_single_provider_error_handling(self, test_provider_factory) -> None:
        """Test that _process_single_provider disables provider on adapter.get_base_tools() exception."""
        # Create concrete provider instance
        provider_id = uuid4()
        provider = ToolProviderWithConfiguration(
            id=provider_id,
            name="Test Provider",
            enabled=True,
            status=ProviderStatus.AVAILABLE,
            configuration=MCPConfiguration(provider_type="mcp", base_url="http://localhost:8080", api_key="test-key"),
            created_by=uuid4(),
        )

        # Mock the ToolManagerClient
        mock_tool_manager_client = Mock()
        mock_tool_manager_client.update_tool_provider_status = AsyncMock()

        # Patch MockMCPProvider to raise exception
        with (
            patch("nexus.agent_orchestrator.tool_manager.tool_services.ToolManagerClient") as mock_client_class,
            patch("nexus.agent_orchestrator.tool_manager.tool_services.get_provider_factory") as mock_factory_getter,
            patch(
                "tests.fixtures.mock_mcp_provider.MockMCPProvider.get_base_tools",
                side_effect=RuntimeError("Connection failed to MCP server"),
            ),
        ):
            # Setup ToolManagerClient context manager
            mock_client_class.return_value.__aenter__.return_value = mock_tool_manager_client
            mock_client_class.return_value.__aexit__.return_value = None

            # Return the test factory with MockMCPProvider registered
            async def async_factory_generator() -> AsyncGenerator[ProviderFactory, None]:
                yield test_provider_factory

            mock_factory_getter.return_value = async_factory_generator()

            # Call _process_single_provider
            result = await tool_services._process_single_provider(provider, test_provider_factory)

            # Should return empty list due to exception
            assert result == []

            # Should have attempted to disable the provider
            mock_tool_manager_client.update_tool_provider_status.assert_called_once_with(
                provider_id=provider_id,
                status=ProviderStatus.ERROR,
                validation_error="Runtime error: Connection failed to MCP server",
            )

    @pytest.mark.asyncio
    async def test_process_single_provider_error_handling_client_failure(self, test_provider_factory) -> None:
        """Test graceful handling when ToolManagerClient itself fails."""
        # Create concrete provider instance
        provider_id = uuid4()
        provider = ToolProviderWithConfiguration(
            id=provider_id,
            name="Test Provider",
            enabled=True,
            status=ProviderStatus.AVAILABLE,
            configuration=MCPConfiguration(provider_type="mcp", base_url="http://localhost:8080", api_key="test-key"),
            created_by=uuid4(),
        )

        # Mock the ToolManagerClient to fail
        mock_tool_manager_client = Mock()
        mock_tool_manager_client.update_tool_provider_status = AsyncMock(
            side_effect=ConnectionError("Tool Manager unavailable")
        )

        # Patch MockMCPProvider to raise exception
        with (
            patch("nexus.agent_orchestrator.tool_manager.tool_services.ToolManagerClient") as mock_client_class,
            patch(
                "tests.fixtures.mock_mcp_provider.MockMCPProvider.get_base_tools",
                side_effect=ValueError("Invalid configuration parameter"),
            ),
        ):
            # Setup ToolManagerClient context manager
            mock_client_class.return_value.__aenter__.return_value = mock_tool_manager_client
            mock_client_class.return_value.__aexit__.return_value = None

            # Call _process_single_provider - should not raise exception even if client fails
            result = await tool_services._process_single_provider(provider, test_provider_factory)

            # Should return empty list due to exception
            assert result == []

            # Should have attempted to disable the provider (even though it failed)
            mock_tool_manager_client.update_tool_provider_status.assert_called_once_with(
                provider_id=provider_id,
                status=ProviderStatus.ERROR,
                validation_error="Invalid configuration: Invalid configuration parameter",
            )

    async def test_tool_synchronizer_class(
        self,
        tool_manager_client: Mock,
        sample_tool_providers: list[ToolProviderWithConfiguration],
        sample_tools: list[ToolWithParameters],
    ) -> None:
        """Test that the ToolSynchronizer class works correctly."""
        # Setup mock responses
        tool_manager_client.get_all_tool_providers.return_value = sample_tool_providers
        tool_manager_client.get_all_tools.return_value = sample_tools

        # Mock MCP client to return some tools
        mock_tool = Mock(spec=BaseTool)
        mock_tool.name = "code_search"

        with (
            patch("nexus.agent_orchestrator.tool_manager.tool_services.ToolManagerClient") as mock_client_class,
            patch("nexus.tool_manager.lib.providers.mcp.mcp_provider.MultiServerMCPClient") as mock_mcp_client_class,
        ):
            # Setup Tool Manager client
            mock_client_class.return_value.__aenter__.return_value = tool_manager_client
            mock_client_class.return_value.__aexit__.return_value = None

            # Setup MCP client
            mock_mcp_instance = Mock()
            mock_mcp_client_class.return_value = mock_mcp_instance
            mock_mcp_instance.get_tools = AsyncMock(return_value=[mock_tool])

            # Test the ToolSynchronizer class
            session_id = "session-abc"
            invocation_id = uuid4()
            execution_id = uuid4()
            synchronizer = tool_services.ToolSynchronizer(session_id, invocation_id, execution_id)

            # Verify initial state
            assert synchronizer.invocation_id == invocation_id
            assert synchronizer.all_providers == []
            assert synchronizer.enabled_tools == []
            assert synchronizer.disabled_tools == []
            assert synchronizer.namespaced_tools == []

            # Test synchronization
            result = await synchronizer.synchronize_tools()

            # Should return filtered tools and populate state
            assert isinstance(result, list)
            assert len(synchronizer.all_providers) == 2
            assert len(synchronizer.enabled_tools) == 3
            assert len(synchronizer.disabled_tools) == 1

            # Should return exactly 1 filtered tool (only code_search is mocked from MCP)
            assert len(result) == 1

            # Verify that the returned BaseTool has tool_id metadata
            code_search_tool = result[0]
            assert code_search_tool.name == "code_search"
            assert hasattr(code_search_tool, "metadata")
            assert code_search_tool.metadata is not None
            assert "tool_id" in code_search_tool.metadata

            # Find the corresponding ToolWithParameters to verify the tool_id matches
            code_search_tool_data = next(tool for tool in sample_tools if tool.name == "code_search")
            expected_tool_id = str(code_search_tool_data.id)
            assert code_search_tool.metadata["tool_id"] == expected_tool_id

            # Verify the synchronization process was executed
            tool_manager_client.get_all_tool_providers.assert_called_once()
            tool_manager_client.get_all_tools.assert_called_once()
