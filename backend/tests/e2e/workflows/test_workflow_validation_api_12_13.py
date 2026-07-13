"""E2E tests for Workflow Validation (AAP-58017).

Tests variable reference validation and publish blocking on validation errors.

API-12: Validate Workflow — Variable Reference Validation
API-13: Validate Workflow — Cannot Enable Until Verification Passes

Run with:
    APP_BASE_URL=http://localhost:8000 make test-e2e
"""

import os
from http import HTTPStatus
from typing import Any
from uuid import UUID

import pytest
from nexus_api_client.api import NexusApiRegistry
from nexus_api_client.models import WorkflowDefinition
from nexus_api_client.models.publish_version_request import PublishVersionRequest
from nexus_api_client.models.workflow_create import WorkflowCreate
from nexus_api_client.models.workflow_update import WorkflowUpdate
from nexus_api_client.models.workflow_validate_request import WorkflowValidateRequest
from nexus_api_client.types import Response

if not os.environ.get("APP_BASE_URL"):
    pytest.skip("APP_BASE_URL not set — full stack required", allow_module_level=True)

pytestmark = [pytest.mark.e2e]


def _definition(
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    triggers: list[dict[str, Any]] | None = None,
) -> WorkflowDefinition:
    """Build a WorkflowDefinition with standard defaults."""
    if triggers is None:
        triggers = [{"id": "trigger", "type": "manual_trigger", "parameters": {}}]

    return WorkflowDefinition.from_dict(
        {
            "name": "validation-test",
            "schema_version": "2.0.0",
            "triggers": triggers,
            "nodes": nodes,
            "edges": edges,
        }
    )


def _validate(nexus_api: NexusApiRegistry, definition: WorkflowDefinition) -> Response[Any]:
    """Call POST /workflows/validate/detailed and return the raw Response."""
    return nexus_api.workflows.validate_definition_detailed(
        body=WorkflowValidateRequest(workflow_definition=definition)
    )


