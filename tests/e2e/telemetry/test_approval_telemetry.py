"""E2E tests: HitL approval telemetry events.

Validates that approval_requested and approval_decided Segment events
are emitted when approvals are created and decided through the API,
using a real workflow execution with an approval node.

Requirements: AAP-72358, AAP-72359

Run with:
    make test-e2e-telemetry
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import httpx
import pytest
from nexus_api_client.models.workflow_create import WorkflowCreate

from tests.e2e.telemetry.conftest import get_captured_events, new_request_id

if TYPE_CHECKING:
    from nexus_api_client import AuthenticatedClient
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.e2e

WORKFLOW_NAME = "e2e-approval-telemetry"
APPROVAL_NODE_ID = "approval_step"


def _create_approval_workflow(nexus_api: NexusApiRegistry) -> str:
    """Create (or reuse) a workflow containing an approval node.

    Returns the workflow ID.
    """
    existing = nexus_api.workflows.list(
        additional_params={"name": WORKFLOW_NAME},
    ).assert_and_get()

    matched = [w for w in existing.resources if w.name == WORKFLOW_NAME]
    if matched:
        return str(matched[0].id)

    data = nexus_api.workflows.create(
        body=WorkflowCreate(
            name=WORKFLOW_NAME,
            description="E2E approval telemetry test workflow",
            is_enabled=True,
            workflow_definition={
                "schema_version": "2.0.0",
                "triggers": [
                    {"id": "trigger", "type": "manual_trigger", "config": {"inputs": {}}},
                ],
                "nodes": [
                    {
                        "id": APPROVAL_NODE_ID,
                        "name": "Approval Step",
                        "type": "approval",
                        "config": {
                            "description": "E2E telemetry approval test",
                            "timeout": 300,
                        },
                    },
                ],
                "edges": [{"from": "trigger", "to": APPROVAL_NODE_ID}],
            },
        ),
    ).assert_and_get()
    return str(data.id)


def _start_execution(
    nexus_base_url: str,
    auth_headers: dict[str, str],
    workflow_id: str,
) -> str:
    """Start a workflow execution and return the execution ID.

    The execution record is created synchronously by the API, so it is
    available for approval creation immediately after this call returns.
    """
    r = httpx.post(
        f"{nexus_base_url}/api/v1/executions",
        json={"workflow_id": workflow_id},
        headers={**auth_headers, "Content-Type": "application/json"},
        timeout=10,
    )
    r.raise_for_status()
    exec_id: str = r.json()["id"]
    return exec_id


def _create_approval(
    nexus_client: AuthenticatedClient,
    execution_id: str,
    *,
    request_id: str | None = None,
) -> dict[str, Any]:
    """Create an approval request via POST /approvals with X-Request-Id."""
    client = nexus_client.get_httpx_client()
    headers: dict[str, str] = {}
    if request_id:
        headers["X-Request-Id"] = request_id

    resp = client.post(
        "/approvals",
        json={
            "execution_id": execution_id,
            "approval_node_id": APPROVAL_NODE_ID,
            "name": "E2E Approval Telemetry Test",
            "workflow_context": {
                "workflow_version_id": execution_id,
                "workflow_name": WORKFLOW_NAME,
                "inputs": {},
            },
        },
        headers=headers,
    )
    resp.raise_for_status()
    result: dict[str, Any] = resp.json()
    return result


def _decide_approval(
    nexus_client: AuthenticatedClient,
    approval_id: str,
    decision: str = "approved",
    *,
    request_id: str | None = None,
) -> dict[str, Any]:
    """Decide an approval via PATCH /approvals/{id} with X-Request-Id."""
    client = nexus_client.get_httpx_client()
    headers: dict[str, str] = {}
    if request_id:
        headers["X-Request-Id"] = request_id

    resp = client.patch(
        f"/approvals/{approval_id}",
        json={"status": decision},
        headers=headers,
    )
    resp.raise_for_status()
    result: dict[str, Any] = resp.json()
    return result


@pytest.fixture(scope="module")
def workflow_id(nexus_api: NexusApiRegistry) -> str:
    """Create or reuse the approval telemetry workflow."""
    return _create_approval_workflow(nexus_api)


class TestApprovalRequestedTelemetry:
    """Verify approval_requested telemetry event on creation (AAP-72358)."""

    def test_approval_requested_event_emitted(
        self,
        nexus_client: AuthenticatedClient,
        segment_server_url: str,
        nexus_base_url: str,
        auth_headers: dict[str, str],
        workflow_id: str,
    ) -> None:
        """Creating an approval request must emit an approval_requested event."""
        exec_id = _start_execution(nexus_base_url, auth_headers, workflow_id)
        rid = new_request_id()
        _create_approval(nexus_client, exec_id, request_id=rid)

        events = get_captured_events(
            segment_server_url,
            event_type="approval_requested",
            request_id=rid,
        )
        assert len(events) == 1, "Expected exactly one approval_requested event"

    def test_approval_requested_event_fields(
        self,
        nexus_client: AuthenticatedClient,
        segment_server_url: str,
        nexus_base_url: str,
        auth_headers: dict[str, str],
        workflow_id: str,
    ) -> None:
        """approval_requested event must include required fields."""
        exec_id = _start_execution(nexus_base_url, auth_headers, workflow_id)
        rid = new_request_id()
        _create_approval(nexus_client, exec_id, request_id=rid)

        events = get_captured_events(
            segment_server_url,
            event_type="approval_requested",
            request_id=rid,
        )
        assert len(events) == 1
        props = events[0].get("properties", {})

        assert "workflow_execution_id" in props
        assert props["workflow_execution_id"] == exec_id
        assert props["approval_node_id"] == APPROVAL_NODE_ID
        assert "entitlement_id" in props
        assert "request_id" in props

    def test_approval_requested_carries_request_id(
        self,
        nexus_client: AuthenticatedClient,
        segment_server_url: str,
        nexus_base_url: str,
        auth_headers: dict[str, str],
        workflow_id: str,
    ) -> None:
        """approval_requested event must carry the originating X-Request-Id."""
        exec_id = _start_execution(nexus_base_url, auth_headers, workflow_id)
        rid = new_request_id()
        _create_approval(nexus_client, exec_id, request_id=rid)

        events = get_captured_events(
            segment_server_url,
            event_type="approval_requested",
            request_id=rid,
        )
        assert len(events) == 1
        assert events[0]["properties"]["request_id"] == rid


class TestApprovalDecidedTelemetry:
    """Verify approval_decided telemetry event on decision (AAP-72359)."""

    def test_approval_decided_event_emitted(
        self,
        nexus_client: AuthenticatedClient,
        segment_server_url: str,
        nexus_base_url: str,
        auth_headers: dict[str, str],
        workflow_id: str,
    ) -> None:
        """Deciding an approval must emit an approval_decided event."""
        exec_id = _start_execution(nexus_base_url, auth_headers, workflow_id)
        approval = _create_approval(nexus_client, exec_id)
        rid = new_request_id()
        _decide_approval(nexus_client, approval["id"], request_id=rid)

        events = get_captured_events(
            segment_server_url,
            event_type="approval_decided",
            request_id=rid,
        )
        assert len(events) == 1, "Expected exactly one approval_decided event"

    def test_approval_decided_event_fields(
        self,
        nexus_client: AuthenticatedClient,
        segment_server_url: str,
        nexus_base_url: str,
        auth_headers: dict[str, str],
        workflow_id: str,
    ) -> None:
        """approval_decided event must include required fields."""
        exec_id = _start_execution(nexus_base_url, auth_headers, workflow_id)
        approval = _create_approval(nexus_client, exec_id)
        rid = new_request_id()
        _decide_approval(nexus_client, approval["id"], decision="rejected", request_id=rid)

        events = get_captured_events(
            segment_server_url,
            event_type="approval_decided",
            request_id=rid,
        )
        assert len(events) == 1
        props = events[0].get("properties", {})

        assert props["workflow_execution_id"] == exec_id
        assert props["decision"] == "rejected"
        assert "wait_time_ms" in props
        assert props["wait_time_ms"] >= 0
        assert "entitlement_id" in props
        assert "request_id" in props

    def test_approval_decided_approved_decision(
        self,
        nexus_client: AuthenticatedClient,
        segment_server_url: str,
        nexus_base_url: str,
        auth_headers: dict[str, str],
        workflow_id: str,
    ) -> None:
        """An approved decision must set decision='approved'."""
        exec_id = _start_execution(nexus_base_url, auth_headers, workflow_id)
        approval = _create_approval(nexus_client, exec_id)
        rid = new_request_id()
        _decide_approval(nexus_client, approval["id"], decision="approved", request_id=rid)

        events = get_captured_events(
            segment_server_url,
            event_type="approval_decided",
            request_id=rid,
        )
        assert len(events) == 1
        assert events[0]["properties"]["decision"] == "approved"

    def test_approval_decided_carries_request_id(
        self,
        nexus_client: AuthenticatedClient,
        segment_server_url: str,
        nexus_base_url: str,
        auth_headers: dict[str, str],
        workflow_id: str,
    ) -> None:
        """approval_decided event must carry the originating X-Request-Id."""
        exec_id = _start_execution(nexus_base_url, auth_headers, workflow_id)
        approval = _create_approval(nexus_client, exec_id)
        rid = new_request_id()
        _decide_approval(nexus_client, approval["id"], request_id=rid)

        events = get_captured_events(
            segment_server_url,
            event_type="approval_decided",
            request_id=rid,
        )
        assert len(events) == 1
        assert events[0]["properties"]["request_id"] == rid
