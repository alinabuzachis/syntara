"""E2E tests for workflow verification and change tracking.

Exercises the verification and change-tracking flows as specified in the
Workflow Verification & Testing epic. Tests are API-level E2E tests against
a running Nexus instance.
"""

from __future__ import annotations

import os
from http import HTTPStatus
from typing import TYPE_CHECKING, Any

import pytest
from nexus_api_client.models.publish_version_request import PublishVersionRequest
from nexus_api_client.models.workflow_create import WorkflowCreate
from nexus_api_client.models.workflow_definition import WorkflowDefinition
from nexus_api_client.models.workflow_update import WorkflowUpdate

from tests.e2e.conftest import unique_name
from tests.e2e.helpers import connected_definition, extended_definition, orphaned_definition

if TYPE_CHECKING:
    from collections.abc import Callable
    from uuid import UUID

    from nexus_api_client.api import NexusApiRegistry
    from nexus_api_client.models.workflow_read import WorkflowRead

    WorkflowFactory = Callable[[WorkflowCreate], WorkflowRead]

if not os.environ.get("APP_BASE_URL"):
    pytest.skip("APP_BASE_URL not set — full stack required", allow_module_level=True)

pytestmark = [pytest.mark.e2e]


def _create_workflow(
    workflow_factory: WorkflowFactory,
    name_prefix: str,
    definition: dict[str, Any],
    project_id: UUID,
    description: str = "",
) -> WorkflowRead:
    """Create a workflow via the factory (handles cleanup automatically)."""
    return workflow_factory(
        WorkflowCreate(
            name=unique_name(name_prefix),
            description=description,
            workflow_definition=WorkflowDefinition.from_dict(definition),
            project_id=project_id,
        )
    )


# ---------------------------------------------------------------------------
# Publish blocked with validation errors
# ---------------------------------------------------------------------------


class TestPublishBlockedWithErrors:
    """Publish blocked when validation errors exist.

    Given a workflow with validation errors saved via force_save,
    when publish is attempted, then a 409 Conflict is returned
    and the workflow remains disabled.
    """

    def test_publish_rejected_for_orphaned_workflow(
        self,
        nexus_api: NexusApiRegistry,
        workflow_factory: WorkflowFactory,
        first_project_id: UUID,
    ) -> None:
        """Save orphaned definition, attempt publish, verify rejection."""
        workflow = _create_workflow(workflow_factory, "e2e-ac2-publish-block", connected_definition(), first_project_id)

        break_resp = nexus_api.workflows.update(
            workflow_id=workflow.id,
            body=WorkflowUpdate(
                workflow_definition=WorkflowDefinition.from_dict(orphaned_definition()),
            ),
            force_save=True,
        )
        assert break_resp.status_code == HTTPStatus.OK, (
            f"Precondition: force_save should succeed, got {break_resp.status_code}"
        )

        refreshed = nexus_api.workflows.get(workflow_id=workflow.id).assert_and_get()

        publish_resp = nexus_api.workflows.publish_version(
            workflow_id=workflow.id,
            version=refreshed.current_version,
            body=PublishVersionRequest(publish_name="should-fail"),
        )

        assert publish_resp.status_code == HTTPStatus.CONFLICT, (
            f"Expected 409 for publish with validation errors, got {publish_resp.status_code}"
        )

        final = nexus_api.workflows.get(workflow_id=workflow.id).assert_and_get()
        assert final.is_enabled is False, "Workflow should remain disabled after failed publish"


# ---------------------------------------------------------------------------
# Force save with validation errors
# ---------------------------------------------------------------------------


class TestForceSaveWithErrors:
    """Force save with validation errors.

    Given a workflow with validation errors, when PATCH /workflows/{id}
    is called with force_save=true, then the workflow is saved (new version
    created), is_enabled remains false, and has_validation_issues reflects
    the error state.
    """

    def test_force_save_persists_with_errors(
        self,
        nexus_api: NexusApiRegistry,
        workflow_factory: WorkflowFactory,
        first_project_id: UUID,
    ) -> None:
        """Force-save a workflow with validation errors."""
        workflow = _create_workflow(workflow_factory, "e2e-ac3-force-save", connected_definition(), first_project_id)
        initial_version = workflow.current_version

        update_resp = nexus_api.workflows.update(
            workflow_id=workflow.id,
            body=WorkflowUpdate(
                workflow_definition=WorkflowDefinition.from_dict(orphaned_definition()),
            ),
            force_save=True,
        )
        assert update_resp.status_code == HTTPStatus.OK, (
            f"Expected 200 for force_save update, got {update_resp.status_code}: {update_resp.content!r}"
        )

        refreshed = nexus_api.workflows.get(workflow_id=workflow.id).assert_and_get()
        assert refreshed.current_version > initial_version, "Force-save should create a new version"
        assert refreshed.is_enabled is False, "Workflow should remain disabled after force-save with errors"
        assert refreshed.has_validation_issues is True, "has_validation_issues should be True after force-save"

    def test_update_without_force_save_rejects_errors(
        self,
        nexus_api: NexusApiRegistry,
        workflow_factory: WorkflowFactory,
        first_project_id: UUID,
    ) -> None:
        """Updating with validation errors and force_save=false is rejected."""
        workflow = _create_workflow(workflow_factory, "e2e-ac3-no-force", connected_definition(), first_project_id)

        update_resp = nexus_api.workflows.update(
            workflow_id=workflow.id,
            body=WorkflowUpdate(
                workflow_definition=WorkflowDefinition.from_dict(orphaned_definition()),
            ),
            force_save=False,
        )
        assert update_resp.status_code == HTTPStatus.UNPROCESSABLE_ENTITY, (
            f"Expected 422 when saving errors without force_save, got {update_resp.status_code}"
        )

        refreshed = nexus_api.workflows.get(workflow_id=workflow.id).assert_and_get()
        assert refreshed.current_version == workflow.current_version, (
            "Version should not increment after rejected update"
        )
        assert refreshed.has_validation_issues is False, "has_validation_issues should be False after rejection"


