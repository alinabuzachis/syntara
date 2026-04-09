"""Integration tests for OrchestrationService._get_tools function.

Tests the private _get_tools function with real ToolManagerClient and database backend,
mocking only the MCP provider's underlying client to simulate different MCP server scenarios.
"""

import logging
from collections.abc import Callable
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

import pytest
from httpx import AsyncClient
from langchain_core.tools import BaseTool
from langchain_openai import ChatOpenAI
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.agent_orchestrator.context_manager.planner import ContextManagerPlanner
from nexus.agent_orchestrator.services.orchestration_service import OrchestrationService
from nexus.agent_orchestrator.tool_manager.tool_manager_client import ToolManagerClient
from nexus.tool_manager.models.tool import Tool, ToolStatus
from nexus.tool_manager.models.tool_provider import ProviderStatus, ToolProvider

logger = logging.getLogger(__name__)


def create_test_tool_manager_client(jwt_client: AsyncClient) -> Callable[..., ToolManagerClient]:
    """Create a ToolManagerClient that uses the same transport as jwt_client.

    This ensures the ToolManagerClient connects to the test app instead of making
    real HTTP requests, following the pattern from existing integration tests.
    """

    def _create_client(*_args: object, **_kwargs: object) -> ToolManagerClient:
        # Create the client with test URL
        client = ToolManagerClient(base_url="http://test/api/v1")
        # Replace its session with one using the test transport and auth headers
        client.session = AsyncClient(
            transport=jwt_client._transport,
            base_url="http://test/api/v1",
            headers=dict(jwt_client.headers),  # Copy JWT auth headers
        )
        return client

    return _create_client


