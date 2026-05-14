"""E2E test: agentic workflow executes a tool and records metrics + telemetry.

Requires the full Nexus stack running (API, Temporal, MCP server, OpenRouter).
Skipped when E2E_LLM_CREDENTIAL_CONFIGURED is not set.

Validates:
  - Workflow execution completes successfully
  - DB tool summary (UsageCounter) is incremented
  - DB tool execution record is created
  - Telemetry events carry the originating X-Request-Id for correlation

Run with:
    make test-e2e-telemetry
"""

import os
import time
from collections.abc import Generator
from typing import Any
from uuid import UUID, uuid4

import httpx
import pytest
from nexus_api_client.api import NexusApiRegistry
from nexus_api_client.models.workflow_create import WorkflowCreate

from tests.e2e.telemetry.conftest import get_captured_events, new_request_id

WORKFLOW_NAME_PREFIX = "e2e-agentic-tool-metrics"
POLL_INTERVAL = 5
POLL_TIMEOUT = 120

requires_openrouter = pytest.mark.skipif(
    not os.environ.get("E2E_LLM_CREDENTIAL_CONFIGURED"),
    reason="E2E_LLM_CREDENTIAL_CONFIGURED not set — full stack with LLM credential required",
)

pytestmark = [pytest.mark.e2e, requires_openrouter]

WORKFLOW_DEFINITION = {
    "schema_version": "2.0.0",
    "triggers": [
        {
            "id": "trigger_manual",
            "type": "manual_trigger",
            "config": {"inputs": {}},
        }
    ],
    "nodes": [
        {
            "id": "agentic_task",
            "name": "Agentic Task",
            "type": "agentic",
            "config": {
                "prompt": (
                    "You MUST use the get_greeting tool to greet jimmy. Do not answer without calling the tool first."
                ),
            },
        }
    ],
    "edges": [
        {"from": "trigger_manual", "to": "agentic_task"},
    ],
}


def _get_metrics(
    nexus_base_url: str,
    auth_headers: dict[str, str],
    path: str,
    **kwargs: object,
) -> dict[str, Any]:
    """Fetch tool metrics endpoints."""
    r = httpx.get(
        f"{nexus_base_url}/api/v1{path}",
        headers=auth_headers,
        **kwargs,  # type: ignore[arg-type]
    )
    r.raise_for_status()
    return r.json()  # type: ignore[no-any-return]


def _poll_execution(nexus_api: NexusApiRegistry, exec_id: str) -> Any:  # noqa: ANN401
    """Poll until execution reaches a terminal state."""
    elapsed = 0
    while elapsed < POLL_TIMEOUT:
        time.sleep(POLL_INTERVAL)
        elapsed += POLL_INTERVAL
        data = nexus_api.executions.get(
            execution_id=UUID(exec_id),
            include="activities",
        ).assert_and_get()
        if data.status in ("completed", "failed", "cancelled"):
            return data
    pytest.fail(f"Execution {exec_id} did not finish within {POLL_TIMEOUT}s")


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def workflow_id(nexus_api: NexusApiRegistry, mcp_provider_id: str) -> Generator[str, None, None]:
    """Create a uniquely-named test workflow, yield its ID, then delete it.

    Depends on mcp_provider_id to ensure the tool provider is registered first.
    """
    workflow_name = f"{WORKFLOW_NAME_PREFIX}-{uuid4().hex[:8]}"

    data = nexus_api.workflows.create(
        body=WorkflowCreate(
            name=workflow_name,
            description="E2E test: agentic workflow with tool metrics",
            is_enabled=True,
            workflow_definition=WORKFLOW_DEFINITION,
        ),
    ).assert_and_get()
    wf_id = str(data.id)

    yield wf_id

    # Cleanup
    try:
        nexus_api.workflows.delete(workflow_id=UUID(wf_id))
    except Exception:
        pass


@pytest.fixture(scope="module")
def completed_execution(
    nexus_api: NexusApiRegistry,
    nexus_base_url: str,
    auth_headers: dict[str, str],
    workflow_id: str,
    segment_server_url: str,
) -> dict[str, Any]:
    """Execute the agentic workflow with X-Request-Id and return results.

    Returns dict with execution data, captured telemetry events,
    execution_id, and the originating request_id.
    """
    rid = new_request_id()

    # Create execution via raw httpx to pass X-Request-Id
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

    # Wait for async metric writes and telemetry to flush
    time.sleep(3)

    # Collect all telemetry events correlated by request_id
    events = get_captured_events(segment_server_url, request_id=rid, timeout=15.0)

    return {
        "execution": execution,
        "events": events,
        "execution_id": exec_id,
        "request_id": rid,
    }


# ---------------------------------------------------------------------------
# DB Metrics Tests
# ---------------------------------------------------------------------------


