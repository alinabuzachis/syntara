"""End-to-end test: agentic workflow executes a tool and records metrics.

Requires the full Nexus stack running (API, Temporal, MCP server, OpenRouter).
Skipped when NEXUS_OPENROUTER_API_KEY is not set.

Run with:
    uv run pytest tests/e2e/test_agentic_workflow_tool_metrics.py -m e2e
"""

import os
import time
from typing import Any

import httpx
import pytest

BASE_URL = os.environ.get("NEXUS_E2E_BASE_URL", "http://127.0.0.1:8000/api/v1")
WORKFLOW_NAME = "e2e-agentic-tool-metrics"
POLL_INTERVAL = 5
POLL_TIMEOUT = 120

requires_openrouter = pytest.mark.skipif(
    not os.environ.get("NEXUS_OPENROUTER_API_KEY"),
    reason="NEXUS_OPENROUTER_API_KEY not set — full stack required",
)


def _get(path: str, **kwargs: object) -> dict[str, Any]:
    r = httpx.get(f"{BASE_URL}{path}", **kwargs)  # type: ignore[arg-type]
    r.raise_for_status()
    return r.json()  # type: ignore[no-any-return]


def _post(path: str, **kwargs: object) -> dict[str, Any]:
    r = httpx.post(f"{BASE_URL}{path}", **kwargs)  # type: ignore[arg-type]
    r.raise_for_status()
    return r.json()  # type: ignore[no-any-return]


def _patch(path: str, **kwargs: object) -> dict[str, Any]:
    r = httpx.patch(f"{BASE_URL}{path}", **kwargs)  # type: ignore[arg-type]
    r.raise_for_status()
    return r.json()  # type: ignore[no-any-return]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

WORKFLOW_DEFINITION = {
    "schemaVersion": "1.0.0",
    "version": 1,
    "metadata": {
        "name": WORKFLOW_NAME,
        "description": "E2E test: agentic workflow with tool metrics",
    },
    "triggers": [{"type": "manual"}],
    "workflow": {
        "activities": [
            {
                "id": "agentic_task",
                "name": "Agentic Task",
                "type": "task",
                "task": {
                    "executor": "agentic",
                    "config": {
                        "prompt": (
                            "You MUST use the get_greeting tool to greet jimmy. "
                            "Do not answer without calling the tool first."
                        ),
                    },
                },
            }
        ]
    },
}


@pytest.fixture(scope="module")
def workflow_id():
    """Create or update the test workflow, return its ID."""
    existing = [
        w for w in _get("/workflows", params={"name": WORKFLOW_NAME})["resources"] if w["name"] == WORKFLOW_NAME
    ]
    if existing:
        wf_id = existing[0]["id"]
        _patch(f"/workflows/{wf_id}", json={"workflow_definition": WORKFLOW_DEFINITION})
        return wf_id

    data = _post(
        "/workflows",
        json={
            "name": WORKFLOW_NAME,
            "description": "E2E test: agentic workflow with tool metrics",
            "is_enabled": True,
            "workflow_definition": WORKFLOW_DEFINITION,
        },
    )
    return data["id"]


def _poll_execution(exec_id: str) -> dict[str, Any]:
    """Poll until execution reaches a terminal state."""
    elapsed = 0
    while elapsed < POLL_TIMEOUT:
        time.sleep(POLL_INTERVAL)
        elapsed += POLL_INTERVAL
        data = _get(f"/executions/{exec_id}", params={"include": "activities"})
        if data["status"] in ("completed", "failed", "cancelled"):
            return data
    pytest.fail(f"Execution {exec_id} did not finish within {POLL_TIMEOUT}s")


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@requires_openrouter
@pytest.mark.e2e
def test_agentic_workflow_records_tool_metrics(workflow_id):
    """Run an agentic workflow and verify tool metrics are recorded.

    Checks:
      - Workflow execution completes successfully
      - DB tool summary (UsageCounter) is incremented
      - DB tool execution record is created
    """
    # --- Snapshot BEFORE ---
    summaries_before = _get("/tool_manager/metrics/tools")["resources"]
    executions_before = _get("/tool_manager/metrics/executions", params={"limit": 100})["resources"]

    # --- Run workflow ---
    exec_data = _post("/executions", json={"workflow_id": workflow_id, "input_data": {}})
    exec_id = exec_data["id"]
    result = _poll_execution(exec_id)

    assert result["status"] == "completed", f"Execution failed: {result.get('error_details')}"

    # Wait for async metric writes to flush
    time.sleep(3)

    # --- Snapshot AFTER ---
    summaries_after = _get("/tool_manager/metrics/tools")["resources"]
    executions_after = _get("/tool_manager/metrics/executions", params={"limit": 100})["resources"]

    # --- Assert DB tool summary incremented ---
    before_by_name = {t["namespaced_name"]: t for t in summaries_before}
    after_by_name = {t["namespaced_name"]: t for t in summaries_after}

    greeting_before = before_by_name.get("mcp::get_greeting", {})
    greeting_after = after_by_name.get("mcp::get_greeting")
    assert greeting_after is not None, (
        "mcp::get_greeting not found in tool summaries after execution — the tool was not called"
    )
    assert greeting_after["total_executions"] > greeting_before.get("total_executions", 0)
    assert greeting_after["success_count"] > greeting_before.get("success_count", 0)

    # --- Assert new DB execution record ---
    assert len(executions_after) > len(executions_before), "No new tool execution records in DB"
    new_exec = executions_after[0]  # Most recent
    assert new_exec["status"] == "success"
    assert new_exec["duration_ms"] >= 0


@requires_openrouter
@pytest.mark.e2e
def test_tool_metrics_summary_fields():
    """Verify the tool metrics summary response has all expected fields."""
    summaries = _get("/tool_manager/metrics/tools")["resources"]

    # If there are any summaries, validate their shape
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


@requires_openrouter
@pytest.mark.e2e
def test_tool_execution_records_fields():
    """Verify tool execution records have all expected fields."""
    executions = _get("/tool_manager/metrics/executions", params={"limit": 5})["resources"]

    for ex in executions:
        assert "id" in ex
        assert "tool_id" in ex
        assert "status" in ex
        assert ex["status"] in ("success", "error", "timeout", "running")
        assert "duration_ms" in ex
        assert "execution_start" in ex
