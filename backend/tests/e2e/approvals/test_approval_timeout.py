"""E2E tests: Approval node timeout behavior (API-23).

Validates the three timeout behaviors of an approval node when no decision
signal is sent before the decision_window expires:

- fail (continue_on_failure=False): execution terminates with FAILED status.
- auto-approve (continue_on_failure=True, fallback_decision="approve"):
  approval node is recorded as failed, routing continues on the "approved" port,
  execution reaches COMPLETED_WITH_ERRORS.
- auto-reject (continue_on_failure=True, fallback_decision="reject"):
  approval node is recorded as failed, routing continues on the "rejected" port,
  execution reaches COMPLETED_WITH_ERRORS.

Run with:
    make test-e2e
"""

import os
from collections.abc import Callable
from typing import Any
from uuid import UUID

import pytest
from nexus_api_client.api import NexusApiRegistry
from nexus_api_client.models import (
    ExecutionCreate,
    WorkflowCreate,
    WorkflowDefinition,
    WorkflowRead,
)
from nexus_api_client.models.execution_status import ExecutionStatus

from tests.e2e.conftest import unique_name
from tests.e2e.helpers import poll_execution

if not os.environ.get("APP_BASE_URL"):
    pytest.skip("APP_BASE_URL not set — full stack required", allow_module_level=True)

pytestmark = [pytest.mark.e2e]

_DECISION_WINDOW = 10  # seconds — short enough to keep tests fast
_EXECUTION_POLL_TIMEOUT = 90  # seconds — decision_window + Temporal scheduling buffer


def _timeout_workflow(
    name: str,
    *,
    fallback_decision: str | None = None,
    continue_on_failure: bool = False,
    with_approved_downstream: bool = False,
    with_rejected_downstream: bool = False,
) -> WorkflowDefinition:
    """Build a workflow definition with a timeout-configured approval node.

    Args:
        name: Workflow name (used as definition name too).
        fallback_decision: "approve" or "reject". Only meaningful when
            continue_on_failure is True.
        continue_on_failure: Whether the approval node absorbs failure and
            routes to a fallback port instead of terminating the workflow.
        with_approved_downstream: Attach a script node on the "approved" port.
        with_rejected_downstream: Attach a script node on the "rejected" port.

    """
    approval_params: dict[str, Any] = {"decision_window": _DECISION_WINDOW}
    if fallback_decision is not None:
        approval_params["fallback_decision"] = fallback_decision

    approval_node: dict[str, Any] = {
        "id": "approval_gate",
        "name": "Review Gate",
        "type": "approval",
        "parameters": approval_params,
    }
    if continue_on_failure:
        approval_node["settings"] = {"continue_on_failure": True}

    nodes: list[dict[str, Any]] = [approval_node]
    edges: list[dict[str, Any]] = [{"from": "trigger", "to": "approval_gate"}]

    if with_approved_downstream:
        nodes.append(
            {
                "id": "approved_step",
                "name": "Approved Path",
                "type": "script",
                "parameters": {"language": "bash", "code": 'echo "approved path executed"'},
            }
        )
        edges.append({"from": "approval_gate", "to": "approved_step", "from_port": "approved"})

    if with_rejected_downstream:
        nodes.append(
            {
                "id": "rejected_step",
                "name": "Rejected Path",
                "type": "script",
                "parameters": {"language": "bash", "code": 'echo "rejected path executed"'},
            }
        )
        edges.append({"from": "approval_gate", "to": "rejected_step", "from_port": "rejected"})

    return WorkflowDefinition.from_dict(
        {
            "name": name,
            "schema_version": "2.0.0",
            "triggers": [{"id": "trigger", "type": "manual_trigger", "parameters": {}}],
            "nodes": nodes,
            "edges": edges,
        }
    )


