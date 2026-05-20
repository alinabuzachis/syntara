"""End-to-end tests for v2 workflow node types.

Tests script, http_request, condition, loop, converge, and switch nodes
using the full Nexus stack (API, Temporal worker, containers).

Run with:
    APP_BASE_URL=http://localhost:8000 make test-e2e
"""

import os
import time
from typing import Any
from uuid import UUID

import pytest
from nexus_api_client.api import NexusApiRegistry
from nexus_api_client.models import (
    ExecutionCreate,
    ExecutionRead,
    WorkflowCreate,
    WorkflowUpdate,
)
from nexus_api_client.models.execution_status import ExecutionStatus

POLL_INTERVAL = 1
POLL_TIMEOUT = 20
AGENTIC_POLL_TIMEOUT = 120

_TERMINAL_STATUSES = {ExecutionStatus.COMPLETED, ExecutionStatus.FAILED, ExecutionStatus.CANCELLED}

requires_openrouter = pytest.mark.skipif(
    not os.environ.get("E2E_LLM_CREDENTIAL_CONFIGURED"),
    reason="E2E_LLM_CREDENTIAL_CONFIGURED not set — full stack with LLM credential required",
)


def _poll_execution(api: NexusApiRegistry, exec_id: str, timeout: int = POLL_TIMEOUT) -> ExecutionRead:
    """Poll until execution reaches a terminal state, returning the final ExecutionRead."""
    elapsed = 0
    while elapsed < timeout:
        time.sleep(POLL_INTERVAL)
        elapsed += POLL_INTERVAL
        response = api.executions.get(execution_id=UUID(exec_id), include="activities")
        assert response.is_success, f"Failed to get execution {exec_id}"
        assert response.parsed is not None, f"Failed to get execution {exec_id}"
        execution: ExecutionRead = response.parsed
        if execution.status in _TERMINAL_STATUSES:
            return execution
    pytest.fail(f"Execution {exec_id} did not finish within {timeout}s")


def _create_and_run_workflow(
    api: NexusApiRegistry, name: str, definition: dict[str, Any], timeout: int = POLL_TIMEOUT
) -> ExecutionRead:
    """Create (or update) a workflow, execute it, and return the completed ExecutionRead."""
    list_response = api.workflows.list(additional_params={"name": name})
    assert list_response.is_success, "Failed to list workflows"
    assert list_response.parsed is not None, "Failed to list workflows"
    existing = [w for w in list_response.parsed.resources if w.name == name]

    if existing:
        wf_id = existing[0].id
        api.workflows.update(workflow_id=wf_id, body=WorkflowUpdate(workflow_definition=definition))
    else:
        create_response = api.workflows.create(
            body=WorkflowCreate(
                name=name,
                description=f"E2E test: {name}",
                is_enabled=True,
                workflow_definition=definition,
            )
        )
        assert create_response.is_success, f"Failed to create workflow {name}"
        assert create_response.parsed is not None, f"Failed to create workflow {name}"
        wf_id = create_response.parsed.id

    exec_response = api.executions.create(body=ExecutionCreate(workflow_id=wf_id))
    assert exec_response.is_success, f"Failed to start execution for {name}"
    assert exec_response.parsed is not None, f"Failed to start execution for {name}"
    return _poll_execution(api, str(exec_response.parsed.id), timeout=timeout)


# ---------------------------------------------------------------------------
# Script node
# ---------------------------------------------------------------------------


@pytest.mark.e2e
def test_script_node_bash(nexus_api: NexusApiRegistry):
    """A bash script node executes and the workflow completes."""
    result = _create_and_run_workflow(
        nexus_api,
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

    assert result.status == ExecutionStatus.COMPLETED, f"Failed: {result.error_details}"
    activities = {a.activity_id: a.status for a in (result.activities or [])}
    assert activities["trigger"] == "completed"
    assert activities["hello_script"] == "completed"


@pytest.mark.e2e
def test_script_node_python(nexus_api: NexusApiRegistry):
    """A python script node executes and the workflow completes."""
    result = _create_and_run_workflow(
        nexus_api,
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

    assert result.status == ExecutionStatus.COMPLETED, f"Failed: {result.error_details}"
    activities = {a.activity_id: a.status for a in (result.activities or [])}
    assert activities["py_script"] == "completed"


# ---------------------------------------------------------------------------
# HTTP request node
# ---------------------------------------------------------------------------


@pytest.mark.e2e
def test_http_request_node(nexus_api: NexusApiRegistry, worker_base_url: str):
    """An HTTP request node calls an endpoint and the workflow completes."""
    result = _create_and_run_workflow(
        nexus_api,
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
                        "url": f"{worker_base_url}/health",
                    },
                },
            ],
            "edges": [{"from": "trigger", "to": "health_check"}],
        },
    )

    assert result.status == ExecutionStatus.COMPLETED, f"Failed: {result.error_details}"
    activities = {a.activity_id: a.status for a in (result.activities or [])}
    assert activities["health_check"] == "completed"


