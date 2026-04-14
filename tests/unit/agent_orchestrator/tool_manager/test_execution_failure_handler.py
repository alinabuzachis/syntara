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
    _emit_tool_telemetry_event,
    _resolve_execution_status,
    create_tool_awrapper,
    create_tool_wrapper,
)
from nexus.core.utils.retry import is_retryable_error
from nexus.tool_manager.models.tool_execution import ExecutionStatus


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

    def _run(self, *args: Any, **kwargs: Any) -> str:  # noqa: ANN401
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
            "Tool execution failed during wrapped call",
            tool_name="sync_tool",
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
            "Tool execution failed during wrapped call",
            tool_name="loop_tool",
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
            "Tool execution failed during wrapped call",
            tool_name="test_tool",
        )
        mock_logger.error.assert_called_once_with(
            "BaseTool missing metadata - this indicates a bug in tool synchronization", tool_name="test_tool"
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
            "Tool execution failed during wrapped call",
            tool_name="network_tool",
        )
        mock_logger.error.assert_called_once_with(
            "BaseTool missing metadata - this indicates a bug in tool synchronization", tool_name="network_tool"
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
            "Tool execution failed during wrapped call",
            tool_name="config_tool",
        )
        mock_logger.error.assert_called_once_with(
            "BaseTool missing metadata - this indicates a bug in tool synchronization", tool_name="config_tool"
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
            "Tool execution failed during wrapped call",
            tool_name="timeout_tool",
        )
        mock_logger.error.assert_called_once_with(
            "BaseTool metadata missing tool_id - this indicates a bug in tool synchronization",
            tool_name="timeout_tool",
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
            "Tool execution failed during wrapped call",
            tool_name="key_tool",
        )
        mock_logger.exception.assert_any_call(
            "Invalid tool_id format in metadata - this indicates a bug in tool synchronization",
            tool_id_value="invalid-uuid-format",
            tool_name="key_tool",
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
            "Tool execution failed during wrapped call",
            tool_name="disk_tool",
        )
        mock_logger.debug.assert_any_call("Extracted tool_id from metadata", tool_id=valid_tool_id)

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
            "Tool execution failed during wrapped call",
            tool_name="attr_tool",
        )
        mock_logger.error.assert_called_once_with(
            "BaseTool metadata missing tool_id - this indicates a bug in tool synchronization",
            tool_name="attr_tool",
        )

        # Verify response
        assert isinstance(result, ToolMessage)
        assert result.content == "Tool execution failed: AttributeError: Missing attribute"
        assert result.tool_call_id == "attr-call-ghi"
        assert result.name == "attr_tool"
        assert result.status == "error"


class TestResolveExecutionStatus:
    """Test _resolve_execution_status maps exceptions to correct ExecutionStatus."""

    def test_none_maps_to_success(self) -> None:
        assert _resolve_execution_status(None) == ExecutionStatus.SUCCESS

    def test_timeout_error_maps_to_timeout(self) -> None:
        assert _resolve_execution_status(TimeoutError("timed out")) == ExecutionStatus.TIMEOUT

    def test_asyncio_timeout_error_maps_to_timeout(self) -> None:
        assert _resolve_execution_status(TimeoutError()) == ExecutionStatus.TIMEOUT

    def test_value_error_maps_to_error(self) -> None:
        assert _resolve_execution_status(ValueError("bad value")) == ExecutionStatus.ERROR

    def test_runtime_error_maps_to_error(self) -> None:
        assert _resolve_execution_status(RuntimeError("runtime")) == ExecutionStatus.ERROR

    def test_connection_error_maps_to_error(self) -> None:
        assert _resolve_execution_status(ConnectionError("conn")) == ExecutionStatus.ERROR