# ---------------------------------------------------------------------------
# Fix validation errors then publish succeeds
# ---------------------------------------------------------------------------


class TestFixErrorsThenPublish:
    """Fix validation errors, then publish succeeds.

    Given a workflow updated to fix all errors (reconnected edge),
    when validated then is_valid=true, and when published then
    is_enabled=true.
    """

    def test_reconnected_workflow_validates_and_publishes(
        self,
        nexus_api: NexusApiRegistry,
        workflow_factory: WorkflowFactory,
        first_project_id: UUID,
    ) -> None:
        """Create with orphan, fix, validate clean, publish."""
        workflow = _create_workflow(
            workflow_factory,
            "e2e-ac4-fix-publish",
            connected_definition(),
            first_project_id,
            "fix errors then publish",
        )

        break_resp = nexus_api.workflows.update(
            workflow_id=workflow.id,
            body=WorkflowUpdate(
                workflow_definition=WorkflowDefinition.from_dict(orphaned_definition()),
            ),
            force_save=True,
        )
        assert break_resp.status_code == HTTPStatus.OK, (
            f"Precondition: force_save should succeed, got {break_resp.status_code}"
        )

        fixed_def = connected_definition()
        fix_resp = nexus_api.workflows.update(
            workflow_id=workflow.id,
            body=WorkflowUpdate(
                workflow_definition=WorkflowDefinition.from_dict(fixed_def),
            ),
        )
        assert fix_resp.status_code == HTTPStatus.OK, (
            f"Precondition: fix update should succeed, got {fix_resp.status_code}"
        )

        refreshed = nexus_api.workflows.get(workflow_id=workflow.id).assert_and_get()

        publish_resp = nexus_api.workflows.publish_version(
            workflow_id=workflow.id,
            version=refreshed.current_version,
            body=PublishVersionRequest(publish_name="fixed-and-published"),
        )
        assert publish_resp.status_code == HTTPStatus.OK, (
            f"Expected publish to succeed, got {publish_resp.status_code}: {publish_resp.content!r}"
        )

        final = nexus_api.workflows.get(workflow_id=workflow.id).assert_and_get()
        assert final.is_enabled is True, "Workflow should be enabled after successful publish"
        assert final.has_validation_issues is False, "has_validation_issues should be cleared after fix and publish"

        published = nexus_api.workflows.get_version(
            workflow_id=workflow.id, version=final.published_version
        ).assert_and_get()
        edge_pairs = [(e["from"], e["to"]) for e in published.workflow_definition["edges"]]
        assert ("trigger", "condition_node") in edge_pairs, (
            "Published version should contain the reconnected trigger->condition edge"
        )


# ---------------------------------------------------------------------------
# Version history with timestamps and user IDs
# ---------------------------------------------------------------------------


class TestVersionHistory:
    """Version history with metadata.

    Given a workflow saved multiple times, when GET /workflows/{id}/versions
    is called, then all versions are returned with timestamps and user IDs.
    """

    def test_multiple_versions_with_metadata(
        self,
        nexus_api: NexusApiRegistry,
        workflow_factory: WorkflowFactory,
        first_project_id: UUID,
    ) -> None:
        """Create workflow, update (adding nodes), verify version history."""
        workflow = _create_workflow(workflow_factory, "e2e-ac6-versions", connected_definition(), first_project_id)

        update_resp = nexus_api.workflows.update(
            workflow_id=workflow.id,
            body=WorkflowUpdate(
                workflow_definition=WorkflowDefinition.from_dict(extended_definition()),
                change_description="Added extra processing step",
            ),
        )
        assert update_resp.status_code == HTTPStatus.OK, (
            f"Precondition: update should succeed, got {update_resp.status_code}"
        )

        versions_resp = nexus_api.workflows.list_versions(workflow_id=workflow.id)
        versions_list = versions_resp.assert_and_get()

        assert len(versions_list.resources) == 2, f"Expected 2 versions, got {len(versions_list.resources)}"

        by_version = {v.version: v for v in versions_list.resources}
        assert 1 in by_version, "Version 1 should exist"
        assert 2 in by_version, "Version 2 should exist"

        for version in versions_list.resources:
            assert version.id is not None, "Version should have an ID"
            assert version.created_at is not None, f"Version {version.version} should have created_at"
            assert version.created_by is not None, f"Version {version.version} should have created_by"
            assert version.workflow_id == workflow.id, f"Version {version.version} should reference the workflow"

        v2 = by_version[2]
        assert v2.change_description == "Added extra processing step", (
            f"Expected change description, got: {v2.change_description}"
        )
