"""E2E tests for POST /api/v1/workflows endpoint.

These tests verify creating workflows through the full system.
"""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING
from uuid import uuid4

import pytest
from nexus_api_client.models.workflow_create import WorkflowCreate
from nexus_api_client.models.workflow_create_labels import WorkflowCreateLabels
from nexus_api_client.models.workflow_definition import WorkflowDefinition

from tests.helpers.workflow import create_minimal_workflow_definition

if TYPE_CHECKING:
    from uuid import UUID

    from nexus_api_client.api import NexusApiRegistry

pytestmark = [pytest.mark.e2e]


class TestWorkflowCreation:
    """E2E tests for workflow creation.

    Note: Basic create success is covered in test_workflow_crud.py::test_create_workflow_minimal.
    These tests focus on new scenarios not covered elsewhere.
    """

    def test_create_workflow_with_labels(self, nexus_api: NexusApiRegistry, cleanup_workflows: list[UUID]) -> None:
        """Test creating a workflow with labels.

        Expected: 201 Created with labels included
        """
        workflow_name = f"labeled-workflow-{uuid4().hex[:8]}"
        workflow_def = WorkflowDefinition.from_dict(
            create_minimal_workflow_definition(
                name=workflow_name,
                description="Workflow with labels",
            )
        )

        workflow = nexus_api.workflows.create(
            body=WorkflowCreate(
                name=workflow_name,
                workflow_definition=workflow_def,
                labels=WorkflowCreateLabels.from_dict(
                    {
                        "environment": "test",
                        "team": "engineering",
                    }
                ),
            )
        ).assert_and_get()
        cleanup_workflows.append(workflow.id)

        assert workflow.labels is not None
        assert workflow.labels["environment"] == "test"
        assert workflow.labels["team"] == "engineering"

    def test_create_workflow_with_long_description(self, nexus_api: NexusApiRegistry) -> None:
        """Test creating a workflow with a long description. The field limit is 2,000 characters.

        Expected: 422 Unprocessable
        """
        workflow_name = f"long-desc-workflow-{uuid4().hex[:8]}"
        workflow_def = WorkflowDefinition.from_dict(
            create_minimal_workflow_definition(
                name=workflow_name,
                description="Workflow with long description",
            )
        )

        response = nexus_api.workflows.create(
            body=WorkflowCreate(
                name=workflow_name,
                description="=" * 2001,
                workflow_definition=workflow_def,
            )
        )

        assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY
