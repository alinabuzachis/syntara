"""E2E tests for the EDA trigger.

Verifies that the ``/webhooks/eda/`` routing works end-to-end.  The
``eda_trigger`` activity delegates to ``webhook_trigger`` internally, so
these tests are intentionally lightweight — just confirm the ``/eda/``
path prefix is routed correctly.

Run with:
    APP_BASE_URL=http://localhost:8000 make test-e2e
"""

from collections.abc import Callable
from http import HTTPStatus
from uuid import UUID

import httpx
import pytest
from nexus_api_client.api import NexusApiRegistry
from nexus_api_client.models import WorkflowCreate, WorkflowDefinition, WorkflowRead
from nexus_api_client.models.publish_version_request import PublishVersionRequest
from nexus_test_sdk.e2e.helpers import poll_execution_until_complete
from nexus_test_sdk.helpers import unique_name

pytestmark = [pytest.mark.e2e]


class TestEdaTrigger:
    """EDA trigger E2E tests — webhook-style trigger via the /eda/ endpoint."""

    def test_eda_trigger_full_flow(
        self,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
        workflow_factory: Callable[[WorkflowCreate], WorkflowRead],
        first_project_id: UUID,
    ):
        """Create workflow with eda_trigger, publish, POST to /webhooks/eda/{path}, poll to completion.

        Test Procedure:
        1. Create a workflow with an ``eda_trigger`` and a downstream script node.
        2. Publish the workflow so the trigger becomes active.
        3. POST a JSON payload to ``/api/v1/webhooks/eda/{webhook_path}``.
        4. Poll the resulting execution until it reaches a terminal state.
        5. Assert that the execution completed and the trigger activity ran.
        """
        workflow_name = unique_name("e2e-eda-trigger")
        webhook_path = unique_name("eda-hook")

        # Step 1: Create workflow with eda_trigger
        workflow_data = WorkflowCreate(
            name=workflow_name,
            description="E2E test: EDA trigger full flow",
            project_id=first_project_id,
            workflow_definition=WorkflowDefinition.from_dict(
                {
                    "name": workflow_name,
                    "schema_version": "2.0.0",
                    "triggers": [
                        {
                            "id": "eda_trigger_1",
                            "type": "eda_trigger",
                            "parameters": {"webhook_path": webhook_path},
                            "outputs": {"event_data": "${result.payload.event_type}"},
                        },
                    ],
                    "nodes": [
                        {
                            "id": "process_event",
                            "name": "Process EDA Event",
                            "type": "script",
                            "parameters": {"language": "bash", "code": "echo 'EDA event processed'"},
                        },
                    ],
                    "edges": [{"from": "eda_trigger_1", "to": "process_event"}],
                }
            ),
        )
        workflow = workflow_factory(workflow_data)
        assert workflow.id is not None

        # Step 2: Publish the workflow
        pub_resp = nexus_api.workflows.publish_version(
            workflow_id=workflow.id,
            version=1,
            body=PublishVersionRequest(),
        )
        assert pub_resp.status_code == HTTPStatus.OK, (
            f"Expected 200 for publish, got {pub_resp.status_code}: {pub_resp.content!r}"
        )

        # Step 3: POST to the EDA webhook endpoint
        eda_url = f"{nexus_base_url}/api/v1/webhooks/eda/{webhook_path}"
        payload = {"event_type": "host_unreachable", "host": "web-01.example.com"}
        webhook_response = httpx.post(eda_url, json=payload, verify=False, timeout=30)  # noqa: S501
        assert webhook_response.status_code == HTTPStatus.ACCEPTED, (
            f"Expected 202 Accepted from EDA webhook, got {webhook_response.status_code}: {webhook_response.text!r}"
        )

        # Step 4: Extract execution ID and poll to completion
        webhook_body = webhook_response.json()
        execution_id = UUID(webhook_body["execution_id"])

        execution = poll_execution_until_complete(nexus_api, execution_id)

        # Step 5: Assert completion and trigger activity
        assert str(execution.status) == "completed", (
            f"Execution should complete successfully, got: {execution.status}. Error details: {execution.error_details}"
        )
        assert execution.activities is not None, "Execution should include activities"

        activity_ids = {a.activity_id for a in execution.activities}
        assert "eda_trigger_1" in activity_ids, "EDA trigger activity should be present"
        assert "process_event" in activity_ids, "Downstream script node should be present"

        activity_statuses = {a.activity_id: str(a.status) for a in execution.activities}
        assert activity_statuses["eda_trigger_1"] == "completed", (
            f"EDA trigger should have completed, got: {activity_statuses['eda_trigger_1']}"
        )
        assert activity_statuses["process_event"] == "completed", (
            f"Process event node should have completed, got: {activity_statuses['process_event']}"
        )

    def test_eda_trigger_404_for_unknown_path(
        self,
        nexus_base_url: str,
    ):
        """POST to an unknown EDA webhook path returns 404.

        Verifies that the EDA webhook router correctly rejects requests
        to paths that do not match any published workflow trigger.
        """
        unknown_path = unique_name("nonexistent-eda-path")
        eda_url = f"{nexus_base_url}/api/v1/webhooks/eda/{unknown_path}"
        payload = {"event_type": "test"}

        response = httpx.post(eda_url, json=payload, verify=False, timeout=30)  # noqa: S501
        assert response.status_code == HTTPStatus.NOT_FOUND, (
            f"Expected 404 for unknown EDA path, got {response.status_code}: {response.text!r}"
        )
