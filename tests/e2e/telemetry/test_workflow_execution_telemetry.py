"""E2E Test 3: Anonymized workflow execution data.

Validates that workflow and activity execution events are captured
with correct fields, correlation IDs, and no PII.

Requirements: AAP-66661, AAP-66662, AAP-66663, AAP-66791, AAP-66792

Run with:
    make test-e2e-telemetry
"""

import time
from typing import Any
from uuid import UUID

import pytest
from nexus_api_client.api import NexusApiRegistry
from nexus_api_client.models.execution_create import ExecutionCreate
from nexus_api_client.models.workflow_create import WorkflowCreate
from nexus_api_client.models.workflow_update import WorkflowUpdate

from tests.e2e.telemetry.conftest import get_captured_events

pytestmark = pytest.mark.e2e

WORKFLOW_NAME = "e2e-telemetry-script"
POLL_INTERVAL = 3
POLL_TIMEOUT = 60

WORKFLOW_DEFINITION: dict[str, Any] = {
    "schema_version": "2.0.0",
    "triggers": [
        {"id": "trigger", "type": "manual_trigger", "config": {"inputs": {}}},
    ],
    "nodes": [
        {
            "id": "script_task",
            "name": "Script Task",
            "type": "script",
            "config": {
                "language": "python",
                "code": "print('telemetry test')",
            },
        },
    ],
    "edges": [{"from": "trigger", "to": "script_task"}],
}

# Fields that must NEVER appear in telemetry events (PII / sensitive data)
PII_FIELDS = {
    "username",
    "email",
    "password",
    "token",
    "api_key",
    "secret",
    "authorization",
    "cookie",
    "user_id",
    "created_by",
}


def _poll_execution(nexus_api: NexusApiRegistry, exec_id: str) -> Any:  # noqa: ANN401
    """Poll until execution reaches a terminal state.

    Raises pytest.fail if the execution never reaches a terminal state,
    which typically means Temporal is not running.
    """
    elapsed = 0
    last_status = "unknown"
    while elapsed < POLL_TIMEOUT:
        time.sleep(POLL_INTERVAL)
        elapsed += POLL_INTERVAL
        data = nexus_api.executions.get(
            execution_id=UUID(exec_id),
            include="activities",
        ).assert_and_get()
        last_status = data.status
        if last_status in ("completed", "failed", "cancelled"):
            return data
    pytest.fail(
        f"Execution {exec_id} stuck in '{last_status}' after {POLL_TIMEOUT}s — "
        f"Temporal may not be running. Start it with: make temporal-run"
    )


@pytest.fixture(scope="module")
def workflow_id(nexus_api: NexusApiRegistry) -> str:
    """Create or update the telemetry test workflow, return its ID.

    If updating an existing workflow fails (e.g. schema mismatch from a
    prior run), delete it and recreate from scratch.
    """
    existing = nexus_api.workflows.list(
        additional_params={"name": WORKFLOW_NAME},
    ).assert_and_get()

    matched = [w for w in existing.resources if w["name"] == WORKFLOW_NAME]
    if matched:
        wf_id = str(matched[0]["id"])
        try:
            nexus_api.workflows.update(
                workflow_id=UUID(wf_id),
                body=WorkflowUpdate(workflow_definition=WORKFLOW_DEFINITION),
            ).assert_and_get()
            return wf_id
        except Exception:
            # Update failed — delete and recreate below
            nexus_api.workflows.delete(workflow_id=UUID(wf_id))

    data = nexus_api.workflows.create(
        body=WorkflowCreate(
            name=WORKFLOW_NAME,
            description="E2E telemetry test: simple script workflow",
            is_enabled=True,
            workflow_definition=WORKFLOW_DEFINITION,
        ),
    ).assert_and_get()
    return str(data.id)


@pytest.fixture(scope="module")
def completed_execution(
    nexus_api: NexusApiRegistry,
    workflow_id: str,
    segment_server_url: str,
) -> dict[str, Any]:
    """Execute the workflow and return execution data plus captured events."""
    exec_data = nexus_api.executions.create(
        body=ExecutionCreate(workflow_id=UUID(workflow_id)),
    ).assert_and_get()

    execution = _poll_execution(nexus_api, str(exec_data.id))
    assert execution.status == "completed", f"Execution failed: {getattr(execution, 'error_details', None)}"

    # Wait for telemetry events to flush to mock Segment.
    # Activity events may arrive later than workflow events due to
    # asynchronous activity sync, so use a longer poll timeout.
    events = get_captured_events(segment_server_url, timeout=10.0)

    return {"execution": execution, "events": events, "execution_id": str(exec_data.id)}


class TestWorkflowStartEvent:
    """Verify workflow_execution_start events."""

    def test_start_event_emitted(
        self,
        completed_execution: dict[str, Any],
    ) -> None:
        """A workflow_execution_start event must be emitted when a workflow begins."""
        start_events = [e for e in completed_execution["events"] if e.get("event") == "workflow_execution_start"]
        assert len(start_events) >= 1, "No workflow_execution_start event captured"

    def test_start_event_has_execution_id(
        self,
        completed_execution: dict[str, Any],
    ) -> None:
        """The start event must contain a workflow_execution_id."""
        start_events = [e for e in completed_execution["events"] if e.get("event") == "workflow_execution_start"]
        assert len(start_events) >= 1
        props = start_events[0].get("properties", {})
        assert "workflow_execution_id" in props, f"workflow_execution_start missing workflow_execution_id: {props}"


