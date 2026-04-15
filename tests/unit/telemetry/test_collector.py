"""Unit tests for TelemetryCollector service."""

from unittest.mock import MagicMock, patch
from uuid import UUID

from nexus.telemetry.collector import TelemetryCollector
from nexus.telemetry.events.node_execution import NodeExecutionEvent
from nexus.telemetry.events.tool_execution import ToolExecutionEvent
from nexus.telemetry.events.workflow_execution import (
    WorkflowExecutionCompletedEvent,
    WorkflowExecutionStartEvent,
)
from nexus.tool_manager.models.tool_execution import ToolExecutionStatus
from nexus.workflows.workflow_engine.models.workflow_definition import (
    ActivityTerminalStatus,
    NodeType,
    WorkflowTerminalStatus,
)

# Import shared test data from conftest
from tests.unit.telemetry.conftest import (
    SAMPLE_NODE_DEF,
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
            execution_id=VALID_WORKFLOW_EXECUTION_ID,
        )
        mock_registry.send_event.assert_called_once()
        sent_event = mock_registry.send_event.call_args[0][0]
        assert isinstance(sent_event, WorkflowExecutionStartEvent)
        assert sent_event.workflow_execution_id == VALID_WORKFLOW_EXECUTION_ID

    def test_capture_workflow_completed_success(self):
        collector, mock_registry = self._create_collector()
        collector.capture_workflow_completed(
            execution_id=VALID_WORKFLOW_EXECUTION_ID,
            status=WorkflowTerminalStatus.COMPLETED,
            duration_ms=12500,
            node_count=8,
            error_count=0,
        )
        mock_registry.send_event.assert_called_once()
        sent_event = mock_registry.send_event.call_args[0][0]
        assert isinstance(sent_event, WorkflowExecutionCompletedEvent)
        assert sent_event.status == "completed"
        assert sent_event.duration_ms == 12500
        assert sent_event.node_count == 8
        assert sent_event.error_count == 0

    def test_capture_workflow_completed_failed(self):
        collector, mock_registry = self._create_collector()
        collector.capture_workflow_completed(
            execution_id=VALID_WORKFLOW_EXECUTION_ID,
            status=WorkflowTerminalStatus.FAILED,
            duration_ms=5000,
            node_count=3,
            error_count=1,
            error_type="ActivityExecutionError",
        )
        mock_registry.send_event.assert_called_once()
        sent_event = mock_registry.send_event.call_args[0][0]
        assert sent_event.status == "failed"
        assert sent_event.error_type == "ActivityExecutionError"

    def test_capture_node_executed_success(self):
        collector, mock_registry = self._create_collector()
        collector.capture_node_executed(
            execution_id=VALID_WORKFLOW_EXECUTION_ID,
            node_type=NodeType.SCRIPT,
            node_def=SAMPLE_NODE_DEF,
            status=ActivityTerminalStatus.COMPLETED,
        )
        mock_registry.send_event.assert_called_once()
        sent_event = mock_registry.send_event.call_args[0][0]
        assert isinstance(sent_event, NodeExecutionEvent)
        assert sent_event.node_type == "script"

    def test_capture_node_executed_failed(self):
        collector, mock_registry = self._create_collector()
        collector.capture_node_executed(
            execution_id=VALID_WORKFLOW_EXECUTION_ID,
            node_type=NodeType.SCRIPT,
            node_def=SAMPLE_NODE_DEF,
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
            execution_id=VALID_WORKFLOW_EXECUTION_ID,
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
            execution_id=VALID_WORKFLOW_EXECUTION_ID,
            status=WorkflowTerminalStatus.COMPLETED,
            duration_ms=100,
            node_count=0,
            error_count=0,
        )
        mock_logger.exception.assert_called_once()

    @patch("nexus.telemetry.collector.logger")
    def test_capture_node_fire_and_forget(self, mock_logger):
        """Verify fire-and-forget: errors are logged but not raised."""
        mock_registry = MagicMock()
        mock_registry.entitlement_id = ""
        mock_registry.send_event.side_effect = RuntimeError("Send failed")
        collector = TelemetryCollector(
            registry=mock_registry,
        )
        collector.capture_node_executed(
            execution_id=VALID_WORKFLOW_EXECUTION_ID,
            node_type=NodeType.SCRIPT,
            node_def=SAMPLE_NODE_DEF,
            status=ActivityTerminalStatus.COMPLETED,
        )
        mock_logger.exception.assert_called_once()

    def test_workflow_start_event_includes_entitlement_id(self):
        """entitlement_id from registry must appear on the start event."""
        collector, mock_registry = self._create_collector(entitlement_id="ent-abc")
        collector.capture_workflow_start(
            execution_id=VALID_WORKFLOW_EXECUTION_ID,
        )
        sent_event = mock_registry.send_event.call_args[0][0]
        assert sent_event.entitlement_id == "ent-abc"

    def test_workflow_completed_event_includes_entitlement_id(self):
        """entitlement_id from registry must appear on the completed event."""
        collector, mock_registry = self._create_collector(entitlement_id="ent-abc")
        collector.capture_workflow_completed(
            execution_id=VALID_WORKFLOW_EXECUTION_ID,
            status=WorkflowTerminalStatus.COMPLETED,
            duration_ms=100,
            node_count=1,
            error_count=0,
        )
        sent_event = mock_registry.send_event.call_args[0][0]
        assert sent_event.entitlement_id == "ent-abc"

    def test_node_event_includes_entitlement_id(self):
        """entitlement_id from registry must appear on the node event."""
        collector, mock_registry = self._create_collector(entitlement_id="ent-abc")
        collector.capture_node_executed(
            execution_id=VALID_WORKFLOW_EXECUTION_ID,
            node_type=NodeType.SCRIPT,
            node_def=SAMPLE_NODE_DEF,
            status=ActivityTerminalStatus.COMPLETED,
        )
        sent_event = mock_registry.send_event.call_args[0][0]
        assert sent_event.entitlement_id == "ent-abc"


