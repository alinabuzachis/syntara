"""Unit tests for tool execution failure handler."""

import asyncio
from typing import Any
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

import pytest
from langchain_core.messages import ToolCall, ToolMessage
from langchain_core.tools import BaseTool
from langgraph.prebuilt.tool_node import ToolCallRequest
from langgraph.types import Command

from nexus.agent_orchestrator.tool_manager.execution_failure_handler import (
    create_tool_awrapper,
    create_tool_wrapper,
)
from nexus.agent_orchestrator.utils.retry import is_retryable_error


async def _execute_async_wrapper(
    tool_name: str,
    tool_call_id: str,
    exception: Exception | None,
    tool: BaseTool | None,
    success_content: str | None = None,
) -> ToolMessage | Command[Any]:
    """Helper function to execute async tool wrapper with configurable success/failure scenarios.

    Args:
        tool_name: Name of the tool being tested
        tool_call_id: ID for the tool call
        exception: Exception to raise in mock_execute (None for success case)
        tool: BaseTool instance (or None for missing tool tests)
        success_content: Content to return for success case (ignored if exception is provided)

    Returns:
        The ToolMessage or Command result from the async wrapper execution

    """
    wrapper = create_tool_awrapper()

    async def mock_execute(tool_request: ToolCallRequest) -> ToolMessage | Command[Any]:
        if exception is not None:
            raise exception

        # Success case
        return ToolMessage(
            content=success_content or "Success!",
            tool_call_id=tool_call_id,
            name=tool_name,
        )

    tool_call = ToolCall(name=tool_name, args={}, id=tool_call_id)
    request = ToolCallRequest(
        tool_call=tool_call,
        tool=tool,
        state={},
        runtime=Mock() if tool is not None else None,  # type: ignore
    )

    return await wrapper(request, mock_execute)


def _execute_sync_wrapper(
    tool_name: str,
    tool_call_id: str,
    exception: Exception | None,
    tool: BaseTool | None,
    success_content: str | None = None,
    loop: asyncio.AbstractEventLoop | None = None,
) -> ToolMessage | Command[Any]:
    """Helper function to execute sync tool wrapper with configurable success/failure scenarios.

    Args:
        tool_name: Name of the tool being tested
        tool_call_id: ID for the tool call
        exception: Exception to raise in mock_execute (None for success case)
        tool: BaseTool instance (or None for missing tool tests)
        success_content: Content to return for success case (ignored if exception is provided)
        loop: Optional event loop to pass to create_tool_wrapper

    Returns:
        The ToolMessage result from the sync wrapper execution

    """
    wrapper = create_tool_wrapper(loop)

    def mock_execute(tool_request: ToolCallRequest) -> ToolMessage | Command[Any]:
        if exception is not None:
            raise exception

        # Success case
        return ToolMessage(
            content=success_content or "Success!",
            tool_call_id=tool_call_id,
            name=tool_name,
        )

    tool_call = ToolCall(name=tool_name, args={}, id=tool_call_id)
    request = ToolCallRequest(
        tool_call=tool_call,
        tool=tool,
        state={},
        runtime=Mock() if tool is not None else None,  # type: ignore
    )

    return wrapper(request, mock_execute)


class MockTool(BaseTool):
    """Mock tool for testing."""

    name: str = "test_tool"
    description: str = "Test tool for unit tests"

    def _run(self, *args: Any, **kwargs: Any) -> str:  # noqa: ANN401, ARG002
        """Mock run method."""
        return "test result"


