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

import httpx
import pytest
from nexus_api_client.api import NexusApiRegistry
from nexus_api_client.models.workflow_create import WorkflowCreate
from nexus_api_client.models.workflow_update import WorkflowUpdate

from nexus.workflows.workflow_engine.models.workflow_definition import ActivityName
from tests.e2e.telemetry.conftest import get_captured_events, new_request_id

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
    """Poll until execution reaches a terminal state."""
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
    """Create or update the telemetry test workflow, return its ID."""
    existing = nexus_api.workflows.list(
        additional_params={"name": WORKFLOW_NAME},
    ).assert_and_get()

    matched = [w for w in existing.resources if w.name == WORKFLOW_NAME]
    if matched:
        wf_id = str(matched[0].id)
        try:
            nexus_api.workflows.update(
                workflow_id=UUID(wf_id),
                body=WorkflowUpdate(workflow_definition=WORKFLOW_DEFINITION),
            ).assert_and_get()
            return wf_id
        except Exception:
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
    nexus_base_url: str,
    auth_headers: dict[str, str],
    workflow_id: str,
    segment_server_url: str,
) -> dict[str, Any]:
    """Execute the workflow with X-Request-Id and return execution data plus captured events.

    Workflow telemetry events (workflow_execution_start/completed) are
    emitted by the Temporal worker which may not yet propagate the
    request_id. We collect all events and tag which ones carry the
    originating request_id for correlation-aware tests.
    """
    rid = new_request_id()

    # Create execution via raw httpx so we can pass X-Request-Id
    headers = {**auth_headers, "X-Request-Id": rid, "Content-Type": "application/json"}
    r = httpx.post(
        f"{nexus_base_url}/api/v1/executions",
        json={"workflow_id": workflow_id},
        headers=headers,
        timeout=10,
    )
    r.raise_for_status()
    exec_data = r.json()
    exec_id = exec_data["id"]

    execution = _poll_execution(nexus_api, exec_id)
    assert execution.status == "completed", f"Execution failed: {getattr(execution, 'error_details', None)}"

    # Collect all events correlated by request_id (api_call + workflow events).
    # The request_id is propagated through the interceptor chain to the
    # workflow emitters, so all event types carry it.
    events = get_captured_events(segment_server_url, request_id=rid, timeout=10.0)

    return {"execution": execution, "events": events, "execution_id": exec_id, "request_id": rid}


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

    def test_start_event_has_trigger_type(
        self,
        completed_execution: dict[str, Any],
    ) -> None:
        """The start event must contain trigger_type matching the workflow trigger node."""
        start_events = [e for e in completed_execution["events"] if e.get("event") == "workflow_execution_start"]
        assert len(start_events) == 1
        props = start_events[0].get("properties", {})
        assert props.get("trigger_type") == ActivityName.MANUAL_TRIGGER, (
            f"Expected trigger_type={ActivityName.MANUAL_TRIGGER!r}, got {props.get('trigger_type')!r}"
        )

    def test_start_event_carries_request_id(
        self,
        completed_execution: dict[str, Any],
    ) -> None:
        """The start event must carry the originating X-Request-Id."""
        rid = completed_execution["request_id"]
        start_events = [e for e in completed_execution["events"] if e.get("event") == "workflow_execution_start"]
        assert len(start_events) >= 1
        props = start_events[0].get("properties", {})
        assert props.get("request_id") == rid, f"Expected request_id={rid}, got {props.get('request_id')}"


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
    """Verify request_id and workflow_execution_id stitch events together."""

    def test_all_events_share_request_id(
        self,
        completed_execution: dict[str, Any],
    ) -> None:
        """All events from one workflow run must share the originating X-Request-Id."""
        rid = completed_execution["request_id"]
        events = completed_execution["events"]
        assert len(events) >= 2, f"Expected at least 2 events, got {len(events)}"

        for event in events:
            props = event.get("properties", {})
            assert props.get("request_id") == rid, (
                f"Event {event.get('event')} has request_id={props.get('request_id')}, expected {rid}"
            )

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