class TestToolMetricsDB:
    """Verify tool execution metrics are recorded in the database."""

    def test_tool_summary_incremented(
        self,
        nexus_base_url: str,
        auth_headers: dict[str, str],
        completed_execution: dict[str, Any],
    ) -> None:
        """DB tool summary (UsageCounter) must be incremented after tool call."""
        summaries = _get_metrics(nexus_base_url, auth_headers, "/tool_manager/metrics/tools")["resources"]
        by_name = {t["namespaced_name"]: t for t in summaries}

        greeting = by_name.get("mcp::get_greeting")
        assert greeting is not None, "mcp::get_greeting not found in tool summaries after execution"
        assert greeting["total_executions"] >= 1
        assert greeting["success_count"] >= 1

    def test_tool_execution_record_created(
        self,
        nexus_base_url: str,
        auth_headers: dict[str, str],
        completed_execution: dict[str, Any],
    ) -> None:
        """A DB tool execution record must be created with correct fields."""
        executions = _get_metrics(
            nexus_base_url, auth_headers, "/tool_manager/metrics/executions", params={"limit": 5}
        )["resources"]

        assert len(executions) >= 1, "No tool execution records in DB"
        latest = executions[0]
        assert latest["status"] == "success"
        assert latest["duration_ms"] >= 0

    def test_tool_metrics_summary_fields(
        self,
        nexus_base_url: str,
        auth_headers: dict[str, str],
        completed_execution: dict[str, Any],
    ) -> None:
        """Tool metrics summary response must have all expected fields."""
        summaries = _get_metrics(nexus_base_url, auth_headers, "/tool_manager/metrics/tools")["resources"]

        for summary in summaries:
            assert "namespaced_name" in summary
            assert "total_executions" in summary
            assert "success_count" in summary
            assert "error_count" in summary
            assert "timeout_count" in summary
            assert "success_rate" in summary
            assert "avg_duration_ms" in summary
            assert "last_execution_at" in summary

            assert isinstance(summary["total_executions"], int)
            assert isinstance(summary["success_rate"], float)
            assert 0.0 <= summary["success_rate"] <= 1.0
            assert summary["total_executions"] == (
                summary["success_count"] + summary["error_count"] + summary["timeout_count"]
            )

    def test_tool_execution_record_fields(
        self,
        nexus_base_url: str,
        auth_headers: dict[str, str],
        completed_execution: dict[str, Any],
    ) -> None:
        """Tool execution records must have all expected fields."""
        executions = _get_metrics(
            nexus_base_url, auth_headers, "/tool_manager/metrics/executions", params={"limit": 5}
        )["resources"]

        for ex in executions:
            assert "id" in ex
            assert "tool_id" in ex
            assert "status" in ex
            assert ex["status"] in ("success", "error", "timeout", "running")
            assert "duration_ms" in ex
            assert "execution_start" in ex


# ---------------------------------------------------------------------------
# Telemetry Correlation Tests
# ---------------------------------------------------------------------------


class TestTelemetryCorrelation:
    """Verify telemetry events are correlated via X-Request-Id."""

    def test_api_call_event_carries_request_id(
        self,
        completed_execution: dict[str, Any],
    ) -> None:
        """The api_call event for POST /executions must carry the request_id."""
        rid = completed_execution["request_id"]
        api_events = [
            e
            for e in completed_execution["events"]
            if e.get("event") == "api_call" and e.get("properties", {}).get("request_id") == rid
        ]
        assert len(api_events) >= 1, f"No api_call event with request_id={rid}"

    def test_workflow_start_event_carries_request_id(
        self,
        completed_execution: dict[str, Any],
    ) -> None:
        """workflow_execution_start must carry the originating request_id."""
        rid = completed_execution["request_id"]
        start_events = [e for e in completed_execution["events"] if e.get("event") == "workflow_execution_start"]
        assert len(start_events) >= 1, "No workflow_execution_start event captured"
        props = start_events[0].get("properties", {})
        assert props.get("request_id") == rid

    def test_workflow_completed_event_carries_request_id(
        self,
        completed_execution: dict[str, Any],
    ) -> None:
        """workflow_execution_completed must carry the originating request_id."""
        rid = completed_execution["request_id"]
        completed_events = [
            e for e in completed_execution["events"] if e.get("event") == "workflow_execution_completed"
        ]
        assert len(completed_events) >= 1, "No workflow_execution_completed event captured"
        props = completed_events[0].get("properties", {})
        assert props.get("request_id") == rid

    def test_tool_execution_event_emitted(
        self,
        completed_execution: dict[str, Any],
    ) -> None:
        """A tool_execution event must be emitted for the mcp::get_greeting call."""
        rid = completed_execution["request_id"]
        tool_events = [
            e
            for e in completed_execution["events"]
            if e.get("event") == "tool_execution" and e.get("properties", {}).get("request_id") == rid
        ]
        assert len(tool_events) >= 1, f"No tool_execution event with request_id={rid}"
        props = tool_events[0].get("properties", {})
        assert props.get("namespaced_name") == "mcp::get_greeting"
        assert props.get("status") == "success"
        assert props.get("duration_ms", -1) >= 0

    def test_all_events_share_request_id(
        self,
        completed_execution: dict[str, Any],
    ) -> None:
        """All telemetry events from one execution must share the same request_id."""
        rid = completed_execution["request_id"]
        events = completed_execution["events"]
        assert len(events) >= 2, f"Expected at least 2 events, got {len(events)}"

        for event in events:
            props = event.get("properties", {})
            assert props.get("request_id") == rid, (
                f"Event {event.get('event')} has request_id={props.get('request_id')}, expected {rid}"
            )

    def test_workflow_events_share_execution_id(
        self,
        completed_execution: dict[str, Any],
    ) -> None:
        """workflow_execution_start and completed must share the same workflow_execution_id."""
        wf_event_types = {"workflow_execution_start", "workflow_execution_completed"}
        wf_events = [e for e in completed_execution["events"] if e.get("event") in wf_event_types]
        assert len(wf_events) >= 2, f"Expected start + completed, got {len(wf_events)}"

        exec_ids = {e["properties"]["workflow_execution_id"] for e in wf_events}
        assert len(exec_ids) == 1, f"Expected one workflow_execution_id, got: {exec_ids}"
