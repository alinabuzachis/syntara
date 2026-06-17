"""Shared utility functions for E2E tests."""

import time
from typing import Any
from uuid import UUID

import httpx
import pytest
from nexus_api_client.api import NexusApiRegistry
from nexus_api_client.models import (
    ExecutionCreate,
    ExecutionRead,
    WorkflowCreate,
    WorkflowUpdate,
)
from nexus_api_client.models.execution_status import ExecutionStatus
from nexus_api_client.models.workflow_definition import WorkflowDefinition

POLL_INTERVAL = 1
POLL_TIMEOUT = 20
API_RETRIES = 3
API_RETRY_DELAY = 2

TERMINAL_STATUSES = {
    ExecutionStatus.COMPLETED,
    ExecutionStatus.COMPLETED_WITH_ERRORS,
    ExecutionStatus.FAILED,
    ExecutionStatus.CANCELLED,
}


def _retry_api_call(fn, *, retries: int = API_RETRIES, delay: float = API_RETRY_DELAY):  # noqa: ANN202
    """Retry an API call on transient failures (connection errors, server disconnects, 500s)."""
    last_exc = None
    for attempt in range(retries):
        try:
            result = fn()
        except (httpx.RemoteProtocolError, httpx.ConnectError, httpx.ReadError) as exc:
            last_exc = exc
            if attempt < retries - 1:
                time.sleep(delay)
                continue
            raise
        if hasattr(result, "status_code") and result.status_code >= 500 and attempt < retries - 1:
            time.sleep(delay)
            continue
        return result
    raise last_exc  # type: ignore[misc]


def _poll_execution(api: NexusApiRegistry, exec_id: str, timeout: int = POLL_TIMEOUT) -> ExecutionRead:
    """Poll until execution reaches a terminal state, returning the final ExecutionRead."""
    elapsed = 0
    while elapsed < timeout:
        time.sleep(POLL_INTERVAL)
        elapsed += POLL_INTERVAL
        response = _retry_api_call(lambda: api.executions.get(execution_id=UUID(exec_id), include="activities"))
        execution: ExecutionRead = response.assert_and_get()
        if execution.status in TERMINAL_STATUSES:
            return execution
    pytest.fail(f"Execution {exec_id} did not finish within {timeout}s")


def create_and_run_workflow(
    api: NexusApiRegistry, name: str, definition: dict[str, Any], timeout: int = POLL_TIMEOUT
) -> ExecutionRead:
    """Create (or update) a workflow, execute it, and return the completed ExecutionRead."""
    list_response = _retry_api_call(lambda: api.workflows.list(additional_params={"name": name}))
    workflows_list = list_response.assert_and_get()
    existing = [w for w in workflows_list.resources if w.name == name]

    wf_def = WorkflowDefinition.from_dict(definition)

    if existing:
        wf_id = existing[0].id
        update_response = _retry_api_call(
            lambda: api.workflows.update(workflow_id=wf_id, body=WorkflowUpdate(workflow_definition=wf_def))
        )
        update_response.assert_and_get()
    else:
        create_response = _retry_api_call(
            lambda: api.workflows.create(
                body=WorkflowCreate(
                    name=name,
                    description=f"E2E test: {name}",
                    workflow_definition=wf_def,
                )
            )
        )
        workflow = create_response.assert_and_get()
        wf_id = workflow.id

    exec_response = _retry_api_call(lambda: api.executions.create(body=ExecutionCreate(workflow_id=wf_id)))
    execution = exec_response.assert_and_get()
    return _poll_execution(api, str(execution.id), timeout=timeout)
