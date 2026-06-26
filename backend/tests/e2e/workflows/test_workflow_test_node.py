"""E2E tests for POST /api/v1/workflows/{workflow_id}/test endpoint.

Tests single-node execution with mocked predecessor data.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from nexus_api_client.models.test_execution_create import TestExecutionCreate
from nexus_api_client.models.***REMOVED*** import TestExecutionCreatePreResolvedNodes
from nexus_api_client.models.workflow_create import WorkflowCreate
from nexus_api_client.models.workflow_definition import WorkflowDefinition

from tests.e2e.conftest import poll_execution_until_complete, unique_name

if TYPE_CHECKING:
    from collections.abc import Callable
    from uuid import UUID

    from nexus_api_client.api import NexusApiRegistry
    from nexus_api_client.models.workflow_read import WorkflowRead

    WorkflowFactory = Callable[[WorkflowCreate], WorkflowRead]

pytestmark = [pytest.mark.e2e]


class TestWorkflowTestNode:
    """E2E tests for single-node test execution with mock input."""

    def test_single_step_with_mock_input(
        self,
        nexus_api: NexusApiRegistry,
        workflow_factory: WorkflowFactory,
        first_project_id: UUID,
    ) -> None:
        """API-38: Test a single node with mocked predecessor data."""
        # Step 1: Create a workflow with connected nodes
        workflow_name = unique_name("e2e-test-node")
        workflow = workflow_factory(
            WorkflowCreate(
                name=workflow_name,
                description="Workflow for testing single-node execution with mock input",
                project_id=first_project_id,
                workflow_definition=WorkflowDefinition.from_dict(
                    {
                        "name": workflow_name,
                        "schema_version": "2.0.0",
                        "triggers": [
                            {"id": "trigger_manual", "type": "manual_trigger", "parameters": {}},
                        ],
                        "nodes": [
                            {
                                "id": "node_a",
                                "name": "Node A",
                                "type": "script",
                                "parameters": {
                                    "language": "bash",
                                    "code": 'echo "node a output"',
                                },
                            },
                            {
                                "id": "node_b",
                                "name": "Node B",
                                "type": "script",
                                "parameters": {
                                    "language": "bash",
                                    "code": 'echo "${node_a.stdout}"',
                                },
                            },
                        ],
                        "edges": [
                            {"from": "trigger_manual", "to": "node_a"},
                            {"from": "node_a", "to": "node_b"},
                        ],
                    }
                ),
            )
        )

        # Step 2: POST /workflows/{workflow_id}/test with mock input data
        pre_resolved = TestExecutionCreatePreResolvedNodes.from_dict(
            {
                "node_a": {
                    "output": {"stdout": "mocked node a output"},
                },
            }
        )
        response = nexus_api.workflows.test_node(
            workflow_id=workflow.id,
            body=TestExecutionCreate(
                target_node_id="node_b",
                pre_resolved_nodes=pre_resolved,
            ),
        )

        execution = response.assert_and_get()
        assert execution.id is not None
        assert execution.workflow_id == workflow.id

        # Step 3: Verify the response
        final_execution = poll_execution_until_complete(nexus_api, execution.id)

        # Expected 1: The node executes with the provided mock data
        assert final_execution.activities is not None, "Execution should include activities"
        activities_by_id = {a.activity_id: a for a in final_execution.activities}
        assert activities_by_id["node_a"].status == "skipped", (
            f"pre-resolved node_a should be skipped, got: {activities_by_id['node_a'].status}"
        )
        assert "node_b" in activities_by_id, "node_b activity should exist"
        assert activities_by_id["node_b"].status == "completed", (
            f"node_b should complete with mocked predecessor, got: {activities_by_id['node_b'].status}"
        )

        # Expected 2: The response includes the node's output with resolved mock data
        node_b_output = activities_by_id["node_b"].output_data
        assert node_b_output is not None, "node_b should have output data"
        output_dict = (
            node_b_output if isinstance(node_b_output, dict) else getattr(node_b_output, "additional_properties", {})
        )
        assert "stdout" in output_dict, f"node_b output should contain stdout, got: {output_dict}"
        assert "mocked node a output" in output_dict["stdout"], (
            f"node_b should echo the mocked node_a output, got: {output_dict['stdout']!r}"
        )

        # Expected 3: No full workflow execution record is created
        assert str(final_execution.mode) == "test", f"Execution mode should be 'test', got: {final_execution.mode}"
