"""Unit tests for workflow_emitters: emit_workflow_error and helpers."""

from unittest.mock import MagicMock, patch

import pytest

from nexus.telemetry.events.workflow_emitters import (
    _map_execution_status_to_telemetry,
    emit_workflow_error,
)
from nexus.telemetry.events.workflow_error import TimedOutComponent
from nexus.workflows.models.execution import ExecutionStatus
from nexus.workflows.workflow_engine.models.workflow_definition import WorkflowTerminalStatus
from tests.unit.telemetry.conftest import (
    VALID_WORKFLOW_EXECUTION_ID,
)

VALID_EXECUTION_ID = VALID_WORKFLOW_EXECUTION_ID


class TestEmitWorkflowError:
    """Tests for emit_workflow_error emitter function."""

    @patch("nexus.telemetry.events.workflow_emitters.get_telemetry_registry")
    def test_skips_when_registry_not_initialized(self, mock_get_registry: MagicMock) -> None:
        registry = MagicMock()
        registry.is_initialized.return_value = False
        mock_get_registry.return_value = registry

        emit_workflow_error(
            execution_id=VALID_EXECUTION_ID,
            timed_out_component=TimedOutComponent.ACTIVITY,
            configured_timeout_seconds=30.0,
            elapsed_time_ms=30500,
        )

        registry.send_event.assert_not_called()

    @patch("nexus.telemetry.events.workflow_emitters.TelemetryCollector")
    @patch("nexus.telemetry.events.workflow_emitters.get_telemetry_registry")
    def test_emits_activity_timeout(self, mock_get_registry: MagicMock, mock_collector_cls: MagicMock) -> None:
        registry = MagicMock()
        registry.is_initialized.return_value = True
        mock_get_registry.return_value = registry

        mock_collector = MagicMock()
        mock_collector_cls.return_value = mock_collector

        emit_workflow_error(
            execution_id=VALID_EXECUTION_ID,
            timed_out_component=TimedOutComponent.ACTIVITY,
            configured_timeout_seconds=30.0,
            elapsed_time_ms=30500,
            activity_id="script-1",
        )

        mock_collector.capture_workflow_error.assert_called_once_with(
            workflow_execution_id=VALID_EXECUTION_ID,
            timed_out_component=TimedOutComponent.ACTIVITY,
            configured_timeout_seconds=30.0,
            elapsed_time_ms=30500,
            activity_id="script-1",
            request_id=None,
            retry_count=0,
            error_type=None,
            retry_reason=None,
        )

    @patch("nexus.telemetry.events.workflow_emitters.TelemetryCollector")
    @patch("nexus.telemetry.events.workflow_emitters.get_telemetry_registry")
    def test_emits_workflow_timeout(self, mock_get_registry: MagicMock, mock_collector_cls: MagicMock) -> None:
        registry = MagicMock()
        registry.is_initialized.return_value = True
        mock_get_registry.return_value = registry

        mock_collector = MagicMock()
        mock_collector_cls.return_value = mock_collector

        emit_workflow_error(
            execution_id=VALID_EXECUTION_ID,
            timed_out_component=TimedOutComponent.WORKFLOW,
            configured_timeout_seconds=3600.0,
            elapsed_time_ms=3600000,
        )

        mock_collector.capture_workflow_error.assert_called_once_with(
            workflow_execution_id=VALID_EXECUTION_ID,
            timed_out_component=TimedOutComponent.WORKFLOW,
            configured_timeout_seconds=3600.0,
            elapsed_time_ms=3600000,
            activity_id=None,
            request_id=None,
            retry_count=0,
            error_type=None,
            retry_reason=None,
        )

    @patch("nexus.telemetry.events.workflow_emitters.TelemetryCollector")
    @patch("nexus.telemetry.events.workflow_emitters.get_telemetry_registry")
    def test_emits_retry_with_reason(self, mock_get_registry: MagicMock, mock_collector_cls: MagicMock) -> None:
        registry = MagicMock()
        registry.is_initialized.return_value = True
        mock_get_registry.return_value = registry

        mock_collector = MagicMock()
        mock_collector_cls.return_value = mock_collector

        emit_workflow_error(
            execution_id=VALID_EXECUTION_ID,
            timed_out_component=TimedOutComponent.ACTIVITY,
            configured_timeout_seconds=30.0,
            elapsed_time_ms=0,
            activity_id="http-1",
            retry_count=2,
            error_type="ConnectionError",
            retry_reason="Connection refused",
        )

        mock_collector.capture_workflow_error.assert_called_once_with(
            workflow_execution_id=VALID_EXECUTION_ID,
            timed_out_component=TimedOutComponent.ACTIVITY,
            configured_timeout_seconds=30.0,
            elapsed_time_ms=0,
            activity_id="http-1",
            request_id=None,
            retry_count=2,
            error_type="ConnectionError",
            retry_reason="Connection refused",
        )

    @patch("nexus.telemetry.events.workflow_emitters.TelemetryCollector")
    @patch("nexus.telemetry.events.workflow_emitters.get_telemetry_registry")
    def test_zero_timeout_logs_debug_and_emits(
        self, mock_get_registry: MagicMock, mock_collector_cls: MagicMock
    ) -> None:
        registry = MagicMock()
        registry.is_initialized.return_value = True
        mock_get_registry.return_value = registry

        mock_collector = MagicMock()
        mock_collector_cls.return_value = mock_collector

        emit_workflow_error(
            execution_id=VALID_EXECUTION_ID,
            timed_out_component=TimedOutComponent.ACTIVITY,
            configured_timeout_seconds=0.0,
            elapsed_time_ms=5000,
            activity_id="script-1",
        )

        mock_collector.capture_workflow_error.assert_called_once()

    @patch("nexus.telemetry.events.workflow_emitters.get_telemetry_registry")
    def test_does_not_raise_on_exception(self, mock_get_registry: MagicMock) -> None:
        mock_get_registry.side_effect = RuntimeError("boom")

        emit_workflow_error(
            execution_id=VALID_EXECUTION_ID,
            timed_out_component=TimedOutComponent.ACTIVITY,
            configured_timeout_seconds=30.0,
            elapsed_time_ms=30000,
        )

    @patch("nexus.telemetry.events.workflow_emitters.TelemetryCollector")
    @patch("nexus.telemetry.events.workflow_emitters.get_telemetry_registry")
    def test_does_not_raise_on_collector_exception(
        self, mock_get_registry: MagicMock, mock_collector_cls: MagicMock
    ) -> None:
        registry = MagicMock()
        registry.is_initialized.return_value = True
        mock_get_registry.return_value = registry

        mock_collector = MagicMock()
        mock_collector.capture_workflow_error.side_effect = RuntimeError("Segment down")
        mock_collector_cls.return_value = mock_collector

        emit_workflow_error(
            execution_id=VALID_EXECUTION_ID,
            timed_out_component=TimedOutComponent.WORKFLOW,
            configured_timeout_seconds=60.0,
            elapsed_time_ms=60000,
        )

    @patch("nexus.telemetry.events.workflow_emitters.TelemetryCollector")
    @patch("nexus.telemetry.events.workflow_emitters.get_telemetry_registry")
    def test_none_request_id_passes_none(self, mock_get_registry: MagicMock, mock_collector_cls: MagicMock) -> None:
        registry = MagicMock()
        registry.is_initialized.return_value = True
        mock_get_registry.return_value = registry

        mock_collector = MagicMock()
        mock_collector_cls.return_value = mock_collector

        emit_workflow_error(
            execution_id=VALID_EXECUTION_ID,
            timed_out_component=TimedOutComponent.WORKFLOW,
            configured_timeout_seconds=60.0,
            elapsed_time_ms=60000,
            request_id=None,
        )

        call_kwargs = mock_collector.capture_workflow_error.call_args[1]
        assert call_kwargs["request_id"] is None


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
