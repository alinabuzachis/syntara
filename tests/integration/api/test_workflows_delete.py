"""Contract tests for DELETE /api/v1/workflows/{id} endpoint.

Tests for soft-deleting workflows.
Tests MUST FAIL before implementation (TDD approach).
"""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from nexus_api.models import Workflow
from tests.helpers import create_minimal_workflow_definition


@pytest.mark.asyncio
async def test_delete_workflow_success(test_client: AsyncClient) -> None:
    """Test soft-deleting a workflow.

    Expected: 204 No Content
    """
    # Create workflow
    workflow = {
        "name": "workflow-to-delete",
        "workflow_definition": create_minimal_workflow_definition(
            name="to-delete",
            description="Workflow to delete",
            activity_id="delete_activity",
        ),
    }

    create_response = await test_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]

    # Delete workflow
    response = await test_client.delete(f"/api/v1/workflows/{workflow_id}")

    assert response.status_code == 204


@pytest.mark.asyncio
async def test_delete_workflow_sets_deleted_at(test_client: AsyncClient) -> None:
    """Test that deletion sets deleted_at timestamp.

    Expected: Workflow no longer accessible after deletion
    """
    # Create workflow
    workflow = {
        "name": "soft-delete-test",
        "workflow_definition": create_minimal_workflow_definition(
            name="soft-delete",
            description="Soft delete test",
            activity_id="soft_delete_activity",
        ),
    }

    create_response = await test_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]

    # Delete workflow
    delete_response = await test_client.delete(f"/api/v1/workflows/{workflow_id}")
    assert delete_response.status_code == 204

    # Try to retrieve deleted workflow
    get_response = await test_client.get(f"/api/v1/workflows/{workflow_id}")
    assert get_response.status_code == 404


@pytest.mark.asyncio
async def test_delete_workflow_excluded_from_list(test_client: AsyncClient) -> None:
    """Test that deleted workflows are excluded from GET list.

    Expected: Deleted workflow not in list results
    """
    # Create two workflows
    workflow1 = {
        "name": "workflow-1",
        "workflow_definition": create_minimal_workflow_definition(
            name="workflow-1",
            description="First workflow",
            activity_id="activity_1",
        ),
    }

    workflow2 = {
        "name": "workflow-2",
        "workflow_definition": create_minimal_workflow_definition(
            name="workflow-2",
            description="Second workflow",
            activity_id="activity_2",
        ),
    }

    create_response1 = await test_client.post("/api/v1/workflows", json=workflow1)
    workflow_id1 = create_response1.json()["id"]

    create_response2 = await test_client.post("/api/v1/workflows", json=workflow2)
    workflow_id2 = create_response2.json()["id"]

    # Delete first workflow
    await test_client.delete(f"/api/v1/workflows/{workflow_id1}")

    # List workflows
    list_response = await test_client.get("/api/v1/workflows")

    assert list_response.status_code == 200
    data = list_response.json()
    workflow_ids = [w["id"] for w in data["workflows"]]

    assert workflow_id1 not in workflow_ids
    assert workflow_id2 in workflow_ids


@pytest.mark.asyncio
async def test_delete_nonexistent_workflow(test_client: AsyncClient) -> None:
    """Test deleting a non-existent workflow.

    Expected: 404 Not Found
    """
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await test_client.delete(f"/api/v1/workflows/{fake_id}")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_already_deleted_workflow(test_client: AsyncClient) -> None:
    """Test deleting an already soft-deleted workflow.

    Expected: 404 Not Found
    """
    # Create and delete workflow
    workflow = {
        "name": "double-delete",
        "workflow_definition": create_minimal_workflow_definition(
            name="double-delete",
            description="Double delete test",
            activity_id="double_delete_activity",
        ),
    }

    create_response = await test_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]

    # First deletion
    first_delete = await test_client.delete(f"/api/v1/workflows/{workflow_id}")
    assert first_delete.status_code == 204

    # Try to delete again
    second_delete = await test_client.delete(f"/api/v1/workflows/{workflow_id}")
    assert second_delete.status_code == 404


@pytest.mark.asyncio
async def test_delete_workflow_is_soft_delete_not_hard(
    test_client: AsyncClient,
    test_db_session: AsyncSession,
) -> None:
    """Test that DELETE performs soft delete, not hard delete.

    Expected: Workflow record still exists in database (with deleted_at set)
    This test directly verifies the database state to ensure soft delete behavior.
    """
    workflow = {
        "name": "soft-not-hard",
        "workflow_definition": create_minimal_workflow_definition(
            name="soft-not-hard",
            description="Soft not hard delete test",
            activity_id="soft_not_hard_activity",
        ),
    }

    create_response = await test_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]

    # Delete workflow
    delete_response = await test_client.delete(f"/api/v1/workflows/{workflow_id}")
    assert delete_response.status_code == 204

    # Workflow should return 404 on normal GET (filtered by deleted_at IS NULL)
    get_response = await test_client.get(f"/api/v1/workflows/{workflow_id}")
    assert get_response.status_code == 404

    # Verify in database: Record still exists with deleted_at set
    result = await test_db_session.execute(
        select(Workflow).filter(Workflow.id == workflow_id)
        # NOTE: No deleted_at filter - we want to see the record even if soft-deleted
    )
    db_workflow = result.scalar_one_or_none()

    # Assert record exists (not hard-deleted)
    assert db_workflow is not None, "Workflow was hard-deleted instead of soft-deleted"

    # Assert deleted_at IS NOT NULL (soft delete timestamp is set)
    assert db_workflow.deleted_at is not None, "deleted_at field is NULL - soft delete not applied"

    # Assert deleted_by is set
    assert db_workflow.deleted_by is not None, "deleted_by field is NULL - should track who deleted it"
