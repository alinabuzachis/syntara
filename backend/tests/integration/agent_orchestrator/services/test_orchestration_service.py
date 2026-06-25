"""Integration tests for OrchestrationService._get_tools function.

Tests the private _get_tools function with real ToolManagerClient and database backend,
mocking only the MCP provider's underlying client to simulate different MCP server scenarios.
Tools now reference Integration directly (ToolProvider shim removed).
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
from nexus.integrations.models.integration import Integration, IntegrationStatus, IntegrationType
from nexus.integrations.models.integration_configuration import MCPServerConfiguration
from nexus.tool_manager.models.tool import Tool, ToolStatus

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


async def _create_test_integration(
    test_db_session: AsyncSession,
    test_user,
    name: str = "test-mcp-integration",
    base_url: str = "http://fake-mcp-server:8000/mcp",
    *,
    enabled: bool = True,
    status: IntegrationStatus = IntegrationStatus.AVAILABLE,
) -> Integration:
    """Create a test Integration directly in the database."""
    integration = Integration(
        name=name,
        integration_type=IntegrationType.MCP_SERVER,
        configuration=MCPServerConfiguration(
            integration_type="mcp_server",
            base_url=base_url,
        ),
        enabled=enabled,
        validation_status=status,
        scope="global",
        created_by=test_user.id,
        updated_by=test_user.id,
    )
    test_db_session.add(integration)
    await test_db_session.commit()
    return integration


class TestOrchestrationServiceGetTools:
    """Integration tests for OrchestrationService._get_tools function."""

    @pytest.fixture
    async def orchestration_service(self) -> OrchestrationService:
        """Create OrchestrationService with minimal dependencies."""
        llm = Mock(spec=ChatOpenAI)
        context_manager = Mock(spec=ContextManagerPlanner)
        return OrchestrationService(llm=llm, context_manager_planner=context_manager, tool_selection_strategy="ALL")

    @pytest.fixture
    async def test_integration_with_tools(
        self, jwt_client: AsyncClient, test_db_session: AsyncSession, test_user
    ) -> tuple[str, list[str]]:
        """Create a test integration with two tools - one enabled, one disabled.

        Returns:
            Tuple of (integration_id, [enabled_tool_id, disabled_tool_id])

        """
        integration = await _create_test_integration(test_db_session, test_user)
        integration_id = str(integration.id)

        # Create tools directly in the database using test session
        tool_1 = Tool(
            name="enabled_tool",
            namespaced_name=f"{integration.name}::enabled_tool",
            description="This tool is enabled",
            integration_id=integration.id,
            enabled=True,
            status=ToolStatus.AVAILABLE,
            parameters=[],
            created_by=test_user.id,
        )

        tool_2 = Tool(
            name="disabled_tool",
            namespaced_name=f"{integration.name}::disabled_tool",
            description="This tool is disabled",
            integration_id=integration.id,
            enabled=False,
            status=ToolStatus.AVAILABLE,
            parameters=[],
            created_by=test_user.id,
        )

        test_db_session.add(tool_1)
        test_db_session.add(tool_2)
        await test_db_session.commit()

        return integration_id, [str(tool_1.id), str(tool_2.id)]

    async def test_get_tools_with_missing_mcp_tools(
        self,
        orchestration_service: OrchestrationService,
        test_integration_with_tools: tuple[str, list[str]],
        jwt_client: AsyncClient,
    ) -> None:
        """Test _get_tools when MCP server returns zero tools.

        Should set enabled tool to MISSING with refresh_error.
        Disabled tools are not processed since they're filtered out at the service layer.
        """
        _integration_id, [enabled_tool_id, disabled_tool_id] = test_integration_with_tools
        session_id = "session-abc"
        invocation_id = uuid4()
        execution_id = uuid4()

        tools_response = await jwt_client.get("/api/v1/tool_manager/tools")
        tools = tools_response.json()["resources"]
        enabled_tools = [t for t in tools if t["enabled"]]
        logger.info("Enabled tools: %s", enabled_tools)

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

            result_tools = await orchestration_service._get_tools(session_id, invocation_id, execution_id)

            assert result_tools == []

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
        test_integration_with_tools: tuple[str, list[str]],
        jwt_client: AsyncClient,
    ) -> None:
        """Test _get_tools when MCP server returns the enabled tool.

        Should return the matching tool and keep it enabled.
        """
        _integration_id, [enabled_tool_id, disabled_tool_id] = test_integration_with_tools
        session_id = "session-abc"
        invocation_id = uuid4()
        execution_id = uuid4()

        mock_enabled_tool = Mock(spec=BaseTool)
        mock_enabled_tool.name = "enabled_tool"
        mock_enabled_tool.description = "This tool is enabled"

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

            result_tools = await orchestration_service._get_tools(session_id, invocation_id, execution_id)

            assert len(result_tools) == 1
            assert result_tools[0] is mock_enabled_tool

            tool_response = await jwt_client.get(f"/api/v1/tool_manager/tools/{enabled_tool_id}")
            assert tool_response.status_code == 200
            enabled_tool = tool_response.json()

            assert enabled_tool["status"] == "available"
            assert enabled_tool["enabled"] is True
            assert enabled_tool["refresh_error"] is None

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
        integration = await _create_test_integration(test_db_session, test_user, "recovery-test-integration")

        # Create a tool that was automatically disabled (MISSING status)
        missing_tool = Tool(
            name="recovery_tool",
            namespaced_name=f"{integration.name}::recovery_tool",
            description="Tool that was missing but now available",
            integration_id=integration.id,
            enabled=False,  # Disabled by system
            status=ToolStatus.MISSING,
            refresh_error="Tool not found in MCP server",
            parameters=[],
            created_by=test_user.id,
        )

        test_db_session.add(missing_tool)
        await test_db_session.commit()

        session_id = "session-abc"
        invocation_id = uuid4()
        execution_id = uuid4()

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

            result_tools = await orchestration_service._get_tools(session_id, invocation_id, execution_id)

            assert isinstance(result_tools, list)

            tool_response = await jwt_client.get(f"/api/v1/tool_manager/tools/{missing_tool.id}")
            assert tool_response.status_code == 200
            recovered_tool = tool_response.json()

            assert recovered_tool["enabled"] is True  # Re-enabled!
            assert recovered_tool["status"] == "available"
            assert recovered_tool["refresh_error"] is None

            result_tools_2 = await orchestration_service._get_tools(session_id, invocation_id, execution_id)
            assert len(result_tools_2) == 1
            assert result_tools_2[0] is mock_recovery_tool

    async def test_integration_disabled_when_mcp_server_unreachable(
        self,
        orchestration_service: OrchestrationService,
        jwt_client: AsyncClient,
        test_db_session: AsyncSession,
        test_user,
    ) -> None:
        """Test that integration is marked as ERROR when MCP server is unreachable."""
        integration = await _create_test_integration(
            test_db_session,
            test_user,
            name="unreachable-integration",
            base_url="http://unreachable-server:8000/mcp",
        )
        integration_id = str(integration.id)

        # Create a tool for this integration
        integration_tool = Tool(
            name="unreachable_tool",
            namespaced_name=f"{integration.name}::unreachable_tool",
            description="Tool from unreachable integration",
            integration_id=integration.id,
            enabled=True,
            status=ToolStatus.AVAILABLE,
            parameters=[],
            created_by=test_user.id,
        )

        test_db_session.add(integration_tool)
        await test_db_session.commit()

        session_id = "session-abc"
        invocation_id = uuid4()
        execution_id = uuid4()

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

            result_tools = await orchestration_service._get_tools(session_id, invocation_id, execution_id)

            assert result_tools == []

            # Verify the integration was marked as ERROR via the integrations API
            integration_response = await jwt_client.get(f"/api/v1/integrations/{integration_id}")
            assert integration_response.status_code == 200
            updated_integration = integration_response.json()

            assert updated_integration["enabled"] is False  # Disabled due to error
            assert updated_integration["validation_status"] == "error"  # Marked as ERROR
            assert "Connection/timeout error" in updated_integration["validation_error"]

            # Tool should be marked as MISSING since integration failed
            tool_response = await jwt_client.get(f"/api/v1/tool_manager/tools/{integration_tool.id}")
            assert tool_response.status_code == 200
            affected_tool = tool_response.json()

            assert affected_tool["enabled"] is False  # Disabled due to missing
            assert affected_tool["status"] == "missing"
            assert affected_tool["refresh_error"] == "Tool not found in MCP server"

    async def test_integration_re_enablement_when_mcp_server_recovers(
        self,
        orchestration_service: OrchestrationService,
        jwt_client: AsyncClient,
        test_db_session: AsyncSession,
        test_user,
    ) -> None:
        """Test that ERROR integrations are re-enabled when MCP server becomes available."""
        integration = await _create_test_integration(
            test_db_session,
            test_user,
            name="recovery-integration",
            base_url="http://recovery-server:8000/mcp",
            enabled=False,
            status=IntegrationStatus.ERROR,
        )
        integration_id = str(integration.id)

        # Update with validation error
        integration.validation_error = "Connection/timeout error: Connection refused"
        test_db_session.add(integration)
        await test_db_session.commit()

        # Create tools for this integration
        integration_tool = Tool(
            name="recovery_integration_tool",
            namespaced_name=f"{integration.name}::recovery_integration_tool",
            description="Tool from recovering integration",
            integration_id=integration.id,
            enabled=True,
            status=ToolStatus.AVAILABLE,
            parameters=[],
            created_by=test_user.id,
        )

        test_db_session.add(integration_tool)
        await test_db_session.commit()

        session_id = "session-abc"
        invocation_id = uuid4()
        execution_id = uuid4()

        mock_integration_tool = Mock(spec=BaseTool)
        mock_integration_tool.name = "recovery_integration_tool"
        mock_integration_tool.description = "Tool from recovering integration"

        with (
            patch(
                "nexus.agent_orchestrator.tool_manager.tool_services.ToolManagerClient",
                create_test_tool_manager_client(jwt_client),
            ),
            patch("nexus.tool_manager.lib.providers.mcp.mcp_provider.MultiServerMCPClient") as mock_mcp_client_class,
        ):
            mock_mcp_instance = Mock()
            mock_mcp_client_class.return_value = mock_mcp_instance
            mock_mcp_instance.get_tools = AsyncMock(return_value=[mock_integration_tool])

            result_tools = await orchestration_service._get_tools(session_id, invocation_id, execution_id)

            assert len(result_tools) == 1
            assert result_tools[0] is mock_integration_tool

            # Verify the integration was re-enabled
            integration_response = await jwt_client.get(f"/api/v1/integrations/{integration_id}")
            assert integration_response.status_code == 200
            recovered_integration = integration_response.json()

            assert recovered_integration["enabled"] is True  # Re-enabled!
            assert recovered_integration["validation_status"] == "available"
            assert recovered_integration["validation_error"] is None  # Error cleared
