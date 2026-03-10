"""Integration tests for end-to-end workflow telemetry capture.

Validates that the telemetry interceptors, collector, and client registry
work together to capture and emit workflow and activity telemetry events.
"""

from __future__ import annotations

from unittest.mock import MagicMock

from nexus.telemetry.client import TelemetryClientRegistry
from nexus.telemetry.collector import TelemetryCollector
from nexus.workflows.workflow_engine.models.workflow_definition import (
    ActivityTerminalStatus,
    ActivityType,
    WorkflowTerminalStatus,
)


class TestEndToEndWorkflowTelemetry:
    """Integration test: full telemetry lifecycle from event capture to Segment send."""

    def test_workflow_start_and_complete_events_sent(self) -> None:
        """Verify that a workflow start and completion event are both sent to Segment."""
        registry = TelemetryClientRegistry()
        mock_client = MagicMock()
        registry._client = mock_client
        registry._entitlement_id = "test-install-001"

        collector = TelemetryCollector(registry=registry)

        workflow_execution_id = "test-correlation-id"

        # Capture start event
        collector.capture_workflow_start(
            workflow_execution_id=workflow_execution_id,
        )

        # Capture completed event
        collector.capture_workflow_completed(
            workflow_execution_id=workflow_execution_id,
            status=WorkflowTerminalStatus.COMPLETED,
            duration_ms=1500,
            activity_count=3,
            error_count=0,
        )

        # Verify two track calls were made (start + completed)
        assert mock_client.track.call_count == 2

        # Verify start event
        start_call = mock_client.track.call_args_list[0]
        assert start_call.kwargs["event"] == "workflow_execution_start"
        assert start_call.kwargs["user_id"] == "test-install-001"
        assert start_call.kwargs["properties"]["workflow_execution_id"] == workflow_execution_id

        # Verify completed event
        complete_call = mock_client.track.call_args_list[1]
        assert complete_call.kwargs["event"] == "workflow_execution_completed"
        assert complete_call.kwargs["properties"]["status"] == "completed"
        assert complete_call.kwargs["properties"]["duration_ms"] == 1500
        assert complete_call.kwargs["properties"]["activity_count"] == 3
        assert complete_call.kwargs["properties"]["error_count"] == 0

    def test_activity_event_sent_with_workflow_execution_id(self) -> None:
        """Verify that activity execution events include the parent workflow_execution_id."""
        registry = TelemetryClientRegistry()
        mock_client = MagicMock()
        registry._client = mock_client
        registry._entitlement_id = "test-install-001"

        collector = TelemetryCollector(registry=registry)

        workflow_execution_id = "parent-workflow-correlation"
        activity_def: dict[str, object] = {"activity_name": "execute_api_request"}

        collector.capture_activity_executed(
            workflow_execution_id=workflow_execution_id,
            activity_type=ActivityType.TASK,
            activity_def=activity_def,
            status=ActivityTerminalStatus.COMPLETED,
        )

        assert mock_client.track.call_count == 1
        call = mock_client.track.call_args
        assert call.kwargs["event"] == "activity_execution"
        assert call.kwargs["properties"]["workflow_execution_id"] == workflow_execution_id
        assert call.kwargs["properties"]["activity_type"] == "task"
        assert call.kwargs["properties"]["status"] == "completed"


class TestEntitlementIdPropagation:
    """Integration test: entitlement_id flows from registry to Segment track calls."""

    def test_entitlement_id_from_registry_to_events(self) -> None:
        """Verify entitlement_id set on registry appears as user_id in track calls."""
        registry = TelemetryClientRegistry()
        mock_client = MagicMock()
        registry._client = mock_client
        registry._entitlement_id = "prod-install-xyz"

        assert registry.entitlement_id == "prod-install-xyz"

        collector = TelemetryCollector(registry=registry)

        collector.capture_workflow_start(
            workflow_execution_id="test-id",
        )

        call = mock_client.track.call_args
        assert call.kwargs["user_id"] == "prod-install-xyz"
