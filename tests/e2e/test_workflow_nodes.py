"""End-to-end tests for v2 workflow node types.

Tests script, http_request, condition, loop, and converge nodes
using the full Nexus stack (API, Temporal worker, containers).

Run with:
    APP_BASE_URL=http://localhost:8000 make test-e2e
"""

import os
import time
from typing import Any

import httpx
import pytest

from .conftest import _generate_e2e_token

BASE_URL = os.environ.get("NEXUS_E2E_BASE_URL", "http://127.0.0.1:8000/api/v1")
MCP_SERVER_URL = os.environ.get("NEXUS_MCP_SERVER_URL", "http://mcp-server:8765/mcp")
MCP_PROVIDER_NAME = "mcp"
POLL_INTERVAL = 3
POLL_TIMEOUT = 60
AGENTIC_POLL_TIMEOUT = 120

_AUTH_HEADERS = {"Authorization": f"Bearer {_generate_e2e_token()}"}

requires_openrouter = pytest.mark.skipif(
    not os.environ.get("NEXUS_OPENROUTER_API_KEY"),
    reason="NEXUS_OPENROUTER_API_KEY not set — full stack required",
)


def _get(path: str, **kwargs: object) -> dict[str, Any]:
    r = httpx.get(f"{BASE_URL}{path}", headers=_AUTH_HEADERS, **kwargs)  # type: ignore[arg-type]
    r.raise_for_status()
    return r.json()  # type: ignore[no-any-return]


def _post(path: str, **kwargs: object) -> dict[str, Any]:
    r = httpx.post(f"{BASE_URL}{path}", headers=_AUTH_HEADERS, **kwargs)  # type: ignore[arg-type]
    r.raise_for_status()
    return r.json()  # type: ignore[no-any-return]


def _patch(path: str, **kwargs: object) -> dict[str, Any]:
    r = httpx.patch(f"{BASE_URL}{path}", headers=_AUTH_HEADERS, **kwargs)  # type: ignore[arg-type]
    r.raise_for_status()
    return r.json()  # type: ignore[no-any-return]


def _poll_execution(exec_id: str, timeout: int = POLL_TIMEOUT) -> dict[str, Any]:
    """Poll until execution reaches a terminal state."""
    elapsed = 0
    while elapsed < timeout:
        time.sleep(POLL_INTERVAL)
        elapsed += POLL_INTERVAL
        data = _get(f"/executions/{exec_id}", params={"include": "activities"})
        if data["status"] in ("completed", "failed", "cancelled"):
            return data
    pytest.fail(f"Execution {exec_id} did not finish within {timeout}s")


def _ensure_mcp_provider() -> str:
    """Register and validate the MCP tool provider if not already present."""
    providers = _get("/tool_manager/tool_providers")["resources"]
    existing = [p for p in providers if p["name"] == MCP_PROVIDER_NAME]

    if existing:
        provider_id = existing[0]["id"]
    else:
        data = _post(
            "/tool_manager/tool_providers",
            json={
                "name": MCP_PROVIDER_NAME,
                "description": "MCP server for E2E tests",
                "configuration": {
                    "provider_type": "mcp",
                    "base_url": MCP_SERVER_URL,
                },
            },
        )
        provider_id = data["id"]

    _post(f"/tool_manager/tool_providers/{provider_id}/validate")
    _post(f"/tool_manager/tool_providers/{provider_id}/refresh_tools")
    return str(provider_id)


def _create_and_run_workflow(name: str, definition: dict[str, Any], timeout: int = POLL_TIMEOUT) -> dict[str, Any]:
    """Create (or update) a workflow, execute it, and return the completed result."""
    existing = [w for w in _get("/workflows", params={"name": name})["resources"] if w["name"] == name]
    if existing:
        wf_id = existing[0]["id"]
        _patch(f"/workflows/{wf_id}", json={"workflow_definition": definition})
    else:
        data = _post(
            "/workflows",
            json={
                "name": name,
                "description": f"E2E test: {name}",
                "is_enabled": True,
                "workflow_definition": definition,
            },
        )
        wf_id = data["id"]

    exec_data = _post("/executions", json={"workflow_id": wf_id, "input_data": {}})
    return _poll_execution(exec_data["id"], timeout=timeout)


# ---------------------------------------------------------------------------
# Script node
# ---------------------------------------------------------------------------


@pytest.mark.e2e
def test_script_node_bash():
    """A bash script node executes and the workflow completes."""
    result = _create_and_run_workflow(
        "e2e-script-bash",
        {
            "schema_version": "2.0.0",
            "triggers": [
                {"id": "trigger", "type": "manual_trigger", "config": {"inputs": {}}},
            ],
            "nodes": [
                {
                    "id": "hello_script",
                    "name": "Hello Script",
                    "type": "script",
                    "config": {
                        "language": "bash",
                        "code": 'echo "Hello from E2E test"',
                    },
                },
            ],
            "edges": [{"from": "trigger", "to": "hello_script"}],
        },
    )

    assert result["status"] == "completed", f"Failed: {result.get('error_details')}"
    activities = {a["activity_id"]: a["status"] for a in result["activities"]}
    assert activities["trigger"] == "completed"
    assert activities["hello_script"] == "completed"


@pytest.mark.e2e
def test_script_node_python():
    """A python script node executes and the workflow completes."""
    result = _create_and_run_workflow(
        "e2e-script-python",
        {
            "schema_version": "2.0.0",
            "triggers": [
                {"id": "trigger", "type": "manual_trigger", "config": {"inputs": {}}},
            ],
            "nodes": [
                {
                    "id": "py_script",
                    "name": "Python Script",
                    "type": "script",
                    "config": {
                        "language": "python",
                        "code": "import json; print(json.dumps({'result': 2 + 2}))",
                    },
                },
            ],
            "edges": [{"from": "trigger", "to": "py_script"}],
        },
    )

    assert result["status"] == "completed", f"Failed: {result.get('error_details')}"
    activities = {a["activity_id"]: a["status"] for a in result["activities"]}
    assert activities["py_script"] == "completed"


# ---------------------------------------------------------------------------
# HTTP request node
# ---------------------------------------------------------------------------


@pytest.mark.e2e
def test_http_request_node():
    """An HTTP request node calls an endpoint and the workflow completes."""
    result = _create_and_run_workflow(
        "e2e-http-request",
        {
            "schema_version": "2.0.0",
            "triggers": [
                {"id": "trigger", "type": "manual_trigger", "config": {"inputs": {}}},
            ],
            "nodes": [
                {
                    "id": "health_check",
                    "name": "Health Check",
                    "type": "http_request",
                    "config": {
                        "method": "GET",
                        "url": "http://nexus:8000/health",
                    },
                },
            ],
            "edges": [{"from": "trigger", "to": "health_check"}],
        },
    )

    assert result["status"] == "completed", f"Failed: {result.get('error_details')}"
    activities = {a["activity_id"]: a["status"] for a in result["activities"]}
    assert activities["health_check"] == "completed"


# ---------------------------------------------------------------------------
# Condition node
# ---------------------------------------------------------------------------


@pytest.mark.e2e
def test_condition_true_branch():
    """A condition that evaluates to true routes to the true branch only."""
    result = _create_and_run_workflow(
        "e2e-condition-true",
        {
            "schema_version": "2.0.0",
            "triggers": [
                {"id": "trigger", "type": "manual_trigger", "config": {"inputs": {}}},
            ],
            "nodes": [
                {
                    "id": "check",
                    "name": "Check Condition",
                    "type": "condition",
                    "config": {"condition": "1 == 1"},
                },
                {
                    "id": "true_branch",
                    "name": "True Branch",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "condition was true"'},
                },
                {
                    "id": "false_branch",
                    "name": "False Branch",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "condition was false"'},
                },
            ],
            "edges": [
                {"from": "trigger", "to": "check"},
                {"from": "check", "to": "true_branch", "from_port": "true"},
                {"from": "check", "to": "false_branch", "from_port": "false"},
            ],
        },
    )

    assert result["status"] == "completed", f"Failed: {result.get('error_details')}"
    activities = {a["activity_id"]: a for a in result["activities"]}
    assert activities["check"]["status"] == "completed"
    assert activities["true_branch"]["status"] == "completed"
    # false_branch should not have executed
    if "false_branch" in activities:
        assert activities["false_branch"]["status"] != "completed", "False branch should not have run"


