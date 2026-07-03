"""End-to-end tests for workflow version restore.

Tests restore flows using the full Nexus stack (API + database).

Run with:
    APP_BASE_URL=http://localhost:8000 make test-e2e
"""

from __future__ import annotations

import json
from http import HTTPStatus
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

import pytest
from nexus_api_client.models.publish_version_request import PublishVersionRequest
from nexus_api_client.models.workflow_create import WorkflowCreate
from nexus_api_client.models.workflow_definition import WorkflowDefinition
from nexus_api_client.models.workflow_update import WorkflowUpdate

from tests.e2e.conftest import unique_name

if TYPE_CHECKING:
    from collections.abc import Callable

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
        self, nexus_api: NexusApiRegistry, cleanup_workflows: list[UUID], first_project_id: UUID
    ) -> None:
        """Restoring v1 after updating to v2 creates v3 as a draft with v1's definition."""
        defn_v1 = _simple_definition(activity_id="task1", description="v1")
        defn_v2 = _simple_definition(activity_id="task2", description="v2")

        create_resp = nexus_api.workflows.create(
            body=WorkflowCreate(
                name=f"e2e-restore-{uuid4().hex[:8]}",
                workflow_definition=defn_v1,
                project_id=first_project_id,
            ),
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
        self, nexus_api: NexusApiRegistry, cleanup_workflows: list[UUID], first_project_id: UUID
    ) -> None:
        """Restoring a published version creates a draft; published copy keeps its status.

        With always-copy publish:
        - Create → v1 (draft)
        - Publish v1 → v1 stays draft, v2 created (published copy). published_version=2
        - Update → v3 (draft)
        - Restore v1 → v4 (draft copy of v1's definition). current_version=4, published_version=2
        """
        defn_v1 = _simple_definition(activity_id="pub_task1", description="published-v1")
        defn_v2 = _simple_definition(activity_id="pub_task2", description="draft-v2")

        create_resp = nexus_api.workflows.create(
            body=WorkflowCreate(
                name=f"e2e-restore-pub-{uuid4().hex[:8]}",
                workflow_definition=defn_v1,
                project_id=first_project_id,
            ),
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
        assert restore_resp.parsed.current_version == 4
        assert restore_resp.parsed.published_version == 2

        versions_resp = nexus_api.workflows.list_versions(workflow_id=wf_id)
        assert versions_resp.status_code == HTTPStatus.OK
        assert versions_resp.parsed is not None
        by_ver = {v.version: v for v in versions_resp.parsed.resources}
        assert by_ver[1].status == "draft"
        assert by_ver[2].status == "published"
        assert by_ver[4].status == "draft"

    def ***REMOVED***(
        self, nexus_api: NexusApiRegistry, cleanup_workflows: list[UUID], first_project_id: UUID
    ) -> None:
        """After publishing the updated draft, the previous published copy becomes previously_published.

        With always-copy publish:
        - Create → v1 (draft)
        - Publish v1 → v1 stays draft, v2 created (published copy). published_version=2
        - Update → v3 (draft, since v2 is the published copy)
        - Publish v3 → v3 stays draft, v2 demoted to previously_published, v4 created (published). published_version=4
        """
        defn_v1 = _simple_definition(activity_id="repub_task1", description="v1")
        defn_v2 = _simple_definition(activity_id="repub_task2", description="v2")

        create_resp = nexus_api.workflows.create(
            body=WorkflowCreate(
                name=f"e2e-republish-{uuid4().hex[:8]}",
                workflow_definition=defn_v1,
                project_id=first_project_id,
            ),
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

        nexus_api.workflows.publish_version(workflow_id=wf_id, version=3, body=PublishVersionRequest())

        versions_resp = nexus_api.workflows.list_versions(workflow_id=wf_id)
        assert versions_resp.status_code == HTTPStatus.OK
        assert versions_resp.parsed is not None
        by_ver = {v.version: v for v in versions_resp.parsed.resources}
        assert by_ver[1].status == "draft"
        assert by_ver[2].status == "previously_published"
        assert by_ver[3].status == "draft"
        assert by_ver[4].status == "published"


class TestPublishWithUnsavedChanges:
    """E2E tests for publishing with unsaved canvas changes (dirty-publish)."""

    def test_publish_with_workflow_definition_uses_provided_definition(
        self, nexus_api: NexusApiRegistry, cleanup_workflows: list[UUID], first_project_id: UUID
    ) -> None:
        """Publishing with workflow_definition in request uses that definition, not the saved draft's.

        Simulates the frontend sending unsaved canvas state with the publish request.
        - Create → v1 (draft with task1)
        - Publish v1 with workflow_definition containing task2 (unsaved canvas state)
        - Published copy (v2) should have task2, original draft (v1) should still have task1
        """
        defn_saved = _simple_definition(activity_id="saved_task", description="saved on server")
        defn_unsaved = _simple_definition(activity_id="unsaved_canvas_task", description="unsaved canvas state")

        create_resp = nexus_api.workflows.create(
            body=WorkflowCreate(
                name=f"e2e-dirty-pub-{uuid4().hex[:8]}",
                workflow_definition=defn_saved,
                project_id=first_project_id,
            ),
        )
        assert create_resp.status_code == HTTPStatus.CREATED
        assert create_resp.parsed is not None
        wf_id = create_resp.parsed.id
        cleanup_workflows.append(wf_id)

        pub_resp = nexus_api.workflows.publish_version(
            workflow_id=wf_id,
            version=1,
            body=PublishVersionRequest.from_dict({"workflow_definition": defn_unsaved.to_dict()}),
        )
        assert pub_resp.status_code == HTTPStatus.OK
        assert pub_resp.parsed is not None
        assert pub_resp.parsed.version is not None
        assert pub_resp.parsed.version.version == 2
        assert pub_resp.parsed.version.status == "published"

        published_defn = pub_resp.parsed.version.workflow_definition
        assert published_defn is not None
        assert published_defn["nodes"][0]["id"] == "unsaved_canvas_task"

        v1_resp = nexus_api.workflows.get_version(workflow_id=wf_id, version=1)
        assert v1_resp.status_code == HTTPStatus.OK
        assert v1_resp.parsed is not None
        assert v1_resp.parsed.workflow_definition["nodes"][0]["id"] == "saved_task"
        assert v1_resp.parsed.status == "draft"

    def test_publish_without_workflow_definition_uses_saved_definition(
        self, nexus_api: NexusApiRegistry, cleanup_workflows: list[UUID], first_project_id: UUID
    ) -> None:
        """Normal publish (no workflow_definition) uses the saved draft's definition.

        - Create → v1 (draft with original_task)
        - Publish v1 with no workflow_definition
        - Published copy (v2) should have original_task
        """
        defn = _simple_definition(activity_id="original_task", description="saved definition")

        create_resp = nexus_api.workflows.create(
            body=WorkflowCreate(
                name=f"e2e-clean-pub-{uuid4().hex[:8]}",
                workflow_definition=defn,
                project_id=first_project_id,
            ),
        )
        assert create_resp.status_code == HTTPStatus.CREATED
        assert create_resp.parsed is not None
        wf_id = create_resp.parsed.id
        cleanup_workflows.append(wf_id)

        pub_resp = nexus_api.workflows.publish_version(
            workflow_id=wf_id,
            version=1,
            body=PublishVersionRequest(),
        )
        assert pub_resp.status_code == HTTPStatus.OK
        assert pub_resp.parsed is not None
        assert pub_resp.parsed.version is not None

        published_defn = pub_resp.parsed.version.workflow_definition
        assert published_defn is not None
        assert published_defn["nodes"][0]["id"] == "original_task"

    def test_publish_with_invalid_workflow_definition_returns_error(
        self, nexus_api: NexusApiRegistry, cleanup_workflows: list[UUID], first_project_id: UUID
    ) -> None:
        """Publishing with an invalid workflow_definition rejects the request.

        - Create → v1 (draft)
        - Publish v1 with invalid workflow_definition (missing required fields)
        - Should return an error, not create a published version
        """
        defn = _simple_definition(activity_id="valid_task", description="valid")

        create_resp = nexus_api.workflows.create(
            body=WorkflowCreate(
                name=f"e2e-invalid-pub-{uuid4().hex[:8]}",
                workflow_definition=defn,
                project_id=first_project_id,
            ),
        )
        assert create_resp.status_code == HTTPStatus.CREATED
        assert create_resp.parsed is not None
        wf_id = create_resp.parsed.id
        cleanup_workflows.append(wf_id)

        pub_resp = nexus_api.workflows.publish_version(
            workflow_id=wf_id,
            version=1,
            body=PublishVersionRequest.from_dict(
                {"workflow_definition": {"schema_version": "2.0.0", "name": "invalid"}}
            ),
        )
        assert pub_resp.status_code in (
            HTTPStatus.BAD_REQUEST,
            HTTPStatus.CONFLICT,
            HTTPStatus.UNPROCESSABLE_ENTITY,
        )

        wf_resp = nexus_api.workflows.get(workflow_id=wf_id)
        assert wf_resp.parsed is not None
        assert wf_resp.parsed.published_version is None

    def test_incremental_build_publish_includes_unsaved_step(
        self, nexus_api: NexusApiRegistry, cleanup_workflows: list[UUID], first_project_id: UUID
    ) -> None:
        """Simulates the real user flow: build incrementally, publish with unsaved changes.

        1. Create workflow with manual trigger + step1 → save (v1)
        2. Add step2 → save (update creates v2)
        3. Add step3 → do NOT save → publish directly with workflow_definition
        4. Published version must contain all three steps (trigger + step1 + step2 + step3)
        5. Last saved draft (v2) must still only have trigger + step1 + step2
        """

        def _build_definition(node_ids: list[str]) -> WorkflowDefinition:
            nodes = [
                {
                    "id": nid,
                    "name": nid,
                    "type": "script",
                    "parameters": {"language": "python", "code": f'print("{nid}")'},
                }
                for nid in node_ids
            ]
            edges = [{"from": "trigger", "to": node_ids[0]}]
            for i in range(len(node_ids) - 1):
                edges.append({"from": node_ids[i], "to": node_ids[i + 1]})
            return WorkflowDefinition.from_dict(
                {
                    "schema_version": "2.0.0",
                    "name": "incremental-build",
                    "description": "incremental build test",
                    "triggers": [{"id": "trigger", "type": "manual_trigger", "parameters": {}}],
                    "nodes": nodes,
                    "edges": edges,
                }
            )

        defn_v1 = _build_definition(["step1"])
        defn_v2 = _build_definition(["step1", "step2"])
        defn_unsaved = _build_definition(["step1", "step2", "step3"])

        # Step 1: create with trigger + step1
        create_resp = nexus_api.workflows.create(
            body=WorkflowCreate(
                name=f"e2e-incremental-{uuid4().hex[:8]}",
                workflow_definition=defn_v1,
                project_id=first_project_id,
            ),
        )
        assert create_resp.status_code == HTTPStatus.CREATED
        assert create_resp.parsed is not None
        wf_id = create_resp.parsed.id
        cleanup_workflows.append(wf_id)
        assert create_resp.parsed.current_version == 1

        # Step 2: add step2 → save
        update_resp = nexus_api.workflows.update(
            workflow_id=wf_id,
            body=WorkflowUpdate(workflow_definition=defn_v2),
        )
        assert update_resp.status_code == HTTPStatus.OK
        assert update_resp.parsed is not None
        assert update_resp.parsed.current_version == 2

        # Step 3: add step3 → publish directly (don't save) with title and description
        pub_resp = nexus_api.workflows.publish_version(
            workflow_id=wf_id,
            version=2,
            body=PublishVersionRequest.from_dict(
                {
                    "publish_name": "Production Release v1.0",
                    "change_description": "Added step3 for post-processing",
                    "workflow_definition": defn_unsaved.to_dict(),
                }
            ),
        )
        assert pub_resp.status_code == HTTPStatus.OK
        assert pub_resp.parsed is not None
        assert pub_resp.parsed.version is not None

        # Published version (v3) must have all three steps
        published = pub_resp.parsed.version
        assert published.version == 3
        assert published.status == "published"
        assert published.publish_name == "Production Release v1.0"
        assert published.change_description == "Added step3 for post-processing"

        published_defn = published.workflow_definition
        assert published_defn is not None
        published_node_ids = [n["id"] for n in published_defn["nodes"]]
        assert published_node_ids == ["step1", "step2", "step3"]

        # Last saved draft (v2) must still only have step1 + step2
        v2_resp = nexus_api.workflows.get_version(workflow_id=wf_id, version=2)
        assert v2_resp.status_code == HTTPStatus.OK
        assert v2_resp.parsed is not None
        v2_node_ids = [n["id"] for n in v2_resp.parsed.workflow_definition["nodes"]]
        assert v2_node_ids == ["step1", "step2"]

        # Original v1 still has only step1
        v1_resp = nexus_api.workflows.get_version(workflow_id=wf_id, version=1)
        assert v1_resp.status_code == HTTPStatus.OK
        assert v1_resp.parsed is not None
        v1_node_ids = [n["id"] for n in v1_resp.parsed.workflow_definition["nodes"]]
        assert v1_node_ids == ["step1"]


class TestWorkflowVersionExport:
    """E2E test for exporting a version of workflow as a portable JSON definition."""

    def test_export_workflow_version_as_json(
        self,
        nexus_api: NexusApiRegistry,
        workflow_factory: Callable[[WorkflowCreate], WorkflowRead],
        first_project_id: UUID,
    ) -> None:
        """Exporting a workflow as a portable JSON definition."""
        workflow_defn = _simple_definition()

        workflow_data = WorkflowCreate(
            name=unique_name("e2e-export-workflow"),
            description="E2E test workflow",
            workflow_definition=workflow_defn,
            project_id=first_project_id,
        )

        created_wf = workflow_factory(workflow_data)
        assert created_wf.id is not None
        wf_id = created_wf.id

        exported_wf = nexus_api.workflows.export_version(workflow_id=wf_id, version=created_wf.current_version)
        assert exported_wf.status_code == HTTPStatus.OK
        assert exported_wf.content is not None
        exported = json.loads(exported_wf.content)
        assert exported["schema_version"] == workflow_defn.schema_version
        assert exported["name"] == workflow_defn.name
        assert exported["description"] == workflow_defn.description