class TestVariableReferenceValidation:
    """API-12: Validate Workflow — Variable Reference Validation.

    Objective: Verify that invalid ${...} variable references are caught at validation time.

    Expected Results:
    - Validation returns an error identifying the unresolvable variable reference
    - The error specifies the node and the invalid expression
    """

    def test_reference_to_nonexistent_node_rejected(self, nexus_api: NexusApiRegistry) -> None:
        """Expression referencing a non-existent node produces a validation error."""
        definition = _definition(
            nodes=[
                {
                    "id": "node_a",
                    "name": "Node A",
                    "type": "script",
                    "parameters": {
                        "language": "bash",
                        "code": "echo hello",
                        "environment": {"VAR": "${nonexistent_node.stdout}"},
                    },
                },
            ],
            edges=[{"from": "trigger", "to": "node_a"}],
        )

        response = _validate(nexus_api, definition)

        # Variable reference errors can return either 200 with findings or 422 with validation_result
        assert response.status_code in (HTTPStatus.OK, HTTPStatus.UNPROCESSABLE_ENTITY), (
            f"Unexpected status {response.status_code}"
        )

        body = response.parsed
        assert body is not None

        # Extract validation result (handles both response formats)
        validation_result = getattr(body, "validation_result", None) or body
        findings = getattr(validation_result, "findings", []) or []
        is_valid = getattr(validation_result, "is_valid", True)

        assert not is_valid, "Validation should fail for reference to nonexistent node"

        # Check that the error identifies the unresolvable variable reference
        finding_messages = [f.message for f in findings]
        has_variable_error = any("nonexistent_node" in msg and "unknown activity" in msg for msg in finding_messages)
        assert has_variable_error, f"Expected error about nonexistent_node reference, got: {finding_messages}"

        # Check that the error specifies the node with the invalid expression
        node_ids = [f.node_id for f in findings if f.node_id]
        assert "node_a" in node_ids, f"Expected node_id 'node_a' in findings, got: {node_ids}"

    def test_reference_to_nonexistent_scope_rejected(self, nexus_api: NexusApiRegistry) -> None:
        """Expression referencing an unknown scope (not a builtin or node ID) is rejected."""
        definition = _definition(
            nodes=[
                {
                    "id": "node_b",
                    "name": "Node B",
                    "type": "script",
                    "parameters": {
                        "language": "bash",
                        "code": "echo hello",
                        "environment": {"VAR": "${unknown_scope.field}"},
                    },
                },
            ],
            edges=[{"from": "trigger", "to": "node_b"}],
        )

        response = _validate(nexus_api, definition)

        assert response.status_code in (HTTPStatus.OK, HTTPStatus.UNPROCESSABLE_ENTITY)

        body = response.parsed
        assert body is not None

        validation_result = getattr(body, "validation_result", None) or body
        findings = getattr(validation_result, "findings", []) or []
        is_valid = getattr(validation_result, "is_valid", True)

        assert not is_valid, "Validation should fail for unknown scope"

        finding_messages = [f.message for f in findings]
        has_scope_error = any("unknown_scope" in msg for msg in finding_messages)
        assert has_scope_error, f"Expected error about unknown_scope, got: {finding_messages}"

    def test_loop_scope_outside_loop_body_rejected(self, nexus_api: NexusApiRegistry) -> None:
        """${loop.*} expression outside a loop body is flagged."""
        definition = _definition(
            nodes=[
                {
                    "id": "node_c",
                    "name": "Node C",
                    "type": "script",
                    "parameters": {
                        "language": "bash",
                        "code": "echo hello",
                        "environment": {"ITEM": "${loop.item}"},
                    },
                },
            ],
            edges=[{"from": "trigger", "to": "node_c"}],
        )

        response = _validate(nexus_api, definition)

        assert response.status_code in (HTTPStatus.OK, HTTPStatus.UNPROCESSABLE_ENTITY)

        body = response.parsed
        assert body is not None

        validation_result = getattr(body, "validation_result", None) or body
        findings = getattr(validation_result, "findings", []) or []
        is_valid = getattr(validation_result, "is_valid", True)

        assert not is_valid, "Validation should fail for loop scope outside loop body"

        finding_messages = [f.message for f in findings]
        has_loop_error = any("loop scope outside" in msg or "loop body" in msg for msg in finding_messages)
        assert has_loop_error, f"Expected error about loop scope, got: {finding_messages}"

    def test_valid_variable_references_accepted(self, nexus_api: NexusApiRegistry) -> None:
        """Valid references to upstream nodes and builtin scopes pass validation."""
        definition = _definition(
            nodes=[
                {
                    "id": "step_a",
                    "name": "Step A",
                    "type": "script",
                    "parameters": {"language": "bash", "code": "echo 'hello'"},
                },
                {
                    "id": "step_b",
                    "name": "Step B",
                    "type": "script",
                    "parameters": {
                        "language": "bash",
                        "code": "echo hello",
                        "environment": {
                            "UPSTREAM": "${step_a.stdout}",
                            "EXEC_ID": "${workflow_context.execution.id}",
                            "INPUT": "${inputs.param}",
                        },
                    },
                },
            ],
            edges=[
                {"from": "trigger", "to": "step_a"},
                {"from": "step_a", "to": "step_b"},
            ],
        )

        response = _validate(nexus_api, definition)

        assert response.status_code == HTTPStatus.OK, (
            f"Expected 200 for valid references, got {response.status_code}: {response.content!r}"
        )

        body = response.parsed
        assert body is not None
        assert body.is_valid is True, f"Expected is_valid=True, got findings: {getattr(body, 'findings', [])}"
        assert body.error_count == 0, f"Expected 0 errors, got {body.error_count}"


