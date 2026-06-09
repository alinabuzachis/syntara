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
from uuid import UUID

import pytest
from nexus_api_client.api import NexusApiRegistry
from nexus_api_client.models.activity_summary import ActivitySummary
from nexus_api_client.models.approval_create_request import ApprovalCreateRequest
from nexus_api_client.models.approval_decision_request import ApprovalDecisionRequest
from nexus_api_client.models.approval_decision_status import ApprovalDecisionStatus
from nexus_api_client.models.execution_create import ExecutionCreate
from nexus_api_client.models.workflow_context import WorkflowContext
from nexus_api_client.models.workflow_context_inputs import WorkflowContextInputs
from nexus_api_client.models.workflow_create import WorkflowCreate
from nexus_api_client.models.workflow_definition import WorkflowDefinition

from tests.e2e.telemetry.conftest import get_captured_events, new_request_id

if TYPE_CHECKING:
    from nexus_api_client import AuthenticatedClient

pytestmark = [pytest.mark.e2e]

WORKFLOW_NAME = "e2e-approval-telemetry"
APPROVAL_NODE_ID = "approval_step"


def _api_with_request_id(
    nexus_client: AuthenticatedClient,
    request_id: str | None,
) -> NexusApiRegistry:
    """Return a NexusApiRegistry with an optional X-Request-Id header."""
    if request_id:
        return NexusApiRegistry(nexus_client.with_headers({"X-Request-Id": request_id}))
    return NexusApiRegistry(nexus_client)


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
            workflow_definition=WorkflowDefinition.from_dict(
                {
                    "name": "approval-telemetry",
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
                }
            ),
        ),
    ).assert_and_get()
    return str(data.id)


def _start_execution(
    nexus_api: NexusApiRegistry,
    workflow_id: str,
) -> str:
    """Start a workflow execution and return the execution ID.

    The execution record is created synchronously by the API, so it is
    available for approval creation immediately after this call returns.
    """
    data = nexus_api.executions.create(
        body=ExecutionCreate(workflow_id=UUID(workflow_id)),
    ).assert_and_get()
    return str(data.id)


def _create_approval(
    nexus_client: AuthenticatedClient,
    execution_id: str,
    *,
    request_id: str | None = None,
) -> dict[str, Any]:
    """Create an approval request via POST /approvals with X-Request-Id."""
    api = _api_with_request_id(nexus_client, request_id)
    data = api.approvals.create(
        body=ApprovalCreateRequest(
            execution_id=UUID(execution_id),
            approval_node_id=APPROVAL_NODE_ID,
            name="E2E Approval Telemetry Test",
            next_step_approved=ActivitySummary(
                id="post_approval",
                name="Post Approval",
                type_="script",
            ),
            workflow_context=WorkflowContext(
                workflow_version_id=UUID(execution_id),
                workflow_name=WORKFLOW_NAME,
                inputs=WorkflowContextInputs(),
            ),
        ),
    ).assert_and_get()
    result: dict[str, Any] = data.to_dict()
    return result


def _decide_approval(
    nexus_client: AuthenticatedClient,
    approval_id: str,
    decision: str = "approved",
    *,
    request_id: str | None = None,
) -> dict[str, Any]:
    """Decide an approval via PATCH /approvals/{id} with X-Request-Id."""
    api = _api_with_request_id(nexus_client, request_id)
    data = api.approvals.decide(
        approval_id=UUID(approval_id),
        body=ApprovalDecisionRequest(
            status=ApprovalDecisionStatus(decision),
        ),
    ).assert_and_get()
    result: dict[str, Any] = data.to_dict()
    return result


@pytest.fixture(scope="module")
def workflow_id(nexus_api: NexusApiRegistry) -> str:
    """Create or reuse the approval telemetry workflow."""
    return _create_approval_workflow(nexus_api)


class TestApprovalRequestedTelemetry:
    """Verify approval_requested telemetry event on creation (AAP-72358)."""

    def test_approval_requested_event_emitted(
        self,
        nexus_api: NexusApiRegistry,
        nexus_client: AuthenticatedClient,
        segment_server_url: str,
        workflow_id: str,
    ) -> None:
        """Creating an approval request must emit an approval_requested event."""
        exec_id = _start_execution(nexus_api, workflow_id)
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
        nexus_api: NexusApiRegistry,
        nexus_client: AuthenticatedClient,
        segment_server_url: str,
        workflow_id: str,
    ) -> None:
        """approval_requested event must include required fields."""
        exec_id = _start_execution(nexus_api, workflow_id)
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
        nexus_api: NexusApiRegistry,
        nexus_client: AuthenticatedClient,
        segment_server_url: str,
        workflow_id: str,
    ) -> None:
        """approval_requested event must carry the originating X-Request-Id."""
        exec_id = _start_execution(nexus_api, workflow_id)
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
        nexus_api: NexusApiRegistry,
        nexus_client: AuthenticatedClient,
        segment_server_url: str,
        workflow_id: str,
    ) -> None:
        """Deciding an approval must emit an approval_decided event."""
        exec_id = _start_execution(nexus_api, workflow_id)
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
        nexus_api: NexusApiRegistry,
        nexus_client: AuthenticatedClient,
        segment_server_url: str,
        workflow_id: str,
    ) -> None:
        """approval_decided event must include required fields."""
        exec_id = _start_execution(nexus_api, workflow_id)
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
        nexus_api: NexusApiRegistry,
        nexus_client: AuthenticatedClient,
        segment_server_url: str,
        workflow_id: str,
    ) -> None:
        """An approved decision must set decision='approved'."""
        exec_id = _start_execution(nexus_api, workflow_id)
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
        nexus_api: NexusApiRegistry,
        nexus_client: AuthenticatedClient,
        segment_server_url: str,
        workflow_id: str,
    ) -> None:
        """approval_decided event must carry the originating X-Request-Id."""
        exec_id = _start_execution(nexus_api, workflow_id)
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
