"""Unit tests for TelemetryCollector service."""

from unittest.mock import MagicMock, patch

from nexus.telemetry.collector import TelemetryCollector
from nexus.telemetry.events.activity_execution import ActivityExecutionEvent
from nexus.telemetry.events.workflow_execution import (
    WorkflowExecutionCompletedEvent,
    WorkflowExecutionStartEvent,
)
from nexus.workflows.workflow_engine.models.workflow_definition import (
    ActivityTerminalStatus,
    ActivityType,
    WorkflowTerminalStatus,
)

# Import shared test data from conftest
from tests.unit.telemetry.conftest import (
    SAMPLE_ACTIVITY_DEF,
    VALID_WORKFLOW_EXECUTION_ID,
)


class TestTelemetryCollector:
    """Tests for TelemetryCollector."""

    def _create_collector(self, entitlement_id: str = "") -> tuple[TelemetryCollector, MagicMock]:
        """Create a collector with a mocked registry."""
        mock_registry = MagicMock()
        mock_registry.is_initialized.return_value = True
        mock_registry.entitlement_id = entitlement_id
        collector = TelemetryCollector(
            registry=mock_registry,
        )
        return collector, mock_registry

    def test_capture_workflow_start(self):
        collector, mock_registry = self._create_collector()
        collector.capture_workflow_start(
            workflow_execution_id=VALID_WORKFLOW_EXECUTION_ID,
        )
        mock_registry.send_event.assert_called_once()
        sent_event = mock_registry.send_event.call_args[0][0]
        assert isinstance(sent_event, WorkflowExecutionStartEvent)
        assert sent_event.workflow_execution_id == VALID_WORKFLOW_EXECUTION_ID

    def test_capture_workflow_completed_success(self):
        collector, mock_registry = self._create_collector()
        collector.capture_workflow_completed(
            workflow_execution_id=VALID_WORKFLOW_EXECUTION_ID,
            status=WorkflowTerminalStatus.COMPLETED,
            duration_ms=12500,
            activity_count=8,
            error_count=0,
        )
        mock_registry.send_event.assert_called_once()
        sent_event = mock_registry.send_event.call_args[0][0]
        assert isinstance(sent_event, WorkflowExecutionCompletedEvent)
        assert sent_event.status == "completed"
        assert sent_event.duration_ms == 12500
        assert sent_event.activity_count == 8
        assert sent_event.error_count == 0

    def test_capture_workflow_completed_failed(self):
        collector, mock_registry = self._create_collector()
        collector.capture_workflow_completed(
            workflow_execution_id=VALID_WORKFLOW_EXECUTION_ID,
            status=WorkflowTerminalStatus.FAILED,
            duration_ms=5000,
            activity_count=3,
            error_count=1,
            error_type="ActivityExecutionError",
        )
        mock_registry.send_event.assert_called_once()
        sent_event = mock_registry.send_event.call_args[0][0]
        assert sent_event.status == "failed"
        assert sent_event.error_type == "ActivityExecutionError"

    def test_capture_activity_executed_success(self):
        collector, mock_registry = self._create_collector()
        collector.capture_activity_executed(
            workflow_execution_id=VALID_WORKFLOW_EXECUTION_ID,
            activity_type=ActivityType.TASK,
            activity_def=SAMPLE_ACTIVITY_DEF,
            status=ActivityTerminalStatus.COMPLETED,
            action_type="api_call",
        )
        mock_registry.send_event.assert_called_once()
        sent_event = mock_registry.send_event.call_args[0][0]
        assert isinstance(sent_event, ActivityExecutionEvent)
        assert sent_event.activity_type == "task"
        assert sent_event.action_type == "api_call"

    def test_capture_activity_executed_failed(self):
        collector, mock_registry = self._create_collector()
        collector.capture_activity_executed(
            workflow_execution_id=VALID_WORKFLOW_EXECUTION_ID,
            activity_type=ActivityType.TASK,
            activity_def=SAMPLE_ACTIVITY_DEF,
            status=ActivityTerminalStatus.FAILED,
            error_type="ActivityExecutionError",
        )
        mock_registry.send_event.assert_called_once()
        sent_event = mock_registry.send_event.call_args[0][0]
        assert sent_event.status == "failed"
        assert sent_event.error_type == "ActivityExecutionError"

    @patch("nexus.telemetry.collector.logger")
    def test_capture_workflow_start_fire_and_forget(self, mock_logger):
        """Verify fire-and-forget: errors are logged but not raised."""
        mock_registry = MagicMock()
        mock_registry.entitlement_id = ""
        mock_registry.send_event.side_effect = RuntimeError("Send failed")
        collector = TelemetryCollector(
            registry=mock_registry,
        )
        # Should not raise
        collector.capture_workflow_start(
            workflow_execution_id=VALID_WORKFLOW_EXECUTION_ID,
        )
        mock_logger.exception.assert_called_once()

    @patch("nexus.telemetry.collector.logger")
    def test_capture_workflow_completed_fire_and_forget(self, mock_logger):
        """Verify fire-and-forget: errors are logged but not raised."""
        mock_registry = MagicMock()
        mock_registry.entitlement_id = ""
        mock_registry.send_event.side_effect = RuntimeError("Send failed")
        collector = TelemetryCollector(
            registry=mock_registry,
        )
        collector.capture_workflow_completed(
            workflow_execution_id=VALID_WORKFLOW_EXECUTION_ID,
            status=WorkflowTerminalStatus.COMPLETED,
            duration_ms=100,
            activity_count=0,
            error_count=0,
        )
        mock_logger.exception.assert_called_once()

    @patch("nexus.telemetry.collector.logger")
    def test_capture_activity_fire_and_forget(self, mock_logger):
        """Verify fire-and-forget: errors are logged but not raised."""
        mock_registry = MagicMock()
        mock_registry.entitlement_id = ""
        mock_registry.send_event.side_effect = RuntimeError("Send failed")
        collector = TelemetryCollector(
            registry=mock_registry,
        )
        collector.capture_activity_executed(
            workflow_execution_id=VALID_WORKFLOW_EXECUTION_ID,
            activity_type=ActivityType.TASK,
            activity_def=SAMPLE_ACTIVITY_DEF,
            status=ActivityTerminalStatus.COMPLETED,
        )
        mock_logger.exception.assert_called_once()

    def test_workflow_start_event_includes_entitlement_id(self):
        """entitlement_id from registry must appear on the start event."""
        collector, mock_registry = self._create_collector(entitlement_id="ent-abc")
        collector.capture_workflow_start(
            workflow_execution_id=VALID_WORKFLOW_EXECUTION_ID,
        )
        sent_event = mock_registry.send_event.call_args[0][0]
        assert sent_event.entitlement_id == "ent-abc"

    def test_workflow_completed_event_includes_entitlement_id(self):
        """entitlement_id from registry must appear on the completed event."""
        collector, mock_registry = self._create_collector(entitlement_id="ent-abc")
        collector.capture_workflow_completed(
            workflow_execution_id=VALID_WORKFLOW_EXECUTION_ID,
            status=WorkflowTerminalStatus.COMPLETED,
            duration_ms=100,
            activity_count=1,
            error_count=0,
        )
        sent_event = mock_registry.send_event.call_args[0][0]
        assert sent_event.entitlement_id == "ent-abc"

    def test_activity_event_includes_entitlement_id(self):
        """entitlement_id from registry must appear on the activity event."""
        collector, mock_registry = self._create_collector(entitlement_id="ent-abc")
        collector.capture_activity_executed(
            workflow_execution_id=VALID_WORKFLOW_EXECUTION_ID,
            activity_type=ActivityType.TASK,
            activity_def=SAMPLE_ACTIVITY_DEF,
            status=ActivityTerminalStatus.COMPLETED,
        )
        sent_event = mock_registry.send_event.call_args[0][0]
        assert sent_event.entitlement_id == "ent-abc"
