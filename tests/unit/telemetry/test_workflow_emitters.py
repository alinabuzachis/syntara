"""Unit tests for workflow_emitters: emit_activities and helpers."""

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from nexus.telemetry.events.workflow_emitters import (
    _map_execution_status_to_telemetry,
    emit_activities,
    emit_workflow_start,
)
from nexus.workflows.audit.node_execution import NodeExecutedEvent
from nexus.workflows.models.activity_execution import ActivityExecution, ActivityStatus
from nexus.workflows.models.execution import Execution, ExecutionStatus
from nexus.workflows.workflow_engine.models.workflow_definition import (
    ActivityName,
    ActivityTerminalStatus,
    WorkflowTerminalStatus,
)


class TestEmitActivities:
    """Tests for emit_activities dispatching NodeExecutedEvent."""

    def _make_activity(
        self,
        *,
        status: ActivityStatus,
        activity_name: str = "script-1",
        started_at: datetime | None = None,
        completed_at: datetime | None = None,
    ) -> MagicMock:
        activity = MagicMock(spec=ActivityExecution)
        activity.status = status
        activity.activity_name = activity_name
        activity.started_at = started_at
        activity.completed_at = completed_at
        return activity

    @patch("nexus.telemetry.events.workflow_emitters.AuditEventDispatcher")
    def test_dispatches_for_terminal_transition(self, mock_dispatcher: MagicMock) -> None:
        now = datetime.now(tz=UTC)
        activity = self._make_activity(
            status=ActivityStatus.COMPLETED,
            started_at=now - timedelta(seconds=2),
            completed_at=now,
        )
        old_values = {"status": ActivityStatus.RUNNING}
        execution_id = uuid4()
        request_id = uuid4()

        emit_activities(
            execution_id=execution_id,
            activity_definitions_map={"script-1": {"type": "script", "name": "test"}},
            updated_activities=[(activity, old_values)],
            request_id=request_id,
        )

        mock_dispatcher.dispatch.assert_called_once()
        event = mock_dispatcher.dispatch.call_args[0][0]
        assert isinstance(event, NodeExecutedEvent)
        assert event.execution_id == execution_id
        assert event.node_type == "script"
        assert event.status == ActivityTerminalStatus.COMPLETED
        assert event.duration_ms is not None
        assert event.error_type is None
        assert event.request_id == request_id

    @patch("nexus.telemetry.events.workflow_emitters.AuditEventDispatcher")
    def test_dispatches_failed_with_error_type(self, mock_dispatcher: MagicMock) -> None:
        activity = self._make_activity(status=ActivityStatus.FAILED)
        old_values = {"status": ActivityStatus.RUNNING}

        emit_activities(
            execution_id=uuid4(),
            activity_definitions_map={"script-1": {"type": "script"}},
            updated_activities=[(activity, old_values)],
        )

        event = mock_dispatcher.dispatch.call_args[0][0]
        assert event.status == ActivityTerminalStatus.FAILED
        assert event.error_type == "ActivityExecutionError"

    @patch("nexus.telemetry.events.workflow_emitters.AuditEventDispatcher")
    def test_skips_non_terminal_activity(self, mock_dispatcher: MagicMock) -> None:
        activity = self._make_activity(status=ActivityStatus.RUNNING)
        old_values = {"status": ActivityStatus.PENDING}

        emit_activities(
            execution_id=uuid4(),
            activity_definitions_map={},
            updated_activities=[(activity, old_values)],
        )

        mock_dispatcher.dispatch.assert_not_called()

    @patch("nexus.telemetry.events.workflow_emitters.AuditEventDispatcher")
    def test_skips_already_terminal_activity(self, mock_dispatcher: MagicMock) -> None:
        activity = self._make_activity(status=ActivityStatus.COMPLETED)
        old_values = {"status": ActivityStatus.COMPLETED}

        emit_activities(
            execution_id=uuid4(),
            activity_definitions_map={},
            updated_activities=[(activity, old_values)],
        )

        mock_dispatcher.dispatch.assert_not_called()

    @patch("nexus.telemetry.events.workflow_emitters.AuditEventDispatcher")
    def test_does_not_raise_on_exception(self, mock_dispatcher: MagicMock) -> None:
        mock_dispatcher.dispatch.side_effect = RuntimeError("boom")
        activity = self._make_activity(status=ActivityStatus.COMPLETED)
        old_values = {"status": ActivityStatus.RUNNING}

        emit_activities(
            execution_id=uuid4(),
            activity_definitions_map={"script-1": {"type": "script"}},
            updated_activities=[(activity, old_values)],
        )


class TestMapExecutionStatusToTelemetry:
    """Tests for _map_execution_status_to_telemetry."""

    def test_completed_maps_to_completed(self) -> None:
        assert _map_execution_status_to_telemetry(ExecutionStatus.COMPLETED) == WorkflowTerminalStatus.COMPLETED

    def test_failed_maps_to_failed(self) -> None:
        assert _map_execution_status_to_telemetry(ExecutionStatus.FAILED) == WorkflowTerminalStatus.FAILED

    def test_cancelled_maps_to_cancelled(self) -> None:
        assert _map_execution_status_to_telemetry(ExecutionStatus.CANCELLED) == WorkflowTerminalStatus.CANCELLED

    @pytest.mark.parametrize(
        "status",
        [ExecutionStatus.PENDING, ExecutionStatus.RUNNING, ExecutionStatus.PAUSED],
    )
    def test_non_terminal_statuses_map_to_cancelled(self, status: ExecutionStatus) -> None:
        assert _map_execution_status_to_telemetry(status) == WorkflowTerminalStatus.CANCELLED


class TestEmitWorkflowStart:
    """Tests for emit_workflow_start."""

    def _make_execution(self) -> MagicMock:
        execution = MagicMock(spec=Execution)
        execution.id = uuid4()
        return execution

    @patch("nexus.telemetry.events.workflow_emitters.TelemetryCollector")
    @patch("nexus.telemetry.events.workflow_emitters.get_telemetry_registry")
    def test_emits_start_event(self, mock_get_registry: MagicMock, mock_collector_cls: MagicMock) -> None:
        registry = MagicMock()
        registry.is_initialized.return_value = True
        mock_get_registry.return_value = registry

        collector = MagicMock()
        mock_collector_cls.return_value = collector

        execution = self._make_execution()
        request_id = uuid4()

        emit_workflow_start(execution, request_id=request_id, trigger_activity_type=ActivityName.SCRIPT)

        mock_collector_cls.assert_called_once_with(registry=registry)
        collector.capture_workflow_start.assert_called_once_with(
            execution_id=str(execution.id),
            request_id=request_id,
            trigger_activity_type=ActivityName.SCRIPT,
        )

    @patch("nexus.telemetry.events.workflow_emitters.get_telemetry_registry")
    def test_skips_when_registry_not_initialized(self, mock_get_registry: MagicMock) -> None:
        registry = MagicMock()
        registry.is_initialized.return_value = False
        mock_get_registry.return_value = registry

        execution = self._make_execution()

        emit_workflow_start(execution)

        registry.send_event.assert_not_called()

    @patch("nexus.telemetry.events.workflow_emitters.get_telemetry_registry")
    def test_does_not_raise_on_exception(self, mock_get_registry: MagicMock) -> None:
        mock_get_registry.side_effect = RuntimeError("registry unavailable")

        execution = self._make_execution()

        emit_workflow_start(execution)

    @patch("nexus.telemetry.events.workflow_emitters.TelemetryCollector")
    @patch("nexus.telemetry.events.workflow_emitters.get_telemetry_registry")
    def test_emits_without_optional_params(self, mock_get_registry: MagicMock, mock_collector_cls: MagicMock) -> None:
        registry = MagicMock()
        registry.is_initialized.return_value = True
        mock_get_registry.return_value = registry

        collector = MagicMock()
        mock_collector_cls.return_value = collector

        execution = self._make_execution()

        emit_workflow_start(execution)

        collector.capture_workflow_start.assert_called_once_with(
            execution_id=str(execution.id),
            request_id=None,
            trigger_activity_type=None,
        )
