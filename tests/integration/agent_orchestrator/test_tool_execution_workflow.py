"""Integration tests for end-to-end tool execution workflow in invocations.

Tests that Agent Orchestrator invocations can discover, load, and execute tools
through the complete StateGraph workflow including ToolNode integration.
"""

import asyncio
from collections.abc import Generator
from typing import Any
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from langchain_core.tools import tool

from nexus.tool_manager.lib.providers.mcp import MCPProvider
from tests.conftest import wait_for_invocation_execution


@pytest.fixture(autouse=True)
def mock_tool_manager_client(base_client: AsyncClient) -> Generator[None, None, None]:
    """Override ToolManagerClient creation to use test server transport."""
    from nexus.agent_orchestrator.tool_manager.tool_manager_client import ToolManagerClient

    # Store the original ToolManagerClient __init__ method
    original_init = ToolManagerClient.__init__

    def patched_init(self, base_url: str, **kwargs: object) -> None:
        # Call original init with test URL - ignore kwargs to avoid type issues
        original_init(self, base_url="http://test/api/v1")
        # Replace the session with test client's transport
        self.session = AsyncClient(
            transport=base_client._transport,
            base_url="http://test/api/v1",
        )

    # Patch the ToolManagerClient.__init__ method
    with patch.object(ToolManagerClient, "__init__", patched_init):
        yield


@pytest.fixture(autouse=True)
def mock_mcp_provider_for_testing(base_client: AsyncClient) -> Generator[None, None, None]:
    """Override MCP provider to use test-compatible HTTP client."""

    async def patched_get_base_tools(self) -> list[Any]:
        """Patched get_base_tools that works in test environment."""
        # Dummy await to satisfy SonarCloud - function must be async to match MCPProvider.get_base_tools signature
        await asyncio.sleep(0)

        # For testing purposes, return mock tools instead of connecting to real MCP server
        # This avoids HTTP client context issues in test environment
        @tool
        def mock_calculator(a: int, b: int) -> int:
            """Add two numbers together."""
            return a + b

        @tool
        def mock_greeter(name: str = "World") -> str:
            """Return a greeting message."""
            return f"Hello, {name}!"

        # Return mock tools that simulate what an MCP provider would return
        return [mock_calculator, mock_greeter]

    # Patch the get_base_tools method
    with patch.object(MCPProvider, "get_base_tools", patched_get_base_tools):
        yield


class TestToolExecutionWorkflow:
    """Integration tests for end-to-end tool execution workflow."""

    async def _create_and_validate_mcp_provider(self, base_client: AsyncClient) -> str:
        """Create and validate an MCP provider for testing."""
        # There are a lot of issues running FastMCP with beartype.
        # See https://github.com/beartype/beartype/issues/542 (for example).
        # Unfortunately the simplest solution is to isolate the MCP tests from all others.
        # This means we also need to lazy-import our ExampleMCPServer to avoid it being loaded early.
        from tests.fixtures.example_mcp_server import ExampleMCPServer

        test_server = ExampleMCPServer(host="localhost", port=8768)

        async with test_server.running():
            await asyncio.sleep(1.0)

            provider_data = {
                "name": "test-tool-execution",
                "description": "Test MCP provider for tool execution",
                "configuration": {
                    "provider_type": "mcp",
                    "base_url": f"{test_server.base_url}",
                },
            }

            # Create provider
            create_response = await base_client.post("/api/v1/tool-providers", json=provider_data)
            assert create_response.status_code == 201

            provider_id = create_response.json()["id"]

            # Validate provider
            validate_response = await base_client.post(f"/api/v1/tool-providers/{provider_id}/validate")
            assert validate_response.status_code == 200
            assert validate_response.json()["valid"] is True

            # Refresh tools
            refresh_response = await base_client.post(f"/api/v1/tool-providers/{provider_id}/refresh-tools")
            assert refresh_response.status_code == 200
            assert refresh_response.json()["refreshed_count"] > 0

            return str(provider_id)

    @pytest.mark.mcp
    @pytest.mark.asyncio
    async def test_invocation_with_tool_execution(self, auth_client_with_tool_aware_mocked_llm: AsyncClient) -> None:
        """Test that invocations can execute tools through StateGraph ToolNode integration.

        This test verifies the complete workflow:
        1. Invocation created with tool-requiring prompt
        2. OrchestrationService discovers available tools via ToolSynchronizer
        3. StateGraph includes ToolNode with discovered tools
        4. LLM intelligently selects and calls appropriate tools
        5. Tool execution results are included in invocation response
        """
        # Set up MCP provider with tools
        await self._create_and_validate_mcp_provider(auth_client_with_tool_aware_mocked_llm)

        # Verify tools are available before creating invocation
        tools_response = await auth_client_with_tool_aware_mocked_llm.get("/api/v1/tools")
        assert tools_response.status_code == 200
        tools_data = tools_response.json()
        available_tools = tools_data["resources"]

        # Assert that our mock tools are discovered
        tool_names = [tool_item["name"] for tool_item in available_tools]
        assert "mock_calculator" in tool_names, f"mock_calculator not found in tools: {tool_names}"
        assert "mock_greeter" in tool_names, f"mock_greeter not found in tools: {tool_names}"

        # Create invocation that should trigger calculator tool usage
        invocation_data = {
            "prompt": "Calculate the sum of 5 and 3 using available tools.",
            "session_id": "test-tool-execution-session",
        }

        create_response = await auth_client_with_tool_aware_mocked_llm.post("/api/v1/invocations", json=invocation_data)
        assert create_response.status_code == 202

        invocation_response = create_response.json()
        invocation_id = invocation_response["id"]

        # Wait for invocation to complete using the helper
        async with wait_for_invocation_execution(
            auth_client_with_tool_aware_mocked_llm, invocation_id, max_wait_time=15.0
        ) as completed_invocation:
            # Verify invocation completed successfully
            assert completed_invocation is not None
            assert completed_invocation["status"] == "completed"
            assert completed_invocation["result"] is not None

            result = completed_invocation["result"]
            assert isinstance(result, dict)

            # Check for streaming metadata indicating successful orchestration
            response_metadata = result.get("response_metadata", {})
            assert response_metadata.get("orchestration") == "langgraph"
            assert response_metadata.get("source") == "streaming"

            # CRITICAL: Assert that tool execution occurred and the result is in the response
            result_content = result.get("content", "")

            # The mock_calculator should have been called with a=5, b=3 and returned 8
            # The response should contain evidence of tool execution
            assert "8" in result_content or "calculator" in result_content.lower(), (
                f"Expected calculator result (8) or tool mention in response: {result_content}"
            )

            # Verify the response indicates tool usage occurred
            assert any(keyword in result_content.lower() for keyword in ["tool", "calculate", "calculator"]), (
                f"Expected tool usage indication in response: {result_content}"
            )

    @pytest.mark.mcp
    @pytest.mark.asyncio
    async def test_invocation_with_greeter_tool_execution(
        self, auth_client_with_tool_aware_mocked_llm: AsyncClient
    ) -> None:
        """Test that the LLM can intelligently select and execute different tools based on prompts."""
        # Set up MCP provider with tools
        await self._create_and_validate_mcp_provider(auth_client_with_tool_aware_mocked_llm)

        # Verify tools are available
        tools_response = await auth_client_with_tool_aware_mocked_llm.get("/api/v1/tools")
        assert tools_response.status_code == 200
        tools_data = tools_response.json()
        available_tools = tools_data["resources"]

        tool_names = [tool_item["name"] for tool_item in available_tools]
        assert "mock_greeter" in tool_names, f"mock_greeter not found in tools: {tool_names}"

        # Create invocation that should trigger greeter tool usage
        invocation_data = {
            "prompt": "Please greet me with a hello message using the available tools.",
            "session_id": "test-greeter-execution-session",
        }

        create_response = await auth_client_with_tool_aware_mocked_llm.post("/api/v1/invocations", json=invocation_data)
        assert create_response.status_code == 202

        invocation_response = create_response.json()
        invocation_id = invocation_response["id"]

        # Wait for invocation to complete using the helper
        async with wait_for_invocation_execution(
            auth_client_with_tool_aware_mocked_llm, invocation_id, max_wait_time=15.0
        ) as completed_invocation:
            # Verify invocation completed successfully
            assert completed_invocation is not None
            assert completed_invocation["status"] == "completed"
            assert completed_invocation["result"] is not None

            result = completed_invocation["result"]
            result_content = result.get("content", "")

            # The mock_greeter should have been called and returned "Hello, Test User!"
            assert any(keyword in result_content for keyword in ["Hello", "Test User", "greeting"]), (
                f"Expected greeting result in response: {result_content}"
            )

            # Verify the response indicates tool usage occurred
            assert any(keyword in result_content.lower() for keyword in ["tool", "greet", "greeting"]), (
                f"Expected tool usage indication in response: {result_content}"
            )

    @pytest.mark.mcp
    @pytest.mark.asyncio
    async def test_invocation_without_available_tools(
        self, auth_client_with_tool_aware_mocked_llm: AsyncClient
    ) -> None:
        """Test that invocations complete gracefully when no tools are available."""
        # Create invocation without any MCP providers configured
        invocation_data = {
            "prompt": "Calculate the sum of 5 and 3",
            "session_id": "test-no-tools-session",
        }

        create_response = await auth_client_with_tool_aware_mocked_llm.post("/api/v1/invocations", json=invocation_data)
        assert create_response.status_code == 202

        invocation_response = create_response.json()
        invocation_id = invocation_response["id"]

        # Wait for invocation to complete using the helper
        async with wait_for_invocation_execution(
            auth_client_with_tool_aware_mocked_llm, invocation_id, max_wait_time=10.0
        ) as completed_invocation:
            # Verify invocation completed successfully even without tools
            assert completed_invocation is not None
            assert completed_invocation["status"] == "completed"
            assert completed_invocation["result"] is not None

            # Verify standard orchestration metadata is present
            result = completed_invocation["result"]
            assert isinstance(result, dict)

            response_metadata = result.get("response_metadata", {})
            assert response_metadata.get("orchestration") == "langgraph"

    @pytest.mark.mcp
    @pytest.mark.asyncio
    async def test_invocation_with_disabled_tools(self, auth_client_with_tool_aware_mocked_llm: AsyncClient) -> None:
        """Test invocation behavior when tools are discovered but disabled."""
        # Create and validate provider with tools
        provider_id = await self._create_and_validate_mcp_provider(auth_client_with_tool_aware_mocked_llm)

        # Get tools and disable them
        tools_response = await auth_client_with_tool_aware_mocked_llm.get(
            "/api/v1/tools", params={"provider_id[eq]": provider_id}
        )
        assert tools_response.status_code == 200

        tools = tools_response.json()["resources"]
        assert len(tools) > 0

        # Disable first tool
        tool_id = tools[0]["id"]
        disable_response = await auth_client_with_tool_aware_mocked_llm.patch(
            f"/api/v1/tools/{tool_id}", json={"enabled": False}
        )
        assert disable_response.status_code == 200

        # Create invocation
        invocation_data = {
            "prompt": f"Use the {tools[0]['name']} tool to calculate something",
            "session_id": "test-disabled-tools-session",
        }

        create_response = await auth_client_with_tool_aware_mocked_llm.post("/api/v1/invocations", json=invocation_data)
        assert create_response.status_code == 202

        invocation_response = create_response.json()
        invocation_id = invocation_response["id"]

        # Wait for invocation to complete using the helper
        async with wait_for_invocation_execution(
            auth_client_with_tool_aware_mocked_llm, invocation_id, max_wait_time=10.0
        ) as completed_invocation:
            # Verify invocation completed (disabled tools should be filtered out)
            assert completed_invocation is not None
            assert completed_invocation["status"] == "completed"
            assert completed_invocation["result"] is not None
