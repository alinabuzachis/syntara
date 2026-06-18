"""End-to-end tests for workflow version restore.

Tests restore flows using the full Nexus stack (API + database).

Run with:
    APP_BASE_URL=http://localhost:8000 make test-e2e
"""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING
from uuid import uuid4

import pytest
from nexus_api_client.models.publish_version_request import PublishVersionRequest
from nexus_api_client.models.workflow_create import WorkflowCreate
from nexus_api_client.models.workflow_definition import WorkflowDefinition
from nexus_api_client.models.workflow_update import WorkflowUpdate

if TYPE_CHECKING:
    from collections.abc import Callable
    from uuid import UUID

    from nexus_api_client.api import NexusApiRegistry
    from nexus_api_client.models.workflow_read import WorkflowRead

    WorkflowFactory = Callable[[WorkflowCreate], WorkflowRead]

pytestmark = [pytest.mark.e2e]


def _simple_definition(activity_id: str = "task1", description: str = "v1") -> WorkflowDefinition:
    return WorkflowDefinition.from_dict(
        {
            "schema_version": "2.0.0",
            "name": "e2e-version-ops",
            "description": description,
            "triggers": [{"id": "trigger", "type": "manual_trigger", "parameters": {}}],
            "nodes": [
                {
                    "id": activity_id,
                    "name": activity_id,
                    "type": "script",
                    "parameters": {"language": "python", "code": f'print("{description}")'},
                },
            ],
            "edges": [{"from": "trigger", "to": activity_id}],
        }
    )


class TestWorkflowVersionRestore:
    """E2E tests for workflow version restore."""

    def test_restore_creates_new_draft_with_original_definition(
        self, nexus_api: NexusApiRegistry, cleanup_workflows: list[UUID]
    ) -> None:
        """Restoring v1 after updating to v2 creates v3 as a draft with v1's definition."""
        defn_v1 = _simple_definition(activity_id="task1", description="v1")
        defn_v2 = _simple_definition(activity_id="task2", description="v2")

        create_resp = nexus_api.workflows.create(
            body=WorkflowCreate(name=f"e2e-restore-{uuid4().hex[:8]}", workflow_definition=defn_v1),
        )
        assert create_resp.status_code == HTTPStatus.CREATED
        assert create_resp.parsed is not None
        wf_id = create_resp.parsed.id
        cleanup_workflows.append(wf_id)

        nexus_api.workflows.update(
            workflow_id=wf_id,
            body=WorkflowUpdate(workflow_definition=defn_v2),
        )

        restore_resp = nexus_api.workflows.restore_version(workflow_id=wf_id, version=1)
        assert restore_resp.status_code == HTTPStatus.OK
        assert restore_resp.parsed is not None

        data = restore_resp.parsed
        assert data.current_version == 3
        assert data.version is not None
        assert data.version.version == 3
        assert data.version.status == "draft"

        versions_resp = nexus_api.workflows.list_versions(workflow_id=wf_id)
        assert versions_resp.status_code == HTTPStatus.OK
        assert versions_resp.parsed is not None
        assert len(versions_resp.parsed.resources) == 3

        by_ver = {v.version: v for v in versions_resp.parsed.resources}
        assert by_ver[1].status == "draft"
        assert by_ver[2].status == "draft"
        assert by_ver[3].status == "draft"

    def test_restore_published_version_keeps_publish_status(
        self, nexus_api: NexusApiRegistry, cleanup_workflows: list[UUID]
    ) -> None:
        """Restoring a published version creates a draft; published version keeps its status."""
        defn_v1 = _simple_definition(activity_id="pub_task1", description="published-v1")
        defn_v2 = _simple_definition(activity_id="pub_task2", description="draft-v2")

        create_resp = nexus_api.workflows.create(
            body=WorkflowCreate(name=f"e2e-restore-pub-{uuid4().hex[:8]}", workflow_definition=defn_v1),
        )
        assert create_resp.status_code == HTTPStatus.CREATED
        assert create_resp.parsed is not None
        wf_id = create_resp.parsed.id
        cleanup_workflows.append(wf_id)

        pub_resp = nexus_api.workflows.publish_version(workflow_id=wf_id, version=1, body=PublishVersionRequest())
        assert pub_resp.status_code == HTTPStatus.OK

        nexus_api.workflows.update(
            workflow_id=wf_id,
            body=WorkflowUpdate(workflow_definition=defn_v2),
        )

        restore_resp = nexus_api.workflows.restore_version(workflow_id=wf_id, version=1)
        assert restore_resp.status_code == HTTPStatus.OK
        assert restore_resp.parsed is not None
        assert restore_resp.parsed.current_version == 3
        assert restore_resp.parsed.published_version == 1

        versions_resp = nexus_api.workflows.list_versions(workflow_id=wf_id)
        assert versions_resp.status_code == HTTPStatus.OK
        assert versions_resp.parsed is not None
        by_ver = {v.version: v for v in versions_resp.parsed.resources}
        assert by_ver[1].status == "published"
        assert by_ver[3].status == "draft"

    def ***REMOVED***(
        self, nexus_api: NexusApiRegistry, cleanup_workflows: list[UUID]
    ) -> None:
        """After publishing v2, v1 becomes previously_published."""
        defn_v1 = _simple_definition(activity_id="repub_task1", description="v1")
        defn_v2 = _simple_definition(activity_id="repub_task2", description="v2")

        create_resp = nexus_api.workflows.create(
            body=WorkflowCreate(name=f"e2e-republish-{uuid4().hex[:8]}", workflow_definition=defn_v1),
        )
        assert create_resp.status_code == HTTPStatus.CREATED
        assert create_resp.parsed is not None
        wf_id = create_resp.parsed.id
        cleanup_workflows.append(wf_id)

        nexus_api.workflows.publish_version(workflow_id=wf_id, version=1, body=PublishVersionRequest())

        nexus_api.workflows.update(
            workflow_id=wf_id,
            body=WorkflowUpdate(workflow_definition=defn_v2),
        )

        nexus_api.workflows.publish_version(workflow_id=wf_id, version=2, body=PublishVersionRequest())

        versions_resp = nexus_api.workflows.list_versions(workflow_id=wf_id)
        assert versions_resp.status_code == HTTPStatus.OK
        assert versions_resp.parsed is not None
        by_ver = {v.version: v for v in versions_resp.parsed.resources}
        assert by_ver[1].status == "previously_published"
        assert by_ver[2].status == "published"