class TestAsyncToolWrapper:
    """Test async tool wrapper functionality."""

    async def test_async_tool_wrapper_success(self) -> None:
        """Test async tool wrapper when execution succeeds."""
        result = await _execute_async_wrapper(
            tool_name="test_tool",
            tool_call_id="test-id",
            exception=None,
            tool=MockTool(),
            success_content="Success!",
        )

        # Should return the successful result
        assert isinstance(result, ToolMessage)
        assert result.content == "Success!"

    async def test_async_tool_wrapper_failure(self) -> None:
        """Test async tool wrapper when execution fails."""
        result = await _execute_async_wrapper(
            tool_name="test_tool",
            tool_call_id="test-id",
            exception=ValueError("Test failure"),
            tool=MockTool(),
        )

        # Should return error ToolMessage
        assert isinstance(result, ToolMessage)
        assert "Tool execution failed: ValueError: Test failure" in result.content
        assert result.tool_call_id == "test-id"
        assert result.name == "test_tool"
        assert result.status == "error"


class TestSyncToolWrapper:
    """Test synchronous tool wrapper functionality."""

    def test_sync_tool_wrapper_success(self) -> None:
        """Test sync tool wrapper when execution succeeds."""
        result = _execute_sync_wrapper(
            tool_name="test_tool",
            tool_call_id="test-id",
            exception=None,
            tool=MockTool(),
            success_content="Success!",
        )

        # Should return the successful result
        assert isinstance(result, ToolMessage)
        assert result.content == "Success!"

    @pytest.mark.usefixtures("fast_retry_settings")
    def test_sync_tool_wrapper_failure(self) -> None:
        """Test sync tool wrapper when execution fails."""
        result = _execute_sync_wrapper(
            tool_name="test_tool",
            tool_call_id="test-id",
            exception=ValueError("Test failure"),
            tool=MockTool(),
        )

        # Should return error ToolMessage
        assert isinstance(result, ToolMessage)
        assert "Tool execution failed: ValueError: Test failure" in result.content
        assert result.tool_call_id == "test-id"
        assert result.name == "test_tool"
        assert result.status == "error"

    @pytest.mark.usefixtures("fast_retry_settings")
    @patch("nexus.agent_orchestrator.tool_manager.execution_failure_handler._disable_tool_by_id")
    @patch("nexus.agent_orchestrator.tool_manager.execution_failure_handler.logger")
    def test_sync_wrapper_tool_disable_scheduling(self, mock_logger: Mock, mock_disable_tool: AsyncMock) -> None:
        """Test sync tool wrapper disables tool for valid tool_id (no event loop provided)."""
        # Create BaseTool with valid tool_id
        valid_tool_id = uuid4()
        tool = Mock(spec=BaseTool)
        tool.name = "sync_tool"
        tool.metadata = {"tool_id": str(valid_tool_id)}

        result = _execute_sync_wrapper(
            tool_name="sync_tool",
            tool_call_id="sync-call-123",
            exception=RuntimeError("Sync failure"),
            tool=tool,
        )

        # Verify logging
        mock_logger.exception.assert_called_once_with(
            "Tool execution failed during wrapped call: tool_name=%s",
            "sync_tool",
        )

        # Verify _disable_tool_by_id was actually called (fallback path using asyncio.run)
        mock_disable_tool.assert_called_once()
        args = mock_disable_tool.call_args[0]
        assert len(args) == 2
        disabled_tool_id, disabled_error = args
        assert disabled_tool_id == valid_tool_id
        assert isinstance(disabled_error, RuntimeError)
        assert str(disabled_error) == "Sync failure"

        # Verify response
        assert isinstance(result, ToolMessage)
        assert result.content == "Tool execution failed: RuntimeError: Sync failure"
        assert result.tool_call_id == "sync-call-123"
        assert result.name == "sync_tool"
        assert result.status == "error"

    @pytest.mark.usefixtures("fast_retry_settings")
    @patch("nexus.agent_orchestrator.tool_manager.execution_failure_handler._disable_tool_by_id")
    @patch("nexus.agent_orchestrator.tool_manager.execution_failure_handler.logger")
    def test_sync_wrapper_tool_disable_with_event_loop(self, mock_logger: Mock, mock_disable_tool: AsyncMock) -> None:
        """Test sync tool wrapper disables tool for valid tool_id (with event loop provided)."""
        # Create a mock event loop
        import asyncio

        mock_loop = Mock(spec=asyncio.AbstractEventLoop)

        # Create BaseTool with valid tool_id
        valid_tool_id = uuid4()
        tool = Mock(spec=BaseTool)
        tool.name = "loop_tool"
        tool.metadata = {"tool_id": str(valid_tool_id)}

        result = _execute_sync_wrapper(
            tool_name="loop_tool",
            tool_call_id="loop-call-456",
            exception=ConnectionError("Network failure"),
            tool=tool,
            loop=mock_loop,
        )

        # Verify logging
        mock_logger.exception.assert_called_once_with(
            "Tool execution failed during wrapped call: tool_name=%s",
            "loop_tool",
        )

        # Verify _disable_tool_by_id was actually called (via run_coroutine_threadsafe path)
        mock_disable_tool.assert_called_once()
        args = mock_disable_tool.call_args[0]
        assert len(args) == 2
        disabled_tool_id, disabled_error = args
        assert disabled_tool_id == valid_tool_id
        assert isinstance(disabled_error, ConnectionError)
        assert str(disabled_error) == "Network failure"

        # Verify response
        assert isinstance(result, ToolMessage)
        assert result.content == "Tool execution failed: ConnectionError: Network failure"
        assert result.tool_call_id == "loop-call-456"
        assert result.name == "loop_tool"
        assert result.status == "error"


