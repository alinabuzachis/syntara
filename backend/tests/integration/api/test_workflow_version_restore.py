"""Contract tests for workflow version restore endpoint.

Tests for POST /api/v1/workflows/{id}/versions/{version}/restore.
"""

import pytest
from httpx import AsyncClient

from tests.helpers.workflow import create_minimal_workflow_definition


@pytest.mark.asyncio
async def test_restore_version_creates_new_draft(jwt_client: AsyncClient) -> None:
    """Restoring a previous version creates a new draft with that definition.

    Expected: current_version bumps, new version has status=draft and matches
    the restored version's workflow_definition.
    """
    defn_v1 = create_minimal_workflow_definition(name="restore-test", description="v1", activity_id="task1")
    defn_v2 = create_minimal_workflow_definition(name="restore-test", description="v2", activity_id="task2")

    create_resp = await jwt_client.post(
        "/api/v1/workflows",
        json={"name": "restore-test", "workflow_definition": defn_v1},
    )
    assert create_resp.status_code == 201
    workflow_id = create_resp.json()["id"]

    # Create v2
    await jwt_client.patch(
        f"/api/v1/workflows/{workflow_id}",
        json={"workflow_definition": defn_v2},
    )

    # Restore v1
    response = await jwt_client.post(f"/api/v1/workflows/{workflow_id}/versions/1/restore")

    assert response.status_code == 200
    data = response.json()
    assert data["current_version"] == 3
    assert data["version"]["version"] == 3
    assert data["version"]["status"] == "draft"
    assert "Restored from" in data["version"]["change_description"]
    assert data["version"]["workflow_definition"] == defn_v1


@pytest.mark.asyncio
async def test_restore_current_version_is_noop(jwt_client: AsyncClient) -> None:
    """Restoring the current version does not create a new version.

    Expected: current_version remains unchanged (change detection skips duplicate).
    """
    defn = create_minimal_workflow_definition(name="restore-noop", description="v1", activity_id="task1")

    create_resp = await jwt_client.post(
        "/api/v1/workflows",
        json={"name": "restore-noop", "workflow_definition": defn},
    )
    workflow_id = create_resp.json()["id"]

    response = await jwt_client.post(f"/api/v1/workflows/{workflow_id}/versions/1/restore")

    assert response.status_code == 200
    assert response.json()["current_version"] == 1


@pytest.mark.asyncio
async def test_restore_nonexistent_version_returns_404(jwt_client: AsyncClient) -> None:
    """Restoring a version that does not exist returns 404.

    Expected: 404 Not Found
    """
    defn = create_minimal_workflow_definition(name="restore-404-version", description="v1", activity_id="task1")

    create_resp = await jwt_client.post(
        "/api/v1/workflows",
        json={"name": "restore-404-version", "workflow_definition": defn},
    )
    workflow_id = create_resp.json()["id"]

    response = await jwt_client.post(f"/api/v1/workflows/{workflow_id}/versions/99/restore")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_restore_nonexistent_workflow_returns_404(jwt_client: AsyncClient) -> None:
    """Restoring from a non-existent workflow returns 404.

    Expected: 404 Not Found
    """
    fake_id = "00000000-0000-0000-0000-000000000000"

    response = await jwt_client.post(f"/api/v1/workflows/{fake_id}/versions/1/restore")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_restore_published_version_creates_draft(jwt_client: AsyncClient) -> None:
    """Restoring a published version creates a new draft, not a published version.

    Expected: new version has status=draft, published_version is unchanged.
    """
    defn_v1 = create_minimal_workflow_definition(name="restore-pub", description="v1", activity_id="task1")
    defn_v2 = create_minimal_workflow_definition(name="restore-pub", description="v2", activity_id="task2")

    create_resp = await jwt_client.post(
        "/api/v1/workflows",
        json={"name": "restore-pub", "workflow_definition": defn_v1},
    )
    workflow_id = create_resp.json()["id"]

    # Publish v1 → v1 stays draft, v2 created (published copy). published_version=2
    await jwt_client.post(f"/api/v1/workflows/{workflow_id}/versions/1/publish", json={})

    # Update creates v3 (draft), since v2 is the published copy
    await jwt_client.patch(
        f"/api/v1/workflows/{workflow_id}",
        json={"workflow_definition": defn_v2},
    )

    # Restore v1 → v4 (draft copy of v1's definition). current_version=4, published_version=2
    response = await jwt_client.post(f"/api/v1/workflows/{workflow_id}/versions/1/restore")

    assert response.status_code == 200
    data = response.json()
    assert data["current_version"] == 4
    assert data["version"]["status"] == "draft"
    # Published copy (v2) stays published
    assert data["published_version"] == 2


@pytest.mark.asyncio
async def test_restore_preserves_workflow_definition(jwt_client: AsyncClient) -> None:
    """Restored version's workflow_definition matches the source version exactly.

    Expected: field-by-field match of workflow_definition.
    """
    defn_v1 = create_minimal_workflow_definition(name="restore-preserve", description="original", activity_id="task1")
    defn_v2 = create_minimal_workflow_definition(name="restore-preserve", description="changed", activity_id="task2")

    create_resp = await jwt_client.post(
        "/api/v1/workflows",
        json={"name": "restore-preserve", "workflow_definition": defn_v1},
    )
    workflow_id = create_resp.json()["id"]

    # Save original v1 definition
    v1_resp = await jwt_client.get(f"/api/v1/workflows/{workflow_id}/versions/1")
    v1_definition = v1_resp.json()["workflow_definition"]

    # Create v2 with different definition
    await jwt_client.patch(
        f"/api/v1/workflows/{workflow_id}",
        json={"workflow_definition": defn_v2},
    )

    # Restore v1
    response = await jwt_client.post(f"/api/v1/workflows/{workflow_id}/versions/1/restore")

    assert response.status_code == 200
    restored_definition = response.json()["version"]["workflow_definition"]
    assert restored_definition == v1_definition
