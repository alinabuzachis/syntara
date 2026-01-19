"""Integration tests for end-to-end tool execution workflow in invocations.

Tests that Agent Orchestrator invocations can discover, load, and execute tools
through the complete StateGraph workflow including ToolNode integration.
"""

import asyncio
from collections.abc import Generator
from datetime import UTC, datetime
from typing import Any
from unittest.mock import Mock, patch

import httpx
import pytest
from httpx import AsyncClient, HTTPStatusError
from langchain_core.tools import tool

from nexus.tool_manager.lib.providers.mcp import MCPProvider
from nexus.tool_manager.models import ToolProviderValidationResult
from tests.helpers.invocations import wait_for_invocation_execution
from tests.helpers.tool_manager import wait_for_tool_status


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


@pytest.fixture
def patch_mcp_provider() -> Generator[None, None, None]:
    """Base fixture that patches MCP provider methods to work without real MCP server."""

    async def patched_validate_connection(self) -> ToolProviderValidationResult:
        """Patched validate_connection that always succeeds for testing."""
        return ToolProviderValidationResult(valid=True, provider_type="mcp", validated_at=datetime.now(UTC))

    # Patch validate_connection method that's common to all MCP provider tests
    with patch.object(MCPProvider, "validate_connection", patched_validate_connection):
        yield


@pytest.fixture
def mock_mcp_provider_for_testing(base_client: AsyncClient, patch_mcp_provider: None) -> Generator[None, None, None]:
    """Override MCP provider to use test-compatible methods without real MCP server."""

    async def patched_get_base_tools(self) -> list[Any]:
        """Patched get_base_tools that works in test environment."""

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

    # Patch get_base_tools method for basic testing tools
    with patch.object(MCPProvider, "get_base_tools", patched_get_base_tools):
        yield


@pytest.fixture
def mock_mcp_provider_with_retry_tools(
    base_client: AsyncClient, patch_mcp_provider: None
) -> Generator[None, None, None]:
    """Override MCP provider with tools that support retry testing."""
    # Global state to track tool execution attempts
    call_counts = {"retry_tool": 0, "network_tool": 0, "failing_tool": 0}

    async def patched_get_base_tools(self) -> list[Any]:
        """Patched get_base_tools with retry-capable tools."""
        await asyncio.sleep(0)

        @tool
        def mock_retry_tool(message: str) -> str:
            """Tool that fails on first call, succeeds on second."""
            call_counts["retry_tool"] += 1
            if call_counts["retry_tool"] == 1:
                error_message = "First call always fails for testing"
                raise TimeoutError(error_message)
            return f"Success on attempt {call_counts['retry_tool']}: {message}"

        @tool
        def mock_network_tool(endpoint: str) -> str:
            """Tool that simulates network failure on first call."""
            call_counts["network_tool"] += 1
            if call_counts["network_tool"] == 1:
                error_message = "Network connection timeout"
                raise TimeoutError(error_message)
            return f"Connected to {endpoint} on attempt {call_counts['network_tool']}"

        @tool
        def mock_failing_tool(data: str) -> str:
            """Tool that consistently fails and should be disabled."""
            call_counts["failing_tool"] += 1
            error_message = f"Persistent failure on attempt {call_counts['failing_tool']}"
            response = Mock()
            response.status_code = httpx.codes.INTERNAL_SERVER_ERROR
            raise HTTPStatusError(error_message, request=Mock(), response=response)

        return [mock_retry_tool, mock_network_tool, mock_failing_tool]

    # Patch get_base_tools method for retry testing tools
    with patch.object(MCPProvider, "get_base_tools", patched_get_base_tools):
        yield


async def _create_tool_provider(base_client: AsyncClient) -> str:
    """Create a ToolProvider for testing."""
    provider_data = {
        "name": "test-tool-execution",
        "description": "Test MCP provider for tool execution",
        "configuration": {
            "provider_type": "mcp",
            "base_url": "https://somewhere.com",
        },
    }

    # Create provider
    create_response = await base_client.post("/api/v1/tool_manager/tool_providers", json=provider_data)
    assert create_response.status_code == 201

    provider_id = create_response.json()["id"]

    # Validate provider
    validate_response = await base_client.post(f"/api/v1/tool_manager/tool_providers/{provider_id}/validate")
    assert validate_response.status_code == 200
    assert validate_response.json()["valid"] is True

    # Refresh tools
    refresh_response = await base_client.post(f"/api/v1/tool_manager/tool_providers/{provider_id}/refresh_tools")
    assert refresh_response.status_code == 200
    assert refresh_response.json()["refreshed_count"] > 0

    return str(provider_id)


class TestToolExecutionWorkflow:
    """Integration tests for end-to-end tool execution workflow."""

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("mock_mcp_provider_for_testing")
    async def test_invocation_with_tool_execution(self, auth_client_with_tool_aware_mocked_llm: AsyncClient) -> None:
        """Test that invocations can execute tools through StateGraph ToolNode integration.

        This test verifies the complete workflow:
        1. Invocation created with tool-requiring prompt
        2. OrchestrationService discovers available tools via ToolSynchronizer
        3. StateGraph includes ToolNode with discovered tools
        4. LLM intelligently selects and calls appropriate tools
        5. Tool execution results are included in invocation response
        """
        # Set up ToolProvider
        await _create_tool_provider(auth_client_with_tool_aware_mocked_llm)

        # Verify tools are available before creating invocation
        tools_response = await auth_client_with_tool_aware_mocked_llm.get("/api/v1/tool_manager/tools")
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

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("mock_mcp_provider_for_testing")
    async def test_invocation_with_greeter_tool_execution(
        self, auth_client_with_tool_aware_mocked_llm: AsyncClient
    ) -> None:
        """Test that the LLM can intelligently select and execute different tools based on prompts."""
        # Set up ToolProvider
        await _create_tool_provider(auth_client_with_tool_aware_mocked_llm)

        # Verify tools are available
        tools_response = await auth_client_with_tool_aware_mocked_llm.get("/api/v1/tool_manager/tools")
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

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("mock_mcp_provider_for_testing")
    async def test_invocation_with_disabled_tools(self, auth_client_with_tool_aware_mocked_llm: AsyncClient) -> None:
        """Test invocation behavior when tools are discovered but disabled."""
        # Set up ToolProvider
        provider_id = await _create_tool_provider(auth_client_with_tool_aware_mocked_llm)

        # Get tools and disable them
        tools_response = await auth_client_with_tool_aware_mocked_llm.get(
            "/api/v1/tool_manager/tools", params={"provider_id[eq]": provider_id}
        )
        assert tools_response.status_code == 200

        tools = tools_response.json()["resources"]
        assert len(tools) > 0

        # Disable first tool
        tool_id = tools[0]["id"]
        disable_response = await auth_client_with_tool_aware_mocked_llm.patch(
            f"/api/v1/tool_manager/tools/{tool_id}", json={"enabled": False}
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


class TestToolExecutionFailureRetryWorkflow:
    """Integration tests for tool execution failure handling, retry mechanisms, and auto-disable functionality."""

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("fast_retry_settings")
    @pytest.mark.usefixtures("mock_mcp_provider_with_retry_tools")
    async def test_tool_retry_mechanism_with_eventual_success(
        self, auth_client_with_tool_aware_mocked_llm: AsyncClient
    ) -> None:
        """Test that the retry mechanism works when a tool fails initially but succeeds on retry."""
        # Set up ToolProvider
        await _create_tool_provider(auth_client_with_tool_aware_mocked_llm)

        # Verify retry tools are available
        tools_response = await auth_client_with_tool_aware_mocked_llm.get("/api/v1/tool_manager/tools")
        assert tools_response.status_code == 200
        tools_data = tools_response.json()
        available_tools = tools_data["resources"]

        tool_names = [tool_item["name"] for tool_item in available_tools]
        assert "mock_retry_tool" in tool_names, f"mock_retry_tool not found in tools: {tool_names}"

        # Create invocation that should trigger retry tool usage
        invocation_data = {
            "prompt": "Use the mock_retry_tool to process the message 'test data'.",
            "session_id": "test-retry-mechanism-session",
        }

        create_response = await auth_client_with_tool_aware_mocked_llm.post("/api/v1/invocations", json=invocation_data)
        assert create_response.status_code == 202

        invocation_response = create_response.json()
        invocation_id = invocation_response["id"]

        # Wait for invocation to complete with extended timeout for retry behavior
        async with wait_for_invocation_execution(
            auth_client_with_tool_aware_mocked_llm, invocation_id, max_wait_time=20.0
        ) as completed_invocation:
            # Verify invocation completed successfully after retry
            assert completed_invocation is not None
            assert completed_invocation["status"] == "completed"
            assert completed_invocation["result"] is not None

            result = completed_invocation["result"]
            result_content = result.get("content", "")

            # Should contain evidence of successful execution on second attempt
            assert any(keyword in result_content for keyword in ["Success on attempt 2", "test data"]), (
                f"Expected successful retry result in response: {result_content}"
            )

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("fast_retry_settings")
    @pytest.mark.usefixtures("mock_mcp_provider_with_retry_tools")
    async def test_tool_retry_mechanism_with_network_error_recovery(
        self, auth_client_with_tool_aware_mocked_llm: AsyncClient
    ) -> None:
        """Test that the retry mechanism handles network errors and recovers on retry."""
        # Set up ToolProvider
        await _create_tool_provider(auth_client_with_tool_aware_mocked_llm)

        # Verify network tool is available
        tools_response = await auth_client_with_tool_aware_mocked_llm.get("/api/v1/tool_manager/tools")
        assert tools_response.status_code == 200
        tools_data = tools_response.json()
        available_tools = tools_data["resources"]

        tool_names = [tool_item["name"] for tool_item in available_tools]
        assert "mock_network_tool" in tool_names, f"mock_network_tool not found in tools: {tool_names}"

        # Create invocation that should trigger network tool usage
        invocation_data = {
            "prompt": "Use the mock_network_tool to connect to endpoint 'api.example.com'.",
            "session_id": "test-network-retry-session",
        }

        create_response = await auth_client_with_tool_aware_mocked_llm.post("/api/v1/invocations", json=invocation_data)
        assert create_response.status_code == 202

        invocation_response = create_response.json()
        invocation_id = invocation_response["id"]

        # Wait for invocation to complete with extended timeout for retry behavior
        async with wait_for_invocation_execution(
            auth_client_with_tool_aware_mocked_llm, invocation_id, max_wait_time=20.0
        ) as completed_invocation:
            # Verify invocation completed successfully after network retry
            assert completed_invocation is not None
            assert completed_invocation["status"] == "completed"
            assert completed_invocation["result"] is not None

            result = completed_invocation["result"]
            result_content = result.get("content", "")

            # Should contain evidence of successful connection on second attempt
            assert any(keyword in result_content for keyword in ["Connected to api.example.com", "attempt 2"]), (
                f"Expected successful network retry result in response: {result_content}"
            )

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("fast_retry_settings")
    @pytest.mark.usefixtures("mock_mcp_provider_with_retry_tools")
    async def test_tool_automatic_disable_on_persistent_failure(
        self, auth_client_with_tool_aware_mocked_llm: AsyncClient
    ) -> None:
        """Test that consistently failing tools are automatically disabled."""
        # Set up ToolProvider
        provider_id = await _create_tool_provider(auth_client_with_tool_aware_mocked_llm)

        # Verify failing tool is available and enabled initially
        tools_response = await auth_client_with_tool_aware_mocked_llm.get(
            "/api/v1/tool_manager/tools", params={"provider_id[eq]": provider_id}
        )
        assert tools_response.status_code == 200
        tools_data = tools_response.json()
        available_tools = tools_data["resources"]

        failing_tool = next(
            (tool_item for tool_item in available_tools if tool_item["name"] == "mock_failing_tool"), None
        )
        assert failing_tool is not None, "mock_failing_tool not found in available tools"
        assert failing_tool["enabled"] is True, "Tool should be initially enabled"

        failing_tool_id = failing_tool["id"]

        # Create invocation that should trigger failing tool usage
        invocation_data = {
            "prompt": "Use the mock_failing_tool to process data 'test input'.",
            "session_id": "test-auto-disable-session",
        }

        create_response = await auth_client_with_tool_aware_mocked_llm.post("/api/v1/invocations", json=invocation_data)
        assert create_response.status_code == 202

        invocation_response = create_response.json()
        invocation_id = invocation_response["id"]

        # Wait for invocation to complete (should eventually fail after retries)
        async with wait_for_invocation_execution(
            auth_client_with_tool_aware_mocked_llm, invocation_id, max_wait_time=25.0
        ) as completed_invocation:
            # Invocation may complete with failure or still succeed with error handling
            assert completed_invocation is not None

        # Wait for the tool to be automatically disabled due to persistent failures
        async with wait_for_tool_status(
            auth_client_with_tool_aware_mocked_llm, failing_tool_id, "error", max_wait_time=10.0
        ) as tool_status:
            # Verify the tool was found and has the expected status
            assert tool_status is not None, "Failed to get tool status"

            # Critical assertion: Tool should be automatically disabled due to persistent failures
            assert tool_status["enabled"] is False, (
                f"Tool should be automatically disabled after persistent failures, but enabled={tool_status['enabled']}"
            )

            # Tool status should be marked as having issues
            assert tool_status.get("status") == "error", (
                f"Tool status should indicate issues after failures, got: {tool_status.get('status')}"
            )
            refresh_error = tool_status.get("refresh_error")
            assert refresh_error is not None, "Tool refresh_error should not be None"
            assert "Persistent failure on attempt 4" in refresh_error, (
                f"Tool refresh_error should indicate reason for failure, got: {refresh_error}"
            )


class TestToolEventWebSocketStreaming:
    """Integration test for tool event streaming via WebSocket/Valkey.

    Validates that tool_call and tool_result events are published to the
    Valkey stream during tool execution, enabling real-time WebSocket streaming.
    """

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("mock_mcp_provider_for_testing")
    async def test_tool_events_published_to_valkey_stream(
        self, auth_client_with_tool_aware_mocked_llm: AsyncClient
    ) -> None:
        """Test that tool_call and tool_result events appear in the Valkey stream.

        1. Create invocation with tool-requiring prompt
        2. Wait for completion
        3. Verify tool_call and tool_result events were published to stream
        """
        from nexus.core.valkey.stream import StreamClient

        # Set up ToolProvider with calculator tool
        await _create_tool_provider(auth_client_with_tool_aware_mocked_llm)

        # Verify tools are available
        tools_response = await auth_client_with_tool_aware_mocked_llm.get("/api/v1/tool_manager/tools")
        assert tools_response.status_code == 200
        tool_names = [t["name"] for t in tools_response.json()["resources"]]
        assert "mock_calculator" in tool_names

        # Create invocation that triggers calculator tool
        invocation_data = {
            "prompt": "Use the calculator to add 5 and 3.",
            "session_id": "test-tool-events-stream-session",
        }

        create_response = await auth_client_with_tool_aware_mocked_llm.post("/api/v1/invocations", json=invocation_data)
        assert create_response.status_code == 202
        invocation_id = create_response.json()["id"]

        # Wait for invocation to complete
        async with wait_for_invocation_execution(
            auth_client_with_tool_aware_mocked_llm, invocation_id, max_wait_time=15.0
        ) as completed_invocation:
            assert completed_invocation is not None
            assert completed_invocation["status"] == "completed"

        # Read events from Valkey stream and verify tool events were published
        stream_id = f"invocation:{invocation_id}:events"
        events: list[dict[str, Any]] = []

        async with StreamClient() as client:
            async for event in client.events(stream_id, start_id="0-0"):
                events.append(event)
                # Stop after completion event
                if event.get("event_type") == "completion":
                    break

        # Verify we received the expected event types
        event_types = [e.get("event_type") for e in events]

        # Must have tool_call event (tool execution started)
        assert "tool_call" in event_types, f"Expected tool_call event in stream, got: {event_types}"

        # Must have tool_result event (tool execution completed)
        assert "tool_result" in event_types, f"Expected tool_result event in stream, got: {event_types}"

        # Must have completion event
        assert "completion" in event_types, f"Expected completion event in stream, got: {event_types}"

        # Verify tool_call event structure
        tool_call_event = next(e for e in events if e.get("event_type") == "tool_call")
        assert tool_call_event["data"]["tool_name"] == "mock_calculator"
        assert "tool_input" in tool_call_event["data"]
        assert tool_call_event["data"]["tool_input"] == {"a": 5, "b": 3}

        # Verify tool_result event structure
        tool_result_event = next(e for e in events if e.get("event_type") == "tool_result")
        assert tool_result_event["data"]["tool_name"] == "mock_calculator"
        assert "tool_output" in tool_result_event["data"]
        # Tool output should contain the result (8)
        assert "8" in tool_result_event["data"]["tool_output"]
