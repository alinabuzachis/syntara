"""Unit tests for WorkflowExecutionErrorTelemetryHandler."""

from unittest.mock import MagicMock, patch
from uuid import uuid4

from nexus.telemetry.events.workflow_error import TimedOutComponent
from nexus.telemetry.handlers.workflow_execution_error import WorkflowExecutionErrorTelemetryHandler
from nexus.workflows.audit.workflow_execution import WorkflowExecutionErrorEvent

EXECUTION_ID = uuid4()
WORKFLOW_ID = uuid4()
REQUEST_ID = uuid4()


class TestWorkflowExecutionErrorTelemetryHandler:
    """Tests for the WorkflowExecutionErrorTelemetryHandler."""

    @patch("nexus.telemetry.handlers.workflow_execution_error.TelemetryCollector")
    @patch("nexus.telemetry.handlers.workflow_execution_error.get_telemetry_registry")
    def test_emits_activity_timeout(self, mock_get_registry: MagicMock, mock_collector_cls: MagicMock) -> None:
        registry = MagicMock()
        registry.is_initialized.return_value = True
        mock_get_registry.return_value = registry

        mock_collector = MagicMock()
        mock_collector_cls.return_value = mock_collector

        domain_event = WorkflowExecutionErrorEvent(
            execution_id=EXECUTION_ID,
            workflow_id=WORKFLOW_ID,
            timed_out_component=TimedOutComponent.ACTIVITY,
            configured_timeout_seconds=30.0,
            elapsed_time_ms=30500,
            activity_id="script-1",
            request_id=REQUEST_ID,
        )
        result = WorkflowExecutionErrorTelemetryHandler().handle(domain_event)

        assert result is None
        mock_collector.capture_workflow_error.assert_called_once_with(
            workflow_execution_id=str(EXECUTION_ID),
            timed_out_component=TimedOutComponent.ACTIVITY,
            configured_timeout_seconds=30.0,
            elapsed_time_ms=30500,
            activity_id="script-1",
            request_id=REQUEST_ID,
            retry_count=0,
            error_type=None,
            retry_reason=None,
        )

    @patch("nexus.telemetry.handlers.workflow_execution_error.TelemetryCollector")
    @patch("nexus.telemetry.handlers.workflow_execution_error.get_telemetry_registry")
    def test_emits_workflow_timeout(self, mock_get_registry: MagicMock, mock_collector_cls: MagicMock) -> None:
        registry = MagicMock()
        registry.is_initialized.return_value = True
        mock_get_registry.return_value = registry

        mock_collector = MagicMock()
        mock_collector_cls.return_value = mock_collector

        domain_event = WorkflowExecutionErrorEvent(
            execution_id=EXECUTION_ID,
            workflow_id=WORKFLOW_ID,
            timed_out_component=TimedOutComponent.WORKFLOW,
            configured_timeout_seconds=3600.0,
            elapsed_time_ms=3600000,
            error_type="WorkflowTimedOut",
        )
        result = WorkflowExecutionErrorTelemetryHandler().handle(domain_event)

        assert result is None
        mock_collector.capture_workflow_error.assert_called_once_with(
            workflow_execution_id=str(EXECUTION_ID),
            timed_out_component=TimedOutComponent.WORKFLOW,
            configured_timeout_seconds=3600.0,
            elapsed_time_ms=3600000,
            activity_id=None,
            request_id=None,
            retry_count=0,
            error_type="WorkflowTimedOut",
            retry_reason=None,
        )

    @patch("nexus.telemetry.handlers.workflow_execution_error.TelemetryCollector")
    @patch("nexus.telemetry.handlers.workflow_execution_error.get_telemetry_registry")
    def test_emits_retry_with_reason(self, mock_get_registry: MagicMock, mock_collector_cls: MagicMock) -> None:
        registry = MagicMock()
        registry.is_initialized.return_value = True
        mock_get_registry.return_value = registry

        mock_collector = MagicMock()
        mock_collector_cls.return_value = mock_collector

        domain_event = WorkflowExecutionErrorEvent(
            execution_id=EXECUTION_ID,
            workflow_id=WORKFLOW_ID,
            timed_out_component=TimedOutComponent.ACTIVITY,
            configured_timeout_seconds=30.0,
            elapsed_time_ms=0,
            activity_id="http-1",
            retry_count=2,
            error_type="ConnectionError",
            retry_reason="Connection refused",
        )
        result = WorkflowExecutionErrorTelemetryHandler().handle(domain_event)

        assert result is None
        mock_collector.capture_workflow_error.assert_called_once_with(
            workflow_execution_id=str(EXECUTION_ID),
            timed_out_component=TimedOutComponent.ACTIVITY,
            configured_timeout_seconds=30.0,
            elapsed_time_ms=0,
            activity_id="http-1",
            request_id=None,
            retry_count=2,
            error_type="ConnectionError",
            retry_reason="Connection refused",
        )

    @patch("nexus.telemetry.handlers.workflow_execution_error.get_telemetry_registry")
    def test_skips_when_not_initialized(self, mock_get_registry: MagicMock) -> None:
        registry = MagicMock()
        registry.is_initialized.return_value = False
        mock_get_registry.return_value = registry

        domain_event = WorkflowExecutionErrorEvent(
            execution_id=EXECUTION_ID,
            workflow_id=WORKFLOW_ID,
            timed_out_component=TimedOutComponent.ACTIVITY,
            configured_timeout_seconds=30.0,
            elapsed_time_ms=30000,
        )
        result = WorkflowExecutionErrorTelemetryHandler().handle(domain_event)

        assert result is None

    @patch("nexus.telemetry.handlers.workflow_execution_error.get_telemetry_registry")
    def test_does_not_raise_on_exception(self, mock_get_registry: MagicMock) -> None:
        mock_get_registry.side_effect = RuntimeError("boom")

        domain_event = WorkflowExecutionErrorEvent(
            execution_id=EXECUTION_ID,
            workflow_id=WORKFLOW_ID,
            timed_out_component=TimedOutComponent.ACTIVITY,
            configured_timeout_seconds=30.0,
            elapsed_time_ms=30000,
        )
        result = WorkflowExecutionErrorTelemetryHandler().handle(domain_event)
        assert result is None
