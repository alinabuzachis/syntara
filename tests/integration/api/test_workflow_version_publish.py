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
    assert data["published_version"] == 1
    assert data["version"]["status"] == "published"


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

    # Publish v1
    await jwt_client.post(f"/api/v1/workflows/{workflow_id}/versions/1/publish", json={})

    # Create v2 by updating definition
    await jwt_client.patch(
        f"/api/v1/workflows/{workflow_id}",
        json={
            "workflow_definition": create_minimal_workflow_definition(
                name="publish-demote", description="Test v2", activity_id="task2"
            ),
        },
    )

    # Publish v2
    response = await jwt_client.post(
        f"/api/v1/workflows/{workflow_id}/versions/2/publish",
        json={},
    )

    assert response.status_code == 200
    assert response.json()["published_version"] == 2

    # Verify v1 is now previously_published
    v1_resp = await jwt_client.get(f"/api/v1/workflows/{workflow_id}/versions/1")
    assert v1_resp.status_code == 200
    assert v1_resp.json()["status"] == "previously_published"

    # Verify v2 is published
    v2_resp = await jwt_client.get(f"/api/v1/workflows/{workflow_id}/versions/2")
    assert v2_resp.status_code == 200
    assert v2_resp.json()["status"] == "published"


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

    # Publish first
    await jwt_client.post(f"/api/v1/workflows/{workflow_id}/versions/1/publish", json={})

    # Unpublish
    response = await jwt_client.post(f"/api/v1/workflows/{workflow_id}/unpublish")

    assert response.status_code == 200
    assert response.json()["is_enabled"] is False
    assert response.json()["published_version"] is None

    # Verify version is now previously_published
    v1_resp = await jwt_client.get(f"/api/v1/workflows/{workflow_id}/versions/1")
    assert v1_resp.json()["status"] == "previously_published"


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

    # Publish v1
    await jwt_client.post(f"/api/v1/workflows/{workflow_id}/versions/1/publish", json={})

    # Create v2
    await jwt_client.patch(
        f"/api/v1/workflows/{workflow_id}",
        json={
            "workflow_definition": create_minimal_workflow_definition(
                name="version-status-list", description="v2", activity_id="task2"
            ),
        },
    )

    # List versions
    response = await jwt_client.get(f"/api/v1/workflows/{workflow_id}/versions")
    assert response.status_code == 200

    versions = response.json()["resources"]
    assert len(versions) == 2

    # v2 (newest first) should be draft
    assert versions[0]["version"] == 2
    assert versions[0]["status"] == "draft"

    # v1 should be published
    assert versions[1]["version"] == 1
    assert versions[1]["status"] == "published"


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

    # Publish v1
    await jwt_client.post(f"/api/v1/workflows/{workflow_id}/versions/1/publish", json={})

    # Create v2
    await jwt_client.patch(
        f"/api/v1/workflows/{workflow_id}",
        json={
            "workflow_definition": create_minimal_workflow_definition(
                name="republish", description="Test v2", activity_id="task2"
            ),
        },
    )

    # Publish v2 (demotes v1 to previously_published)
    await jwt_client.post(f"/api/v1/workflows/{workflow_id}/versions/2/publish", json={})

    v1_resp = await jwt_client.get(f"/api/v1/workflows/{workflow_id}/versions/1")
    assert v1_resp.json()["status"] == "previously_published"

    # Re-publish v1 (should transition from previously_published back to published)
    response = await jwt_client.post(
        f"/api/v1/workflows/{workflow_id}/versions/1/publish",
        json={"publish_name": "v1-hotfix"},
    )

    assert response.status_code == 200
    assert response.json()["published_version"] == 1
    assert response.json()["version"]["status"] == "published"
    assert response.json()["version"]["publish_name"] == "v1-hotfix"

    # Verify v2 is now previously_published
    v2_resp = await jwt_client.get(f"/api/v1/workflows/{workflow_id}/versions/2")
    assert v2_resp.json()["status"] == "previously_published"
