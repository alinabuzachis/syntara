"""E2E tests for Workflow Expression Resolution.

Tests that ${...} expressions in config fields (e.g., config.environment) referencing
upstream node outputs are resolved correctly during execution.

Expression resolution is implemented via _resolve_node_config() which resolves all
${...} expressions in config fields before the activity runs. For script nodes,
resolved values in config.environment are passed as environment variables to the script.

Test Plan Coverage:
- API-18 (Expression Resolution - Node Output References): FULLY COVERED
  - Tests ${node_id.stdout_json.field} expressions in config.environment
  - Tests ${trigger_id.field} expressions referencing trigger node outputs
- API-19 (Expression Resolution - System Variables): NOT COVERED
  - ${inputs.*}, ${execution.id}, and ${workflow.vars.x} are NOT implemented
  - The 'inputs' namespace does not exist in the expression resolver

"""

from collections.abc import Callable
from typing import Any

import pytest
from nexus_api_client.api import NexusApiRegistry
from nexus_api_client.models import (
    ExecutionCreate,
    ExecutionCreateInputData,
    WorkflowCreate,
    WorkflowDefinition,
    WorkflowRead,
)

from tests.e2e.conftest import poll_execution_until_complete, unique_name

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
            "triggers": [{"id": "trigger_manual", "type": "manual_trigger", "config": {}}],
            "nodes": list(nodes),
            "edges": edges or [],
        }
    )


