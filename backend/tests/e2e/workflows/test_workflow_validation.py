"""E2E tests for Workflow Definition Validation (ANSTRAT-1845).

Tests DAG validation including cycle detection and orphaned node detection
via the POST /workflows/validate/detailed endpoint.

API-10: Validate Workflow — Cycle Detection
API-11: Validate Workflow — Orphaned Node Detection

Run with:
    APP_BASE_URL=http://localhost:8000 make test-e2e
"""

import os
from http import HTTPStatus
from typing import Any
from uuid import UUID

import pytest
from nexus_api_client.api import NexusApiRegistry
from nexus_api_client.models import WorkflowCreate, WorkflowDefinition
from nexus_api_client.models.publish_version_request import PublishVersionRequest
from nexus_api_client.models.workflow_update import WorkflowUpdate
from nexus_api_client.models.workflow_validate_request import WorkflowValidateRequest
from nexus_api_client.types import Response

from tests.e2e.conftest import unique_name

if not os.environ.get("APP_BASE_URL"):
    pytest.skip("APP_BASE_URL not set — full stack required", allow_module_level=True)

pytestmark = [pytest.mark.e2e]


def _definition(
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
) -> WorkflowDefinition:
    return WorkflowDefinition.from_dict(
        {
            "name": "validation-test",
            "schema_version": "2.0.0",
            "triggers": [{"id": "trigger", "type": "manual_trigger", "parameters": {}}],
            "nodes": nodes,
            "edges": edges,
        }
    )


def _validate(nexus_api: NexusApiRegistry, definition: WorkflowDefinition) -> Response[Any]:
    """Call POST /workflows/validate/detailed and return the raw Response."""
    return nexus_api.workflows.validate_definition_detailed(
        body=WorkflowValidateRequest(workflow_definition=definition)
    )


