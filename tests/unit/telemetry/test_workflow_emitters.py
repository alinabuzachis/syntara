"""Unit tests for workflow_emitters: status mapping helper."""

import pytest

from nexus.telemetry.events.workflow_emitters import (
    _map_execution_status_to_telemetry,
)
from nexus.workflows.models.execution import ExecutionStatus
from nexus.workflows.workflow_engine.models.workflow_definition import WorkflowTerminalStatus


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