class TestCaptureToolExecuted:
    """Tests for TelemetryCollector.capture_tool_executed."""

    def _create_collector(self, entitlement_id: str = "ent-test") -> tuple[TelemetryCollector, MagicMock]:
        mock_registry = MagicMock()
        mock_registry.entitlement_id = entitlement_id
        return TelemetryCollector(registry=mock_registry), mock_registry

    def test_builds_and_sends_event_with_workflow_id(self):
        collector, mock_registry = self._create_collector()
        wf_id = UUID("550e8400-e29b-41d4-a716-446655440000")
        collector.capture_tool_executed(
            namespaced_name="mcp::get_greeting",
            status=ToolExecutionStatus.SUCCESS,
            duration_ms=142,
            execution_id=wf_id,
        )
        mock_registry.send_event.assert_called_once()
        event = mock_registry.send_event.call_args[0][0]
        assert isinstance(event, ToolExecutionEvent)
        assert event.namespaced_name == "mcp::get_greeting"
        assert event.status == ToolExecutionStatus.SUCCESS
        assert event.duration_ms == 142
        assert event.workflow_execution_id == wf_id
        assert event.entitlement_id == "ent-test"

    def test_builds_and_sends_event_without_workflow_id(self):
        collector, mock_registry = self._create_collector()
        collector.capture_tool_executed(
            namespaced_name="mcp::tool",
            status=ToolExecutionStatus.ERROR,
            duration_ms=50,
        )
        mock_registry.send_event.assert_called_once()
        event = mock_registry.send_event.call_args[0][0]
        assert event.workflow_execution_id is None

    @patch("nexus.telemetry.collector.logger")
    def test_fire_and_forget(self, mock_logger):
        mock_registry = MagicMock()
        mock_registry.entitlement_id = ""
        mock_registry.send_event.side_effect = RuntimeError("Send failed")
        collector = TelemetryCollector(registry=mock_registry)
        # Should not raise
        collector.capture_tool_executed(
            namespaced_name="mcp::tool",
            status=ToolExecutionStatus.SUCCESS,
            duration_ms=100,
        )
        mock_logger.exception.assert_called_once()