class TestPublishValidationBlocking:
    """API-13: Validate Workflow — Cannot Enable Until Verification Passes.

    Objective: Verify that a workflow cannot be enabled/published until all verification checks pass.

    Test Procedure:
    1. Create a workflow with a misconfigured node (missing required parameter)
    2. Attempt to publish the workflow
    3. Fix the misconfiguration
    4. Re-publish the workflow

    Expected Results:
    - The publish request is rejected when verification fails
    - After fixing the misconfiguration, the publish request succeeds
    """

    def test_publish_rejected_when_validation_fails(self, nexus_api: NexusApiRegistry, first_project_id: UUID) -> None:
        """Workflow with validation errors cannot be published."""
        # Create a workflow with invalid variable reference
        workflow_definition = _definition(
            nodes=[
                {
                    "id": "misconfigured_node",
                    "name": "Misconfigured Node",
                    "type": "script",
                    "parameters": {
                        "language": "bash",
                        "code": "echo hello",
                        "environment": {"VAR": "${nonexistent_node.stdout}"},
                    },
                },
            ],
            edges=[{"from": "trigger", "to": "misconfigured_node"}],
        )

        # Create the workflow with force_save=True to bypass validation
        create_response = nexus_api.workflows.create(
            body=WorkflowCreate(
                name="test-publish-invalid",
                project_id=first_project_id,
                workflow_definition=workflow_definition,
            ),
            force_save=True,
        )
        assert create_response.status_code == HTTPStatus.CREATED, (
            f"Failed to create workflow: {create_response.status_code}"
        )
        workflow = create_response.parsed
        assert workflow is not None
        workflow_id = workflow.id

        try:
            # Validate the workflow - should fail
            validate_response = _validate(nexus_api, workflow_definition)
            validation_result = getattr(validate_response.parsed, "validation_result", None) or validate_response.parsed
            is_valid = getattr(validation_result, "is_valid", True)
            assert not is_valid, "Workflow with invalid variable reference should fail validation"

            # Attempt to publish the workflow - should be rejected
            publish_response = nexus_api.workflows.publish_version(
                workflow_id=workflow_id,
                version=1,
                body=PublishVersionRequest(
                    publish_name="initial-publish",
                    change_description="Attempting to publish invalid workflow",
                ),
            )

            # Expect publish to fail (400, 409, or 422)
            assert publish_response.status_code in (
                HTTPStatus.BAD_REQUEST,
                HTTPStatus.CONFLICT,
                HTTPStatus.UNPROCESSABLE_ENTITY,
            ), f"Expected 400/409/422 when publishing invalid workflow, got {publish_response.status_code}"

            # Verify workflow is not enabled
            get_response = nexus_api.workflows.get(workflow_id=workflow_id)
            assert get_response.status_code == HTTPStatus.OK
            workflow_details = get_response.parsed
            assert workflow_details is not None
            assert workflow_details.is_enabled is False, "Workflow should not be enabled after failed publish"

        finally:
            # Cleanup
            nexus_api.workflows.delete(workflow_id=workflow_id)

    def test_publish_succeeds_after_fixing_validation_errors(
        self, nexus_api: NexusApiRegistry, first_project_id: UUID
    ) -> None:
        """Workflow can be published after fixing validation errors."""
        # Create a workflow with invalid variable reference
        invalid_definition = _definition(
            nodes=[
                {
                    "id": "script_node",
                    "name": "Script Node",
                    "type": "script",
                    "parameters": {
                        "language": "bash",
                        "code": "echo hello",
                        "environment": {"VAR": "${nonexistent.stdout}"},
                    },
                },
            ],
            edges=[{"from": "trigger", "to": "script_node"}],
        )

        # Create the workflow with force_save=True to bypass validation
        create_response = nexus_api.workflows.create(
            body=WorkflowCreate(
                name="test-publish-then-fix",
                project_id=first_project_id,
                workflow_definition=invalid_definition,
            ),
            force_save=True,
        )
        assert create_response.status_code == HTTPStatus.CREATED
        workflow = create_response.parsed
        assert workflow is not None
        workflow_id = workflow.id

        try:
            # Verify initial validation fails
            initial_validate = _validate(nexus_api, invalid_definition)
            initial_result = getattr(initial_validate.parsed, "validation_result", None) or initial_validate.parsed
            assert not getattr(initial_result, "is_valid", True), "Initial workflow should fail validation"

            # Attempt to publish - should fail
            initial_publish = nexus_api.workflows.publish_version(
                workflow_id=workflow_id,
                version=1,
                body=PublishVersionRequest(publish_name="initial"),
            )
            assert initial_publish.status_code in (
                HTTPStatus.BAD_REQUEST,
                HTTPStatus.CONFLICT,
                HTTPStatus.UNPROCESSABLE_ENTITY,
            )

            # Fix the workflow by removing the invalid variable reference
            fixed_definition = _definition(
                nodes=[
                    {
                        "id": "script_node",
                        "name": "Script Node",
                        "type": "script",
                        "parameters": {
                            "language": "bash",
                            "code": "echo 'Fixed'",
                            "environment": {"VAR": "static_value"},
                        },
                    },
                ],
                edges=[{"from": "trigger", "to": "script_node"}],
            )

            # Update the workflow
            update_response = nexus_api.workflows.update(
                workflow_id=workflow_id,
                body=WorkflowUpdate(workflow_definition=fixed_definition),
            )
            assert update_response.status_code == HTTPStatus.OK, "Failed to update workflow"

            # Validate again - should now pass
            fixed_validate = _validate(nexus_api, fixed_definition)
            assert fixed_validate.status_code == HTTPStatus.OK
            fixed_result = fixed_validate.parsed
            assert fixed_result is not None
            assert fixed_result.is_valid is True, "Fixed workflow should pass validation"
            assert fixed_result.error_count == 0

            # Now publish should succeed
            fixed_publish = nexus_api.workflows.publish_version(
                workflow_id=workflow_id,
                version=2,  # Version incremented after update
                body=PublishVersionRequest(
                    publish_name="fixed-publish",
                    change_description="Published after fixing validation errors",
                ),
            )
            assert fixed_publish.status_code == HTTPStatus.OK, (
                f"Expected 200 when publishing fixed workflow, got {fixed_publish.status_code}"
            )

            # Verify workflow is now enabled
            get_response = nexus_api.workflows.get(workflow_id=workflow_id)
            assert get_response.status_code == HTTPStatus.OK
            workflow_details = get_response.parsed
            assert workflow_details is not None
            assert workflow_details.is_enabled is True, "Workflow should be enabled after successful publish"

        finally:
            # Cleanup
            nexus_api.workflows.delete(workflow_id=workflow_id)
