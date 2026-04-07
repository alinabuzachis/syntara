"""End-to-end test: agentic workflow executes a tool and records metrics.

Requires the full Nexus stack running (API, Temporal, MCP server, OpenRouter).
Skipped when APP_OPENROUTER_API_KEY is not set.

Run with:
    uv run pytest tests/e2e/test_agentic_workflow_tool_metrics.py -m e2e
"""

import os
import time
from typing import Any
from uuid import UUID

import httpx
import pytest
from nexus_api_client.api import NexusApiRegistry
from nexus_api_client.models.execution_create import ExecutionCreate
from nexus_api_client.models.workflow_create import WorkflowCreate
from nexus_api_client.models.workflow_update import WorkflowUpdate

SYSTEM_USER_ID = UUID("00000000-0000-0000-0000-000000000001")

WORKFLOW_NAME = "e2e-agentic-tool-metrics"
POLL_INTERVAL = 5
POLL_TIMEOUT = 120

requires_openrouter = pytest.mark.skipif(
    not os.environ.get("APP_OPENROUTER_API_KEY"),
    reason="APP_OPENROUTER_API_KEY not set — full stack required",
)

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


def _get_metrics(nexus_api: NexusApiRegistry, path: str, **kwargs: object) -> dict[str, Any]:
    """Fetch tool metrics endpoints directly (not yet wrapped in the API client)."""
    base_url = nexus_api._client._base_url
    r = httpx.get(f"{base_url}/api/v1{path}", **kwargs)  # type: ignore[arg-type]
    r.raise_for_status()
    return r.json()  # type: ignore[no-any-return]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module", autouse=True)
def _require_system_user(nexus_api: NexusApiRegistry) -> None:
    """Skip the entire module if the system user is not created."""
    base_url = nexus_api._client._base_url
    r = httpx.get(
        f"{base_url}/api/v1/invocations",
        params={"created_by": str(SYSTEM_USER_ID), "limit": 1},
    )
    if r.status_code != 200:
        pytest.skip("System user not found — run ./tools/create_system_user.py first")


@pytest.fixture(scope="module", autouse=True)
def _require_mcp_greeting_tool(nexus_api: NexusApiRegistry) -> None:
    """Skip the entire module if the mcp::get_greeting tool is not registered."""
    tools = nexus_api.tool_manager.get_tools().assert_and_get()
    names = [t["namespaced_name"] for t in tools.resources]
    if "mcp::get_greeting" not in names:
        pytest.skip("mcp::get_greeting tool not registered — run ./tools/register_mcp_provider.py first")


@pytest.fixture(scope="module")
def workflow_id(nexus_api: NexusApiRegistry) -> str:
    """Create or update the test workflow, return its ID."""
    existing = nexus_api.workflows.list(
        additional_params={"name": WORKFLOW_NAME},
    ).assert_and_get()

    matched = [w for w in existing.resources if w["name"] == WORKFLOW_NAME]
    if matched:
        wf_id = str(matched[0]["id"])
        nexus_api.workflows.update(
            workflow_id=UUID(wf_id),
            body=WorkflowUpdate(workflow_definition=WORKFLOW_DEFINITION),
        ).assert_and_get()
        return wf_id

    data = nexus_api.workflows.create(
        body=WorkflowCreate(
            name=WORKFLOW_NAME,
            description="E2E test: agentic workflow with tool metrics",
            is_enabled=True,
            workflow_definition=WORKFLOW_DEFINITION,
        ),
    ).assert_and_get()
    return str(data.id)


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
# Tests
# ---------------------------------------------------------------------------


@requires_openrouter
@pytest.mark.e2e
def test_agentic_workflow_records_tool_metrics(nexus_api: NexusApiRegistry, workflow_id: str) -> None:
    """Run an agentic workflow and verify tool metrics are recorded.

    Checks:
      - Workflow execution completes successfully
      - DB tool summary (UsageCounter) is incremented
      - DB tool execution record is created
    """
    # --- Snapshot BEFORE ---
    summaries_before = _get_metrics(nexus_api, "/tool_manager/metrics/tools")["resources"]
    executions_before = _get_metrics(nexus_api, "/tool_manager/metrics/executions", params={"limit": 100})["resources"]

    # --- Run workflow ---
    exec_data = nexus_api.executions.create(
        body=ExecutionCreate(workflow_id=UUID(workflow_id)),
    ).assert_and_get()
    exec_id = str(exec_data.id)
    result = _poll_execution(nexus_api, exec_id)

    assert result.status == "completed", f"Execution failed: {getattr(result, 'error_details', None)}"

    # Wait for async metric writes to flush
    time.sleep(3)

    # --- Snapshot AFTER ---
    summaries_after = _get_metrics(nexus_api, "/tool_manager/metrics/tools")["resources"]
    executions_after = _get_metrics(nexus_api, "/tool_manager/metrics/executions", params={"limit": 100})["resources"]

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
def test_tool_metrics_summary_fields(nexus_api: NexusApiRegistry) -> None:
    """Verify the tool metrics summary response has all expected fields."""
    summaries = _get_metrics(nexus_api, "/tool_manager/metrics/tools")["resources"]

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
def test_tool_execution_records_fields(nexus_api: NexusApiRegistry) -> None:
    """Verify tool execution records have all expected fields."""
    executions = _get_metrics(nexus_api, "/tool_manager/metrics/executions", params={"limit": 5})["resources"]

    for ex in executions:
        assert "id" in ex
        assert "tool_id" in ex
        assert "status" in ex
        assert ex["status"] in ("success", "error", "timeout", "running")
        assert "duration_ms" in ex
        assert "execution_start" in ex