class TestOrchestrationServiceGetTools:
    """Integration tests for OrchestrationService._get_tools function."""

    @pytest.fixture
    async def orchestration_service(self) -> OrchestrationService:
        """Create OrchestrationService with minimal dependencies."""
        # Create minimal mocks for required dependencies
        llm = Mock(spec=ChatOpenAI)
        context_manager = Mock(spec=ContextManagerPlanner)

        return OrchestrationService(llm=llm, context_manager_planner=context_manager)

    @pytest.fixture
    async def test_tool_provider_with_tools(
        self, jwt_client: AsyncClient, test_db_session: AsyncSession, test_user
    ) -> tuple[str, list[str]]:
        """Create a test tool provider with two tools - one enabled, one disabled.

        Returns:
            Tuple of (provider_id, [enabled_tool_id, disabled_tool_id])

        """
        # Create the MCP tool provider
        provider_data = {
            "name": "test-mcp-provider",
            "configuration": {
                "provider_type": "mcp",
                "base_url": "http://fake-mcp-server:8000/mcp",
                "api_key": None,
            },
        }

        # Create provider
        create_response = await jwt_client.post("/api/v1/tool_manager/tool_providers", json=provider_data)
        assert create_response.status_code == 201
        provider = create_response.json()
        provider_id = provider["id"]

        # Create tools directly in the database using test session
        tool_1 = Tool(
            name="enabled_tool",
            namespaced_name="test-mcp-provider::enabled_tool",
            description="This tool is enabled",
            provider_id=provider_id,
            enabled=True,
            status=ToolStatus.AVAILABLE,
            parameters=[],
            created_by=test_user.id,
        )

        tool_2 = Tool(
            name="disabled_tool",
            namespaced_name="test-mcp-provider::disabled_tool",
            description="This tool is disabled",
            provider_id=provider_id,
            enabled=False,
            status=ToolStatus.AVAILABLE,
            parameters=[],
            created_by=test_user.id,
        )

        test_db_session.add(tool_1)
        test_db_session.add(tool_2)
        await test_db_session.commit()

        # Update the provider to enabled status (mimicking tool refresh behavior)
        # This circumvents the normal refresh mechanism since we're adding tools manually
        provider_record = await test_db_session.get(ToolProvider, provider_id)
        if provider_record is not None:
            provider_record.enabled = True
            provider_record.status = ProviderStatus.AVAILABLE
            await test_db_session.commit()

        return provider_id, [str(tool_1.id), str(tool_2.id)]

    async def test_get_tools_with_missing_mcp_tools(
        self,
        orchestration_service: OrchestrationService,
        test_tool_provider_with_tools: tuple[str, list[str]],
        jwt_client: AsyncClient,
    ) -> None:
        """Test _get_tools when MCP server returns zero tools.

        Should set enabled tool to MISSING with refresh_error.
        Disabled tools are not processed since they're filtered out at the service layer.
        """
        _provider_id, [enabled_tool_id, disabled_tool_id] = test_tool_provider_with_tools
        invocation_id = uuid4()

        # Log test setup information for debugging
        provider_list_response = await jwt_client.get("/api/v1/tool_manager/tool_providers")
        providers = provider_list_response.json()["resources"]
        logger.info("All providers: %s", providers)

        enabled_providers = [p for p in providers if p["enabled"]]
        logger.info("Enabled providers: %s", enabled_providers)

        tools_response = await jwt_client.get("/api/v1/tool_manager/tools")
        tools = tools_response.json()["resources"]
        enabled_tools = [t for t in tools if t["enabled"]]
        logger.info("Enabled tools: %s", enabled_tools)

        # Mock ToolManagerClient to use the test transport like base_client
        # and mock MCP provider to return ZERO tools from the MCP server
        with (
            patch(
                "nexus.agent_orchestrator.tool_manager.tool_services.ToolManagerClient",
                create_test_tool_manager_client(jwt_client),
            ),
            patch("nexus.tool_manager.lib.providers.mcp.mcp_provider.MultiServerMCPClient") as mock_mcp_client_class,
        ):
            mock_mcp_instance = Mock()
            mock_mcp_client_class.return_value = mock_mcp_instance
            mock_mcp_instance.get_tools = AsyncMock(return_value=[])  # No tools from MCP server

            # Call _get_tools
            result_tools = await orchestration_service._get_tools(invocation_id)

            # Should return empty list since no tools are available
            assert result_tools == []

            # Verify the mock was called (this verifies the MCP integration worked through ProviderFactory)
            assert mock_mcp_client_class.called, "MultiServerMCPClient class should have been instantiated"
            assert mock_mcp_instance.get_tools.called, "get_tools should have been called"

            # Verify that the enabled tool was marked as MISSING
            tool_response = await jwt_client.get(f"/api/v1/tool_manager/tools/{enabled_tool_id}")
            assert tool_response.status_code == 200
            enabled_tool = tool_response.json()

            assert enabled_tool["status"] == "missing"
            assert enabled_tool["refresh_error"] == "Tool not found in MCP server"
            assert enabled_tool["enabled"] is False

            # Verify that the disabled tool remains unchanged (not processed by sync)
            tool_response = await jwt_client.get(f"/api/v1/tool_manager/tools/{disabled_tool_id}")
            assert tool_response.status_code == 200
            disabled_tool = tool_response.json()

            assert disabled_tool["status"] == "available"  # Status unchanged since not processed
            assert disabled_tool["enabled"] is False  # Still disabled

    async def test_get_tools_with_matching_mcp_tool(
        self,
        orchestration_service: OrchestrationService,
        test_tool_provider_with_tools: tuple[str, list[str]],
        jwt_client: AsyncClient,
    ) -> None:
        """Test _get_tools when MCP server returns the enabled tool.

        Should return the matching tool and keep it enabled.
        """
        _provider_id, [enabled_tool_id, disabled_tool_id] = test_tool_provider_with_tools
        invocation_id = uuid4()

        # Create mock BaseTool that matches the enabled tool
        mock_enabled_tool = Mock(spec=BaseTool)
        mock_enabled_tool.name = "enabled_tool"
        mock_enabled_tool.description = "This tool is enabled"

        # Mock ToolManagerClient to use the test transport like base_client
        # and mock MCP provider to return ONE tool matching the enabled tool
        with (
            patch(
                "nexus.agent_orchestrator.tool_manager.tool_services.ToolManagerClient",
                create_test_tool_manager_client(jwt_client),
            ),
            patch("nexus.tool_manager.lib.providers.mcp.mcp_provider.MultiServerMCPClient") as mock_mcp_client_class,
        ):
            mock_mcp_instance = Mock()
            mock_mcp_client_class.return_value = mock_mcp_instance
            mock_mcp_instance.get_tools = AsyncMock(return_value=[mock_enabled_tool])

            # Call _get_tools
            result_tools = await orchestration_service._get_tools(invocation_id)

            # Should return the one matching enabled tool
            assert len(result_tools) == 1
            assert result_tools[0] is mock_enabled_tool

            # Verify that the enabled tool remains available and enabled
            tool_response = await jwt_client.get(f"/api/v1/tool_manager/tools/{enabled_tool_id}")
            assert tool_response.status_code == 200
            enabled_tool = tool_response.json()

            assert enabled_tool["status"] == "available"
            assert enabled_tool["enabled"] is True
            assert enabled_tool["refresh_error"] is None

            # Verify that the disabled tool remains unchanged
            tool_response = await jwt_client.get(f"/api/v1/tool_manager/tools/{disabled_tool_id}")
            assert tool_response.status_code == 200
            disabled_tool = tool_response.json()

            assert disabled_tool["status"] == "available"
            assert disabled_tool["enabled"] is False  # Still disabled

    async def test_missing_tool_re_enablement_when_mcp_server_recovers(
        self,
        orchestration_service: OrchestrationService,
        jwt_client: AsyncClient,
        test_db_session: AsyncSession,
        test_user,
    ) -> None:
        """Test that MISSING tools are re-enabled when MCP server returns them again.

        Critical: Only re-enables automatically disabled tools (status=MISSING),
        not manually disabled tools (status=AVAILABLE).
        """
        # Setup: Create a provider
        provider_data = {
            "name": "recovery-test-provider",
            "configuration": {
                "provider_type": "mcp",
                "base_url": "http://fake-mcp-server:8000/mcp",
                "api_key": None,
            },
        }

        create_response = await jwt_client.post("/api/v1/tool_manager/tool_providers", json=provider_data)
        assert create_response.status_code == 201
        provider = create_response.json()
        provider_id = provider["id"]

        # Create a tool that was automatically disabled (MISSING status)
        missing_tool = Tool(
            name="recovery_tool",
            namespaced_name="recovery-test-provider::recovery_tool",
            description="Tool that was missing but now available",
            provider_id=provider_id,
            enabled=False,  # Disabled by system
            status=ToolStatus.MISSING,  # Automatically disabled due to being missing
            refresh_error="Tool not found in MCP server",  # Previous error
            parameters=[],
            created_by=test_user.id,
        )

        test_db_session.add(missing_tool)
        await test_db_session.commit()

        # Enable the provider (similar to existing test fixture)
        provider_record = await test_db_session.get(ToolProvider, provider_id)
        if provider_record is not None:
            provider_record.enabled = True
            provider_record.status = ProviderStatus.AVAILABLE
            await test_db_session.commit()

        invocation_id = uuid4()

        # Mock MCP server to now return the previously missing tool
        mock_recovery_tool = Mock(spec=BaseTool)
        mock_recovery_tool.name = "recovery_tool"
        mock_recovery_tool.description = "Tool that was missing but now available"

        with (
            patch(
                "nexus.agent_orchestrator.tool_manager.tool_services.ToolManagerClient",
                create_test_tool_manager_client(jwt_client),
            ),
            patch("nexus.tool_manager.lib.providers.mcp.mcp_provider.MultiServerMCPClient") as mock_mcp_client_class,
        ):
            mock_mcp_instance = Mock()
            mock_mcp_client_class.return_value = mock_mcp_instance
            mock_mcp_instance.get_tools = AsyncMock(return_value=[mock_recovery_tool])

            # Call _get_tools - should trigger re-enablement in the background
            result_tools = await orchestration_service._get_tools(invocation_id)

            # Tool won't be returned immediately since it's being processed from disabled state
            # But it should be re-enabled for the next execution
            assert isinstance(result_tools, list)  # May be empty on first run after re-enablement

            # Verify the tool was re-enabled in the database
            tool_response = await jwt_client.get(f"/api/v1/tool_manager/tools/{missing_tool.id}")
            assert tool_response.status_code == 200
            recovered_tool = tool_response.json()

            assert recovered_tool["enabled"] is True  # Re-enabled!
            assert recovered_tool["status"] == "available"  # Status updated
            assert recovered_tool["refresh_error"] is None  # Error cleared

            # On a subsequent call, the tool should now be available since it's enabled
            result_tools_2 = await orchestration_service._get_tools(uuid4())
            assert len(result_tools_2) == 1
            assert result_tools_2[0] is mock_recovery_tool

    async def test_provider_disabled_when_mcp_server_unreachable(
        self,
        orchestration_service: OrchestrationService,
        jwt_client: AsyncClient,
        test_db_session: AsyncSession,
        test_user,
    ) -> None:
        """Test that provider is marked as ERROR when MCP server is unreachable."""
        # Setup: Create an enabled provider with tools
        provider_data = {
            "name": "unreachable-provider",
            "configuration": {
                "provider_type": "mcp",
                "base_url": "http://unreachable-server:8000/mcp",
                "api_key": None,
            },
        }

        create_response = await jwt_client.post("/api/v1/tool_manager/tool_providers", json=provider_data)
        assert create_response.status_code == 201
        provider = create_response.json()
        provider_id = provider["id"]

        # Create a tool for this provider
        provider_tool = Tool(
            name="unreachable_tool",
            namespaced_name="unreachable-provider::unreachable_tool",
            description="Tool from unreachable provider",
            provider_id=provider_id,
            enabled=True,
            status=ToolStatus.AVAILABLE,
            parameters=[],
            created_by=test_user.id,
        )

        test_db_session.add(provider_tool)
        await test_db_session.commit()

        # Enable the provider (similar to existing test fixture)
        provider_record = await test_db_session.get(ToolProvider, provider_id)
        if provider_record is not None:
            provider_record.enabled = True
            provider_record.status = ProviderStatus.AVAILABLE
            await test_db_session.commit()

        invocation_id = uuid4()

        # Mock MCP client to raise ConnectionError
        with (
            patch(
                "nexus.agent_orchestrator.tool_manager.tool_services.ToolManagerClient",
                create_test_tool_manager_client(jwt_client),
            ),
            patch("nexus.tool_manager.lib.providers.mcp.mcp_provider.MultiServerMCPClient") as mock_mcp_client_class,
        ):
            mock_mcp_instance = Mock()
            mock_mcp_client_class.return_value = mock_mcp_instance
            mock_mcp_instance.get_tools = AsyncMock(side_effect=ConnectionError("Connection refused"))

            # Call _get_tools - should handle the connection error gracefully
            result_tools = await orchestration_service._get_tools(invocation_id)

            # Should return empty list since provider failed
            assert result_tools == []

            # Verify the provider was marked as ERROR
            provider_response = await jwt_client.get(f"/api/v1/tool_manager/tool_providers/{provider_id}")
            assert provider_response.status_code == 200
            updated_provider = provider_response.json()

            assert updated_provider["enabled"] is False  # Disabled due to error
            assert updated_provider["status"] == "error"  # Marked as ERROR
            assert "Connection/timeout error" in updated_provider["validation_error"]

            # Tool should be marked as MISSING since provider failed
            tool_response = await jwt_client.get(f"/api/v1/tool_manager/tools/{provider_tool.id}")
            assert tool_response.status_code == 200
            affected_tool = tool_response.json()

            # Tool gets marked as MISSING when provider fails to return tools
            assert affected_tool["enabled"] is False  # Disabled due to missing
            assert affected_tool["status"] == "missing"  # Status changed to MISSING
            assert affected_tool["refresh_error"] == "Tool not found in MCP server"  # Error set

    async def test_provider_re_enablement_when_mcp_server_recovers(
        self,
        orchestration_service: OrchestrationService,
        jwt_client: AsyncClient,
        test_db_session: AsyncSession,
        test_user,
    ) -> None:
        """Test that ERROR providers are re-enabled when MCP server becomes available."""
        # Setup: Create a provider in ERROR state
        provider_data = {
            "name": "recovery-provider",
            "configuration": {
                "provider_type": "mcp",
                "base_url": "http://recovery-server:8000/mcp",
                "api_key": None,
            },
        }

        create_response = await jwt_client.post("/api/v1/tool_manager/tool_providers", json=provider_data)
        assert create_response.status_code == 201
        provider = create_response.json()
        provider_id = provider["id"]

        # Manually set provider to ERROR state (as if it failed previously)
        provider_record = await test_db_session.get(ToolProvider, provider_id)
        if provider_record is not None:
            provider_record.enabled = False  # Disabled due to previous error
            provider_record.status = ProviderStatus.ERROR  # In ERROR state
            provider_record.validation_error = "Connection/timeout error: Connection refused"
            await test_db_session.commit()

        # Create tools for this provider
        provider_tool = Tool(
            name="recovery_provider_tool",
            namespaced_name="recovery-provider::recovery_provider_tool",
            description="Tool from recovering provider",
            provider_id=provider_id,
            enabled=True,
            status=ToolStatus.AVAILABLE,
            parameters=[],
            created_by=test_user.id,
        )

        test_db_session.add(provider_tool)
        await test_db_session.commit()

        invocation_id = uuid4()

        # Mock MCP server to now work and return tools
        mock_provider_tool = Mock(spec=BaseTool)
        mock_provider_tool.name = "recovery_provider_tool"
        mock_provider_tool.description = "Tool from recovering provider"

        with (
            patch(
                "nexus.agent_orchestrator.tool_manager.tool_services.ToolManagerClient",
                create_test_tool_manager_client(jwt_client),
            ),
            patch("nexus.tool_manager.lib.providers.mcp.mcp_provider.MultiServerMCPClient") as mock_mcp_client_class,
        ):
            mock_mcp_instance = Mock()
            mock_mcp_client_class.return_value = mock_mcp_instance
            mock_mcp_instance.get_tools = AsyncMock(return_value=[mock_provider_tool])

            # Call _get_tools - should retry the ERROR provider and re-enable it
            result_tools = await orchestration_service._get_tools(invocation_id)

            # Should return the tool from the recovered provider
            assert len(result_tools) == 1
            assert result_tools[0] is mock_provider_tool

            # Verify the provider was re-enabled
            provider_response = await jwt_client.get(f"/api/v1/tool_manager/tool_providers/{provider_id}")
            assert provider_response.status_code == 200
            recovered_provider = provider_response.json()

            assert recovered_provider["enabled"] is True  # Re-enabled!
            assert recovered_provider["status"] == "available"  # Status restored
            assert recovered_provider["validation_error"] is None  # Error cleared
