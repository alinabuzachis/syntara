"""E2E tests for PATCH /api/v1/workflows/{id} endpoint.

Tests for updating workflow metadata.
"""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING
from uuid import uuid4

import pytest
from nexus_api_client.models.project_create import ProjectCreate
from nexus_api_client.models.workflow_create import WorkflowCreate
from nexus_api_client.models.workflow_definition import WorkflowDefinition
from nexus_api_client.models.workflow_update import WorkflowUpdate
from nexus_api_client.models.workflow_update_labels_type_0 import WorkflowUpdateLabelsType0

from tests.e2e.conftest import unique_name
from tests.helpers.workflow import create_minimal_workflow_definition, create_workflow_definition_with_activities

if TYPE_CHECKING:
    from collections.abc import Callable

    from nexus_api_client.api import NexusApiRegistry
    from nexus_api_client.models.workflow_read import WorkflowRead

    WorkflowFactory = Callable[[WorkflowCreate], WorkflowRead]

pytestmark = [pytest.mark.e2e]


class TestWorkflowUpdate:
    """E2E tests for updating workflows."""

    def test_update_workflow_labels(
        self,
        nexus_api: NexusApiRegistry,
        workflow_factory: WorkflowFactory,
    ) -> None:
        """Test updating workflow labels.

        Expected: 200 OK with updated labels
        """
        # Create workflow with labels
        from nexus_api_client.models.workflow_create_labels import WorkflowCreateLabels

        workflow_name = unique_name("labeled-workflow")
        workflow = workflow_factory(
            WorkflowCreate(
                name=workflow_name,
                description="Labeled workflow",
                workflow_definition=WorkflowDefinition.from_dict(
                    create_minimal_workflow_definition(
                        name=workflow_name,
                        description="Labeled workflow",
                    )
                ),
                labels=WorkflowCreateLabels.from_dict({"env": "dev"}),
            )
        )

        # Update labels
        updated = nexus_api.workflows.update(
            workflow_id=workflow.id,
            body=WorkflowUpdate(labels=WorkflowUpdateLabelsType0.from_dict({"env": "prod", "team": "engineering"})),
        ).assert_and_get()

        assert updated.labels is not None
        assert updated.labels["env"] == "prod"
        assert updated.labels["team"] == "engineering"

    def test_update_nonexistent_workflow(self, nexus_api: NexusApiRegistry) -> None:
        """Test updating a non-existent workflow.

        Expected: 404 Not Found
        """
        fake_id = uuid4()
        response = nexus_api.workflows.update(
            workflow_id=fake_id,
            body=WorkflowUpdate(name="new-name"),
        )

        assert response.status_code == HTTPStatus.NOT_FOUND

    def test_update_workflow_validation_errors(
        self, nexus_api: NexusApiRegistry, workflow_factory: WorkflowFactory
    ) -> None:
        """Test validation errors on invalid update data.

        Expected: 422 Unprocessable Entity for invalid data
        """
        workflow_name = unique_name("validation-test")
        workflow_def = WorkflowDefinition.from_dict(
            create_minimal_workflow_definition(
                name=workflow_name,
                description="Validation test",
                activity_id="task1",
            )
        )
        workflow = workflow_factory(
            WorkflowCreate(
                name=workflow_name,
                workflow_definition=workflow_def,
            )
        )
        workflow_id = workflow.id

        # Try to set name to empty string
        response = nexus_api.workflows.update(
            workflow_id=workflow_id,
            body=WorkflowUpdate(name=""),
        )

        assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY

    def test_update_metadata_only_does_not_create_version(
        self,
        nexus_api: NexusApiRegistry,
        workflow_factory: WorkflowFactory,
    ) -> None:
        """Test that PATCH with only metadata does NOT create a new version.

        Expected: 200 OK, current_version unchanged
        """
        # Create workflow
        workflow_name = unique_name("metadata-test")
        workflow = workflow_factory(
            WorkflowCreate(
                name=workflow_name,
                description="Initial description",
                workflow_definition=WorkflowDefinition.from_dict(
                    create_minimal_workflow_definition(
                        name=workflow_name,
                        description="Initial description",
                    )
                ),
            )
        )
        test_suffix = uuid4().hex[:8]
        assert workflow.current_version == 1

        # Update only metadata fields
        updated = nexus_api.workflows.update(
            workflow_id=workflow.id,
            body=WorkflowUpdate(
                name=f"metadata-test-updated-{test_suffix}",
                description="Updated description",
            ),
        ).assert_and_get()

        assert updated.current_version == 1  # Version should NOT be incremented
        assert updated.name == f"metadata-test-updated-{test_suffix}"
        assert updated.description == "Updated description"

    def test_update_workflow_returns_version_data(
        self,
        nexus_api: NexusApiRegistry,
        workflow_factory: WorkflowFactory,
    ) -> None:
        """Test that PATCH response includes version object with current version data.

        Expected: 200 OK with version object containing current active version
        """
        # Create workflow
        workflow_name = unique_name("version-response-test")
        workflow = workflow_factory(
            WorkflowCreate(
                name=workflow_name,
                description="Initial version",
                workflow_definition=WorkflowDefinition.from_dict(
                    create_minimal_workflow_definition(
                        name=workflow_name,
                        description="Initial version",
                    )
                ),
            )
        )

        # Update metadata
        updated = nexus_api.workflows.update(
            workflow_id=workflow.id,
            body=WorkflowUpdate(description="Testing version response"),
        ).assert_and_get()

        assert updated.version is not None
        assert updated.version.version == 1
        assert updated.version.workflow_id == workflow.id

    def test_update_with_unchanged_yaml_skips_version(
        self, nexus_api: NexusApiRegistry, workflow_factory: WorkflowFactory
    ) -> None:
        """Test that PATCH with identical definition does NOT create new version.

        Expected: 200 OK, current_version unchanged when definition is exactly identical.
        """
        workflow_name = unique_name("change-detection-test")
        workflow_definition = WorkflowDefinition.from_dict(
            create_workflow_definition_with_activities(
                name=workflow_name,
                description="Change detection test",
                activities=[
                    {
                        "id": "step1",
                        "name": "Step 1",
                        "type": "script",
                        "config": {
                            "language": "python",
                            "code": "print('step 1')",
                        },
                    }
                ],
            )
        )
        workflow = workflow_factory(
            WorkflowCreate(
                name=workflow_name,
                workflow_definition=workflow_definition,
            )
        )
        workflow_id = workflow.id
        assert workflow.current_version == 1

        # Update with identical definition (should NOT create new version)
        updated1 = nexus_api.workflows.update(
            workflow_id=workflow_id,
            body=WorkflowUpdate(
                workflow_definition=workflow_definition,
                change_description="Testing change detection",
            ),
        ).assert_and_get()

        assert updated1.current_version == 1  # Version should NOT be incremented

        # Update with actual definition change (should create new version)
        updated_definition = WorkflowDefinition.from_dict(
            create_workflow_definition_with_activities(
                name=workflow_name,
                description="Change detection test",
                activities=[
                    {
                        "id": "step1",
                        "name": "Step 1",
                        "type": "script",
                        "config": {
                            "language": "python",
                            "code": "print('step 1')",
                        },
                    },
                    {
                        "id": "step2",
                        "name": "Step 2",
                        "type": "http_request",
                        "config": {
                            "method": "GET",
                            "url": "https://example.com",
                        },
                    },
                ],
            )
        )
        updated2 = nexus_api.workflows.update(
            workflow_id=workflow_id,
            body=WorkflowUpdate(
                workflow_definition=updated_definition,
                change_description="Added step2",
            ),
        ).assert_and_get()

        assert updated2.current_version == 2  # Version incremented due to content change

    def test_update_workflow_duplicate_name_error(
        self, nexus_api: NexusApiRegistry, workflow_factory: WorkflowFactory
    ) -> None:
        """Test that renaming to an existing workflow name returns conflict error.

        Expected: 409 Conflict
        """
        # Create two workflows
        workflow1_name = unique_name("workflow-one")
        workflow_def_1 = WorkflowDefinition.from_dict(
            create_minimal_workflow_definition(
                name=workflow1_name,
                description="First workflow",
                activity_id="task1",
            )
        )
        workflow1 = workflow_factory(
            WorkflowCreate(
                name=workflow1_name,
                workflow_definition=workflow_def_1,
            )
        )
        workflow1_id = workflow1.id

        workflow2_name = unique_name("workflow-two")
        workflow_def_2 = WorkflowDefinition.from_dict(
            create_minimal_workflow_definition(
                name=workflow2_name,
                description="Second workflow",
                activity_id="task2",
            )
        )
        workflow2 = workflow_factory(
            WorkflowCreate(
                name=workflow2_name,
                workflow_definition=workflow_def_2,
            )
        )
        workflow2_id = workflow2.id

        # Try to rename workflow2 to workflow1's name (should fail)
        response = nexus_api.workflows.update(
            workflow_id=workflow2_id,
            body=WorkflowUpdate(name=workflow1_name),
        )

        assert response.status_code == HTTPStatus.CONFLICT

        # Verify workflow1 is unchanged
        workflow1_data = nexus_api.workflows.get(workflow_id=workflow1_id).assert_and_get()
        assert workflow1_data.name == workflow1_name

    def test_update_workflow_preserves_project_id(
        self, nexus_api: NexusApiRegistry, workflow_factory: WorkflowFactory
    ) -> None:
        """Test that PATCH response includes the correct project_id."""
        # Create project via API
        project_data = nexus_api.projects.create(
            body=ProjectCreate(
                name=f"test-project-{uuid4().hex[:8]}",
                description="Test project",
            )
        ).assert_and_get()
        project_id = project_data.id

        workflow_name = unique_name("project-patch-test")
        workflow_def = WorkflowDefinition.from_dict(
            create_minimal_workflow_definition(
                name=workflow_name,
                description="Workflow in a project",
                activity_id="proj_activity",
            )
        )
        workflow = workflow_factory(
            WorkflowCreate(
                name=workflow_name,
                project_id=project_id,
                workflow_definition=workflow_def,
            )
        )
        workflow_id = workflow.id

        updated = nexus_api.workflows.update(
            workflow_id=workflow_id,
            body=WorkflowUpdate(description="Updated description"),
        ).assert_and_get()

        assert updated.project_id == project_id