class TestExpressionResolution:
    """Tests for ${...} expression resolution in workflow execution."""

    def test_node_output_reference_resolution(
        self, nexus_api: NexusApiRegistry, workflow_factory: Callable[[WorkflowCreate], WorkflowRead]
    ):
        """Test that ${node_id.field} expressions resolve to upstream node outputs.

        Objective: Verify that ${...} expressions referencing upstream node outputs
        are resolved correctly during execution via config.environment.

        Test Procedure:
        1. Create a workflow with:
           - Node A: Script node that produces structured JSON output
           - Node B: Script node with ${node_a.stdout_json.message} in config.environment
        2. Execute the workflow
        3. Verify Node B received the resolved value from Node A's output

        Expected Results:
        - Node A executes and produces output with structured data
        - The expression resolver substitutes ${node_a.stdout_json.message} with actual value
        - Node B's script receives the resolved value via environment variable
        """
        workflow_name = unique_name("e2e-expression-resolution")

        # Step 1: Create workflow with two connected nodes
        # Node A produces JSON output with a field "message"
        # Node B uses ${node_a.stdout_json.message} in config.environment to reference that field
        workflow_data = WorkflowCreate(
            name=workflow_name,
            description="Workflow for testing expression resolution",
            workflow_definition=_workflow_definition_with_nodes(
                workflow_name,
                {
                    "id": "node_a",
                    "name": "Producer Node",
                    "type": "script",
                    "config": {
                        "language": "python",
                        "code": 'print(\'{"message": "Hello from Node A", "status": "success", "count": 42}\')',
                    },
                },
                {
                    "id": "node_b",
                    "name": "Consumer Node",
                    "type": "script",
                    "config": {
                        "language": "python",
                        "code": "import os; msg = os.environ.get('MESSAGE', 'default'); print(f'Received: {msg}')",
                        "environment": {
                            "MESSAGE": "${node_a.stdout_json.message}",
                        },
                    },
                },
                edges=[
                    {"from": "trigger_manual", "to": "node_a"},
                    {"from": "node_a", "to": "node_b"},
                ],
            ),
        )
        workflow = workflow_factory(workflow_data)

        # Step 2: Execute the workflow
        execution = nexus_api.executions.create(body=ExecutionCreate(workflow_id=workflow.id)).assert_and_get()
        execution_id = execution.id

        # Poll until execution completes
        final_execution = poll_execution_until_complete(nexus_api, execution_id)

        # Expected Result 1: Execution completes successfully
        assert str(final_execution.status) == "completed", (
            f"Execution should complete successfully, got: {final_execution.status}"
        )

        # Expected Result 2: Both nodes executed successfully
        assert final_execution.activities is not None, "Execution should have activities"

        # Find node_a and node_b activities
        activities_by_id = {activity.activity_id: activity for activity in final_execution.activities}

        assert "node_a" in activities_by_id, "node_a activity should exist"
        assert "node_b" in activities_by_id, "node_b activity should exist"

        node_a_activity = activities_by_id["node_a"]
        node_b_activity = activities_by_id["node_b"]

        # Expected Result 3: Node A produced output
        assert str(node_a_activity.status) == "completed", "node_a should complete successfully"
        assert node_a_activity.output_data is not None, "node_a should have output data"

        # Expected Result 4: Node A output contains expected fields
        # The output_data contains stdout_json with the parsed JSON from the script's stdout
        node_a_output = (
            node_a_activity.output_data
            if isinstance(node_a_activity.output_data, dict)
            else getattr(node_a_activity.output_data, "additional_properties", {})
        )

        assert "stdout_json" in node_a_output, f"node_a output should contain 'stdout_json' field: {node_a_output}"
        stdout_json = node_a_output["stdout_json"]
        assert "message" in stdout_json, f"node_a stdout_json should contain 'message' field: {stdout_json}"
        assert stdout_json["message"] == "Hello from Node A", (
            f"node_a message should be 'Hello from Node A', got: {stdout_json['message']}"
        )

        # Expected Result 5: Node B executed successfully
        # If expression resolution worked, node_b would have received the resolved value
        assert str(node_b_activity.status) == "completed", (
            f"node_b should complete successfully after expression resolution, got: {node_b_activity.status}"
        )

        # Expected Result 6: Node B's output should show it received the resolved value
        # The script prints "Received: <message>", which should contain the resolved value
        node_b_output = (
            node_b_activity.output_data
            if isinstance(node_b_activity.output_data, dict)
            else getattr(node_b_activity.output_data, "additional_properties", {})
        )

        # Verify the resolved value actually arrived in node_b
        assert node_b_output is not None, "node_b should have output data"
        node_b_stdout = node_b_output.get("stdout", "")
        assert "Hello from Node A" in node_b_stdout, (
            f"node_b should have received resolved value from node_a in stdout. "
            f"Expected 'Received: Hello from Node A', got stdout: {node_b_stdout}"
        )

    def test_multiple_expression_references(
        self, nexus_api: NexusApiRegistry, workflow_factory: Callable[[WorkflowCreate], WorkflowRead]
    ):
        """Test multiple ${...} expressions in a single node configuration.

        Objective: Verify that multiple expression references in config.environment are all resolved.

        Test Procedure:
        1. Create a workflow where Node B references multiple fields from Node A via config.environment
        2. Execute the workflow
        3. Verify all expressions were resolved

        Expected Results:
        - All ${node_a.stdout_json.*} expressions in config.environment are resolved
        - Node B receives all referenced values as environment variables
        """
        workflow_name = unique_name("e2e-multi-expression")

        workflow_data = WorkflowCreate(
            name=workflow_name,
            description="Workflow for testing multiple expression resolution",
            workflow_definition=_workflow_definition_with_nodes(
                workflow_name,
                {
                    "id": "node_a",
                    "name": "Data Producer",
                    "type": "script",
                    "config": {
                        "language": "python",
                        "code": ('print(\'{"name": "test-user", "team": "engineering", "role": "admin"}\')'),
                    },
                },
                {
                    "id": "node_b",
                    "name": "Data Consumer",
                    "type": "script",
                    "config": {
                        "language": "python",
                        "code": (
                            "import os; "
                            "name = os.environ.get('USER_NAME', 'unknown'); "
                            "team = os.environ.get('USER_TEAM', 'none'); "
                            "role = os.environ.get('USER_ROLE', 'guest'); "
                            "print(f'User: {name}, Team: {team}, Role: {role}')"
                        ),
                        "environment": {
                            "USER_NAME": "${node_a.stdout_json.name}",
                            "USER_TEAM": "${node_a.stdout_json.team}",
                            "USER_ROLE": "${node_a.stdout_json.role}",
                        },
                    },
                },
                edges=[
                    {"from": "trigger_manual", "to": "node_a"},
                    {"from": "node_a", "to": "node_b"},
                ],
            ),
        )
        workflow = workflow_factory(workflow_data)

        # Execute workflow
        execution = nexus_api.executions.create(body=ExecutionCreate(workflow_id=workflow.id)).assert_and_get()
        final_execution = poll_execution_until_complete(nexus_api, execution.id)

        # Verify execution completed
        assert str(final_execution.status) == "completed", (
            f"Execution should complete successfully, got: {final_execution.status}"
        )

        # Verify both nodes completed
        activities_by_id = {activity.activity_id: activity for activity in final_execution.activities}

        assert "node_a" in activities_by_id, "node_a should exist"
        assert "node_b" in activities_by_id, "node_b should exist"

        node_a = activities_by_id["node_a"]
        node_b = activities_by_id["node_b"]

        assert str(node_a.status) == "completed", "node_a should complete"
        assert str(node_b.status) == "completed", "node_b should complete after all expressions resolved"

        # Verify node_a produced the expected output structure
        node_a_output = (
            node_a.output_data
            if isinstance(node_a.output_data, dict)
            else getattr(node_a.output_data, "additional_properties", {})
        )

        assert "stdout_json" in node_a_output, "node_a output should have 'stdout_json' field"
        stdout_json = node_a_output["stdout_json"]

        assert "name" in stdout_json, "node_a stdout_json should have 'name' field"
        assert "team" in stdout_json, "node_a stdout_json should have 'team' field"
        assert "role" in stdout_json, "node_a stdout_json should have 'role' field"

        assert stdout_json["name"] == "test-user"
        assert stdout_json["team"] == "engineering"
        assert stdout_json["role"] == "admin"

        # Verify node_b received all resolved values
        node_b_output = (
            node_b.output_data
            if isinstance(node_b.output_data, dict)
            else getattr(node_b.output_data, "additional_properties", {})
        )
        assert node_b_output is not None, "node_b should have output data"
        node_b_stdout = node_b_output.get("stdout", "")

        # Script prints "User: {name}, Team: {team}, Role: {role}"
        assert "test-user" in node_b_stdout, (
            f"node_b should have received resolved user_name. Expected 'test-user' in stdout, got: {node_b_stdout}"
        )
        assert "engineering" in node_b_stdout, (
            f"node_b should have received resolved user_team. Expected 'engineering' in stdout, got: {node_b_stdout}"
        )
        assert "admin" in node_b_stdout, (
            f"node_b should have received resolved user_role. Expected 'admin' in stdout, got: {node_b_stdout}"
        )

    def test_trigger_input_reference_resolution(
        self, nexus_api: NexusApiRegistry, workflow_factory: Callable[[WorkflowCreate], WorkflowRead]
    ):
        """Test that ${trigger_node.field} expressions resolve trigger output values.

        Test Plan: API-19 (NOT COVERED - system variables not implemented)

        NOTE: API-19 expects ${inputs.*}, ${execution.id}, and ${workflow.vars.x} to be supported,
        but these system variables are NOT implemented in the codebase. The 'inputs' namespace
        does not exist in the expression resolver.

        This test uses ${trigger_manual.*} instead, which references the trigger node's output.
        Trigger nodes receive input_data from ExecutionCreate and output it, making their outputs
        available to downstream nodes via ${trigger_id.field} expressions.

        Objective: Verify that downstream nodes can reference trigger node outputs via config.environment.

        Test Procedure:
        1. Create a workflow with a manual trigger
        2. Create a node that references ${trigger_manual.field} in config.environment
        3. Execute the workflow with input_data
        4. Verify the node received the trigger output values as environment variables

        Expected Results:
        - ${trigger_manual.field} in config.environment resolves to the trigger output value
        - Values are substituted before node execution and passed as env vars
        """
        workflow_name = unique_name("e2e-trigger-inputs")

        # Create workflow where a script node references trigger inputs
        workflow_data = WorkflowCreate(
            name=workflow_name,
            description="Workflow for testing trigger input resolution",
            workflow_definition=_workflow_definition_with_nodes(
                workflow_name,
                {
                    "id": "process_input",
                    "name": "Process Trigger Input",
                    "type": "script",
                    "config": {
                        "language": "python",
                        "code": (
                            "import os; "
                            "user = os.environ.get('USERNAME', 'unknown'); "
                            "action = os.environ.get('ACTION', 'none'); "
                            "print(f'Processing: user={user}, action={action}')"
                        ),
                        "environment": {
                            "USERNAME": "${trigger_manual.username}",
                            "ACTION": "${trigger_manual.action}",
                        },
                    },
                },
                edges=[{"from": "trigger_manual", "to": "process_input"}],
            ),
        )
        workflow = workflow_factory(workflow_data)

        # Execute workflow with trigger inputs
        execution = nexus_api.executions.create(
            body=ExecutionCreate(
                workflow_id=workflow.id,
                input_data=ExecutionCreateInputData.from_dict({"username": "test-user", "action": "deploy"}),
            )
        ).assert_and_get()

        # Wait for completion
        final_execution = poll_execution_until_complete(nexus_api, execution.id)

        # Verify execution completed
        assert str(final_execution.status) == "completed", (
            f"Execution should complete successfully, got: {final_execution.status}"
        )

        # Verify node received resolved input values
        activities_by_id = {activity.activity_id: activity for activity in final_execution.activities}

        assert "process_input" in activities_by_id, "process_input activity should exist"
        process_activity = activities_by_id["process_input"]

        assert str(process_activity.status) == "completed", (
            "process_input should complete after trigger input resolution"
        )

        # Verify the script executed with resolved values from trigger inputs
        assert process_activity.output_data is not None, "Activity should have output"

        process_output = (
            process_activity.output_data
            if isinstance(process_activity.output_data, dict)
            else getattr(process_activity.output_data, "additional_properties", {})
        )
        process_stdout = process_output.get("stdout", "")

        # Script prints "Processing: user={user}, action={action}"
        assert "test-user" in process_stdout, (
            f"process_input should have received resolved username from trigger inputs. "
            f"Expected 'test-user' in stdout, got: {process_stdout}"
        )
        assert "deploy" in process_stdout, (
            f"process_input should have received resolved action from trigger inputs. "
            f"Expected 'deploy' in stdout, got: {process_stdout}"
        )
