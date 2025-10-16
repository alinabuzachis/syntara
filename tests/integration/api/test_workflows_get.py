"""Contract tests for GET /api/v1/workflows endpoint.

Tests for listing workflows with filtering and pagination.
Tests MUST FAIL before implementation (TDD approach).
"""

import pytest
from httpx import AsyncClient

from tests.helpers import create_minimal_workflow_definition


@pytest.mark.asyncio
async def test_get_workflows_empty_list(base_client: AsyncClient) -> None:
    """Test getting workflows when none exist.

    Expected: 200 OK with empty array
    """
    response = await base_client.get("/api/v1/workflows")

    assert response.status_code == 200
    data = response.json()
    assert "workflows" in data
    assert isinstance(data["workflows"], list)
    assert len(data["workflows"]) == 0
    assert "total" in data
    assert data["total"] == 0


@pytest.mark.asyncio
async def test_get_workflows_list_all(base_client: AsyncClient) -> None:
    """Test listing all workflows.

    Expected: 200 OK with workflows array
    """
    # Create test workflows
    workflows_to_create = [
        {
            "name": f"workflow-{i}",
            "workflow_definition": create_minimal_workflow_definition(
                name=f"workflow-{i}",
                description=f"Workflow {i}",
                activity_id=f"activity_{i}",
            ),
        }
        for i in range(3)
    ]

    for workflow in workflows_to_create:
        response = await base_client.post("/api/v1/workflows", json=workflow)
        assert response.status_code == 201

    # List all workflows
    response = await base_client.get("/api/v1/workflows")

    assert response.status_code == 200
    data = response.json()
    assert "workflows" in data
    assert len(data["workflows"]) == 3
    assert data["total"] == 3


@pytest.mark.asyncio
async def test_get_workflows_filter_by_created_by(base_client: AsyncClient) -> None:
    """Test filtering workflows by creator.

    Expected: 200 OK with only workflows from specified creator
    """
    # Create first workflow (uses default test user)
    workflow1 = {
        "name": "workflow-creator-1",
        "workflow_definition": create_minimal_workflow_definition(
            name="workflow-creator-1",
            description="Creator test workflow 1",
            activity_id="activity_1",
        ),
    }
    response1 = await base_client.post("/api/v1/workflows", json=workflow1)
    assert response1.status_code == 201
    creator_id = response1.json()["created_by"]

    # Create second workflow (same creator)
    workflow2 = {
        "name": "workflow-creator-2",
        "workflow_definition": create_minimal_workflow_definition(
            name="workflow-creator-2",
            description="Creator test workflow 2",
            activity_id="activity_2",
        ),
    }
    response2 = await base_client.post("/api/v1/workflows", json=workflow2)
    assert response2.status_code == 201

    # Filter by creator - should return both workflows
    response = await base_client.get(f"/api/v1/workflows?created_by={creator_id}")
    assert response.status_code == 200
    data = response.json()
    assert len(data["workflows"]) == 2
    assert data["total"] == 2
    # Verify both workflows have the same creator
    assert all(wf["created_by"] == creator_id for wf in data["workflows"])


@pytest.mark.asyncio
async def test_get_workflows_filter_by_invalid_uuid(base_client: AsyncClient) -> None:
    """Test filtering by invalid UUID returns validation error.

    Expected: 422 Unprocessable Entity
    """
    response = await base_client.get("/api/v1/workflows?created_by=invalid-uuid")
    assert response.status_code == 422
    data = response.json()
    assert "detail" in data


@pytest.mark.asyncio
async def test_get_workflows_filter_by_is_enabled(base_client: AsyncClient) -> None:
    """Test filtering workflows by enabled status.

    Expected: 200 OK with filtered workflows
    """
    response = await base_client.get("/api/v1/workflows?is_enabled=true")

    assert response.status_code == 200
    data = response.json()
    assert "workflows" in data
    assert isinstance(data["workflows"], list)

    # If workflows exist, verify they're all enabled
    for workflow in data["workflows"]:
        assert workflow["is_enabled"] is True


@pytest.mark.asyncio
async def test_get_workflows_pagination(base_client: AsyncClient) -> None:
    """Test pagination with limit and offset.

    Expected: 200 OK with paginated results
    """
    # Create 10 workflows
    for i in range(10):
        workflow = {
            "name": f"paginated-workflow-{i}",
            "workflow_definition": create_minimal_workflow_definition(
                name=f"paginated-workflow-{i}",
                description=f"Paginated workflow {i}",
                activity_id=f"activity_{i}",
            ),
        }
        response = await base_client.post("/api/v1/workflows", json=workflow)
        assert response.status_code == 201

    # Get first page (limit=5, offset=0)
    response = await base_client.get("/api/v1/workflows?limit=5&offset=0")

    assert response.status_code == 200
    data = response.json()
    assert len(data["workflows"]) == 5
    assert data["total"] == 10

    # Get second page
    response = await base_client.get("/api/v1/workflows?limit=5&offset=5")

    assert response.status_code == 200
    data = response.json()
    assert len(data["workflows"]) == 5