# ---------------------------------------------------------------------------
# Condition node
# ---------------------------------------------------------------------------


@pytest.mark.e2e
def test_condition_true_branch(nexus_api: NexusApiRegistry):
    """A condition that evaluates to true routes to the true branch only."""
    result = _create_and_run_workflow(
        nexus_api,
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

    assert result.status == ExecutionStatus.COMPLETED, f"Failed: {result.error_details}"
    activities = {a.activity_id: a for a in (result.activities or [])}
    assert activities["check"].status == "completed"
    assert activities["true_branch"].status == "completed"
    if "false_branch" in activities:
        assert activities["false_branch"].status != "completed", "False branch should not have run"


@pytest.mark.e2e
def test_condition_false_branch(nexus_api: NexusApiRegistry):
    """A condition that evaluates to false routes to the false branch only."""
    result = _create_and_run_workflow(
        nexus_api,
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

    assert result.status == ExecutionStatus.COMPLETED, f"Failed: {result.error_details}"
    activities = {a.activity_id: a for a in (result.activities or [])}
    assert activities["check"].status == "completed"
    assert activities["false_branch"].status == "completed"
    if "true_branch" in activities:
        assert activities["true_branch"].status != "completed", "True branch should not have run"


# ---------------------------------------------------------------------------
# Loop node
# ---------------------------------------------------------------------------


@pytest.mark.e2e
def test_loop_for_each(nexus_api: NexusApiRegistry):
    """A for_each loop iterates over items and executes the body for each."""
    result = _create_and_run_workflow(
        nexus_api,
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

    assert result.status == ExecutionStatus.COMPLETED, f"Failed: {result.error_details}"
    activities = {a.activity_id: a.status for a in (result.activities or [])}
    assert activities["loop"] == "completed"
    assert activities["loop_body"] == "completed"


# ---------------------------------------------------------------------------
# Converge node (parallel paths)
# ---------------------------------------------------------------------------


@pytest.mark.e2e
def test_parallel_paths_with_converge(nexus_api: NexusApiRegistry):
    """Two parallel script nodes converge before a final node executes."""
    result = _create_and_run_workflow(
        nexus_api,
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

    assert result.status == ExecutionStatus.COMPLETED, f"Failed: {result.error_details}"
    activities = {a.activity_id: a.status for a in (result.activities or [])}
    assert activities["path_a"] == "completed"
    assert activities["path_b"] == "completed"
    assert activities["join"] == "completed"
    assert activities["final_step"] == "completed"


# ---------------------------------------------------------------------------
# Combined: script -> condition -> parallel -> converge
# ---------------------------------------------------------------------------


@pytest.mark.e2e
def test_multi_node_workflow(nexus_api: NexusApiRegistry):
    """A workflow combining script, condition, parallel paths, and converge."""
    result = _create_and_run_workflow(
        nexus_api,
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

    assert result.status == ExecutionStatus.COMPLETED, f"Failed: {result.error_details}"
    activities = {a.activity_id: a.status for a in (result.activities or [])}
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
def test_script_then_agentic(nexus_api: NexusApiRegistry, mcp_provider_id: str):
    """A script node feeds into an agentic node."""
    result = _create_and_run_workflow(
        nexus_api,
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

    assert result.status == ExecutionStatus.COMPLETED, f"Failed: {result.error_details}"
    activities = {a.activity_id: a.status for a in (result.activities or [])}
    assert activities["prep"] == "completed"
    assert activities["agent"] == "completed"


@requires_openrouter
@pytest.mark.e2e
def test_agentic_then_script(nexus_api: NexusApiRegistry, mcp_provider_id: str):
    """An agentic node feeds into a script node."""
    result = _create_and_run_workflow(
        nexus_api,
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

    assert result.status == ExecutionStatus.COMPLETED, f"Failed: {result.error_details}"
    activities = {a.activity_id: a.status for a in (result.activities or [])}
    assert activities["agent"] == "completed"
    assert activities["post_process"] == "completed"


@requires_openrouter
@pytest.mark.e2e
def test_loop_with_agentic_body(nexus_api: NexusApiRegistry, mcp_provider_id: str):
    """A loop iterates with an agentic node as the loop body."""
    result = _create_and_run_workflow(
        nexus_api,
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

    assert result.status == ExecutionStatus.COMPLETED, f"Failed: {result.error_details}"
    activities = {a.activity_id: a.status for a in (result.activities or [])}
    assert activities["loop"] == "completed"
    assert activities["greet"] == "completed"


@requires_openrouter
@pytest.mark.e2e
def test_http_request_then_agentic(nexus_api: NexusApiRegistry, worker_base_url: str, mcp_provider_id: str):
    """An HTTP request node feeds into an agentic node."""
    result = _create_and_run_workflow(
        nexus_api,
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
                        "url": f"{worker_base_url}/health",
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

    assert result.status == ExecutionStatus.COMPLETED, f"Failed: {result.error_details}"
    activities = {a.activity_id: a.status for a in (result.activities or [])}
    assert activities["fetch"] == "completed"
    assert activities["analyze"] == "completed"


# ---------------------------------------------------------------------------
# Switch node
# ---------------------------------------------------------------------------


def _switch_workflow_definition(cases: list[dict[str, str]], default_port: str = "default") -> dict[str, Any]:
    """Build a switch workflow definition with downstream script nodes per case + default."""
    nodes: list[dict[str, Any]] = [
        {
            "id": "sw",
            "name": "Switch Router",
            "type": "switch",
            "config": {"cases": cases, "default_port": default_port},
        },
    ]
    edges: list[dict[str, Any]] = [{"from": "trigger", "to": "sw"}]

    for case in cases:
        port = case["port"]
        node_id = f"action_{port}"
        nodes.append(
            {
                "id": node_id,
                "name": f"Action {port}",
                "type": "script",
                "config": {"language": "bash", "code": f'echo "{port} executed"'},
            }
        )
        edges.append({"from": "sw", "to": node_id, "from_port": port})

    nodes.append(
        {
            "id": "action_default",
            "name": "Default Action",
            "type": "script",
            "config": {"language": "bash", "code": 'echo "default executed"'},
        }
    )
    edges.append({"from": "sw", "to": "action_default", "from_port": default_port})

    return {
        "schema_version": "2.0.0",
        "triggers": [{"id": "trigger", "type": "manual_trigger", "config": {"inputs": {}}}],
        "nodes": nodes,
        "edges": edges,
    }


@pytest.mark.e2e
def test_switch_first_case_matches(nexus_api: NexusApiRegistry):
    """Switch routes to first matching case, other cases and default are skipped."""
    result = _create_and_run_workflow(
        nexus_api,
        "e2e-switch-first-case",
        _switch_workflow_definition(
            [
                {"port": "case_0", "label": "Always True", "condition": "1 == 1"},
                {"port": "case_1", "label": "Also True", "condition": "2 == 2"},
            ]
        ),
    )

    assert result.status == ExecutionStatus.COMPLETED, f"Failed: {result.error_details}"
    activities = {a.activity_id: a for a in (result.activities or [])}
    assert activities["sw"].status == "completed"
    assert activities["action_case_0"].status == "completed"
    assert activities["action_case_1"].status == "skipped"
    assert activities["action_default"].status == "skipped"

    # Verify switch node output contains matched port
    sw_output = activities["sw"].output_data
    if sw_output is not None:
        output_dict = sw_output if isinstance(sw_output, dict) else getattr(sw_output, "additional_properties", {})
        assert output_dict.get("matched_port") == "case_0"


@pytest.mark.e2e
def test_switch_second_case_matches(nexus_api: NexusApiRegistry):
    """Switch skips first case (false), routes to second case (true)."""
    result = _create_and_run_workflow(
        nexus_api,
        "e2e-switch-second-case",
        _switch_workflow_definition(
            [
                {"port": "case_0", "label": "False", "condition": "1 == 0"},
                {"port": "case_1", "label": "True", "condition": "1 == 1"},
            ]
        ),
    )

    assert result.status == ExecutionStatus.COMPLETED, f"Failed: {result.error_details}"
    activities = {a.activity_id: a for a in (result.activities or [])}
    assert activities["sw"].status == "completed"
    assert activities["action_case_1"].status == "completed"
    assert activities["action_case_0"].status == "skipped"
    assert activities["action_default"].status == "skipped"


@pytest.mark.e2e
def test_switch_default_fallback(nexus_api: NexusApiRegistry):
    """Switch routes to default when no case matches."""
    result = _create_and_run_workflow(
        nexus_api,
        "e2e-switch-default",
        _switch_workflow_definition(
            [
                {"port": "case_0", "label": "False", "condition": "1 == 0"},
                {"port": "case_1", "label": "Also False", "condition": "2 == 0"},
            ]
        ),
    )

    assert result.status == ExecutionStatus.COMPLETED, f"Failed: {result.error_details}"
    activities = {a.activity_id: a for a in (result.activities or [])}
    assert activities["sw"].status == "completed"
    assert activities["action_default"].status == "completed"
    assert activities["action_case_0"].status == "skipped"
    assert activities["action_case_1"].status == "skipped"


@pytest.mark.e2e
def test_switch_3_case_routing(nexus_api: NexusApiRegistry):
    """Switch with 3 cases routes to the first matching case; later cases and default are skipped."""
    result = _create_and_run_workflow(
        nexus_api,
        "e2e-switch-3-case",
        _switch_workflow_definition(
            [
                {"port": "case_0", "label": "False A", "condition": "1 == 0"},
                {"port": "case_1", "label": "True B", "condition": "1 == 1"},
                {"port": "case_2", "label": "Also True C", "condition": "2 == 2"},
            ]
        ),
    )

    assert result.status == ExecutionStatus.COMPLETED, f"Failed: {result.error_details}"
    activities = {a.activity_id: a for a in (result.activities or [])}
    assert activities["sw"].status == "completed"
    assert activities["action_case_1"].status == "completed"
    assert activities["action_case_0"].status == "skipped"
    assert activities["action_case_2"].status == "skipped"
    assert activities["action_default"].status == "skipped"


@pytest.mark.e2e
def test_switch_single_case_with_default(nexus_api: NexusApiRegistry):
    """Switch with one case + default works correctly."""
    result = _create_and_run_workflow(
        nexus_api,
        "e2e-switch-single-case",
        _switch_workflow_definition(
            [
                {"port": "case_0", "label": "Only Case", "condition": "1 == 1"},
            ]
        ),
    )

    assert result.status == ExecutionStatus.COMPLETED, f"Failed: {result.error_details}"
    activities = {a.activity_id: a for a in (result.activities or [])}
    assert activities["sw"].status == "completed"
    assert activities["action_case_0"].status == "completed"
    assert activities["action_default"].status == "skipped"


@pytest.mark.e2e
def test_switch_numeric_comparison(nexus_api: NexusApiRegistry):
    """Switch evaluates numeric comparison operators correctly."""
    result = _create_and_run_workflow(
        nexus_api,
        "e2e-switch-numeric",
        _switch_workflow_definition(
            [
                {"port": "case_0", "label": "Greater", "condition": "10 > 5"},
                {"port": "case_1", "label": "Less", "condition": "10 < 5"},
            ]
        ),
    )

    assert result.status == ExecutionStatus.COMPLETED, f"Failed: {result.error_details}"
    activities = {a.activity_id: a for a in (result.activities or [])}
    assert activities["action_case_0"].status == "completed"
    assert activities["action_case_1"].status == "skipped"
    assert activities["action_default"].status == "skipped"


@pytest.mark.e2e
def test_switch_negation(nexus_api: NexusApiRegistry):
    """Switch evaluates not() expressions correctly."""
    result = _create_and_run_workflow(
        nexus_api,
        "e2e-switch-negation",
        _switch_workflow_definition(
            [
                {"port": "case_0", "label": "Not False", "condition": "not False"},
            ]
        ),
    )

    assert result.status == ExecutionStatus.COMPLETED, f"Failed: {result.error_details}"
    activities = {a.activity_id: a for a in (result.activities or [])}
    assert activities["action_case_0"].status == "completed"
    assert activities["action_default"].status == "skipped"


@pytest.mark.e2e
def test_switch_skipped_branches_have_activity_records(nexus_api: NexusApiRegistry):
    """Skipped branches have ActivityExecution records with correct status and null timing."""
    result = _create_and_run_workflow(
        nexus_api,
        "e2e-switch-skipped",
        _switch_workflow_definition(
            [
                {"port": "case_0", "label": "True", "condition": "1 == 1"},
                {"port": "case_1", "label": "False", "condition": "1 == 0"},
                {"port": "case_2", "label": "Also False", "condition": "2 == 0"},
            ]
        ),
    )

    assert result.status == ExecutionStatus.COMPLETED, f"Failed: {result.error_details}"
    activities = {a.activity_id: a for a in (result.activities or [])}

    # Taken branch has completed status and timing data
    assert activities["action_case_0"].status == "completed"
    assert activities["action_case_0"].started_at is not None
    assert activities["action_case_0"].completed_at is not None

    # Skipped branches have records with skipped status and were never started
    for skipped_id in ("action_case_1", "action_case_2", "action_default"):
        assert activities[skipped_id].status == "skipped"
        assert activities[skipped_id].started_at is None


@pytest.mark.e2e
def test_switch_in_operator(nexus_api: NexusApiRegistry):
    """Switch evaluates 'in' operator correctly."""
    result = _create_and_run_workflow(
        nexus_api,
        "e2e-switch-in-operator",
        _switch_workflow_definition(
            [
                {"port": "case_0", "label": "Contains a", "condition": "'a' in 'abc'"},
                {"port": "case_1", "label": "Contains z", "condition": "'z' in 'abc'"},
            ]
        ),
    )

    assert result.status == ExecutionStatus.COMPLETED, f"Failed: {result.error_details}"
    activities = {a.activity_id: a for a in (result.activities or [])}
    assert activities["action_case_0"].status == "completed"
    assert activities["action_case_1"].status == "skipped"
    assert activities["action_default"].status == "skipped"


@pytest.mark.e2e
def test_switch_empty_cases_fails(nexus_api: NexusApiRegistry):
    """Switch with empty cases array fails the workflow."""
    result = _create_and_run_workflow(
        nexus_api,
        "e2e-switch-empty-cases",
        {
            "schema_version": "2.0.0",
            "triggers": [
                {"id": "trigger", "type": "manual_trigger", "config": {"inputs": {}}},
            ],
            "nodes": [
                {
                    "id": "sw",
                    "name": "Empty Switch",
                    "type": "switch",
                    "config": {"cases": [], "default_port": "default"},
                },
                {
                    "id": "action_default",
                    "name": "Default",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "should not run"'},
                },
            ],
            "edges": [
                {"from": "trigger", "to": "sw"},
                {"from": "sw", "to": "action_default", "from_port": "default"},
            ],
        },
    )

    assert result.status == ExecutionStatus.FAILED, f"Expected failure but got: {result.status}"
    assert result.error_details is not None, "Expected error details on failure"
    assert "cases" in result.error_details.lower(), f"Expected 'cases' in error: {result.error_details}"
    activities = {a.activity_id: a for a in (result.activities or [])}
    if "action_default" in activities:
        assert activities["action_default"].status != "completed", "Default should not run with empty cases"


@pytest.mark.e2e
def test_switch_after_script_node(nexus_api: NexusApiRegistry):
    """Switch reads upstream node output via namespace injection."""
    result = _create_and_run_workflow(
        nexus_api,
        "e2e-switch-after-script",
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
                    "config": {
                        "language": "python",
                        "code": 'import json; print(json.dumps({"priority": "high"}))',
                    },
                },
                {
                    "id": "sw",
                    "name": "Route by Priority",
                    "type": "switch",
                    "config": {
                        "cases": [
                            {"port": "case_0", "label": "High", "condition": "${setup.stdout_json.priority} == 'high'"},
                            {"port": "case_1", "label": "Low", "condition": "${setup.stdout_json.priority} == 'low'"},
                        ],
                        "default_port": "default",
                    },
                },
                {
                    "id": "action_high",
                    "name": "High Priority",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "high priority"'},
                },
                {
                    "id": "action_low",
                    "name": "Low Priority",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "low priority"'},
                },
                {
                    "id": "action_default",
                    "name": "Default",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "default"'},
                },
            ],
            "edges": [
                {"from": "trigger", "to": "setup"},
                {"from": "setup", "to": "sw"},
                {"from": "sw", "to": "action_high", "from_port": "case_0"},
                {"from": "sw", "to": "action_low", "from_port": "case_1"},
                {"from": "sw", "to": "action_default", "from_port": "default"},
            ],
        },
    )

    assert result.status == ExecutionStatus.COMPLETED, f"Failed: {result.error_details}"
    activities = {a.activity_id: a for a in (result.activities or [])}
    assert activities["setup"].status == "completed"
    assert activities["sw"].status == "completed"
    assert activities["action_high"].status == "completed"
    assert activities["action_low"].status == "skipped"
    assert activities["action_default"].status == "skipped"