class TestApprovalTimeout:
    """API-23: Approval node timeout — fail, auto-approve, auto-reject behaviors."""

    def test_timeout_without_continue_on_failure_fails_execution(
        self,
        nexus_api: NexusApiRegistry,
        workflow_factory: Callable[[WorkflowCreate], WorkflowRead],
        first_project_id: UUID,
    ) -> None:
        """Approval timeout with no continue_on_failure terminates the execution as FAILED.

        Objective: Verify that when an approval node times out and
        continue_on_failure is not set, the execution reaches FAILED status
        and the approval node activity is recorded as failed.

        Test Procedure:
        1. Create a workflow with an approval node (decision_window=10s,
           no continue_on_failure) followed by a downstream script.
        2. Execute the workflow — do NOT send any approval signal.
        3. Wait for the decision_window to expire.
        4. Poll to terminal.

        Expected Results:
        - Execution status is FAILED.
        - approval_gate activity status is "failed".
        - approval_gate output_data.status is "failed" and decision is None
          (timeout, not a human decision).
        - Downstream approved_step is not present or skipped.
        """
        name = unique_name("e2e-approval-timeout-fail")
        workflow = workflow_factory(
            WorkflowCreate(
                name=name,
                description="E2E API-23: approval timeout fails execution",
                workflow_definition=_timeout_workflow(
                    name,
                    continue_on_failure=False,
                    with_approved_downstream=True,
                ),
                project_id=first_project_id,
            )
        )

        execution = nexus_api.executions.create(body=ExecutionCreate(workflow_id=workflow.id)).assert_and_get()

        final = poll_execution(nexus_api, str(execution.id), timeout=_EXECUTION_POLL_TIMEOUT)

        assert final.status == ExecutionStatus.FAILED, (
            f"Expected FAILED when approval times out with no continue_on_failure, "
            f"got {final.status}: {final.error_details}"
        )

        activities = {a.activity_id: a for a in (final.activities or [])}
        assert "approval_gate" in activities, f"approval_gate must appear in activities: {list(activities)}"

        gate = activities["approval_gate"]
        assert gate.status == "failed", f"approval_gate should be failed on timeout, got: {gate.status}"

        assert gate.output_data is not None, "approval_gate must have output_data on timeout"
        output = gate.output_data.to_dict()
        assert output.get("status") == "failed", f"output_data.status should be 'failed', got: {output.get('status')!r}"
        assert output.get("decision") is None, (
            f"output_data.decision should be None on timeout (no human decision), got: {output.get('decision')!r}"
        )
        assert output.get("error"), "output_data.error should be a non-empty string on timeout"

        if "approved_step" in activities:
            assert activities["approved_step"].status == "skipped", (
                f"approved_step should be skipped after unhandled failure, got: {activities['approved_step'].status}"
            )

    def test_timeout_with_fallback_approve_routes_to_approved_path(
        self,
        nexus_api: NexusApiRegistry,
        workflow_factory: Callable[[WorkflowCreate], WorkflowRead],
        first_project_id: UUID,
    ) -> None:
        """Approval timeout with fallback_decision="approve" routes to the approved downstream.

        Objective: Verify that when an approval node times out with
        continue_on_failure=True and fallback_decision="approve", the engine
        absorbs the failure and routes execution to the node on the "approved"
        output port, reaching COMPLETED_WITH_ERRORS.

        Test Procedure:
        1. Create a workflow with an approval node (decision_window=10s,
           continue_on_failure=True, fallback_decision="approve") connected to
           an approved_step on the "approved" port.
        2. Execute the workflow — do NOT send any approval signal.
        3. Wait for the decision_window to expire.
        4. Poll to terminal.

        Expected Results:
        - Execution status is COMPLETED_WITH_ERRORS (approval failed but CoF absorbed it).
        - approval_gate activity status is "failed".
        - approved_step activity status is "completed" (routed to approved path on timeout).
        """
        name = unique_name("e2e-approval-timeout-approve")
        workflow = workflow_factory(
            WorkflowCreate(
                name=name,
                description="E2E API-23: approval timeout auto-approves via fallback",
                workflow_definition=_timeout_workflow(
                    name,
                    fallback_decision="approve",
                    continue_on_failure=True,
                    with_approved_downstream=True,
                ),
                project_id=first_project_id,
            )
        )

        execution = nexus_api.executions.create(body=ExecutionCreate(workflow_id=workflow.id)).assert_and_get()

        final = poll_execution(nexus_api, str(execution.id), timeout=_EXECUTION_POLL_TIMEOUT)

        assert final.status == ExecutionStatus.COMPLETED_WITH_ERRORS, (
            f"Expected COMPLETED_WITH_ERRORS when fallback_decision='approve' absorbs timeout, "
            f"got {final.status}: {final.error_details}"
        )

        activities = {a.activity_id: a for a in (final.activities or [])}
        assert "approval_gate" in activities, f"approval_gate must appear in activities: {list(activities)}"

        gate = activities["approval_gate"]
        assert gate.status == "failed", f"approval_gate should be failed on timeout even with CoF, got: {gate.status}"

        assert gate.output_data is not None, "approval_gate must have output_data on timeout"
        output = gate.output_data.to_dict()
        assert output.get("status") == "failed", f"output_data.status should be 'failed', got: {output.get('status')!r}"
        assert output.get("decision") is None, (
            f"output_data.decision should be None (timeout, not human decision), got: {output.get('decision')!r}"
        )

        assert "approved_step" in activities, (
            f"approved_step must execute when fallback_decision='approve': {list(activities)}"
        )
        assert activities["approved_step"].status == "completed", (
            f"approved_step should complete after auto-approve on timeout, got: {activities['approved_step'].status}"
        )

    def test_timeout_with_fallback_reject_routes_to_rejected_path(
        self,
        nexus_api: NexusApiRegistry,
        workflow_factory: Callable[[WorkflowCreate], WorkflowRead],
        first_project_id: UUID,
    ) -> None:
        """Approval timeout with fallback_decision="reject" routes to the rejected downstream.

        Objective: Verify that when an approval node times out with
        continue_on_failure=True and fallback_decision="reject", the engine
        absorbs the failure and routes execution to the node on the "rejected"
        output port, reaching COMPLETED_WITH_ERRORS.

        Test Procedure:
        1. Create a workflow with an approval node (decision_window=10s,
           continue_on_failure=True, fallback_decision="reject") connected to
           a rejected_step on the "rejected" port and an approved_step on the
           "approved" port.
        2. Execute the workflow — do NOT send any approval signal.
        3. Wait for the decision_window to expire.
        4. Poll to terminal.

        Expected Results:
        - Execution status is COMPLETED_WITH_ERRORS (approval failed but CoF absorbed it).
        - approval_gate activity status is "failed".
        - rejected_step activity status is "completed" (routed to rejected path on timeout).
        - approved_step is not present or skipped (non-taken branch).
        """
        name = unique_name("e2e-approval-timeout-reject")
        workflow = workflow_factory(
            WorkflowCreate(
                name=name,
                description="E2E API-23: approval timeout auto-rejects via fallback",
                workflow_definition=_timeout_workflow(
                    name,
                    fallback_decision="reject",
                    continue_on_failure=True,
                    with_approved_downstream=True,
                    with_rejected_downstream=True,
                ),
                project_id=first_project_id,
            )
        )

        execution = nexus_api.executions.create(body=ExecutionCreate(workflow_id=workflow.id)).assert_and_get()

        final = poll_execution(nexus_api, str(execution.id), timeout=_EXECUTION_POLL_TIMEOUT)

        assert final.status == ExecutionStatus.COMPLETED_WITH_ERRORS, (
            f"Expected COMPLETED_WITH_ERRORS when fallback_decision='reject' absorbs timeout, "
            f"got {final.status}: {final.error_details}"
        )

        activities = {a.activity_id: a for a in (final.activities or [])}
        assert "approval_gate" in activities, f"approval_gate must appear in activities: {list(activities)}"

        gate = activities["approval_gate"]
        assert gate.status == "failed", f"approval_gate should be failed on timeout even with CoF, got: {gate.status}"

        assert gate.output_data is not None, "approval_gate must have output_data on timeout"
        output = gate.output_data.to_dict()
        assert output.get("status") == "failed", f"output_data.status should be 'failed', got: {output.get('status')!r}"
        assert output.get("decision") is None, (
            f"output_data.decision should be None (timeout, not human decision), got: {output.get('decision')!r}"
        )

        assert "rejected_step" in activities, (
            f"rejected_step must execute when fallback_decision='reject': {list(activities)}"
        )
        assert activities["rejected_step"].status == "completed", (
            f"rejected_step should complete after auto-reject on timeout, got: {activities['rejected_step'].status}"
        )

        if "approved_step" in activities:
            assert activities["approved_step"].status == "skipped", (
                f"approved_step should be skipped (non-taken branch), got: {activities['approved_step'].status}"
            )