@pytest.mark.e2e
def test_condition_false_branch():
    """A condition that evaluates to false routes to the false branch only."""
    result = _create_and_run_workflow(
        "e2e-condition-false",
        {
            "schema_version": "2.0.0",
            "triggers": [
                {"id": "trigger", "type": "manual_trigger", "config": {"inputs": {}}},
            ],
            "nodes": [
                {
                    "id": "check",
                    "name": "Check Condition",
                    "type": "condition",
                    "config": {"condition": "1 == 0"},
                },
                {
                    "id": "true_branch",
                    "name": "True Branch",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "should not run"'},
                },
                {
                    "id": "false_branch",
                    "name": "False Branch",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "condition was false"'},
                },
            ],
            "edges": [
                {"from": "trigger", "to": "check"},
                {"from": "check", "to": "true_branch", "from_port": "true"},
                {"from": "check", "to": "false_branch", "from_port": "false"},
            ],
        },
    )

    assert result["status"] == "completed", f"Failed: {result.get('error_details')}"
    activities = {a["activity_id"]: a for a in result["activities"]}
    assert activities["check"]["status"] == "completed"
    assert activities["false_branch"]["status"] == "completed"
    if "true_branch" in activities:
        assert activities["true_branch"]["status"] != "completed", "True branch should not have run"


# ---------------------------------------------------------------------------
# Loop node
# ---------------------------------------------------------------------------


@pytest.mark.e2e
def test_loop_for_each():
    """A for_each loop iterates over items and executes the body for each."""
    result = _create_and_run_workflow(
        "e2e-loop-foreach",
        {
            "schema_version": "2.0.0",
            "triggers": [
                {"id": "trigger", "type": "manual_trigger", "config": {"inputs": {}}},
            ],
            "nodes": [
                {
                    "id": "loop",
                    "name": "Loop Over Items",
                    "type": "loop",
                    "config": {
                        "loop_type": "for_each",
                        "items": ["alpha", "bravo", "charlie"],
                    },
                },
                {
                    "id": "loop_body",
                    "name": "Loop Body",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "Processing item"'},
                },
            ],
            "edges": [
                {"from": "trigger", "to": "loop"},
                {"from": "loop", "to": "loop_body", "from_port": "iterate"},
                {"from": "loop_body", "to": "loop", "to_port": "iterate"},
            ],
        },
    )

    assert result["status"] == "completed", f"Failed: {result.get('error_details')}"
    activities = {a["activity_id"]: a["status"] for a in result["activities"]}
    assert activities["loop"] == "completed"
    assert activities["loop_body"] == "completed"


# ---------------------------------------------------------------------------
# Converge node (parallel paths)
# ---------------------------------------------------------------------------


@pytest.mark.e2e
def test_parallel_paths_with_converge():
    """Two parallel script nodes converge before a final node executes."""
    result = _create_and_run_workflow(
        "e2e-parallel-converge",
        {
            "schema_version": "2.0.0",
            "triggers": [
                {"id": "trigger", "type": "manual_trigger", "config": {"inputs": {}}},
            ],
            "nodes": [
                {
                    "id": "path_a",
                    "name": "Path A",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "Path A done"'},
                },
                {
                    "id": "path_b",
                    "name": "Path B",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "Path B done"'},
                },
                {
                    "id": "join",
                    "name": "Join Paths",
                    "type": "converge",
                    "config": {},
                },
                {
                    "id": "final_step",
                    "name": "Final Step",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "All paths completed"'},
                },
            ],
            "edges": [
                {"from": "trigger", "to": "path_a"},
                {"from": "trigger", "to": "path_b"},
                {"from": "path_a", "to": "join"},
                {"from": "path_b", "to": "join"},
                {"from": "join", "to": "final_step"},
            ],
        },
    )

    assert result["status"] == "completed", f"Failed: {result.get('error_details')}"
    activities = {a["activity_id"]: a["status"] for a in result["activities"]}
    assert activities["path_a"] == "completed"
    assert activities["path_b"] == "completed"
    assert activities["join"] == "completed"
    assert activities["final_step"] == "completed"


# ---------------------------------------------------------------------------
# Combined: script -> condition -> parallel -> converge
# ---------------------------------------------------------------------------


@pytest.mark.e2e
def test_multi_node_workflow():
    """A workflow combining script, condition, parallel paths, and converge."""
    result = _create_and_run_workflow(
        "e2e-multi-node",
        {
            "schema_version": "2.0.0",
            "triggers": [
                {"id": "trigger", "type": "manual_trigger", "config": {"inputs": {}}},
            ],
            "nodes": [
                {
                    "id": "setup",
                    "name": "Setup",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "setup done"'},
                },
                {
                    "id": "gate",
                    "name": "Gate",
                    "type": "condition",
                    "config": {"condition": "True"},
                },
                {
                    "id": "task_a",
                    "name": "Task A",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "task a"'},
                },
                {
                    "id": "task_b",
                    "name": "Task B",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "task b"'},
                },
                {
                    "id": "join",
                    "name": "Join",
                    "type": "converge",
                    "config": {},
                },
                {
                    "id": "finish",
                    "name": "Finish",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "done"'},
                },
            ],
            "edges": [
                {"from": "trigger", "to": "setup"},
                {"from": "setup", "to": "gate"},
                # condition true -> two parallel tasks
                {"from": "gate", "to": "task_a", "from_port": "true"},
                {"from": "gate", "to": "task_b", "from_port": "true"},
                {"from": "task_a", "to": "join"},
                {"from": "task_b", "to": "join"},
                {"from": "join", "to": "finish"},
            ],
        },
    )

    assert result["status"] == "completed", f"Failed: {result.get('error_details')}"
    activities = {a["activity_id"]: a["status"] for a in result["activities"]}
    assert activities["setup"] == "completed"
    assert activities["gate"] == "completed"
    assert activities["task_a"] == "completed"
    assert activities["task_b"] == "completed"
    assert activities["join"] == "completed"
    assert activities["finish"] == "completed"


# ---------------------------------------------------------------------------
# Cross-node combinations with agentic
# ---------------------------------------------------------------------------


@requires_openrouter
@pytest.mark.e2e
def test_script_then_agentic():
    """A script node feeds into an agentic node."""
    _ensure_mcp_provider()
    result = _create_and_run_workflow(
        "e2e-script-to-agentic",
        {
            "schema_version": "2.0.0",
            "triggers": [
                {"id": "trigger", "type": "manual_trigger", "config": {"inputs": {}}},
            ],
            "nodes": [
                {
                    "id": "prep",
                    "name": "Prep Data",
                    "type": "script",
                    "config": {
                        "language": "bash",
                        "code": 'echo "jimmy"',
                    },
                },
                {
                    "id": "agent",
                    "name": "Greet via Agent",
                    "type": "agentic",
                    "config": {
                        "prompt": (
                            "You MUST use the get_greeting tool to greet jimmy. "
                            "Do not answer without calling the tool first."
                        ),
                    },
                },
            ],
            "edges": [
                {"from": "trigger", "to": "prep"},
                {"from": "prep", "to": "agent"},
            ],
        },
        timeout=AGENTIC_POLL_TIMEOUT,
    )

    assert result["status"] == "completed", f"Failed: {result.get('error_details')}"
    activities = {a["activity_id"]: a["status"] for a in result["activities"]}
    assert activities["prep"] == "completed"
    assert activities["agent"] == "completed"


