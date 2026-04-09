"""Contract tests for GET /api/v1/workflows/{id}/versions/{version} endpoint.

Tests for retrieving a specific workflow version.
Tests MUST FAIL before implementation (TDD approach).
"""

import pytest
from httpx import AsyncClient

from tests.helpers.workflow import (
    create_minimal_workflow_definition,
    create_workflow_definition_with_activities,
)


@pytest.mark.asyncio
async def test_get_workflow_version_by_number(jwt_client: AsyncClient) -> None:
    """Test retrieving a specific version by number.

    Expected: 200 OK with version details including workflow definition
    """
    # Create workflow
    workflow = {
        "name": "versioned-workflow",
        "workflow_definition": create_minimal_workflow_definition(
            name="versioned-workflow",
            description="Test workflow for versioning",
            activity_id="initial_activity",
        ),
    }

    create_response = await jwt_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]

    # Create version 2 using PATCH (versions are system-managed)
    update_data = {
        "workflow_definition": create_minimal_workflow_definition(
            name="versioned-workflow",
            description="Added activity",
            activity_id="activity_1",
        ),
        "change_description": "Added activity",
    }

    await jwt_client.patch(f"/api/v1/workflows/{workflow_id}", json=update_data)

    # Get version 2
    response = await jwt_client.get(f"/api/v1/workflows/{workflow_id}/versions/2")

    assert response.status_code == 200
    data = response.json()
    assert data["version"] == 2
    assert data["workflow_id"] == workflow_id
    assert "workflow_definition" in data
    workflow_def = data["workflow_definition"]
    assert workflow_def["nodes"][0]["id"] == "activity_1"


@pytest.mark.asyncio
async def test_get_workflow_version_1(jwt_client: AsyncClient) -> None:
    """Test retrieving version 1 (initial version).

    Expected: 200 OK with initial version details
    """
    # Create workflow
    workflow = {
        "name": "version-1-test",
        "workflow_definition": create_minimal_workflow_definition(
            name="version-1-test",
            description="Test workflow for version 1",
            activity_id="v1_activity",
        ),
    }

    create_response = await jwt_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]

    # Get version 1
    response = await jwt_client.get(f"/api/v1/workflows/{workflow_id}/versions/1")

    assert response.status_code == 200
    data = response.json()
    assert data["version"] == 1
    assert "workflow_definition" in data


@pytest.mark.asyncio
async def test_get_workflow_version_nonexistent_version(
    jwt_client: AsyncClient,
) -> None:
    """Test retrieving a non-existent version number.

    Expected: 404 Not Found
    """
    # Create workflow
    workflow = {
        "name": "test-workflow",
        "workflow_definition": create_minimal_workflow_definition(
            name="test-workflow",
            description="Test workflow for nonexistent version",
            activity_id="test_activity",
        ),
    }

    create_response = await jwt_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]

    # Try to get version 99 (doesn't exist)
    response = await jwt_client.get(f"/api/v1/workflows/{workflow_id}/versions/99")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_workflow_version_nonexistent_workflow(
    jwt_client: AsyncClient,
) -> None:
    """Test retrieving version for non-existent workflow.

    Expected: 404 Not Found
    """
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await jwt_client.get(f"/api/v1/workflows/{fake_id}/versions/1")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_workflow_version_response_schema(jwt_client: AsyncClient) -> None:
    """Test that response matches expected schema.

    Expected: All required fields present
    """
    # Create workflow
    workflow = {
        "name": "schema-test",
        "workflow_definition": create_minimal_workflow_definition(
            name="schema-test",
            description="Test workflow for schema validation",
            activity_id="schema_activity",
        ),
    }

    create_response = await jwt_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]

    # Get version 1
    response = await jwt_client.get(f"/api/v1/workflows/{workflow_id}/versions/1")

    assert response.status_code == 200
    data = response.json()

    required_fields = [
        "id",
        "workflow_id",
        "version",
        "schema_version",
        "workflow_definition",
        "created_at",
    ]

    for field in required_fields:
        assert field in data, f"Missing required field: {field}"


@pytest.mark.asyncio
async def test_get_workflow_version_includes_full_definition(jwt_client: AsyncClient) -> None:
    """Test that response includes complete workflow definition.

    Expected: workflow_definition field contains complete definition with all activities
    """
    # Create workflow with detailed definition
    workflow = {
        "name": "detailed-workflow",
        "workflow_definition": create_workflow_definition_with_activities(
            name="detailed-workflow",
            description="A workflow with detailed configuration",
            activities=[
                {
                    "id": "task_1",
                    "name": "Task 1",
                    "type": "script",
                    "config": {
                        "language": "python",
                        "code": "print('task 1')",
                    },
                },
                {
                    "id": "task_2",
                    "name": "Task 2",
                    "type": "script",
                    "config": {
                        "language": "python",
                        "code": "print('task 2')",
                    },
                },
            ],
        ),
    }

    create_response = await jwt_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]

    # Get version 1
    response = await jwt_client.get(f"/api/v1/workflows/{workflow_id}/versions/1")

    assert response.status_code == 200
    data = response.json()
    workflow_def = data["workflow_definition"]
    nodes = workflow_def["nodes"]
    assert len(nodes) == 2
    assert nodes[0]["id"] == "task_1"
    assert nodes[1]["id"] == "task_2"
    assert workflow_def["name"] == "detailed-workflow"
