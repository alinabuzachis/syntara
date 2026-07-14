"""Contract tests for workflow version export endpoint.

Tests for GET /api/v1/workflows/{id}/versions/{version}/export.
"""

import json
from uuid import UUID

import pytest
from httpx import AsyncClient
from nexus_test_sdk.helpers.workflow import create_minimal_workflow_definition


@pytest.mark.asyncio
async def test_export_returns_json_file_download(jwt_client: AsyncClient, test_project_id: UUID) -> None:
    """Exporting a version returns the workflow definition as a JSON file."""
    defn = create_minimal_workflow_definition(name="export-test", description="v1", activity_id="task1")

    create_resp = await jwt_client.post(
        "/api/v1/workflows",
        json={"name": "export-test", "workflow_definition": defn, "project_id": str(test_project_id)},
    )
    assert create_resp.status_code == 201
    workflow_id = create_resp.json()["id"]

    response = await jwt_client.get(f"/api/v1/workflows/{workflow_id}/versions/1/export")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    assert "attachment" in response.headers["content-disposition"]
    assert "export-test-v1.json" in response.headers["content-disposition"]

    body = json.loads(response.content)
    assert body == defn


@pytest.mark.asyncio
async def test_export_specific_version(jwt_client: AsyncClient, test_project_id: UUID) -> None:
    """Exporting a specific version returns that version's definition, not the current one."""
    defn_v1 = create_minimal_workflow_definition(name="export-versions", description="v1", activity_id="task1")
    defn_v2 = create_minimal_workflow_definition(name="export-versions", description="v2", activity_id="task2")

    create_resp = await jwt_client.post(
        "/api/v1/workflows",
        json={"name": "export-versions", "workflow_definition": defn_v1, "project_id": str(test_project_id)},
    )
    assert create_resp.status_code == 201
    workflow_id = create_resp.json()["id"]

    await jwt_client.patch(
        f"/api/v1/workflows/{workflow_id}",
        json={"workflow_definition": defn_v2},
    )

    response = await jwt_client.get(f"/api/v1/workflows/{workflow_id}/versions/1/export")

    assert response.status_code == 200
    body = json.loads(response.content)
    assert body == defn_v1


@pytest.mark.asyncio
async def test_export_nonexistent_version_returns_404(jwt_client: AsyncClient, test_project_id: UUID) -> None:
    """Exporting a version that does not exist returns 404."""
    defn = create_minimal_workflow_definition(name="export-404", description="v1", activity_id="task1")

    create_resp = await jwt_client.post(
        "/api/v1/workflows",
        json={"name": "export-404", "workflow_definition": defn, "project_id": str(test_project_id)},
    )
    workflow_id = create_resp.json()["id"]

    response = await jwt_client.get(f"/api/v1/workflows/{workflow_id}/versions/999/export")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_export_nonexistent_workflow_returns_404(jwt_client: AsyncClient) -> None:
    """Exporting from a workflow that does not exist returns 404."""
    response = await jwt_client.get("/api/v1/workflows/00000000-0000-0000-0000-000000000000/versions/1/export")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_export_filename_sanitized(jwt_client: AsyncClient, test_project_id: UUID) -> None:
    """Export filename sanitizes special characters in the workflow name."""
    defn = create_minimal_workflow_definition(name="my workflow!", description="v1", activity_id="task1")

    create_resp = await jwt_client.post(
        "/api/v1/workflows",
        json={"name": "my workflow!", "workflow_definition": defn, "project_id": str(test_project_id)},
    )
    assert create_resp.status_code == 201
    workflow_id = create_resp.json()["id"]

    response = await jwt_client.get(f"/api/v1/workflows/{workflow_id}/versions/1/export")

    assert response.status_code == 200
    content_disp = response.headers["content-disposition"]
    assert "my_workflow_-v1.json" in content_disp
