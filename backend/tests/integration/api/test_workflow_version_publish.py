"""Contract tests for workflow version publish/unpublish endpoints.

Tests for POST /api/v1/workflows/{id}/versions/{version}/publish
and POST /api/v1/workflows/{id}/unpublish.
"""

import pytest
from httpx import AsyncClient

from tests.helpers.workflow import create_minimal_workflow_definition


@pytest.mark.asyncio
async def test_publish_version_returns_200(jwt_client: AsyncClient) -> None:
    """Test publishing a workflow version.

    Expected: 200 with workflow including published_version
    """
    workflow = {
        "name": "publish-test",
        "workflow_definition": create_minimal_workflow_definition(
            name="publish-test", description="Test", activity_id="task1"
        ),
    }

    create_resp = await jwt_client.post("/api/v1/workflows", json=workflow)
    assert create_resp.status_code == 201
    workflow_id = create_resp.json()["id"]
    assert create_resp.json()["is_enabled"] is False
    assert create_resp.json()["published_version"] is None

    response = await jwt_client.post(
        f"/api/v1/workflows/{workflow_id}/versions/1/publish",
        json={},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["is_enabled"] is True
    assert data["published_version"] == 2
    assert data["version"]["status"] == "published"
    assert data["version"]["version"] == 2


@pytest.mark.asyncio
async def test_publish_version_with_publish_name(jwt_client: AsyncClient) -> None:
    """Test publishing with a publish_name.

    Expected: 200 with publish_name set on the version
    """
    workflow = {
        "name": "publish-named-test",
        "workflow_definition": create_minimal_workflow_definition(
            name="publish-named", description="Test", activity_id="task1"
        ),
    }

    create_resp = await jwt_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_resp.json()["id"]

    response = await jwt_client.post(
        f"/api/v1/workflows/{workflow_id}/versions/1/publish",
        json={"publish_name": "v1.0 Release"},
    )

    assert response.status_code == 200
    assert response.json()["published_version"] == 2
    assert response.json()["version"]["version"] == 2
    assert response.json()["version"]["publish_name"] == "v1.0 Release"
    assert response.json()["version"]["status"] == "published"


@pytest.mark.asyncio
async def test_publish_version_with_change_description(jwt_client: AsyncClient) -> None:
    """Test publishing with a change_description.

    Expected: 200 with change_description set on the version
    """
    workflow = {
        "name": "publish-desc-test",
        "workflow_definition": create_minimal_workflow_definition(
            name="publish-desc", description="Test", activity_id="task1"
        ),
    }

    create_resp = await jwt_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_resp.json()["id"]

    response = await jwt_client.post(
        f"/api/v1/workflows/{workflow_id}/versions/1/publish",
        json={"publish_name": "v1.0", "change_description": "Initial release"},
    )

    assert response.status_code == 200
    assert response.json()["published_version"] == 2
    assert response.json()["version"]["version"] == 2
    assert response.json()["version"]["publish_name"] == "v1.0"
    assert response.json()["version"]["change_description"] == "Initial release"
    assert response.json()["version"]["status"] == "published"


@pytest.mark.asyncio
async def test_publish_demotes_previous_version(jwt_client: AsyncClient) -> None:
    """Test that publishing a new version demotes the previous.

    Expected: Old published version becomes previously_published
    """
    workflow = {
        "name": "publish-demote-test",
        "workflow_definition": create_minimal_workflow_definition(
            name="publish-demote", description="Test v1", activity_id="task1"
        ),
    }

    create_resp = await jwt_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_resp.json()["id"]

    # Publish v1 → v1 stays draft, v2 created (published copy). published_version=2
    await jwt_client.post(f"/api/v1/workflows/{workflow_id}/versions/1/publish", json={})

    # Update creates v3 (draft), since v2 is the published copy
    await jwt_client.patch(
        f"/api/v1/workflows/{workflow_id}",
        json={
            "workflow_definition": create_minimal_workflow_definition(
                name="publish-demote", description="Test v2", activity_id="task2"
            ),
        },
    )

    # Publish v3 → v3 stays draft, v2 demoted, v4 created (published). published_version=4
    response = await jwt_client.post(
        f"/api/v1/workflows/{workflow_id}/versions/3/publish",
        json={},
    )

    assert response.status_code == 200
    assert response.json()["published_version"] == 4

    # v1 (source of first publish) stays draft — never mutated
    v1_resp = await jwt_client.get(f"/api/v1/workflows/{workflow_id}/versions/1")
    assert v1_resp.status_code == 200
    assert v1_resp.json()["status"] == "draft"

    # v2 (first published copy) is now previously_published
    v2_resp = await jwt_client.get(f"/api/v1/workflows/{workflow_id}/versions/2")
    assert v2_resp.status_code == 200
    assert v2_resp.json()["status"] == "previously_published"

    # v4 (new published copy) is published
    v4_resp = await jwt_client.get(f"/api/v1/workflows/{workflow_id}/versions/4")
    assert v4_resp.status_code == 200
    assert v4_resp.json()["status"] == "published"


@pytest.mark.asyncio
async def test_unpublish_workflow(jwt_client: AsyncClient) -> None:
    """Test unpublishing a workflow.

    Expected: 200 with is_enabled=False, published_version=None
    """
    workflow = {
        "name": "unpublish-test",
        "workflow_definition": create_minimal_workflow_definition(
            name="unpublish-test", description="Test", activity_id="task1"
        ),
    }

    create_resp = await jwt_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_resp.json()["id"]

    # Publish v1 → v1 stays draft, v2 created (published copy). published_version=2
    await jwt_client.post(f"/api/v1/workflows/{workflow_id}/versions/1/publish", json={})

    # Unpublish → v2 (the published copy) demoted to previously_published
    response = await jwt_client.post(f"/api/v1/workflows/{workflow_id}/unpublish")

    assert response.status_code == 200
    assert response.json()["is_enabled"] is False
    assert response.json()["published_version"] is None

    # v1 (source draft) stays draft — never mutated
    v1_resp = await jwt_client.get(f"/api/v1/workflows/{workflow_id}/versions/1")
    assert v1_resp.json()["status"] == "draft"

    # v2 (published copy) is now previously_published
    v2_resp = await jwt_client.get(f"/api/v1/workflows/{workflow_id}/versions/2")
    assert v2_resp.json()["status"] == "previously_published"


@pytest.mark.asyncio
async def test_unpublish_when_not_published_returns_400(jwt_client: AsyncClient) -> None:
    """Test unpublishing a workflow that is not published.

    Expected: 400 Bad Request
    """
    workflow = {
        "name": "unpublish-not-published",
        "workflow_definition": create_minimal_workflow_definition(
            name="unpublish-not-published", description="Test", activity_id="task1"
        ),
    }

    create_resp = await jwt_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_resp.json()["id"]

    response = await jwt_client.post(f"/api/v1/workflows/{workflow_id}/unpublish")

    assert response.status_code == 400
    assert response.json()["code"] == "WORKFLOW_NOT_PUBLISHED"


@pytest.mark.asyncio
async def test_publish_nonexistent_version_returns_404(jwt_client: AsyncClient) -> None:
    """Test publishing a version that does not exist.

    Expected: 404 Not Found
    """
    workflow = {
        "name": "publish-nonexistent-version",
        "workflow_definition": create_minimal_workflow_definition(
            name="publish-nonexistent", description="Test", activity_id="task1"
        ),
    }

    create_resp = await jwt_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_resp.json()["id"]

    response = await jwt_client.post(
        f"/api/v1/workflows/{workflow_id}/versions/99/publish",
        json={},
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_version_list_includes_status(jwt_client: AsyncClient) -> None:
    """Test that version list includes status field.

    Expected: Versions include status (draft/published)
    """
    workflow = {
        "name": "version-status-list",
        "workflow_definition": create_minimal_workflow_definition(
            name="version-status-list", description="Test", activity_id="task1"
        ),
    }

    create_resp = await jwt_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_resp.json()["id"]

    # Publish v1 → v1 stays draft, v2 created (published copy). published_version=2
    await jwt_client.post(f"/api/v1/workflows/{workflow_id}/versions/1/publish", json={})

    # Update creates v3 (draft), since v2 is the published copy
    await jwt_client.patch(
        f"/api/v1/workflows/{workflow_id}",
        json={
            "workflow_definition": create_minimal_workflow_definition(
                name="version-status-list", description="v2", activity_id="task2"
            ),
        },
    )

    # List versions: v1 (draft), v2 (published copy), v3 (draft from update)
    response = await jwt_client.get(f"/api/v1/workflows/{workflow_id}/versions")
    assert response.status_code == 200

    versions = response.json()["resources"]
    by_ver = {v["version"]: v for v in versions}

    # v1 (source draft) stays draft
    assert by_ver[1]["status"] == "draft"

    # v2 (published copy) should be published
    assert by_ver[2]["status"] == "published"

    # v3 (created by update) should be draft
    assert by_ver[3]["status"] == "draft"


@pytest.mark.asyncio
async def test_create_workflow_defaults_to_unpublished(jwt_client: AsyncClient) -> None:
    """Test new workflows start unpublished.

    Expected: 201 with is_enabled=False, published_version=None
    """
    workflow = {
        "name": "default-unpublished",
        "workflow_definition": create_minimal_workflow_definition(
            name="default-unpublished", description="Test", activity_id="task1"
        ),
    }

    response = await jwt_client.post("/api/v1/workflows", json=workflow)

    assert response.status_code == 201
    assert response.json()["is_enabled"] is False
    assert response.json()["published_version"] is None


@pytest.mark.asyncio
async def test_republish_previously_published_version(jwt_client: AsyncClient) -> None:
    """Test re-publishing a previously_published version.

    Expected: publish v1 → publish v2 (v1 demoted) → publish v1 again (v2 demoted)
    """
    workflow = {
        "name": "republish-test",
        "workflow_definition": create_minimal_workflow_definition(
            name="republish", description="Test v1", activity_id="task1"
        ),
    }

    create_resp = await jwt_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_resp.json()["id"]

    # Publish v1 → v1 stays draft, v2 created (published copy). published_version=2
    await jwt_client.post(f"/api/v1/workflows/{workflow_id}/versions/1/publish", json={})

    # Update creates v3 (draft), since v2 is the published copy
    await jwt_client.patch(
        f"/api/v1/workflows/{workflow_id}",
        json={
            "workflow_definition": create_minimal_workflow_definition(
                name="republish", description="Test v2", activity_id="task2"
            ),
        },
    )

    # Publish v3 → v3 stays draft, v2 demoted, v4 created (published). published_version=4
    await jwt_client.post(f"/api/v1/workflows/{workflow_id}/versions/3/publish", json={})

    # v1 stays draft (never mutated)
    v1_resp = await jwt_client.get(f"/api/v1/workflows/{workflow_id}/versions/1")
    assert v1_resp.json()["status"] == "draft"

    # v2 (first published copy) is now previously_published
    v2_resp = await jwt_client.get(f"/api/v1/workflows/{workflow_id}/versions/2")
    assert v2_resp.json()["status"] == "previously_published"

    # Re-publish v1 → v1 stays draft, v4 demoted, v5 created (published). published_version=5
    response = await jwt_client.post(
        f"/api/v1/workflows/{workflow_id}/versions/1/publish",
        json={"publish_name": "v1-hotfix"},
    )

    assert response.status_code == 200
    assert response.json()["published_version"] == 5
    assert response.json()["version"]["status"] == "published"
    assert response.json()["version"]["version"] == 5
    assert response.json()["version"]["publish_name"] == "v1-hotfix"

    # Verify v4 (previous published copy) is now previously_published
    v4_resp = await jwt_client.get(f"/api/v1/workflows/{workflow_id}/versions/4")
    assert v4_resp.json()["status"] == "previously_published"


@pytest.mark.asyncio
async def test_publish_with_unsaved_step_includes_all_nodes(jwt_client: AsyncClient) -> None:
    """Publish with unsaved canvas changes must include those changes.

    Reproduces the user flow:
    1. Create workflow with manual trigger + step1 → save (v1)
    2. Add step2 → save (update creates v2)
    3. Add step3 → do NOT save → publish with workflow_definition, title, and description
    4. Published version (v3) must contain trigger + step1 + step2 + step3
    5. Last saved draft (v2) must still only have trigger + step1 + step2
    """

    def _build_definition(node_ids: list[str]) -> dict[str, object]:
        nodes = [
            {
                "id": nid,
                "name": nid,
                "type": "script",
                "parameters": {"language": "python", "code": f'print("{nid}")'},
            }
            for nid in node_ids
        ]
        edges = [{"from": "trigger_manual", "to": node_ids[0]}]
        for i in range(len(node_ids) - 1):
            edges.append({"from": node_ids[i], "to": node_ids[i + 1]})
        return {
            "schema_version": "2.0.0",
            "name": "unsaved-step-test",
            "description": "test",
            "triggers": [{"id": "trigger_manual", "type": "manual_trigger", "parameters": {}}],
            "nodes": nodes,
            "edges": edges,
        }

    # Step 1: create with trigger + step1
    create_resp = await jwt_client.post(
        "/api/v1/workflows",
        json={"name": "unsaved-step-publish", "workflow_definition": _build_definition(["step1"])},
    )
    assert create_resp.status_code == 201
    workflow_id = create_resp.json()["id"]
    assert create_resp.json()["current_version"] == 1

    # Step 2: add step2 → save
    update_resp = await jwt_client.patch(
        f"/api/v1/workflows/{workflow_id}",
        json={"workflow_definition": _build_definition(["step1", "step2"])},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["current_version"] == 2

    # Step 3: add step3 → publish directly (don't save) with title and description
    unsaved_defn = _build_definition(["step1", "step2", "step3"])
    pub_resp = await jwt_client.post(
        f"/api/v1/workflows/{workflow_id}/versions/2/publish",
        json={
            "publish_name": "Production Release v1.0",
            "change_description": "Added step3 for post-processing",
            "workflow_definition": unsaved_defn,
        },
    )
    assert pub_resp.status_code == 200
    pub_data = pub_resp.json()

    # Published version (v3) must have all three steps + title + description
    assert pub_data["published_version"] == 3
    assert pub_data["version"]["version"] == 3
    assert pub_data["version"]["status"] == "published"
    assert pub_data["version"]["publish_name"] == "Production Release v1.0"
    assert pub_data["version"]["change_description"] == "Added step3 for post-processing"

    published_node_ids = [n["id"] for n in pub_data["version"]["workflow_definition"]["nodes"]]
    assert published_node_ids == ["step1", "step2", "step3"]

    # Last saved draft (v2) must still only have step1 + step2
    v2_resp = await jwt_client.get(f"/api/v1/workflows/{workflow_id}/versions/2")
    assert v2_resp.status_code == 200
    v2_node_ids = [n["id"] for n in v2_resp.json()["workflow_definition"]["nodes"]]
    assert v2_node_ids == ["step1", "step2"]

    # Original v1 still has only step1
    v1_resp = await jwt_client.get(f"/api/v1/workflows/{workflow_id}/versions/1")
    assert v1_resp.status_code == 200
    v1_node_ids = [n["id"] for n in v1_resp.json()["workflow_definition"]["nodes"]]
    assert v1_node_ids == ["step1"]
