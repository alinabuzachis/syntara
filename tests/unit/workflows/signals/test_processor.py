"""Unit tests for WorkflowSignalProcessor."""

from datetime import UTC, datetime
from typing import Any

import pytest

from nexus.workflows.workflow_engine.activities.common import ActivityExecutionError
from nexus.workflows.workflow_engine.signals.processor import WorkflowSignalProcessor


class TestWorkflowSignalProcessorProcessSignal:
    """Tests for WorkflowSignalProcessor.process_signal."""

    def test_process_signal_success_returns_signal_data(self) -> None:
        """Test that successful signal returns the signal data unchanged."""
        # Arrange
        signal_data = {
            "id": "invocation-123",
            "status": "completed",
            "result": {
                "content": "Analysis complete: The system is healthy",
                "response_metadata": {"model": "claude-3-5-sonnet-20241022"},
            },
            "timestamp": datetime.now(UTC).isoformat(),
        }
        activity_id = "analyze_system"
        execution_id = "exec-456"

        # Act
        result = WorkflowSignalProcessor.process_signal(signal_data, activity_id, execution_id)

        # Assert
        assert result == signal_data
        assert result["status"] == "completed"
        assert "result" in result

    def test_process_signal_success_with_nested_data(self) -> None:
        """Test processing success signal with nested result data."""
        # Arrange
        signal_data = {
            "id": "invocation-789",
            "status": "completed",
            "result": {
                "content": {
                    "answer": "42",
                    "explanation": "The answer to life, the universe, and everything",
                },
                "response_metadata": {
                    "source": "streaming",
                    "model": "gpt-4",
                },
            },
        }

        # Act
        result = WorkflowSignalProcessor.process_signal(signal_data, "task_1", "exec_1")

        # Assert
        assert result == signal_data
        assert result["result"]["content"]["answer"] == "42"

    def test_process_signal_failure_raises_activity_execution_error(self) -> None:
        """Test that failed signal raises ActivityExecutionError."""
        # Arrange
        signal_data = {
            "id": "invocation-error",
            "status": "failed",
            "error": {
                "message": "API key is invalid",
                "error_type": "AuthenticationError",
            },
            "timestamp": datetime.now(UTC).isoformat(),
        }

        # Act & Assert
        with pytest.raises(ActivityExecutionError) as exc_info:
            WorkflowSignalProcessor.process_signal(signal_data, "api_call", "exec-123")

        assert "AuthenticationError" in str(exc_info.value)
        assert "API key is invalid" in str(exc_info.value)

    def test_process_signal_failure_with_minimal_error_info(self) -> None:
        """Test that failed signal with minimal error info uses defaults."""
        # Arrange
        signal_data = {
            "id": "invocation-minimal",
            "status": "failed",
            "error": {},  # Empty error dict
        }

        # Act & Assert
        with pytest.raises(ActivityExecutionError) as exc_info:
            WorkflowSignalProcessor.process_signal(signal_data, "task_minimal", "exec-minimal")

        # Should use default message and type
        assert "UnknownError" in str(exc_info.value)
        assert "Agent execution failed" in str(exc_info.value)

    def test_process_signal_failure_without_error_dict(self) -> None:
        """Test that failed signal without error dict uses defaults."""
        # Arrange
        signal_data = {
            "id": "invocation-no-error",
            "status": "failed",
            # No 'error' key at all
        }

        # Act & Assert
        with pytest.raises(ActivityExecutionError) as exc_info:
            WorkflowSignalProcessor.process_signal(signal_data, "task_no_error", "exec-no-error")

        assert "UnknownError" in str(exc_info.value)
        assert "Agent execution failed" in str(exc_info.value)

    def test_process_signal_failure_preserves_error_type(self) -> None:
        """Test that error type is preserved in the raised exception."""
        # Arrange
        error_types = ["ValueError", "TimeoutError", "LLMConfigurationError", "NetworkError"]

        for error_type in error_types:
            signal_data = {
                "status": "failed",
                "error": {
                    "message": f"Test {error_type} occurred",
                    "error_type": error_type,
                },
            }

            # Act & Assert
            with pytest.raises(ActivityExecutionError) as exc_info:
                WorkflowSignalProcessor.process_signal(signal_data, "test_activity", "test_exec")

            assert error_type in str(exc_info.value)
            assert f"Test {error_type} occurred" in str(exc_info.value)

    def test_process_signal_with_unknown_status(self) -> None:
        """Test processing signal with unknown status (not 'failed')."""
        # Arrange - any status other than "failed" should be treated as success
        signal_data = {
            "id": "invocation-pending",
            "status": "pending",
            "result": {"content": "Processing..."},
        }

        # Act
        result = WorkflowSignalProcessor.process_signal(signal_data, "activity_1", "exec_1")

        # Assert - should return signal data unchanged (not raise)
        assert result == signal_data

    def test_process_signal_with_none_status(self) -> None:
        """Test processing signal with None status."""
        # Arrange
        signal_data = {
            "id": "invocation-no-status",
            "status": None,
            "result": {"content": "Done"},
        }

        # Act
        result = WorkflowSignalProcessor.process_signal(signal_data, "activity_1", "exec_1")

        # Assert - should return signal data (not raise)
        assert result == signal_data

    def test_process_signal_preserves_original_structure(self) -> None:
        """Test that process_signal preserves the original signal structure."""
        # Arrange
        signal_data = {
            "id": "inv-123",
            "status": "completed",
            "result": {
                "content": "Test result",
                "response_metadata": {
                    "model": "test-model",
                    "tokens": 150,
                },
            },
            "timestamp": "2024-01-13T12:00:00Z",
            "agent_type": "GenericAgent",
            "custom_field": "custom_value",
        }

        # Act
        result = WorkflowSignalProcessor.process_signal(signal_data, "test_activity", "test_exec")

        # Assert - all fields preserved
        assert result == signal_data
        assert result["custom_field"] == "custom_value"
        assert result["timestamp"] == "2024-01-13T12:00:00Z"

    def test_process_signal_failure_with_complex_error_message(self) -> None:
        """Test that complex error messages are preserved correctly."""
        # Arrange
        complex_message = """
        Multiple errors occurred:
        1. Connection timeout after 30s
        2. Retry limit exceeded (5 attempts)
        3. Fallback mechanism failed
        """
        signal_data = {
            "status": "failed",
            "error": {
                "message": complex_message,
                "error_type": "CompositeError",
            },
        }

        # Act & Assert
        with pytest.raises(ActivityExecutionError) as exc_info:
            WorkflowSignalProcessor.process_signal(signal_data, "complex_task", "exec_complex")

        error_message = str(exc_info.value)
        assert "CompositeError" in error_message
        assert "Connection timeout" in error_message
        assert "Retry limit exceeded" in error_message

    def test_process_signal_with_empty_signal_data(self) -> None:
        """Test processing completely empty signal data."""
        # Arrange
        signal_data: dict[str, Any] = {}

        # Act
        result = WorkflowSignalProcessor.process_signal(signal_data, "empty_activity", "empty_exec")

        # Assert - should return empty dict (status is None/missing, treated as success)
        assert result == {}
