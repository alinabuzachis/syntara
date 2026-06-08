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

TERMINAL_STATUSES = {ExecutionStatus.COMPLETED, ExecutionStatus.FAILED, ExecutionStatus.CANCELLED}


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
        assert response.is_success, f"Failed to get execution {exec_id}"
        assert response.parsed is not None, f"Failed to get execution {exec_id}"
        execution: ExecutionRead = response.parsed
        if execution.status in TERMINAL_STATUSES:
            return execution
    pytest.fail(f"Execution {exec_id} did not finish within {timeout}s")


def create_and_run_workflow(
    api: NexusApiRegistry, name: str, definition: dict[str, Any], timeout: int = POLL_TIMEOUT
) -> ExecutionRead:
    """Create (or update) a workflow, execute it, and return the completed ExecutionRead."""
    list_response = _retry_api_call(lambda: api.workflows.list(additional_params={"name": name}))
    assert list_response.is_success, "Failed to list workflows"
    assert list_response.parsed is not None, "Failed to list workflows"
    existing = [w for w in list_response.parsed.resources if w.name == name]

    wf_def = WorkflowDefinition.from_dict(definition)

    if existing:
        wf_id = existing[0].id
        update_response = _retry_api_call(
            lambda: api.workflows.update(workflow_id=wf_id, body=WorkflowUpdate(workflow_definition=wf_def))
        )
        assert update_response.is_success, f"Failed to update workflow {name}"
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
        assert create_response.is_success, f"Failed to create workflow {name}"
        assert create_response.parsed is not None, f"Failed to create workflow {name}"
        wf_id = create_response.parsed.id

    exec_response = _retry_api_call(lambda: api.executions.create(body=ExecutionCreate(workflow_id=wf_id)))
    assert exec_response.is_success, f"Failed to start execution for {name}"
    assert exec_response.parsed is not None, f"Failed to start execution for {name}"
    return _poll_execution(api, str(exec_response.parsed.id), timeout=timeout)