@requires_openrouter
@pytest.mark.e2e
def test_agentic_then_script():
    """An agentic node feeds into a script node."""
    _ensure_mcp_provider()
    result = _create_and_run_workflow(
        "e2e-agentic-to-script",
        {
            "schema_version": "2.0.0",
            "triggers": [
                {"id": "trigger", "type": "manual_trigger", "config": {"inputs": {}}},
            ],
            "nodes": [
                {
                    "id": "agent",
                    "name": "Agent Task",
                    "type": "agentic",
                    "config": {
                        "prompt": (
                            "You MUST use the get_greeting tool to greet jimmy. "
                            "Do not answer without calling the tool first."
                        ),
                    },
                },
                {
                    "id": "post_process",
                    "name": "Post Process",
                    "type": "script",
                    "config": {
                        "language": "bash",
                        "code": 'echo "Agent task finished, post-processing complete"',
                    },
                },
            ],
            "edges": [
                {"from": "trigger", "to": "agent"},
                {"from": "agent", "to": "post_process"},
            ],
        },
        timeout=AGENTIC_POLL_TIMEOUT,
    )

    assert result["status"] == "completed", f"Failed: {result.get('error_details')}"
    activities = {a["activity_id"]: a["status"] for a in result["activities"]}
    assert activities["agent"] == "completed"
    assert activities["post_process"] == "completed"


@requires_openrouter
@pytest.mark.e2e
def test_loop_with_agentic_body():
    """A loop iterates with an agentic node as the loop body."""
    _ensure_mcp_provider()
    result = _create_and_run_workflow(
        "e2e-loop-agentic",
        {
            "schema_version": "2.0.0",
            "triggers": [
                {"id": "trigger", "type": "manual_trigger", "config": {"inputs": {}}},
            ],
            "nodes": [
                {
                    "id": "loop",
                    "name": "Loop Over Names",
                    "type": "loop",
                    "config": {
                        "loop_type": "for_each",
                        "items": ["jimmy", "sarah"],
                    },
                },
                {
                    "id": "greet",
                    "name": "Greet Person",
                    "type": "agentic",
                    "config": {
                        "prompt": (
                            "You MUST use the get_greeting tool to greet someone. "
                            "Do not answer without calling the tool first."
                        ),
                    },
                },
            ],
            "edges": [
                {"from": "trigger", "to": "loop"},
                {"from": "loop", "to": "greet", "from_port": "iterate"},
                {"from": "greet", "to": "loop", "to_port": "iterate"},
            ],
        },
        timeout=AGENTIC_POLL_TIMEOUT,
    )

    assert result["status"] == "completed", f"Failed: {result.get('error_details')}"
    activities = {a["activity_id"]: a["status"] for a in result["activities"]}
    assert activities["loop"] == "completed"
    assert activities["greet"] == "completed"


@requires_openrouter
@pytest.mark.e2e
def test_http_request_then_agentic():
    """An HTTP request node feeds into an agentic node."""
    _ensure_mcp_provider()
    result = _create_and_run_workflow(
        "e2e-http-to-agentic",
        {
            "schema_version": "2.0.0",
            "triggers": [
                {"id": "trigger", "type": "manual_trigger", "config": {"inputs": {}}},
            ],
            "nodes": [
                {
                    "id": "fetch",
                    "name": "Fetch Health",
                    "type": "http_request",
                    "config": {
                        "method": "GET",
                        "url": "http://nexus:8000/health",
                    },
                },
                {
                    "id": "analyze",
                    "name": "Analyze Response",
                    "type": "agentic",
                    "config": {
                        "prompt": "Say 'Health check passed' in one sentence.",
                    },
                },
            ],
            "edges": [
                {"from": "trigger", "to": "fetch"},
                {"from": "fetch", "to": "analyze"},
            ],
        },
        timeout=AGENTIC_POLL_TIMEOUT,
    )

    assert result["status"] == "completed", f"Failed: {result.get('error_details')}"
    activities = {a["activity_id"]: a["status"] for a in result["activities"]}
    assert activities["fetch"] == "completed"
    assert activities["analyze"] == "completed"