class TestMetricsEmissionAndDbPersistence:
    """Test that tool wrappers emit metrics with correct status and persist to DB."""

    @patch("nexus.agent_orchestrator.tool_manager.execution_failure_handler._persist_tool_execution_to_db")
    @patch("nexus.agent_orchestrator.tool_manager.execution_failure_handler._emit_tool_metrics")
    async def test_async_wrapper_success_emits_success_status(self, mock_emit: Mock, mock_persist: AsyncMock) -> None:
        """Test that successful async execution emits SUCCESS status and persists to DB."""
        tool = Mock(spec=BaseTool)
        tool.name = "my_tool"
        tool.metadata = {"tool_id": str(uuid4()), "namespaced_name": "provider::my_tool"}

        await _execute_async_wrapper(
            tool_name="my_tool",
            tool_call_id="call-1",
            exception=None,
            tool=tool,
            success_content="OK",
        )

        mock_emit.assert_called_once()
        _, _, emit_status = mock_emit.call_args[0]
        assert emit_status == ExecutionStatus.SUCCESS

        mock_persist.assert_awaited_once()
        persist_args = mock_persist.call_args
        assert persist_args[0][0] is tool
        assert persist_args[0][2] == ExecutionStatus.SUCCESS
        assert persist_args[1]["error_message"] is None

    @patch("nexus.agent_orchestrator.tool_manager.execution_failure_handler._persist_tool_execution_to_db")
    @patch("nexus.agent_orchestrator.tool_manager.execution_failure_handler._emit_tool_metrics")
    async def test_async_wrapper_timeout_emits_timeout_status(self, mock_emit: Mock, mock_persist: AsyncMock) -> None:
        """Test that TimeoutError emits TIMEOUT status and persists with error message."""
        tool = Mock(spec=BaseTool)
        tool.name = "slow_tool"
        tool.metadata = {"tool_id": str(uuid4()), "namespaced_name": "provider::slow_tool"}

        await _execute_async_wrapper(
            tool_name="slow_tool",
            tool_call_id="call-2",
            exception=TimeoutError("Request timed out"),
            tool=tool,
        )

        mock_emit.assert_called_once()
        _, _, emit_status = mock_emit.call_args[0]
        assert emit_status == ExecutionStatus.TIMEOUT

        mock_persist.assert_awaited_once()
        persist_args = mock_persist.call_args
        assert persist_args[0][0] is tool
        assert persist_args[0][2] == ExecutionStatus.TIMEOUT
        assert persist_args[1]["error_message"] == "Request timed out"

    @patch("nexus.agent_orchestrator.tool_manager.execution_failure_handler._persist_tool_execution_to_db")
    @patch("nexus.agent_orchestrator.tool_manager.execution_failure_handler._emit_tool_metrics")
    async def test_async_wrapper_error_emits_error_status(self, mock_emit: Mock, mock_persist: AsyncMock) -> None:
        """Test that a generic exception emits ERROR status."""
        tool = Mock(spec=BaseTool)
        tool.name = "bad_tool"
        tool.metadata = {"tool_id": str(uuid4()), "namespaced_name": "provider::bad_tool"}

        await _execute_async_wrapper(
            tool_name="bad_tool",
            tool_call_id="call-3",
            exception=ValueError("bad input"),
            tool=tool,
        )

        mock_emit.assert_called_once()
        _, _, emit_status = mock_emit.call_args[0]
        assert emit_status == ExecutionStatus.ERROR

        mock_persist.assert_awaited_once()
        assert mock_persist.call_args[0][2] == ExecutionStatus.ERROR

    @pytest.mark.usefixtures("fast_retry_settings")
    @patch("nexus.agent_orchestrator.tool_manager.execution_failure_handler._run_coroutine_from_sync")
    @patch("nexus.agent_orchestrator.tool_manager.execution_failure_handler._emit_tool_metrics")
    def test_sync_wrapper_timeout_emits_timeout_status(self, mock_emit: Mock, mock_run_coro: Mock) -> None:
        """Test that sync wrapper maps TimeoutError to TIMEOUT status."""
        tool = Mock(spec=BaseTool)
        tool.name = "sync_slow"
        tool.metadata = {"tool_id": str(uuid4()), "namespaced_name": "provider::sync_slow"}

        _execute_sync_wrapper(
            tool_name="sync_slow",
            tool_call_id="call-5",
            exception=TimeoutError("sync timeout"),
            tool=tool,
        )

        mock_emit.assert_called_once()
        _, _, emit_status = mock_emit.call_args[0]
        assert emit_status == ExecutionStatus.TIMEOUT

        # _run_coroutine_from_sync is called twice: once for tool disable, once for DB persistence
        assert mock_run_coro.call_count == 2
        persist_call = mock_run_coro.call_args_list[-1]
        assert persist_call[0][2] == "tool execution DB persistence"


class TestEmitToolTelemetryEvent:
    """Test _emit_tool_telemetry_event Segment emission."""

    def test_telemetry_emitted_when_registry_initialized(self) -> None:
        """Test that telemetry event is emitted when registry is initialized."""
        mock_registry = Mock()
        mock_registry.is_initialized.return_value = True
        mock_collector = Mock()

        with (
            patch(
                "nexus.telemetry.client.get_telemetry_registry",
                return_value=mock_registry,
            ),
            patch(
                "nexus.telemetry.collector.TelemetryCollector",
                return_value=mock_collector,
            ) as mock_collector_cls,
        ):
            exec_id = uuid4()
            _emit_tool_telemetry_event(
                namespaced_name="provider::my_tool",
                status=ExecutionStatus.SUCCESS,
                duration_ms=150.0,
                execution_id=exec_id,
            )

            mock_collector_cls.assert_called_once_with(registry=mock_registry)
            mock_collector.capture_tool_executed.assert_called_once_with(
                namespaced_name="provider::my_tool",
                status=ExecutionStatus.SUCCESS,
                duration_ms=150,
                execution_id=exec_id,
            )

    @patch("nexus.agent_orchestrator.tool_manager.execution_failure_handler.logger")
    def test_telemetry_skipped_when_registry_not_initialized(self, mock_logger: Mock) -> None:
        """Test that telemetry is skipped with debug log when registry is not initialized."""
        mock_registry = Mock()
        mock_registry.is_initialized.return_value = False

        with patch(
            "nexus.telemetry.client.get_telemetry_registry",
            return_value=mock_registry,
        ):
            _emit_tool_telemetry_event(
                namespaced_name="provider::my_tool",
                status=ExecutionStatus.SUCCESS,
                duration_ms=100.0,
            )

            mock_logger.debug.assert_any_call("Telemetry not initialized, skipping tool_execution_telemetry event")

    @patch("nexus.agent_orchestrator.tool_manager.execution_failure_handler.logger")
    def test_telemetry_exception_caught_and_logged(self, mock_logger: Mock) -> None:
        """Test that exceptions during telemetry emission are caught and logged as warning."""
        with patch(
            "nexus.telemetry.client.get_telemetry_registry",
            side_effect=RuntimeError("telemetry broken"),
        ):
            _emit_tool_telemetry_event(
                namespaced_name="provider::my_tool",
                status=ExecutionStatus.ERROR,
                duration_ms=200.0,
            )

            mock_logger.warning.assert_any_call("Failed to emit tool telemetry event", exc_info=True)
