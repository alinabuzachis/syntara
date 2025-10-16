"""Contract tests for GET /api/v1/workflows/{id} endpoint.

Tests for retrieving a single workflow by ID.
Tests MUST FAIL before implementation (TDD approach).
"""

import pytest
from httpx import AsyncClient

from tests.helpers import create_minimal_workflow_definition


@pytest.mark.asyncio
async def test_get_workflow_by_valid_id(base_client: AsyncClient) -> None:
    """Test retrieving a workflow by valid ID.

    Expected: 200 OK with workflow object
    """
    # Create a workflow first
    workflow = {
        "name": "test-workflow-get",
        "description": "Test workflow for GET by ID",
        "workflow_definition": create_minimal_workflow_definition(
            name="test-workflow-get",
            description="Test workflow for GET by ID",
            activity_id="get_activity",
        ),
    }

    create_response = await base_client.post("/api/v1/workflows", json=workflow)
    assert create_response.status_code == 201
    workflow_id = create_response.json()["id"]

    # Get the workflow by ID
    response = await base_client.get(f"/api/v1/workflows/{workflow_id}")

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == workflow_id
    assert data["name"] == "test-workflow-get"
    assert data["description"] == "Test workflow for GET by ID"


@pytest.mark.asyncio
async def test_get_workflow_by_nonexistent_id(base_client: AsyncClient) -> None:
    """Test retrieving a workflow with non-existent ID.

    Expected: 404 Not Found
    """
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await base_client.get(f"/api/v1/workflows/{fake_id}")

    assert response.status_code == 404
    data = response.json()
    assert "detail" in data


@pytest.mark.asyncio
async def test_get_workflow_includes_current_version(base_client: AsyncClient) -> None:
    """Test that response includes current version details.

    Expected: 200 OK with version information
    """
    workflow = {
        "name": "workflow-with-version",
        "workflow_definition": create_minimal_workflow_definition(
            name="workflow-with-version",
            description="Workflow with version",
            activity_id="version_activity",
        ),
    }

    create_response = await base_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]

    response = await base_client.get(f"/api/v1/workflows/{workflow_id}")

    assert response.status_code == 200
    data = response.json()
    assert "current_version" in data
    assert data["current_version"] == 1


@pytest.mark.asyncio
async def test_get_soft_deleted_workflow_returns_404(base_client: AsyncClient) -> None:
    """Test that soft-deleted workflows return 404.

    Expected: 404 Not Found for soft-deleted workflow
    """
    # Create and then delete a workflow
    workflow = {
        "name": "workflow-to-delete",
        "workflow_definition": create_minimal_workflow_definition(
            name="workflow-to-delete",
            description="Workflow to delete",
            activity_id="delete_activity",
        ),
    }

    create_response = await base_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]

    # Soft delete the workflow
    delete_response = await base_client.delete(f"/api/v1/workflows/{workflow_id}")
    assert delete_response.status_code == 204

    # Try to get the deleted workflow
    get_response = await base_client.get(f"/api/v1/workflows/{workflow_id}")

    assert get_response.status_code == 404


@pytest.mark.asyncio
async def test_get_workflow_response_schema(base_client: AsyncClient) -> None:
    """Test that the response matches expected schema including version data.

    Expected: All required fields present with correct types, including version object
    """
    workflow = {
        "name": "schema-test",
        "workflow_definition": create_minimal_workflow_definition(
            name="schema-test",
            description="Schema test workflow",
            activity_id="schema_activity",
        ),
    }

    create_response = await base_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]

    response = await base_client.get(f"/api/v1/workflows/{workflow_id}")

    assert response.status_code == 200
    data = response.json()

    # Check workflow fields
    required_fields = [
        "id",
        "name",
        "current_version",
        "is_enabled",
        "created_at",
        "updated_at",
        "version",  # New: version object should be included
    ]

    for field in required_fields:
        assert field in data, f"Missing required field: {field}"

    # Check version object fields
    version = data["version"]
    assert isinstance(version, dict), "version should be an object"
    version_fields = [
        "id",
        "workflow_id",
        "version",
        "schema_version",
        "workflow_definition",
        "created_by",
        "created_at",
    ]

    for field in version_fields:
        assert field in version, f"Missing required version field: {field}"

    # Verify version data matches
    assert version["workflow_id"] == workflow_id
    assert version["version"] == 1
    assert version["schema_version"] == "1.0.0"
    assert "workflow" in version["workflow_definition"]
    assert "activities" in version["workflow_definition"]["workflow"]
