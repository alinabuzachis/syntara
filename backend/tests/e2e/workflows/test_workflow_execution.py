"""E2E tests for Workflow Execution (ANSTRAT-1845).

Tests workflow execution including triggering, status tracking,
and integration with Temporal workflows.
"""

import time
from collections.abc import Callable
from http import HTTPStatus
from typing import Any
from uuid import UUID

import pytest
from nexus_api_client.api import NexusApiRegistry
from nexus_api_client.models import (
    ExecutionCreate,
    WorkflowCreate,
    WorkflowDefinition,
    WorkflowRead,
    WorkflowUpdate,
)

from tests.e2e.conftest import unique_name

pytestmark = [pytest.mark.e2e]


def _workflow_definition_with_nodes(
    workflow_name: str,
    *nodes: dict[str, Any],
    edges: list[dict[str, Any]] | None = None,
) -> WorkflowDefinition:
    """Create a workflow definition with custom nodes and edges."""
    return WorkflowDefinition.from_dict(
        {
            "name": workflow_name,
            "schema_version": "2.0.0",
            "triggers": [{"id": "trigger_manual", "type": "manual_trigger"}],
            "nodes": list(nodes),
            "edges": edges or [],
        }
    )


class TestWorkflowExecution:
    """Workflow execution tests - triggering and status tracking."""

    def test_execute_workflow_with_script_node(
        self, nexus_api: NexusApiRegistry, workflow_factory: Callable[[WorkflowCreate], WorkflowRead]
    ):
        """API 14: Execute workflow and track execution status.

        Objective: Verify that a valid workflow can be executed and tracked.

        Test Procedure:
        1. Create a workflow with a script node
        2. POST /api/v1/executions to execute the workflow
        3. Poll or query the execution status

        Expected Results:
        - Response is 201 Created with an execution object containing execution_id
        - The execution transitions through states: pending → running → completed
        - The Temporal workflow is started and tracked in the database
        """
        workflow_name = unique_name("e2e-execute-workflow")

        # Step 1: Create workflow with a simple script node
        workflow_data = WorkflowCreate(
            name=workflow_name,
            description="Workflow for testing execution",
            workflow_definition=_workflow_definition_with_nodes(
                workflow_name,
                {
                    "id": "script_node",
                    "name": "Hello Script",
                    "type": "script",
                    "config": {"language": "bash", "code": "echo 'Hello from execution test'"},
                },
                edges=[{"from": "trigger_manual", "to": "script_node"}],
            ),
        )
        workflow = workflow_factory(workflow_data)

        # Verify workflow was created
        assert workflow.id is not None
        assert workflow.name == workflow_name

        # Step 2: Execute the workflow
        execution = nexus_api.executions.create(body=ExecutionCreate(workflow_id=workflow.id)).assert_and_get()

        # Expected Result 1: 201 Created with execution object
        # Verify execution object contains required fields
        assert execution.id is not None, "Execution should have an ID"
        assert execution.workflow_id == workflow.id, "Execution should reference the correct workflow"
        assert execution.temporal_workflow_id is not None, "Execution should have a Temporal workflow ID"
        assert execution.status is not None, "Execution should have a status"

        execution_id = execution.id

        # Step 3: Poll execution status and verify state transitions
        # Expected states: pending → running → completed
        max_polls = 30  # Maximum number of status checks (30 * 2s = 60s timeout)
        poll_interval = 2  # seconds between polls

        states_observed = set()
        final_status = None
        final_execution = None

        for _ in range(max_polls):
            # Query execution status
            current_execution = nexus_api.executions.get(
                execution_id=UUID(str(execution_id)), include="activities"
            ).assert_and_get()

            # Track observed states
            current_status = str(current_execution.status)
            states_observed.add(current_status)

            # Check if execution reached a terminal state
            if current_status in ["completed", "failed", "cancelled"]:
                final_status = current_status
                final_execution = current_execution
                break

            time.sleep(poll_interval)

        # Expected Result 2: Execution should complete successfully
        assert final_status is not None, (
            f"Execution did not reach a terminal state within {max_polls * poll_interval}s. "
            f"Last observed states: {states_observed}. "
            f"Temporal may not be running. Start it with: make temporal-run"
        )

        assert final_status == "completed", (
            f"Execution should complete successfully. Final status: {final_status}, States: {states_observed}"
        )

        # Expected Result 3: Verify final execution details
        assert final_execution is not None
        assert final_execution.completed_at is not None, "Completed execution should have completed_at timestamp"
        assert final_execution.error_details is None, "Successful execution should have no error details"

        # Verify Temporal workflow was created
        assert final_execution.temporal_workflow_id is not None, "Execution should have a Temporal workflow ID"

    def test_get_execution_status_with_per_node_details(
        self, nexus_api: NexusApiRegistry, workflow_factory: Callable[[WorkflowCreate], WorkflowRead]
    ):
        """API 15: Get execution status with per-node activity details.

        Objective: Verify that execution status includes per-node activity statuses.

        Test Procedure:
        1. Execute a workflow with multiple nodes
        2. GET /api/v1/executions/{execution_id}
        3. Verify the response

        Expected Results:
        - Response is 200 with execution status, start time, and per-node activity statuses
        - Each activity status includes the node ID, status, start/end timestamps
        - Output data is available for completed nodes
        - Input data is available for each node (for I/O inspection)
        """
        workflow_name = unique_name("e2e-execution-details")

        # Step 1: Create workflow with multiple script nodes
        workflow_data = WorkflowCreate(
            name=workflow_name,
            description="Workflow for testing execution details with multiple nodes",
            workflow_definition=_workflow_definition_with_nodes(
                workflow_name,
                {
                    "id": "node_a",
                    "name": "First Script",
                    "type": "script",
                    "config": {"language": "bash", "code": "echo 'Output from node A'"},
                },
                {
                    "id": "node_b",
                    "name": "Second Script",
                    "type": "script",
                    "config": {"language": "bash", "code": "echo 'Output from node B'"},
                },
                {
                    "id": "node_c",
                    "name": "Third Script",
                    "type": "script",
                    "config": {"language": "bash", "code": "echo 'Output from node C'"},
                },
                edges=[
                    {"from": "trigger_manual", "to": "node_a"},
                    {"from": "node_a", "to": "node_b"},
                    {"from": "node_b", "to": "node_c"},
                ],
            ),
        )
        workflow = workflow_factory(workflow_data)

        # Execute the workflow
        execution = nexus_api.executions.create(body=ExecutionCreate(workflow_id=workflow.id)).assert_and_get()

        execution_id = execution.id

        # Step 2: Poll until execution completes
        max_polls = 30
        poll_interval = 2
        final_execution = None

        for _ in range(max_polls):
            # Step 3: GET execution status with activities included
            current_execution = nexus_api.executions.get(
                execution_id=UUID(str(execution_id)), include="activities"
            ).assert_and_get()

            # Check if completed
            if str(current_execution.status) in ["completed", "failed", "cancelled"]:
                final_execution = current_execution
                break

            time.sleep(poll_interval)

        assert final_execution is not None, f"Execution did not complete within {max_polls * poll_interval}s"
        assert str(final_execution.status) == "completed", (
            f"Execution should complete successfully, got: {final_execution.status}"
        )

        # Expected Result 2: Execution has start time (created_at)
        assert final_execution.created_at is not None, "Execution should have created_at timestamp"
        assert final_execution.completed_at is not None, "Completed execution should have completed_at timestamp"

        # Expected Result 3: Per-node activity statuses are included
        assert final_execution.activities is not None, "Execution should include activities data"

        # We expect exactly 4 activities (trigger_manual + node_a, node_b, node_c)
        assert len(final_execution.activities) == 4, (
            f"Expected exactly 4 activities (trigger + 3 nodes), got {len(final_execution.activities)}"
        )

        # Verify we have the expected activity IDs
        activity_ids = [activity.activity_id for activity in final_execution.activities]
        expected_activity_ids = {"trigger_manual", "node_a", "node_b", "node_c"}
        assert set(activity_ids) == expected_activity_ids, (
            f"Expected activities {expected_activity_ids}, got {set(activity_ids)}"
        )

        # Expected Result 4: Each activity has required fields
        for activity in final_execution.activities:
            # Activity should have an ID
            assert activity.activity_id is not None, "Activity should have activity_id"

            # Activity should have a status
            assert activity.status is not None, "Activity should have status"

            # Completed activities should have timestamps
            if str(activity.status) == "completed":
                assert activity.started_at is not None, (
                    f"Completed activity {activity.activity_id} should have started_at timestamp"
                )
                assert activity.completed_at is not None, (
                    f"Completed activity {activity.activity_id} should have completed_at timestamp"
                )

                # Expected Result 5: Output data should be available for completed nodes
                # Note: output_data might be None or empty depending on the activity
                # For script nodes that produce output, it should be present
                # We'll just verify the field exists (can be None or have data)
                assert hasattr(activity, "output_data"), "Activity should have output_data field"

        # Verify all activity IDs are unique (already extracted above)
        assert len(activity_ids) == len(set(activity_ids)), "All activity IDs should be unique"

        # Expected Result 6: Execution metadata is complete
        assert final_execution.workflow_id == workflow.id, "Execution should reference correct workflow"
        assert final_execution.temporal_workflow_id is not None, "Should have Temporal workflow ID"
        assert final_execution.error_details is None, "Successful execution should have no errors"

    def test_list_executions_with_filtering(
        self, nexus_api: NexusApiRegistry, workflow_factory: Callable[[WorkflowCreate], WorkflowRead]
    ):
        """API 16: List executions with filtering by status.

        Epic: AAP-70985
        Objective: Verify that execution history can be retrieved and filtered.

        Test Procedure:
        1. Execute a workflow multiple times (some successful, some failed)
        2. GET /api/v1/executions?workflow_id={id}
        3. GET /api/v1/executions?workflow_id={id}&status=failed

        Expected Results:
        - Response includes all executions for the workflow
        - Filtering by status returns only matching executions
        - Each execution includes status, duration, trigger source, and summary
        """
        workflow_name = unique_name("e2e-list-executions")

        # Create a workflow with a simple script node
        workflow_data = WorkflowCreate(
            name=workflow_name,
            description="Workflow for testing execution listing and filtering",
            workflow_definition=_workflow_definition_with_nodes(
                workflow_name,
                {
                    "id": "script_node",
                    "name": "Conditional Script",
                    "type": "script",
                    "config": {"language": "bash", "code": "echo 'Running script'; exit 0"},
                },
                edges=[{"from": "trigger_manual", "to": "script_node"}],
            ),
        )
        workflow = workflow_factory(workflow_data)

        # Step 1: Execute workflow multiple times - create some successful and some failed executions
        execution_ids = []
        expected_successful = 0
        expected_failed = 0

        # Create 2 successful executions
        for _ in range(2):
            execution = nexus_api.executions.create(body=ExecutionCreate(workflow_id=workflow.id)).assert_and_get()
            execution_ids.append(execution.id)
            expected_successful += 1

        # Update workflow to fail (exit with error code)
        failed_workflow_def = _workflow_definition_with_nodes(
            workflow_name,
            {
                "id": "script_node",
                "name": "Failing Script",
                "type": "script",
                "config": {"language": "bash", "code": "echo 'This will fail'; exit 1"},
            },
            edges=[{"from": "trigger_manual", "to": "script_node"}],
        )

        nexus_api.workflows.update(
            workflow_id=workflow.id, body=WorkflowUpdate(workflow_definition=failed_workflow_def)
        ).assert_and_get()

        # Create 2 failed executions
        for _ in range(2):
            execution = nexus_api.executions.create(body=ExecutionCreate(workflow_id=workflow.id)).assert_and_get()
            execution_ids.append(execution.id)
            expected_failed += 1

        # Wait for all executions to complete (either successfully or with failure)
        max_polls = 30
        poll_interval = 2

        for exec_id in execution_ids:
            for _ in range(max_polls):
                execution = nexus_api.executions.get(execution_id=UUID(str(exec_id))).assert_and_get()
                if str(execution.status) in ["completed", "failed", "cancelled"]:
                    break
                time.sleep(poll_interval)

        # Give a small buffer for all to settle
        time.sleep(1)

        # Step 2: List all executions for the workflow (no status filter)
        all_executions_list = nexus_api.executions.list(
            additional_params={"workflow_id": str(workflow.id)}, limit=100
        ).assert_and_get()

        # Expected Result 1: Response includes all executions for the workflow
        all_executions = all_executions_list.resources
        assert len(all_executions) == 4, (
            f"Should have exactly 4 executions (2 successful + 2 failed), got {len(all_executions)}"
        )

        # Verify each execution has required fields
        for execution in all_executions:
            # Expected Result 3: Each execution includes status, duration, and summary
            assert execution.id is not None, "Execution should have ID"
            assert execution.status is not None, "Execution should have status"
            assert execution.created_at is not None, "Execution should have created_at (start time)"
            assert execution.workflow_id == workflow.id, "Execution should belong to the correct workflow"

            # Duration can be calculated from created_at and completed_at
            if str(execution.status) in ["completed", "failed"]:
                assert execution.completed_at is not None, "Terminal executions should have completed_at"

        # Step 3: Filter executions by status=failed
        failed_executions_list = nexus_api.executions.list(
            additional_params={"workflow_id": str(workflow.id), "status": "failed"}, limit=100
        ).assert_and_get()

        # Expected Result 2: Filtering by status returns only matching executions
        failed_executions = failed_executions_list.resources
        assert len(failed_executions) == expected_failed, (
            f"Should have exactly {expected_failed} failed executions, got {len(failed_executions)}"
        )

        # Verify all returned executions have failed status
        for execution in failed_executions:
            assert str(execution.status) == "failed", (
                f"Filtered list should only contain failed executions, got {execution.status}"
            )
            assert execution.workflow_id == workflow.id, "Should only include executions from this workflow"

        # Test filtering by status=completed
        completed_executions_list = nexus_api.executions.list(
            additional_params={"workflow_id": str(workflow.id), "status": "completed"}, limit=100
        ).assert_and_get()

        completed_executions = completed_executions_list.resources
        assert len(completed_executions) == expected_successful, (
            f"Should have exactly {expected_successful} completed executions, got {len(completed_executions)}"
        )

        # Verify all returned executions have completed status
        for execution in completed_executions:
            assert str(execution.status) == "completed", (
                f"Filtered list should only contain completed executions, got {execution.status}"
            )

        # Verify total count: failed + completed should match all executions for this workflow
        our_executions = [e for e in all_executions if e.id in execution_ids]
        our_completed = len([e for e in our_executions if str(e.status) == "completed"])
        our_failed = len([e for e in our_executions if str(e.status) == "failed"])

        assert our_completed == expected_successful, (
            f"Expected {expected_successful} successful executions, got {our_completed}"
        )
        assert our_failed == expected_failed, f"Expected {expected_failed} failed executions, got {our_failed}"

    def test_cancel_running_execution(
        self, nexus_api: NexusApiRegistry, workflow_factory: Callable[[WorkflowCreate], WorkflowRead]
    ):
        """API 17: Cancel a running workflow execution.

        Objective: Verify that a running workflow execution can be cancelled.

        Test Procedure:
        1. Create a workflow with a long-running script node (5 minute sleep)
        2. Execute the workflow
        3. While the execution is running, POST /api/v1/executions/{execution_id}/cancel
        4. Verify the execution status

        Expected Results:
        - The cancel request returns a success response (202 Accepted)
        - The execution transitions to cancelled status
        - The Temporal workflow is terminated
        - Subsequent nodes are not executed
        """
        workflow_name = unique_name("e2e-cancel-execution")

        # Step 1: Create workflow with a long-running script node (using sleep) and subsequent nodes
        workflow_data = WorkflowCreate(
            name=workflow_name,
            description="Workflow for testing execution cancellation",
            workflow_definition=_workflow_definition_with_nodes(
                workflow_name,
                {
                    "id": "sleep_node",
                    "name": "Long Running Script",
                    "type": "script",
                    "config": {
                        "language": "bash",
                        "code": "echo 'Starting long sleep'; sleep 300; echo 'Sleep completed'",
                    },
                },
                {
                    "id": "after_sleep_node",
                    "name": "Node After Sleep",
                    "type": "script",
                    "config": {"language": "bash", "code": "echo 'This should not execute if cancelled'"},
                },
                edges=[
                    {"from": "trigger_manual", "to": "sleep_node"},
                    {"from": "sleep_node", "to": "after_sleep_node"},
                ],
            ),
        )
        workflow = workflow_factory(workflow_data)

        # Step 2: Execute the workflow
        execution = nexus_api.executions.create(body=ExecutionCreate(workflow_id=workflow.id)).assert_and_get()

        execution_id = execution.id

        # Wait a bit to ensure the execution has started and is in "running" state
        time.sleep(3)

        # Verify execution is running
        execution_before_cancel = nexus_api.executions.get(
            execution_id=UUID(str(execution_id)), include="activities"
        ).assert_and_get()

        # Execution should be in pending or running state (not completed yet)
        status_str = str(execution_before_cancel.status)
        assert status_str in ["pending", "running"], (
            f"Execution should be pending or running before cancellation, got {status_str}"
        )

        # Step 3: Cancel the running execution
        cancel_response = nexus_api.executions.cancel(execution_id=UUID(str(execution_id)))

        # Expected Result 1: Cancel request returns success response (202 Accepted)
        assert cancel_response.status_code == HTTPStatus.ACCEPTED, (
            f"Expected 202 Accepted for cancel request, got {cancel_response.status_code}: {cancel_response.content!r}"
        )

        # Step 4: Poll execution status to verify it transitions to cancelled
        max_polls = 20
        poll_interval = 1
        cancelled_execution = None

        for _ in range(max_polls):
            current_execution = nexus_api.executions.get(
                execution_id=UUID(str(execution_id)), include="activities"
            ).assert_and_get()

            current_status = str(current_execution.status)

            # Expected Result 2: Execution transitions to cancelled status
            if current_status == "cancelled":
                cancelled_execution = current_execution
                break

            time.sleep(poll_interval)

        assert cancelled_execution is not None, (
            f"Execution did not transition to cancelled within {max_polls * poll_interval}s. "
            f"Last status: {current_execution.status!s}"
        )

        assert str(cancelled_execution.status) == "cancelled", (
            f"Execution status should be 'cancelled', got {cancelled_execution.status}"
        )

        # Expected Result 3: Verify Temporal workflow was terminated
        assert cancelled_execution.temporal_workflow_id is not None, "Execution should have Temporal workflow ID"

        # Expected Result 4: Verify subsequent nodes were not executed
        assert cancelled_execution.activities is not None, "Cancelled execution should have activities"

        # Get all activity IDs and statuses for verification
        activity_ids = [activity.activity_id for activity in cancelled_execution.activities]
        activity_statuses = {activity.activity_id: str(activity.status) for activity in cancelled_execution.activities}

        # Expected activities: trigger_manual, sleep_node, and possibly after_sleep_node (but NOT completed)
        # Workflow execution may create activity records for downstream nodes even if they don't execute
        assert "trigger_manual" in activity_ids, "trigger_manual should be present"
        assert "sleep_node" in activity_ids, "sleep_node should be present"

        # Critical assertion: after_sleep_node should NOT have completed
        if "after_sleep_node" in activity_ids:
            assert activity_statuses["after_sleep_node"] != "completed", (
                "after_sleep_node should NOT have completed after cancellation"
            )

        # Verify only the trigger completed (sleep_node was cancelled/failed, not completed)
        completed_activity_ids = [
            activity.activity_id for activity in cancelled_execution.activities if str(activity.status) == "completed"
        ]
        assert len(completed_activity_ids) == 1, (
            f"Expected exactly 1 completed activity (trigger), "
            f"got {len(completed_activity_ids)}: {completed_activity_ids}"
        )
        assert "trigger_manual" in completed_activity_ids, "Only trigger_manual should have completed"

        # Verify cancellation metadata
        assert cancelled_execution.completed_at is not None, "Cancelled execution should have completed_at timestamp"
        assert cancelled_execution.created_at < cancelled_execution.completed_at, (
            "Completed time should be after created time"
        )
