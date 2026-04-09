"""Contract tests for GET /api/v1/workflows/{id}/versions endpoint.

Tests for listing workflow versions.
Tests MUST FAIL before implementation (TDD approach).
"""

import pytest
from httpx import AsyncClient

from tests.helpers.workflow import (
    create_minimal_workflow_definition,
    create_workflow_definition_with_activities,
)


@pytest.mark.asyncio
async def test_get_workflow_versions_list(base_client: AsyncClient) -> None:
    """Test listing all versions for a workflow.

    Expected: 200 OK with versions array ordered by version DESC
    """
    # Create workflow
    workflow = {
        "name": "multi-version-workflow",
        "workflow_definition": create_minimal_workflow_definition(
            name="multi-version",
            description="Test workflow for multi-version",
            activity_id="initial_activity",
        ),
    }

    create_response = await base_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]

    # Create additional versions using PATCH (versions are system-managed)
    # Note: Each PATCH must have different definition to trigger version creation (change detection)
    update_data_v2 = {
        "workflow_definition": create_minimal_workflow_definition(
            name="multi-version",
            description="Version 2",
            activity_id="step1",
        ),
        "change_description": "Version 2",
    }
    await base_client.patch(f"/api/v1/workflows/{workflow_id}", json=update_data_v2)

    update_data_v3 = {
        "workflow_definition": create_workflow_definition_with_activities(
            name="multi-version",
            description="Version 3",
            activities=[
                {
                    "id": "step1",
                    "name": "Step 1",
                    "type": "script",
                    "config": {
                        "language": "python",
                        "code": "print('step 1')",
                    },
                },
                {
                    "id": "step2",
                    "name": "Step 2",
                    "type": "script",
                    "config": {
                        "language": "python",
                        "code": "print('step 2')",
                    },
                },
            ],
        ),
        "change_description": "Version 3",
    }
    await base_client.patch(f"/api/v1/workflows/{workflow_id}", json=update_data_v3)

    # List all versions
    response = await base_client.get(f"/api/v1/workflows/{workflow_id}/versions")

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
async def test_get_workflow_versions_empty_list(base_client: AsyncClient) -> None:
    """Test listing versions for workflow with only initial version.

    Expected: 200 OK with single version (the initial one)
    """
    # Create workflow
    workflow = {
        "name": "single-version-workflow",
        "workflow_definition": create_minimal_workflow_definition(
            name="single-version",
            description="Test workflow for single version",
            activity_id="initial_activity",
        ),
    }

    create_response = await base_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]

    # List versions
    response = await base_client.get(f"/api/v1/workflows/{workflow_id}/versions")

    assert response.status_code == 200
    data = response.json()
    assert "versions" in data
    assert len(data["versions"]) == 1  # Only initial version
    assert data["versions"][0]["version"] == 1


@pytest.mark.asyncio
async def test_get_workflow_versions_nonexistent_workflow(
    base_client: AsyncClient,
) -> None:
    """Test listing versions for non-existent workflow.

    Expected: 404 Not Found
    """
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await base_client.get(f"/api/v1/workflows/{fake_id}/versions")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_workflow_versions_includes_metadata(base_client: AsyncClient) -> None:
    """Test that version list includes metadata.

    Expected: Each version includes schema_version, created_at, etc.
    """
    # Create workflow
    workflow = {
        "name": "metadata-test",
        "workflow_definition": create_minimal_workflow_definition(
            name="metadata-test",
            description="Test workflow for metadata",
            activity_id="metadata_activity",
        ),
    }

    create_response = await base_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]

    # List versions
    response = await base_client.get(f"/api/v1/workflows/{workflow_id}/versions")

    assert response.status_code == 200
    data = response.json()

    for version in data["versions"]:
        assert "id" in version
        assert "version" in version
        assert "schema_version" in version
        assert "created_at" in version
        assert "workflow_id" in version
