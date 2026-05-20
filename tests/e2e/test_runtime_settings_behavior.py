"""E2E tests: runtime settings affect workflow execution behavior.

Verifies that changing a setting via the Settings API changes actual
workflow behavior without restart. Requires the full stack (API,
Temporal worker, containers).

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

if not os.environ.get("APP_BASE_URL"):
    pytest.skip("APP_BASE_URL not set — full stack required", allow_module_level=True)

from nexus_api_client import AuthenticatedClient

POLL_INTERVAL = 1
POLL_TIMEOUT = 30

_TERMINAL = {ExecutionStatus.COMPLETED, ExecutionStatus.FAILED, ExecutionStatus.CANCELLED}


def _poll(api: NexusApiRegistry, exec_id: str, timeout: int = POLL_TIMEOUT) -> ExecutionRead:
    elapsed = 0
    while elapsed < timeout:
        time.sleep(POLL_INTERVAL)
        elapsed += POLL_INTERVAL
        resp = api.executions.get(execution_id=UUID(exec_id), include="activities")
        assert resp.is_success
        assert resp.parsed is not None
        execution: ExecutionRead = resp.parsed
        if execution.status in _TERMINAL:
            return execution
    pytest.fail(f"Execution {exec_id} did not finish within {timeout}s")


def _run_workflow(
    api: NexusApiRegistry, name: str, definition: dict[str, Any], timeout: int = POLL_TIMEOUT
) -> ExecutionRead:
    list_resp = api.workflows.list(additional_params={"name": name})
    assert list_resp.is_success
    assert list_resp.parsed is not None
    existing = [w for w in list_resp.parsed.resources if w.name == name]

    if existing:
        wf_id = existing[0].id
        api.workflows.update(workflow_id=wf_id, body=WorkflowUpdate(workflow_definition=definition))
    else:
        create = api.workflows.create(
            body=WorkflowCreate(name=name, description=f"E2E: {name}", workflow_definition=definition)
        )
        assert create.is_success
        assert create.parsed is not None
        wf_id = create.parsed.id

    exec_resp = api.executions.create(body=ExecutionCreate(workflow_id=wf_id))
    assert exec_resp.is_success
    assert exec_resp.parsed is not None
    return _poll(api, str(exec_resp.parsed.id), timeout=timeout)


def _patch_setting(client: Any, key: str, *, value: int | bool) -> dict[str, Any]:  # noqa: ANN401
    resp = client.patch(f"/settings/{key}", json={"value": value})
    assert resp.status_code == 200
    return resp.json()  # type: ignore[no-any-return]


# ---------------------------------------------------------------------------
# script_timeout_seconds — verify timeout actually kills a slow script
# ---------------------------------------------------------------------------


@pytest.mark.e2e
def test_script_timeout_setting_affects_execution(
    nexus_api: NexusApiRegistry,
    nexus_client: AuthenticatedClient,
) -> None:
    """Changing script_timeout_seconds causes a slow script to time out."""
    client = nexus_client.get_httpx_client()
    key = "workflow_engine.script_timeout_seconds"
    original = client.get(f"/settings/{key}").json()

    try:
        # Set timeout to 2 seconds
        _patch_setting(client, key, value=2)

        # Run a script that sleeps for 10 seconds — should be killed by timeout
        result = _run_workflow(
            nexus_api,
            "e2e-settings-script-timeout",
            {
                "schema_version": "2.0.0",
                "triggers": [{"id": "trigger", "type": "manual_trigger", "config": {"inputs": {}}}],
                "nodes": [
                    {
                        "id": "slow_script",
                        "name": "Slow Script",
                        "type": "script",
                        "config": {"language": "bash", "code": "sleep 10 && echo done"},
                    }
                ],
                "edges": [{"from": "trigger", "to": "slow_script"}],
            },
        )

        assert result.status == ExecutionStatus.FAILED, f"Expected FAILED (timeout), got {result.status}"
    finally:
        _patch_setting(client, key, value=original["effective_value"])


# ---------------------------------------------------------------------------
# max_loop_iterations — verify loop stops at the configured limit
# ---------------------------------------------------------------------------


@pytest.mark.e2e
def test_max_loop_iterations_setting_affects_execution(
    nexus_api: NexusApiRegistry,
    nexus_client: AuthenticatedClient,
) -> None:
    """Changing max_loop_iterations limits how many times a while loop runs."""
    client = nexus_client.get_httpx_client()
    key = "workflow_engine.max_loop_iterations"
    original = client.get(f"/settings/{key}").json()

    try:
        # Set max iterations to 3
        _patch_setting(client, key, value=3)

        # Run a do_while loop with always-true condition (no max_iterations in config)
        result = _run_workflow(
            nexus_api,
            "e2e-settings-max-loop",
            {
                "schema_version": "2.0.0",
                "triggers": [{"id": "trigger", "type": "manual_trigger", "config": {"inputs": {}}}],
                "nodes": [
                    {
                        "id": "loop",
                        "name": "Loop",
                        "type": "loop",
                        "config": {
                            "loop_type": "do_while",
                            "condition": "1 == 1",
                        },
                    },
                    {
                        "id": "body",
                        "name": "Body",
                        "type": "script",
                        "config": {"language": "bash", "code": "echo iteration"},
                    },
                ],
                "edges": [
                    {"from": "trigger", "to": "loop"},
                    {"from": "loop", "to": "body", "from_port": "iterate"},
                    {"from": "body", "to": "loop", "to_port": "iterate"},
                ],
            },
        )

        # Should complete (loop hit max and stopped), not fail
        assert result.status == ExecutionStatus.COMPLETED, (
            f"Expected COMPLETED, got {result.status}: {result.error_details}"
        )
    finally:
        _patch_setting(client, key, value=original["effective_value"])
