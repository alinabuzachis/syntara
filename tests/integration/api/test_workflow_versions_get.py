"""Contract tests for GET /api/v1/workflows/{id}/versions endpoint.

Tests for listing workflow versions.
Tests MUST FAIL before implementation (TDD approach).
"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_workflow_versions_list(test_client: AsyncClient) -> None:
    """Test listing all versions for a workflow.

    Expected: 200 OK with versions array ordered by version DESC
    """
    # Create workflow
    workflow = {
        "name": "multi-version-workflow",
        "yaml_definition": """
schemaVersion: "1.0.0"
name: multi-version
activities: []
""",
    }

    create_response = await test_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]

    # Create additional versions using PATCH (versions are system-managed)
    # Note: Each PATCH must have different YAML to trigger version creation (change detection)
    update_data_v2 = {
        "yaml_definition": """
schemaVersion: "1.0.0"
name: multi-version
activities:
  - id: step1
    executor: script
""",
        "change_description": "Version 2",
    }
    await test_client.patch(f"/api/v1/workflows/{workflow_id}", json=update_data_v2)

    update_data_v3 = {
        "yaml_definition": """
schemaVersion: "1.0.0"
name: multi-version
activities:
  - id: step1
    executor: script
  - id: step2
    executor: api
""",
        "change_description": "Version 3",
    }
    await test_client.patch(f"/api/v1/workflows/{workflow_id}", json=update_data_v3)

    # List all versions
    response = await test_client.get(f"/api/v1/workflows/{workflow_id}/versions")

    assert response.status_code == 200
    data = response.json()
    assert "versions" in data
    assert len(data["versions"]) == 3  # Versions 1, 2, 3

    # Verify ordered by version DESC (newest first)
    versions = data["versions"]
    assert versions[0]["version"] == 3
    assert versions[1]["version"] == 2
    assert versions[2]["version"] == 1


@pytest.mark.asyncio
async def test_get_workflow_versions_empty_list(test_client: AsyncClient) -> None:
    """Test listing versions for workflow with only initial version.

    Expected: 200 OK with single version (the initial one)
    """
    # Create workflow
    workflow = {
        "name": "single-version-workflow",
        "yaml_definition": """
schemaVersion: "1.0.0"
name: single-version
activities: []
""",
    }

    create_response = await test_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]

    # List versions
    response = await test_client.get(f"/api/v1/workflows/{workflow_id}/versions")

    assert response.status_code == 200
    data = response.json()
    assert "versions" in data
    assert len(data["versions"]) == 1  # Only initial version
    assert data["versions"][0]["version"] == 1


@pytest.mark.asyncio
async def test_get_workflow_versions_nonexistent_workflow(
    test_client: AsyncClient,
) -> None:
    """Test listing versions for non-existent workflow.

    Expected: 404 Not Found
    """
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await test_client.get(f"/api/v1/workflows/{fake_id}/versions")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_workflow_versions_includes_metadata(test_client: AsyncClient) -> None:
    """Test that version list includes metadata.

    Expected: Each version includes schema_version, created_at, etc.
    """
    # Create workflow
    workflow = {
        "name": "metadata-test",
        "yaml_definition": """
schemaVersion: "1.0.0"
name: metadata-test
activities: []
""",
    }

    create_response = await test_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]

    # List versions
    response = await test_client.get(f"/api/v1/workflows/{workflow_id}/versions")

    assert response.status_code == 200
    data = response.json()

    for version in data["versions"]:
        assert "id" in version
        assert "version" in version
        assert "schema_version" in version
        assert "created_at" in version
        assert "workflow_id" in version