class TestRetryableErrorIntegration:
    """Test integration with is_retryable_error function."""

    @pytest.mark.asyncio
    async def test_retryable_error_in_handler_context(
        self,
    ) -> None:
        """Test retryable error classification in handler context."""
        # Test error classification - use only errors that are actually retryable
        retryable_errors: list[Exception] = [
            TimeoutError("Async timeout"),
        ]

        non_retryable_errors = [
            ValueError("Invalid parameter"),
            KeyError("Missing key"),
            AttributeError("Missing attribute"),
            ConnectionError("Network failure"),  # Not retryable in the current implementation
        ]

        for error in retryable_errors:
            assert is_retryable_error(error), f"{error} should be retryable"

        for error in non_retryable_errors:
            assert not is_retryable_error(error), f"{error} should not be retryable"


class TestToolWrapperFailureScenarios:
    """Test comprehensive failure scenarios for tool wrapper."""

    @patch("nexus.agent_orchestrator.tool_manager.execution_failure_handler.logger")
    async def test_tool_wrapper_missing_base_tool(self, mock_logger: Mock) -> None:
        """Test tool wrapper when BaseTool is None."""
        result = await _execute_async_wrapper(
            tool_name="test_tool",
            tool_call_id="test-call-id",
            exception=RuntimeError("Tool execution failed"),
            tool=None,  # Missing BaseTool
        )

        # Verify error logging
        assert mock_logger.exception.call_count == 1
        assert mock_logger.error.call_count == 1
        mock_logger.exception.assert_called_once_with(
            "Tool execution failed during wrapped call: tool_name=%s",
            "test_tool",
        )
        mock_logger.error.assert_called_once_with(
            "BaseTool missing metadata - this indicates a bug in tool synchronization: tool_name=%s", "test_tool"
        )

        # Verify error ToolMessage returned
        assert isinstance(result, ToolMessage)
        assert result.content == "Tool execution failed: RuntimeError: Tool execution failed"
        assert result.tool_call_id == "test-call-id"
        assert result.name == "test_tool"
        assert result.status == "error"

    @patch("nexus.agent_orchestrator.tool_manager.execution_failure_handler.logger")
    async def test_tool_wrapper_missing_metadata_attribute(self, mock_logger: Mock) -> None:
        """Test tool wrapper when BaseTool has no metadata attribute."""
        # Create BaseTool without metadata attribute
        tool = Mock(spec=BaseTool)
        tool.name = "network_tool"
        # Deliberately don't set metadata attribute

        result = await _execute_async_wrapper(
            tool_name="network_tool",
            tool_call_id="network-call-123",
            exception=ConnectionError("Network timeout"),
            tool=tool,
        )

        # Verify logging
        assert mock_logger.exception.call_count == 1
        assert mock_logger.error.call_count == 1
        mock_logger.exception.assert_called_once_with(
            "Tool execution failed during wrapped call: tool_name=%s",
            "network_tool",
        )
        mock_logger.error.assert_called_once_with(
            "BaseTool missing metadata - this indicates a bug in tool synchronization: tool_name=%s", "network_tool"
        )

        # Verify response
        assert isinstance(result, ToolMessage)
        assert result.content == "Tool execution failed: ConnectionError: Network timeout"
        assert result.tool_call_id == "network-call-123"
        assert result.name == "network_tool"
        assert result.status == "error"

    @patch("nexus.agent_orchestrator.tool_manager.execution_failure_handler.logger")
    async def test_tool_wrapper_non_dict_metadata(self, mock_logger: Mock) -> None:
        """Test tool wrapper when BaseTool metadata is not a dictionary."""
        # Create BaseTool with non-dict metadata
        tool = Mock(spec=BaseTool)
        tool.name = "config_tool"
        tool.metadata = "invalid_metadata_string"  # Should be dict, not string

        result = await _execute_async_wrapper(
            tool_name="config_tool",
            tool_call_id="config-call-456",
            exception=ValueError("Invalid configuration"),
            tool=tool,
        )

        # Verify logging
        assert mock_logger.exception.call_count == 1
        assert mock_logger.error.call_count == 1
        mock_logger.exception.assert_called_once_with(
            "Tool execution failed during wrapped call: tool_name=%s",
            "config_tool",
        )
        mock_logger.error.assert_called_once_with(
            "BaseTool missing metadata - this indicates a bug in tool synchronization: tool_name=%s", "config_tool"
        )

        # Verify response
        assert isinstance(result, ToolMessage)
        assert result.content == "Tool execution failed: ValueError: Invalid configuration"
        assert result.tool_call_id == "config-call-456"
        assert result.name == "config_tool"
        assert result.status == "error"

    @pytest.mark.usefixtures("fast_retry_settings")
    @patch("nexus.agent_orchestrator.tool_manager.execution_failure_handler.logger")
    async def test_tool_wrapper_missing_tool_id_in_metadata(self, mock_logger: Mock) -> None:
        """Test tool wrapper when metadata exists but tool_id is missing."""
        # Create BaseTool with metadata but no tool_id
        tool = Mock(spec=BaseTool)
        tool.name = "timeout_tool"
        tool.metadata = {"some_other_field": "value"}  # Missing tool_id

        result = await _execute_async_wrapper(
            tool_name="timeout_tool",
            tool_call_id="timeout-call-789",
            exception=TimeoutError("Request timeout"),
            tool=tool,
        )

        # Verify logging
        assert mock_logger.exception.call_count == 1
        assert mock_logger.error.call_count == 1
        mock_logger.exception.assert_called_once_with(
            "Tool execution failed during wrapped call: tool_name=%s",
            "timeout_tool",
        )
        mock_logger.error.assert_called_once_with(
            "BaseTool metadata missing tool_id - this indicates a bug in tool synchronization: tool_name=%s",
            "timeout_tool",
        )

        # Verify response
        assert isinstance(result, ToolMessage)
        assert result.content == "Tool execution failed: TimeoutError: Request timeout"
        assert result.tool_call_id == "timeout-call-789"
        assert result.name == "timeout_tool"
        assert result.status == "error"

    @patch("nexus.agent_orchestrator.tool_manager.execution_failure_handler.logger")
    async def test_tool_wrapper_invalid_tool_id_format(self, mock_logger: Mock) -> None:
        """Test tool wrapper when tool_id in metadata is not a valid UUID."""
        # Create BaseTool with invalid tool_id format
        tool = Mock(spec=BaseTool)
        tool.name = "key_tool"
        tool.metadata = {"tool_id": "invalid-uuid-format"}  # Invalid UUID

        result = await _execute_async_wrapper(
            tool_name="key_tool",
            tool_call_id="key-call-abc",
            exception=KeyError("Missing required key"),
            tool=tool,
        )

        # Verify logging
        assert mock_logger.exception.call_count == 2
        mock_logger.exception.assert_any_call(
            "Tool execution failed during wrapped call: tool_name=%s",
            "key_tool",
        )
        mock_logger.exception.assert_any_call(
            "Invalid tool_id format in metadata - this indicates a bug in tool synchronization: "
            "tool_name=%s, tool_id=%s",
            "key_tool",
            "invalid-uuid-format",
        )

        # Verify response
        assert isinstance(result, ToolMessage)
        assert result.content == "Tool execution failed: KeyError: 'Missing required key'"
        assert result.tool_call_id == "key-call-abc"
        assert result.name == "key_tool"
        assert result.status == "error"

    @patch("nexus.agent_orchestrator.tool_manager.execution_failure_handler._disable_tool_by_id")
    @patch("nexus.agent_orchestrator.tool_manager.execution_failure_handler.logger")
    async def test_tool_wrapper_successful_tool_id_extraction_and_disable_scheduling(
        self, mock_logger: Mock, mock_disable_tool: AsyncMock
    ) -> None:
        """Test tool wrapper with valid tool_id that gets disabled directly."""
        # Create BaseTool with valid tool_id
        valid_tool_id = uuid4()
        tool = Mock(spec=BaseTool)
        tool.name = "disk_tool"
        tool.metadata = {"tool_id": str(valid_tool_id)}

        result = await _execute_async_wrapper(
            tool_name="disk_tool",
            tool_call_id="disk-call-def",
            exception=OSError("Disk full"),
            tool=tool,
        )

        # Verify logging
        mock_logger.exception.assert_called_once_with(
            "Tool execution failed during wrapped call: tool_name=%s",
            "disk_tool",
        )
        mock_logger.debug.assert_called_once_with("Extracted tool_id from metadata: %s", valid_tool_id)

        # Verify tool disable was called directly
        mock_disable_tool.assert_called_once()
        args, _kwargs = mock_disable_tool.call_args
        assert len(args) == 2
        disabled_tool_id, disabled_error = args
        assert disabled_tool_id == valid_tool_id
        assert isinstance(disabled_error, OSError)
        assert str(disabled_error) == "Disk full"

        # Verify response
        assert isinstance(result, ToolMessage)
        assert result.content == "Tool execution failed: OSError: Disk full"
        assert result.tool_call_id == "disk-call-def"
        assert result.name == "disk_tool"
        assert result.status == "error"

    @patch("nexus.agent_orchestrator.tool_manager.execution_failure_handler.logger")
    async def test_tool_wrapper_none_tool_id_in_metadata(self, mock_logger: Mock) -> None:
        """Test tool wrapper when tool_id is explicitly None in metadata."""
        # Create BaseTool with None tool_id
        tool = Mock(spec=BaseTool)
        tool.name = "attr_tool"
        tool.metadata = {"tool_id": None}  # Explicitly None

        result = await _execute_async_wrapper(
            tool_name="attr_tool",
            tool_call_id="attr-call-ghi",
            exception=AttributeError("Missing attribute"),
            tool=tool,
        )

        # Verify logging
        assert mock_logger.exception.call_count == 1
        assert mock_logger.error.call_count == 1
        mock_logger.exception.assert_called_once_with(
            "Tool execution failed during wrapped call: tool_name=%s",
            "attr_tool",
        )
        mock_logger.error.assert_called_once_with(
            "BaseTool metadata missing tool_id - this indicates a bug in tool synchronization: tool_name=%s",
            "attr_tool",
        )

        # Verify response
        assert isinstance(result, ToolMessage)
        assert result.content == "Tool execution failed: AttributeError: Missing attribute"
        assert result.tool_call_id == "attr-call-ghi"
        assert result.name == "attr_tool"
        assert result.status == "error"