class TestCycleDetection:
    """API-10: Validate Workflow — Cycle Detection.

    Objective: Verify that the API rejects workflow definitions containing cycles.

    Expected Results:
    - A definition with a back-edge is rejected with a 422 response.
    - The response body includes a finding with category == "cycle_detected".
    - The existing valid portion of the DAG remains described correctly.
    - A definition without cycles is accepted with is_valid == True.
    """

    def test_direct_self_loop_rejected(self, nexus_api: NexusApiRegistry) -> None:
        """A node that points to itself is a trivial cycle and must be rejected."""
        definition = _definition(
            nodes=[{"id": "node_a", "name": "A", "type": "script", "parameters": {"language": "bash", "code": "true"}}],
            edges=[
                {"from": "trigger", "to": "node_a"},
                {"from": "node_a", "to": "node_a"},  # self-loop
            ],
        )

        response = _validate(nexus_api, definition)

        assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY, (
            f"Expected 422 for a self-loop, got {response.status_code}"
        )

        body = response.parsed
        assert body is not None

        # Body is a DetailedValidationProblemDetail; its nested ValidationResult has the findings.
        validation_result = getattr(body, "validation_result", None)
        assert validation_result is not None, f"Expected validation_result in response body, got: {body}"
        assert not validation_result.is_valid, "Validation should fail for a self-loop"

        categories = [f.category for f in (validation_result.findings or [])]
        assert "cycle_detected" in categories, f"Expected a 'cycle_detected' finding, got categories: {categories}"

    def test_two_node_mutual_cycle_rejected(self, nexus_api: NexusApiRegistry) -> None:
        """A → B → A creates a two-node cycle and must be rejected."""
        definition = _definition(
            nodes=[
                {"id": "node_a", "name": "A", "type": "script", "parameters": {"language": "bash", "code": "true"}},
                {"id": "node_b", "name": "B", "type": "script", "parameters": {"language": "bash", "code": "true"}},
            ],
            edges=[
                {"from": "trigger", "to": "node_a"},
                {"from": "node_a", "to": "node_b"},
                {"from": "node_b", "to": "node_a"},  # back-edge — creates cycle
            ],
        )

        response = _validate(nexus_api, definition)

        assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY, (
            f"Expected 422 for a two-node mutual cycle, got {response.status_code}"
        )

        body = response.parsed
        validation_result = getattr(body, "validation_result", None)
        assert validation_result is not None
        assert not validation_result.is_valid

        categories = [f.category for f in (validation_result.findings or [])]
        assert "cycle_detected" in categories, f"Expected a 'cycle_detected' finding, got categories: {categories}"

    def test_three_node_cycle_rejected(self, nexus_api: NexusApiRegistry) -> None:
        """A → B → C → A creates a three-node cycle and must be rejected."""
        definition = _definition(
            nodes=[
                {"id": "node_a", "name": "A", "type": "script", "parameters": {"language": "bash", "code": "true"}},
                {"id": "node_b", "name": "B", "type": "script", "parameters": {"language": "bash", "code": "true"}},
                {"id": "node_c", "name": "C", "type": "script", "parameters": {"language": "bash", "code": "true"}},
            ],
            edges=[
                {"from": "trigger", "to": "node_a"},
                {"from": "node_a", "to": "node_b"},
                {"from": "node_b", "to": "node_c"},
                {"from": "node_c", "to": "node_a"},  # back-edge — creates cycle
            ],
        )

        response = _validate(nexus_api, definition)

        assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY, (
            f"Expected 422 for a three-node cycle, got {response.status_code}"
        )

        body = response.parsed
        validation_result = getattr(body, "validation_result", None)
        assert validation_result is not None
        assert not validation_result.is_valid

        categories = [f.category for f in (validation_result.findings or [])]
        assert "cycle_detected" in categories, f"Expected a 'cycle_detected' finding, got categories: {categories}"

    def test_valid_linear_dag_accepted(self, nexus_api: NexusApiRegistry) -> None:
        """A valid linear DAG (trigger → A → B → C) passes validation."""
        definition = _definition(
            nodes=[
                {"id": "node_a", "name": "A", "type": "script", "parameters": {"language": "bash", "code": "true"}},
                {"id": "node_b", "name": "B", "type": "script", "parameters": {"language": "bash", "code": "true"}},
                {"id": "node_c", "name": "C", "type": "script", "parameters": {"language": "bash", "code": "true"}},
            ],
            edges=[
                {"from": "trigger", "to": "node_a"},
                {"from": "node_a", "to": "node_b"},
                {"from": "node_b", "to": "node_c"},
            ],
        )

        response = _validate(nexus_api, definition)

        assert response.status_code == HTTPStatus.OK, (
            f"Expected 200 for a valid DAG, got {response.status_code}: {response.content!r}"
        )

        body = response.parsed
        assert body is not None
        assert body.is_valid is True, f"Expected is_valid=True, got findings: {getattr(body, 'findings', [])}"
        assert body.error_count == 0, f"Expected 0 errors, got {body.error_count}"

    def test_valid_fork_join_dag_accepted(self, nexus_api: NexusApiRegistry) -> None:
        """A valid fork-join DAG (trigger → A → [B, C] → converge → D) passes validation."""
        definition = _definition(
            nodes=[
                {"id": "node_a", "name": "A", "type": "script", "parameters": {"language": "bash", "code": "true"}},
                {"id": "node_b", "name": "B", "type": "script", "parameters": {"language": "bash", "code": "true"}},
                {"id": "node_c", "name": "C", "type": "script", "parameters": {"language": "bash", "code": "true"}},
                {"id": "converge", "name": "Join", "type": "converge", "parameters": {}},
                {"id": "node_d", "name": "D", "type": "script", "parameters": {"language": "bash", "code": "true"}},
            ],
            edges=[
                {"from": "trigger", "to": "node_a"},
                {"from": "node_a", "to": "node_b"},
                {"from": "node_a", "to": "node_c"},
                {"from": "node_b", "to": "converge"},
                {"from": "node_c", "to": "converge"},
                {"from": "converge", "to": "node_d"},
            ],
        )

        response = _validate(nexus_api, definition)

        assert response.status_code == HTTPStatus.OK, (
            f"Expected 200 for a valid fork-join DAG, got {response.status_code}: {response.content!r}"
        )

        body = response.parsed
        assert body is not None
        assert body.is_valid is True
        assert body.error_count == 0


