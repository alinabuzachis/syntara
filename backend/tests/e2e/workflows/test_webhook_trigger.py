"""E2E tests for Webhook Trigger full flow.

Tests that a workflow with a webhook_trigger can be created, published,
and triggered via the public webhook endpoint, with the execution running
to completion and the trigger output reaching downstream nodes.
"""

from collections.abc import Callable
from http import HTTPStatus
from uuid import UUID

import httpx
import pytest
from nexus_api_client.api import NexusApiRegistry
from nexus_api_client.models import (
    WorkflowCreate,
    WorkflowDefinition,
    WorkflowRead,
)
from nexus_api_client.models.publish_version_request import PublishVersionRequest

from tests.e2e.conftest import poll_execution_until_complete, unique_name

pytestmark = [pytest.mark.e2e]


class TestWebhookTrigger:
    """Webhook trigger E2E tests -- create, publish, POST, and verify execution."""

    def test_webhook_trigger_full_flow(
        self,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
        workflow_factory: Callable[[WorkflowCreate], WorkflowRead],
        first_project_id: UUID,
    ):
        """Full webhook trigger flow: create, publish, fire, and verify execution.

        Objective: Verify that a workflow with a webhook_trigger can be published,
        triggered via the public webhook endpoint, and runs to completion with the
        trigger payload available to downstream nodes.

        Test Procedure:
        1. Create a workflow with a webhook_trigger and a downstream script node
        2. Publish the workflow (version 1) so the webhook trigger becomes active
        3. POST a JSON payload to the public webhook endpoint
        4. Extract the execution_id from the 202 response
        5. Poll the execution until it reaches a terminal state

        Expected Results:
        - The webhook POST returns 202 Accepted with an execution_id
        - The execution completes successfully
        - The execution has activity records for both the webhook trigger and the
          downstream echo node
        """
        webhook_path = unique_name("e2e-wh-path")
        workflow_name = unique_name("e2e-webhook-trigger")

        # Step 1: Create workflow with webhook_trigger and a downstream node
        workflow_data = WorkflowCreate(
            name=workflow_name,
            description="Workflow for testing webhook trigger full flow",
            project_id=first_project_id,
            workflow_definition=WorkflowDefinition.from_dict(
                {
                    "name": workflow_name,
                    "schema_version": "2.0.0",
                    "triggers": [
                        {
                            "id": "webhook_trigger_1",
                            "type": "webhook_trigger",
                            "parameters": {
                                "webhook_path": webhook_path,
                            },
                            "outputs": {
                                "test_value": "${result.payload.test_key}",
                            },
                        }
                    ],
                    "nodes": [
                        {
                            "id": "echo_node",
                            "name": "Echo Trigger Data",
                            "type": "script",
                            "parameters": {
                                "language": "bash",
                                "code": "echo 'Webhook received'",
                            },
                        }
                    ],
                    "edges": [{"from": "webhook_trigger_1", "to": "echo_node"}],
                }
            ),
        )
        workflow = workflow_factory(workflow_data)
        assert workflow.id is not None

        # Step 2: Publish the workflow so the webhook trigger becomes active
        pub_resp = nexus_api.workflows.publish_version(
            workflow_id=workflow.id,
            version=1,
            body=PublishVersionRequest(),
        )
        assert pub_resp.status_code == HTTPStatus.OK, (
            f"Expected 200 for publish, got {pub_resp.status_code}: {pub_resp.content!r}"
        )

        # Step 3: POST to the public webhook endpoint (no auth required)
        webhook_url = f"{nexus_base_url}/api/v1/webhooks/{webhook_path}"
        webhook_response = httpx.post(
            webhook_url,
            json={"test_key": "hello"},
            verify=False,  # noqa: S501
            timeout=30,
        )

        # Step 4: Verify 202 Accepted and extract execution_id
        assert webhook_response.status_code == HTTPStatus.ACCEPTED, (
            f"Expected 202 Accepted from webhook endpoint, got {webhook_response.status_code}: "
            f"{webhook_response.text!r}"
        )
        response_body = webhook_response.json()
        assert "execution_id" in response_body, f"Webhook response should contain 'execution_id', got: {response_body}"
        execution_id = response_body["execution_id"]

        # Step 5: Poll execution to completion
        final_execution = poll_execution_until_complete(nexus_api, UUID(execution_id))

        assert str(final_execution.status) == "completed", (
            f"Execution should complete successfully, got: {final_execution.status}. "
            f"Error details: {final_execution.error_details}"
        )

        # Verify activity records include the webhook trigger and the downstream node
        assert final_execution.activities is not None, "Execution should include activities"
        activity_ids = {a.activity_id for a in final_execution.activities}
        assert "webhook_trigger_1" in activity_ids, f"Expected 'webhook_trigger_1' in activities, got: {activity_ids}"
        assert "echo_node" in activity_ids, f"Expected 'echo_node' in activities, got: {activity_ids}"

    def test_webhook_trigger_404_for_unknown_path(
        self,
        nexus_base_url: str,
    ):
        """POST to a nonexistent webhook path returns 404.

        Objective: Verify that the webhook endpoint returns 404 for paths that
        do not match any registered webhook trigger.

        Test Procedure:
        1. POST to a webhook path that has never been registered

        Expected Results:
        - The response is 404 Not Found
        """
        unknown_path = unique_name("e2e-wh-nonexistent")
        webhook_url = f"{nexus_base_url}/api/v1/webhooks/{unknown_path}"
        response = httpx.post(
            webhook_url,
            json={"some": "data"},
            verify=False,  # noqa: S501
            timeout=30,
        )

        assert response.status_code == HTTPStatus.NOT_FOUND, (
            f"Expected 404 for unknown webhook path, got {response.status_code}: {response.text!r}"
        )

    def test_webhook_trigger_requires_published_workflow(
        self,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
        workflow_factory: Callable[[WorkflowCreate], WorkflowRead],
        first_project_id: UUID,
    ):
        """Webhook trigger is not active until the workflow is published.

        Objective: Verify that creating a workflow with a webhook_trigger but NOT
        publishing it means the webhook path is not registered and returns 404.

        Test Procedure:
        1. Create a workflow with a webhook_trigger (do NOT publish)
        2. POST to the webhook path

        Expected Results:
        - The response is 404 Not Found because only published workflows
          register active webhook triggers
        """
        webhook_path = unique_name("e2e-wh-unpublished")
        workflow_name = unique_name("e2e-webhook-unpublished")

        # Step 1: Create workflow with webhook_trigger but do NOT publish
        workflow_data = WorkflowCreate(
            name=workflow_name,
            description="Workflow for testing unpublished webhook trigger",
            project_id=first_project_id,
            workflow_definition=WorkflowDefinition.from_dict(
                {
                    "name": workflow_name,
                    "schema_version": "2.0.0",
                    "triggers": [
                        {
                            "id": "webhook_trigger_1",
                            "type": "webhook_trigger",
                            "parameters": {
                                "webhook_path": webhook_path,
                            },
                        }
                    ],
                    "nodes": [
                        {
                            "id": "echo_node",
                            "name": "Echo Node",
                            "type": "script",
                            "parameters": {
                                "language": "bash",
                                "code": "echo 'Should not run'",
                            },
                        }
                    ],
                    "edges": [{"from": "webhook_trigger_1", "to": "echo_node"}],
                }
            ),
        )
        workflow = workflow_factory(workflow_data)
        assert workflow.id is not None

        # Step 2: POST to the webhook path without publishing the workflow
        webhook_url = f"{nexus_base_url}/api/v1/webhooks/{webhook_path}"
        response = httpx.post(
            webhook_url,
            json={"test_key": "should_not_trigger"},
            verify=False,  # noqa: S501
            timeout=30,
        )

        # The webhook path is not registered because the workflow is not published
        assert response.status_code == HTTPStatus.NOT_FOUND, (
            f"Expected 404 for unpublished webhook trigger, got {response.status_code}: {response.text!r}"
        )
