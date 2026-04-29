"""Unit tests for TelemetryCollector.capture_workflow_error."""

from unittest.mock import MagicMock
from uuid import uuid4

from nexus.telemetry.collector import TelemetryCollector

VALID_EXECUTION_ID = "550e8400-e29b-41d4-a716-446655440000"


def _make_collector(mock_registry: MagicMock) -> TelemetryCollector:
    return TelemetryCollector(registry=mock_registry)


class TestCaptureWorkflowError:
    """Tests for TelemetryCollector.capture_workflow_error."""

    def test_emits_activity_timeout_event(self):
        mock_registry = MagicMock()
        mock_registry.entitlement_id = "ent-123"
        collector = _make_collector(mock_registry)

        collector.capture_workflow_error(
            workflow_execution_id=VALID_EXECUTION_ID,
            timed_out_component="activity",
            configured_timeout_seconds=30.0,
            elapsed_time_ms=30500,
            activity_id="script-1",
        )

        mock_registry.send_event.assert_called_once()
        event = mock_registry.send_event.call_args[0][0]
        assert event.workflow_execution_id == VALID_EXECUTION_ID
        assert event.timed_out_component == "activity"
        assert event.configured_timeout_seconds == 30.0
        assert event.elapsed_time_ms == 30500
        assert event.activity_id == "script-1"
        assert event.entitlement_id == "ent-123"
        assert event.retry_count == 0

    def test_emits_workflow_timeout_event(self):
        mock_registry = MagicMock()
        mock_registry.entitlement_id = "ent-456"
        collector = _make_collector(mock_registry)

        collector.capture_workflow_error(
            workflow_execution_id=VALID_EXECUTION_ID,
            timed_out_component="workflow",
            configured_timeout_seconds=3600.0,
            elapsed_time_ms=3600000,
        )

        mock_registry.send_event.assert_called_once()
        event = mock_registry.send_event.call_args[0][0]
        assert event.timed_out_component == "workflow"
        assert event.activity_id is None
        assert event.configured_timeout_seconds == 3600.0

    def test_includes_request_id(self):
        mock_registry = MagicMock()
        mock_registry.entitlement_id = "ent-123"
        collector = _make_collector(mock_registry)
        request_id = uuid4()

        collector.capture_workflow_error(
            workflow_execution_id=VALID_EXECUTION_ID,
            timed_out_component="activity",
            configured_timeout_seconds=30.0,
            elapsed_time_ms=30000,
            request_id=request_id,
        )

        event = mock_registry.send_event.call_args[0][0]
        assert event.request_id == request_id

    def test_segment_event_name(self):
        mock_registry = MagicMock()
        mock_registry.entitlement_id = "ent-123"
        collector = _make_collector(mock_registry)

        collector.capture_workflow_error(
            workflow_execution_id=VALID_EXECUTION_ID,
            timed_out_component="activity",
            configured_timeout_seconds=30.0,
            elapsed_time_ms=30000,
        )

        event = mock_registry.send_event.call_args[0][0]
        segment = event.to_segment_event()
        assert segment["event"] == "workflow_error"

    def test_emits_retry_count(self):
        mock_registry = MagicMock()
        mock_registry.entitlement_id = "ent-123"
        collector = _make_collector(mock_registry)

        collector.capture_workflow_error(
            workflow_execution_id=VALID_EXECUTION_ID,
            timed_out_component="activity",
            configured_timeout_seconds=30.0,
            elapsed_time_ms=90500,
            activity_id="http-request-1",
            retry_count=2,
        )

        mock_registry.send_event.assert_called_once()
        event = mock_registry.send_event.call_args[0][0]
        assert event.retry_count == 2
        props = event.to_segment_event()["properties"]
        assert props["retry_count"] == 2

    def test_emits_retry_event(self):
        mock_registry = MagicMock()
        mock_registry.entitlement_id = "ent-123"
        collector = _make_collector(mock_registry)

        collector.capture_workflow_error(
            workflow_execution_id=VALID_EXECUTION_ID,
            timed_out_component="activity",
            configured_timeout_seconds=30.0,
            elapsed_time_ms=0,
            activity_id="script-1",
            retry_count=1,
            error_type="ConnectionError",
            retry_reason="Connection refused",
        )

        mock_registry.send_event.assert_called_once()
        event = mock_registry.send_event.call_args[0][0]
        assert event.error_type == "ConnectionError"
        assert event.retry_reason == "Connection refused"
        assert event.retry_count == 1
        props = event.to_segment_event()["properties"]
        assert props["error_type"] == "ConnectionError"
        assert props["retry_reason"] == "Connection refused"

    def test_optional_params_default_to_none(self):
        mock_registry = MagicMock()
        mock_registry.entitlement_id = "ent-123"
        collector = _make_collector(mock_registry)

        collector.capture_workflow_error(
            workflow_execution_id=VALID_EXECUTION_ID,
            timed_out_component="workflow",
            configured_timeout_seconds=60.0,
            elapsed_time_ms=60000,
        )

        mock_registry.send_event.assert_called_once()
        event = mock_registry.send_event.call_args[0][0]
        assert event.activity_id is None
        assert event.request_id is None

    def test_fire_and_forget_on_error(self):
        mock_registry = MagicMock()
        mock_registry.entitlement_id = "ent-123"
        mock_registry.send_event.side_effect = RuntimeError("Segment down")
        collector = _make_collector(mock_registry)

        # Should not raise
        collector.capture_workflow_error(
            workflow_execution_id=VALID_EXECUTION_ID,
            timed_out_component="activity",
            configured_timeout_seconds=30.0,
            elapsed_time_ms=30000,
        )