class TestOrphanedNodeDetection:
    """API-11: Validate Workflow — Orphaned Node Detection.

    Objective: Verify that validation detects nodes disconnected from the rest of the workflow.

    Expected Results:
    - A definition with an isolated node (no edges touching it) is rejected.
    - The response includes a finding with category == "orphaned_node".
    - A definition where all nodes are reachable from the trigger passes.
    """

    def test_completely_isolated_node_rejected(self, nexus_api: NexusApiRegistry) -> None:
        """A node with no edges at all is an orphan and must be flagged."""
        definition = _definition(
            nodes=[
                {"id": "node_a", "name": "A", "type": "script", "parameters": {"language": "bash", "code": "true"}},
                {
                    "id": "orphan",
                    "name": "Orphan",
                    "type": "script",
                    "parameters": {"language": "bash", "code": "true"},
                },
            ],
            edges=[
                {"from": "trigger", "to": "node_a"},
                # orphan has no edges — it is disconnected from the graph
            ],
        )

        response = _validate(nexus_api, definition)

        assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY, (
            f"Expected 422 for an orphaned node, got {response.status_code}"
        )

        body = response.parsed
        assert body is not None

        validation_result = body.validation_result
        assert validation_result is not None, f"Expected validation_result in response body, got: {body}"
        assert not validation_result.is_valid, "Validation should fail when an orphaned node is present"

        categories = [f.category for f in (validation_result.findings or [])]
        assert "orphaned_node" in categories, f"Expected an 'orphaned_node' finding, got categories: {categories}"

    def test_node_with_only_outgoing_edge_detected(self, nexus_api: NexusApiRegistry) -> None:
        """A node that points to a connected node but is not reachable from the trigger is an orphan."""
        definition = _definition(
            nodes=[
                {"id": "node_a", "name": "A", "type": "script", "parameters": {"language": "bash", "code": "true"}},
                # island_src → node_a but island_src itself is unreachable from trigger
                {
                    "id": "island_src",
                    "name": "Island Source",
                    "type": "script",
                    "parameters": {"language": "bash", "code": "true"},
                },
            ],
            edges=[
                {"from": "trigger", "to": "node_a"},
                {"from": "island_src", "to": "node_a"},  # island_src has no incoming edge from trigger path
            ],
        )

        response = _validate(nexus_api, definition)

        assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY, (
            f"Expected 422 for an unreachable node, got {response.status_code}"
        )

        body = response.parsed
        assert body is not None

        validation_result = body.validation_result
        assert validation_result is not None, f"Expected validation_result in response body, got: {body}"
        assert not validation_result.is_valid, "Validation should fail when a node is unreachable from the trigger"

        categories = [f.category for f in (validation_result.findings or [])]
        assert "orphaned_node" in categories, (
            f"Expected an 'orphaned_node' finding for unreachable node, got categories: {categories}"
        )

    def ***REMOVED***(self, nexus_api: NexusApiRegistry) -> None:
        """All orphaned nodes must appear in the findings, not just the first one."""
        definition = _definition(
            nodes=[
                {"id": "node_a", "name": "A", "type": "script", "parameters": {"language": "bash", "code": "true"}},
                {
                    "id": "orphan_1",
                    "name": "Orphan 1",
                    "type": "script",
                    "parameters": {"language": "bash", "code": "true"},
                },
                {
                    "id": "orphan_2",
                    "name": "Orphan 2",
                    "type": "script",
                    "parameters": {"language": "bash", "code": "true"},
                },
            ],
            edges=[
                {"from": "trigger", "to": "node_a"},
                # orphan_1 and orphan_2 have no edges
            ],
        )

        response = _validate(nexus_api, definition)

        assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY, (
            f"Expected 422 for multiple orphaned nodes, got {response.status_code}"
        )

        body = response.parsed
        assert body is not None

        validation_result = body.validation_result
        assert validation_result is not None, f"Expected validation_result in response body, got: {body}"

        orphan_findings = [f for f in (validation_result.findings or []) if f.category == "orphaned_node"]
        assert len(orphan_findings) >= 2, (
            f"Expected at least 2 orphaned_node findings (one per orphan), "
            f"got {len(orphan_findings)}: {orphan_findings}"
        )

    def test_all_nodes_connected_passes(self, nexus_api: NexusApiRegistry) -> None:
        """A definition where every node is reachable from the trigger has no orphan findings."""
        definition = _definition(
            nodes=[
                {"id": "node_a", "name": "A", "type": "script", "parameters": {"language": "bash", "code": "true"}},
                {"id": "node_b", "name": "B", "type": "script", "parameters": {"language": "bash", "code": "true"}},
            ],
            edges=[
                {"from": "trigger", "to": "node_a"},
                {"from": "node_a", "to": "node_b"},
            ],
        )

        response = _validate(nexus_api, definition)

        assert response.status_code == HTTPStatus.OK, (
            f"Expected 200 for a fully connected graph, got {response.status_code}: {response.content!r}"
        )

        body = response.parsed
        assert body is not None
        assert body.is_valid is True

        findings = getattr(body, "findings", []) or []
        orphan_findings = [f for f in findings if f.category == "orphaned_node"]
        assert len(orphan_findings) == 0, f"Expected no orphaned_node findings, got: {orphan_findings}"


class TestOrphanedNodePublishBlocking:
    """API-11 (enable path): Verify orphaned nodes block workflow enablement.

    Supplements TestOrphanedNodeDetection with publish-path tests.
    The test plan requires that a workflow cannot be enabled until all
    orphaned nodes are removed or connected.
    """

    def test_workflow_with_orphaned_node_cannot_be_published(
        self,
        nexus_api: NexusApiRegistry,
        first_project_id: UUID,
    ) -> None:
        """A workflow saved with an orphaned node is blocked from being published.

        Procedure:
        1. Create a workflow with an orphaned node using force_save=True —
           this bypasses creation-time validation and sets has_validation_issues=True.
        2. Attempt to publish the draft version.

        Expected:
        - has_validation_issues is True on the created workflow.
        - publish_version returns a non-2xx response (409 Conflict).
        """
        name = unique_name("e2e-api11-publish-blocked")
        _params = {"language": "bash", "code": "true"}
        orphaned_definition = _definition(
            nodes=[
                {"id": "node_a", "name": "A", "type": "script", "parameters": _params},
                {"id": "orphan_c", "name": "C (orphan)", "type": "script", "parameters": _params},
            ],
            edges=[{"from": "trigger", "to": "node_a"}],
        )

        workflow = nexus_api.workflows.create(
            body=WorkflowCreate(
                name=name,
                workflow_definition=orphaned_definition,
                project_id=first_project_id,
            ),
            force_save=True,
        ).assert_and_get()
        workflow_id = UUID(str(workflow.id))

        try:
            assert workflow.has_validation_issues is True, (
                "Workflow saved with an orphaned node must have has_validation_issues=True"
            )

            publish_response = nexus_api.workflows.publish_version(
                workflow_id=workflow_id,
                version=workflow.current_version,
                body=PublishVersionRequest(),
            )
            assert publish_response.status_code == HTTPStatus.CONFLICT, (
                f"Publish should be blocked with 409 Conflict for a workflow with validation issues, "
                f"got HTTP {publish_response.status_code}"
            )
        finally:
            try:
                nexus_api.workflows.delete(workflow_id=workflow_id)
            except Exception:
                pass

    def test_workflow_becomes_publishable_after_orphan_is_removed(
        self,
        nexus_api: NexusApiRegistry,
        first_project_id: UUID,
    ) -> None:
        """After removing the orphaned node, the workflow can be published and becomes enabled.

        Procedure:
        1. Create a workflow with an orphaned node using force_save=True.
        2. Update the definition to remove the orphan (no force_save — validation runs).
        3. Publish the updated version.

        Expected:
        - The update succeeds and has_validation_issues becomes False.
        - publish_version returns 200 and the workflow is_enabled becomes True.
        """
        name = unique_name("e2e-api11-publish-fixed")
        _params = {"language": "bash", "code": "true"}
        orphaned_definition = _definition(
            nodes=[
                {"id": "node_a", "name": "A", "type": "script", "parameters": _params},
                {"id": "orphan_c", "name": "C (orphan)", "type": "script", "parameters": _params},
            ],
            edges=[{"from": "trigger", "to": "node_a"}],
        )

        workflow = nexus_api.workflows.create(
            body=WorkflowCreate(
                name=name,
                workflow_definition=orphaned_definition,
                project_id=first_project_id,
            ),
            force_save=True,
        ).assert_and_get()
        workflow_id = UUID(str(workflow.id))

        try:
            assert workflow.has_validation_issues is True

            # Remove the orphan — update with a valid definition (validation runs, no force_save).
            valid_definition = _definition(
                nodes=[
                    {"id": "node_a", "name": "A", "type": "script", "parameters": {"language": "bash", "code": "true"}},
                ],
                edges=[{"from": "trigger", "to": "node_a"}],
            )
            updated = nexus_api.workflows.update(
                workflow_id=workflow_id,
                body=WorkflowUpdate(workflow_definition=valid_definition),
            ).assert_and_get()
            assert updated.has_validation_issues is False, (
                "After removing the orphan, has_validation_issues should be False"
            )

            # Publish the now-valid version.
            published = nexus_api.workflows.publish_version(
                workflow_id=workflow_id,
                version=updated.current_version,
                body=PublishVersionRequest(),
            ).assert_and_get()
            assert published.is_enabled is True, "Workflow should be enabled (is_enabled=True) after successful publish"
        finally:
            try:
                nexus_api.workflows.unpublish(workflow_id=workflow_id)
            except Exception:
                pass
            try:
                nexus_api.workflows.delete(workflow_id=workflow_id)
            except Exception:
                pass


class TestInvalidEdgeReferenceValidation:
    """Edges referencing non-existent nodes are rejected.

    Given a workflow definition with an edge pointing to a node ID
    that does not exist, validation returns a finding with
    category=invalid_reference.
    """

    def test_edge_to_nonexistent_node_rejected(self, nexus_api: NexusApiRegistry) -> None:
        """An edge targeting a non-existent node produces an invalid_reference finding."""
        definition = _definition(
            nodes=[
                {
                    "id": "action_node",
                    "name": "Run Action",
                    "type": "script",
                    "parameters": {"language": "bash", "code": "echo 'hello'"},
                },
            ],
            edges=[{"from": "trigger", "to": "nonexistent_node"}],
        )

        response = _validate(nexus_api, definition)

        assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY, (
            f"Expected 422 for invalid edge reference, got {response.status_code}"
        )

        body = response.parsed
        assert body is not None

        validation_result = body.validation_result
        assert validation_result is not None, f"Expected validation_result in response body, got: {body}"
        categories = [f.category for f in (validation_result.findings or [])]
        assert "invalid_reference" in categories, f"Expected invalid_reference finding, got categories: {categories}"