class TestWorkflowCompletedEvent:
    """Verify workflow_execution_completed events."""

    def test_completed_event_emitted(
        self,
        completed_execution: dict[str, Any],
    ) -> None:
        """A workflow_execution_completed event must be emitted after workflow finishes."""
        completed_events = [
            e for e in completed_execution["events"] if e.get("event") == "workflow_execution_completed"
        ]
        assert len(completed_events) >= 1, "No workflow_execution_completed event captured"

    def test_completed_event_fields(
        self,
        completed_execution: dict[str, Any],
    ) -> None:
        """The completed event must include status, duration, activity count, and error count."""
        completed_events = [
            e for e in completed_execution["events"] if e.get("event") == "workflow_execution_completed"
        ]
        assert len(completed_events) >= 1
        props = completed_events[0].get("properties", {})

        assert "workflow_execution_id" in props
        assert "status" in props
        assert "duration_ms" in props
        assert "node_count" in props
        assert "error_count" in props

        assert props["status"] == "completed"
        assert props["duration_ms"] >= 0
        assert props["node_count"] >= 1
        assert props["error_count"] == 0


class TestEventCorrelation:
    """Verify workflow_execution_id stitches all events within a run."""

    def test_all_events_share_workflow_execution_id(
        self,
        completed_execution: dict[str, Any],
    ) -> None:
        """All events from one workflow run must share the same workflow_execution_id."""
        telemetry_event_types = {
            "workflow_execution_start",
            "workflow_execution_completed",
            "activity_execution",
        }
        workflow_events = [e for e in completed_execution["events"] if e.get("event") in telemetry_event_types]
        assert len(workflow_events) >= 2, (
            f"Expected at least 2 workflow telemetry events (start + completed), got {len(workflow_events)}"
        )

        execution_ids = {
            e["properties"]["workflow_execution_id"]
            for e in workflow_events
            if "workflow_execution_id" in e.get("properties", {})
        }
        assert len(execution_ids) == 1, f"Expected one workflow_execution_id across all events, got: {execution_ids}"


class TestNoPII:
    """Verify no PII or sensitive data in any telemetry event."""

    def test_no_pii_fields_in_events(
        self,
        completed_execution: dict[str, Any],
    ) -> None:
        """No event properties may contain known PII field names."""
        for event in completed_execution["events"]:
            props = event.get("properties", {})
            found_pii = PII_FIELDS & set(props.keys())
            assert not found_pii, f"PII fields found in {event.get('event')} event: {found_pii}"

    def test_no_raw_workflow_content_in_events(
        self,
        completed_execution: dict[str, Any],
    ) -> None:
        """Workflow definition code must not appear in telemetry event properties."""
        code_snippet = "print('telemetry test')"
        for event in completed_execution["events"]:
            props_str = str(event.get("properties", {}))
            assert code_snippet not in props_str, f"Raw workflow code found in {event.get('event')} event"


class TestBatchDelivery:
    """Verify events are sent to Segment via the batch endpoint."""

    def test_events_delivered_via_batch_endpoint(
        self,
        completed_execution: dict[str, Any],
    ) -> None:
        """Telemetry events must arrive via the /v1/batch endpoint, not /v1/track."""
        events = completed_execution["events"]
        assert len(events) >= 1, "No events captured"

        batch_events = [e for e in events if e.get("_delivery_method") == "batch"]
        assert len(batch_events) >= 1, (
            f"No events delivered via /v1/batch — all {len(events)} events used: "
            f"{ {e.get('_delivery_method', 'unknown') for e in events} }"
        )


class TestPeriodicAnalytics:
    """Verify periodic system_analytics events.

    The test environment sets APP_COLLECTION_INTERVAL_SECONDS=10.
    We wait long enough for at least one periodic collection cycle.
    """

    def test_system_analytics_event_emitted(
        self,
        segment_server_url: str,
    ) -> None:
        """A system_analytics event should be emitted by the periodic collector."""
        # The collection interval is 10s in test env; poll long enough
        # for at least one cycle to complete.
        events = get_captured_events(
            segment_server_url,
            event_type="system_analytics",
            timeout=20.0,
        )

        assert len(events) >= 1, "No system_analytics event captured after waiting for periodic collection"

    def test_system_analytics_event_fields(
        self,
        segment_server_url: str,
    ) -> None:
        """system_analytics events must include workflow, credential, and execution counts."""
        events = get_captured_events(
            segment_server_url,
            event_type="system_analytics",
            timeout=20.0,
        )

        assert len(events) >= 1
        props = events[0].get("properties", {})

        assert "workflows" in props
        assert "credentials" in props
        assert "executions" in props
        assert "config" in props

        # Verify nested structure
        assert "total" in props["workflows"]
        assert "enabled" in props["workflows"]
        assert "disabled" in props["workflows"]
        assert "total" in props["executions"]
        assert "completed" in props["executions"]
        assert "failed" in props["executions"]
