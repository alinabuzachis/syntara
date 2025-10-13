"""Contract tests for GET /api/v1/workflows/{id}/versions/{version} endpoint.

Tests for retrieving a specific workflow version.
Tests MUST FAIL before implementation (TDD approach).
"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_workflow_version_by_number(test_client: AsyncClient) -> None:
    """Test retrieving a specific version by number.

    Expected: 200 OK with version details including YAML definition
    """
    # Create workflow
    workflow = {
        "name": "versioned-workflow",
        "yaml_definition": """
schemaVersion: "1.0.0"
name: versioned-workflow
activities: []
""",
    }

    create_response = await test_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]

    # Create version 2 using PATCH (versions are system-managed)
    version2_yaml = """
schemaVersion: "1.1.0"
name: versioned-workflow
activities:
  - id: activity_1
    name: Activity 1
    type: task
"""
    update_data = {
        "yaml_definition": version2_yaml,
        "change_description": "Added activity",
    }

    await test_client.patch(f"/api/v1/workflows/{workflow_id}", json=update_data)

    # Get version 2
    response = await test_client.get(f"/api/v1/workflows/{workflow_id}/versions/2")

    assert response.status_code == 200
    data = response.json()
    assert data["version"] == 2
    assert data["workflow_id"] == workflow_id
    assert "yaml_definition" in data
    assert "activity_1" in data["yaml_definition"]


@pytest.mark.asyncio
async def test_get_workflow_version_1(test_client: AsyncClient) -> None:
    """Test retrieving version 1 (initial version).

    Expected: 200 OK with initial version details
    """
    # Create workflow
    workflow = {
        "name": "version-1-test",
        "yaml_definition": """
schemaVersion: "1.0.0"
name: version-1-test
activities: []
""",
    }

    create_response = await test_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]

    # Get version 1
    response = await test_client.get(f"/api/v1/workflows/{workflow_id}/versions/1")

    assert response.status_code == 200
    data = response.json()
    assert data["version"] == 1
    assert "yaml_definition" in data


@pytest.mark.asyncio
async def test_get_workflow_version_nonexistent_version(
    test_client: AsyncClient,
) -> None:
    """Test retrieving a non-existent version number.

    Expected: 404 Not Found
    """
    # Create workflow
    workflow = {
        "name": "test-workflow",
        "yaml_definition": """
schemaVersion: "1.0.0"
name: test-workflow
activities: []
""",
    }

    create_response = await test_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]

    # Try to get version 99 (doesn't exist)
    response = await test_client.get(f"/api/v1/workflows/{workflow_id}/versions/99")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_workflow_version_nonexistent_workflow(
    test_client: AsyncClient,
) -> None:
    """Test retrieving version for non-existent workflow.

    Expected: 404 Not Found
    """
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await test_client.get(f"/api/v1/workflows/{fake_id}/versions/1")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_workflow_version_response_schema(test_client: AsyncClient) -> None:
    """Test that response matches expected schema.

    Expected: All required fields present
    """
    # Create workflow
    workflow = {
        "name": "schema-test",
        "yaml_definition": """
schemaVersion: "1.0.0"
name: schema-test
activities: []
""",
    }

    create_response = await test_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]

    # Get version 1
    response = await test_client.get(f"/api/v1/workflows/{workflow_id}/versions/1")

    assert response.status_code == 200
    data = response.json()

    required_fields = [
        "id",
        "workflow_id",
        "version",
        "schema_version",
        "yaml_definition",
        "created_at",
    ]

    for field in required_fields:
        assert field in data, f"Missing required field: {field}"


@pytest.mark.asyncio
async def test_get_workflow_version_includes_full_yaml(test_client: AsyncClient) -> None:
    """Test that response includes full YAML definition.

    Expected: yaml_definition field contains complete YAML
    """
    # Create workflow with detailed YAML
    detailed_yaml = """
schemaVersion: "1.0.0"
name: detailed-workflow
description: A workflow with detailed configuration
activities:
  - id: task_1
    name: Task 1
    type: task
  - id: task_2
    name: Task 2
    type: task
"""
    workflow = {"name": "detailed-workflow", "yaml_definition": detailed_yaml}

    create_response = await test_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]

    # Get version 1
    response = await test_client.get(f"/api/v1/workflows/{workflow_id}/versions/1")

    assert response.status_code == 200
    data = response.json()
    assert "task_1" in data["yaml_definition"]
    assert "task_2" in data["yaml_definition"]
    assert "detailed-workflow" in data["yaml_definition"]
