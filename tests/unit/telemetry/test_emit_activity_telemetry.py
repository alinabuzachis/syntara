"""Unit tests for TelemetryCollector.emit_activity_telemetry."""

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock
from uuid import uuid4

from nexus.telemetry.collector import TelemetryCollector
from nexus.workflows.models.activity_execution import ActivityExecution, ActivityStatus

EXECUTION_ID = uuid4()
ACTIVITY_DEF = {"id": "task-1", "type": "task", "name": "Test Task"}
ACTIVITY_DEFINITIONS_MAP = {"task-1": ACTIVITY_DEF}


def _make_activity(
    name: str,
    status: ActivityStatus,
    started_at: datetime | None = None,
    completed_at: datetime | None = None,
) -> ActivityExecution:
    return ActivityExecution(
        execution_id=EXECUTION_ID,
        activity_name=name,
        temporal_activity_id=f"temporal-{name}",
        status=status,
        started_at=started_at,
        completed_at=completed_at,
    )


def _make_collector(mock_registry: MagicMock) -> TelemetryCollector:
    """Create a TelemetryCollector with a mocked registry."""
    from nexus.telemetry.collector import TelemetryCollector

    return TelemetryCollector(registry=mock_registry)


class TestEmitActivityTelemetry:
    """Tests for TelemetryCollector.emit_activity_telemetry."""

    def test_emits_for_completed_activity(self):
        mock_registry = MagicMock()
        mock_registry.is_initialized.return_value = True
        mock_registry.entitlement_id = ""
        collector = _make_collector(mock_registry)

        activity = _make_activity("task-1", ActivityStatus.COMPLETED)
        old_values = {"status": ActivityStatus.PENDING}

        collector.emit_activity_telemetry(
            execution_id=EXECUTION_ID,
            activity_definitions_map=ACTIVITY_DEFINITIONS_MAP,
            updated_activities=[(activity, old_values)],
        )

        mock_registry.send_event.assert_called_once()
        event = mock_registry.send_event.call_args[0][0]
        assert event.workflow_execution_id == str(EXECUTION_ID)
        assert event.activity_type == "task"
        assert event.status == "completed"
        assert event.duration_ms is None
        assert event.error_type is None

    def test_computes_duration_from_timestamps(self):
        mock_registry = MagicMock()
        mock_registry.is_initialized.return_value = True
        mock_registry.entitlement_id = ""
        collector = _make_collector(mock_registry)

        start = datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)
        end = start + timedelta(seconds=5, milliseconds=500)
        activity = _make_activity("task-1", ActivityStatus.COMPLETED, started_at=start, completed_at=end)
        old_values = {"status": ActivityStatus.RUNNING}

        collector.emit_activity_telemetry(
            execution_id=EXECUTION_ID,
            activity_definitions_map=ACTIVITY_DEFINITIONS_MAP,
            updated_activities=[(activity, old_values)],
        )

        event = mock_registry.send_event.call_args[0][0]
        assert event.duration_ms == 5500

    def test_emits_for_failed_activity_with_error_type(self):
        mock_registry = MagicMock()
        mock_registry.is_initialized.return_value = True
        mock_registry.entitlement_id = ""
        collector = _make_collector(mock_registry)

        activity = _make_activity("task-1", ActivityStatus.FAILED)
        old_values = {"status": ActivityStatus.RUNNING}

        collector.emit_activity_telemetry(
            execution_id=EXECUTION_ID,
            activity_definitions_map=ACTIVITY_DEFINITIONS_MAP,
            updated_activities=[(activity, old_values)],
        )

        event = mock_registry.send_event.call_args[0][0]
        assert event.status == "failed"
        assert event.error_type == "ActivityExecutionError"

    def test_emits_for_skipped_activity(self):
        mock_registry = MagicMock()
        mock_registry.is_initialized.return_value = True
        mock_registry.entitlement_id = ""
        collector = _make_collector(mock_registry)

        activity = _make_activity("task-1", ActivityStatus.SKIPPED)
        old_values = {"status": ActivityStatus.PENDING}

        collector.emit_activity_telemetry(
            execution_id=EXECUTION_ID,
            activity_definitions_map=ACTIVITY_DEFINITIONS_MAP,
            updated_activities=[(activity, old_values)],
        )

        event = mock_registry.send_event.call_args[0][0]
        assert event.status == "skipped"

    def test_skips_non_terminal_status(self):
        mock_registry = MagicMock()
        mock_registry.is_initialized.return_value = True
        mock_registry.entitlement_id = ""
        collector = _make_collector(mock_registry)

        activity = _make_activity("task-1", ActivityStatus.RUNNING)
        old_values = {"status": ActivityStatus.PENDING}

        collector.emit_activity_telemetry(
            execution_id=EXECUTION_ID,
            activity_definitions_map=ACTIVITY_DEFINITIONS_MAP,
            updated_activities=[(activity, old_values)],
        )

        mock_registry.send_event.assert_not_called()

    def test_skips_already_terminal_old_status(self):
        """Avoid duplicate telemetry when re-syncing an already-terminal activity."""
        mock_registry = MagicMock()
        mock_registry.is_initialized.return_value = True
        mock_registry.entitlement_id = ""
        collector = _make_collector(mock_registry)

        activity = _make_activity("task-1", ActivityStatus.COMPLETED)
        old_values = {"status": ActivityStatus.COMPLETED}

        collector.emit_activity_telemetry(
            execution_id=EXECUTION_ID,
            activity_definitions_map=ACTIVITY_DEFINITIONS_MAP,
            updated_activities=[(activity, old_values)],
        )

        mock_registry.send_event.assert_not_called()

    def test_fire_and_forget_on_error(self):
        """Telemetry errors should not propagate."""
        mock_registry = MagicMock()
        mock_registry.is_initialized.return_value = True
        mock_registry.entitlement_id = ""
        mock_registry.send_event.side_effect = RuntimeError("Segment down")
        collector = _make_collector(mock_registry)

        activity = _make_activity("task-1", ActivityStatus.COMPLETED)
        old_values = {"status": ActivityStatus.PENDING}

        # Should not raise
        collector.emit_activity_telemetry(
            execution_id=EXECUTION_ID,
            activity_definitions_map=ACTIVITY_DEFINITIONS_MAP,
            updated_activities=[(activity, old_values)],
        )
