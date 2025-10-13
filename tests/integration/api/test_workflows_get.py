"""Contract tests for GET /api/v1/workflows endpoint.

Tests for listing workflows with filtering and pagination.
Tests MUST FAIL before implementation (TDD approach).
"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_workflows_empty_list(test_client: AsyncClient) -> None:
    """Test getting workflows when none exist.

    Expected: 200 OK with empty array
    """
    response = await test_client.get("/api/v1/workflows")

    assert response.status_code == 200
    data = response.json()
    assert "workflows" in data
    assert isinstance(data["workflows"], list)
    assert len(data["workflows"]) == 0
    assert "total" in data
    assert data["total"] == 0


@pytest.mark.asyncio
async def test_get_workflows_list_all(test_client: AsyncClient) -> None:
    """Test listing all workflows.

    Expected: 200 OK with workflows array
    """
    # Create test workflows
    workflows_to_create = [
        {
            "name": f"workflow-{i}",
            "yaml_definition": f"""
schemaVersion: "1.0.0"
name: workflow-{i}
activities: []
""",
        }
        for i in range(3)
    ]

    for workflow in workflows_to_create:
        response = await test_client.post("/api/v1/workflows", json=workflow)
        assert response.status_code == 201

    # List all workflows
    response = await test_client.get("/api/v1/workflows")

    assert response.status_code == 200
    data = response.json()
    assert "workflows" in data
    assert len(data["workflows"]) == 3
    assert data["total"] == 3


@pytest.mark.asyncio
async def test_get_workflows_filter_by_created_by(test_client: AsyncClient) -> None:
    """Test filtering workflows by creator.

    Expected: 200 OK with filtered workflows
    """
    # Note: In real implementation, created_by would come from auth context
    # For now, we test the query parameter support
    response = await test_client.get("/api/v1/workflows?created_by=user-123")

    assert response.status_code == 200
    data = response.json()
    assert "workflows" in data
    assert isinstance(data["workflows"], list)


@pytest.mark.asyncio
async def test_get_workflows_filter_by_is_enabled(test_client: AsyncClient) -> None:
    """Test filtering workflows by enabled status.

    Expected: 200 OK with filtered workflows
    """
    response = await test_client.get("/api/v1/workflows?is_enabled=true")

    assert response.status_code == 200
    data = response.json()
    assert "workflows" in data
    assert isinstance(data["workflows"], list)

    # If workflows exist, verify they're all enabled
    for workflow in data["workflows"]:
        assert workflow["is_enabled"] is True


@pytest.mark.asyncio
async def test_get_workflows_pagination(test_client: AsyncClient) -> None:
    """Test pagination with limit and offset.

    Expected: 200 OK with paginated results
    """
    # Create 10 workflows
    for i in range(10):
        workflow = {
            "name": f"paginated-workflow-{i}",
            "yaml_definition": f"""
schemaVersion: "1.0.0"
name: paginated-workflow-{i}
activities: []
""",
        }
        response = await test_client.post("/api/v1/workflows", json=workflow)
        assert response.status_code == 201

    # Get first page (limit=5, offset=0)
    response = await test_client.get("/api/v1/workflows?limit=5&offset=0")

    assert response.status_code == 200
    data = response.json()
    assert len(data["workflows"]) == 5
    assert data["total"] == 10

    # Get second page
    response = await test_client.get("/api/v1/workflows?limit=5&offset=5")

    assert response.status_code == 200
    data = response.json()
    assert len(data["workflows"]) == 5


@pytest.mark.asyncio
async def test_get_workflows_excludes_soft_deleted(test_client: AsyncClient) -> None:
    """Test that soft-deleted workflows are excluded by default.

    Expected: Deleted workflows not in results
    """
    # Create workflow
    workflow = {
        "name": "to-be-deleted",
        "yaml_definition": """
schemaVersion: "1.0.0"
name: to-be-deleted
activities: []
""",
    }
    create_response = await test_client.post("/api/v1/workflows", json=workflow)
    assert create_response.status_code == 201
    workflow_id = create_response.json()["id"]

    # Delete workflow (soft delete)
    delete_response = await test_client.delete(f"/api/v1/workflows/{workflow_id}")
    assert delete_response.status_code == 204

    # List workflows - should not include deleted one
    list_response = await test_client.get("/api/v1/workflows")

    assert list_response.status_code == 200
    data = list_response.json()
    workflow_ids = [w["id"] for w in data["workflows"]]
    assert workflow_id not in workflow_ids


@pytest.mark.asyncio
async def test_get_workflows_filter_by_labels(test_client: AsyncClient) -> None:
    """Test filtering workflows by labels.

    Expected: 200 OK with workflows matching label criteria
    """
    # Create workflows with different labels
    workflow1 = {
        "name": "prod-workflow",
        "yaml_definition": """
schemaVersion: "1.0.0"
name: prod-workflow
activities: []
""",
        "labels": {"environment": "production"},
    }

    workflow2 = {
        "name": "dev-workflow",
        "yaml_definition": """
schemaVersion: "1.0.0"
name: dev-workflow
activities: []
""",
        "labels": {"environment": "development"},
    }

    await test_client.post("/api/v1/workflows", json=workflow1)
    await test_client.post("/api/v1/workflows", json=workflow2)

    # Filter by label using key-value format (as per contract spec)
    response = await test_client.get("/api/v1/workflows?labels=environment=production")

    assert response.status_code == 200
    data = response.json()

    # Assert we got exactly one result
    assert len(data["workflows"]) == 1

    # Verify the result is the production workflow
    assert data["workflows"][0]["name"] == "prod-workflow"
    assert data["workflows"][0]["labels"]["environment"] == "production"