@pytest.mark.asyncio
async def test_get_workflows_excludes_soft_deleted(base_client: AsyncClient) -> None:
    """Test that soft-deleted workflows are excluded by default.

    Expected: Deleted workflows not in results
    """
    # Create workflow
    workflow = {
        "name": "to-be-deleted",
        "workflow_definition": create_minimal_workflow_definition(
            name="to-be-deleted",
            description="Workflow to be deleted",
            activity_id="activity_delete",
        ),
    }
    create_response = await base_client.post("/api/v1/workflows", json=workflow)
    assert create_response.status_code == 201
    workflow_id = create_response.json()["id"]

    # Delete workflow (soft delete)
    delete_response = await base_client.delete(f"/api/v1/workflows/{workflow_id}")
    assert delete_response.status_code == 204

    # List workflows - should not include deleted one
    list_response = await base_client.get("/api/v1/workflows")

    assert list_response.status_code == 200
    data = list_response.json()
    workflow_ids = [w["id"] for w in data["workflows"]]
    assert workflow_id not in workflow_ids


@pytest.mark.asyncio
async def test_get_workflows_filter_by_labels(base_client: AsyncClient) -> None:
    """Test filtering workflows by labels.

    Expected: 200 OK with workflows matching label criteria
    """
    # Create workflows with different labels
    workflow1 = {
        "name": "prod-workflow",
        "workflow_definition": create_minimal_workflow_definition(
            name="prod-workflow",
            description="Production workflow",
            activity_id="activity_prod",
        ),
        "labels": {"environment": "production"},
    }

    workflow2 = {
        "name": "dev-workflow",
        "workflow_definition": create_minimal_workflow_definition(
            name="dev-workflow",
            description="Development workflow",
            activity_id="activity_dev",
        ),
        "labels": {"environment": "development"},
    }

    await base_client.post("/api/v1/workflows", json=workflow1)
    await base_client.post("/api/v1/workflows", json=workflow2)

    # Filter by label using key-value format (as per contract spec)
    response = await base_client.get("/api/v1/workflows?labels=environment=production")

    assert response.status_code == 200
    data = response.json()

    # Assert we got exactly one result
    assert len(data["workflows"]) == 1

    # Verify the result is the production workflow
    assert data["workflows"][0]["name"] == "prod-workflow"
    assert data["workflows"][0]["labels"]["environment"] == "production"


@pytest.mark.asyncio
async def test_get_workflows_default_page_size(base_client: AsyncClient) -> None:
    """Test default page size is 20 items (as per contract).

    Expected: 200 OK with maximum 20 workflows when more exist
    """
    # Create 25 workflows
    for i in range(25):
        workflow = {
            "name": f"workflow-page-{i}",
            "workflow_definition": create_minimal_workflow_definition(
                name=f"workflow-page-{i}",
                description=f"Workflow page {i}",
                activity_id=f"activity_page_{i}",
            ),
        }
        response = await base_client.post("/api/v1/workflows", json=workflow)
        assert response.status_code == 201

    # Get workflows without limit parameter
    response = await base_client.get("/api/v1/workflows")

    assert response.status_code == 200
    data = response.json()
    # Should return 20 items (default limit)
    assert len(data["workflows"]) == 20
    # Total should show all 25 workflows exist
    assert data["total"] == 25


@pytest.mark.asyncio
async def test_get_workflows_filter_by_label_key_only(base_client: AsyncClient) -> None:
    """Test filtering workflows by label key existence (no value).

    Expected: 200 OK with workflows that have the specified label key
    """
    # Create workflow with label
    workflow1 = {
        "name": "workflow-with-label",
        "workflow_definition": create_minimal_workflow_definition(
            name="workflow-with-label",
            description="Workflow with experimental label",
            activity_id="activity_with_label",
        ),
        "labels": {"feature": "experimental", "team": "platform"},
    }

    # Create workflow without that label
    workflow2 = {
        "name": "workflow-without-label",
        "workflow_definition": create_minimal_workflow_definition(
            name="workflow-without-label",
            description="Workflow without experimental label",
            activity_id="activity_without_label",
        ),
        "labels": {"team": "platform"},
    }

    await base_client.post("/api/v1/workflows", json=workflow1)
    await base_client.post("/api/v1/workflows", json=workflow2)

    # Filter by key-only (no value specified)
    response = await base_client.get("/api/v1/workflows?labels=feature")

    assert response.status_code == 200
    data = response.json()

    # Should return only workflow with "feature" label
    assert len(data["workflows"]) == 1
    assert data["workflows"][0]["name"] == "workflow-with-label"
    assert "feature" in data["workflows"][0]["labels"]
