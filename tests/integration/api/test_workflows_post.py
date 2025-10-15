"""Contract tests for POST /api/v1/workflows endpoint.

These tests verify the API contract for creating workflows.
Tests MUST FAIL before implementation (TDD approach).
"""

import pytest
from httpx import AsyncClient

from tests.helpers import create_minimal_workflow_definition


@pytest.mark.asyncio
async def test_post_workflow_valid_definition(test_client: AsyncClient) -> None:
    """Test creating a workflow with valid definition.

    Expected: 201 Created with workflow object
    """
    valid_workflow = {
        "name": "test-workflow",
        "description": "A test workflow",
        "workflow_definition": create_minimal_workflow_definition(
            name="test-workflow", description="A test workflow", activity_id="task1", activity_type="task"
        ),
    }

    response = await test_client.post("/api/v1/workflows", json=valid_workflow)

    assert response.status_code == 201
    data = response.json()
    assert "id" in data
    assert data["name"] == "test-workflow"
    assert data["description"] == "A test workflow"
    assert "created_at" in data
    assert "current_version" in data
    assert data["current_version"] == 1
    assert data["is_enabled"] is True


@pytest.mark.asyncio
async def test_post_workflow_invalid_definition(test_client: AsyncClient) -> None:
    """Test creating a workflow with invalid definition structure.

    Expected: 422 Unprocessable Entity (Pydantic validation error)
    """
    invalid_workflow = {
        "name": "invalid-workflow",
        "workflow_definition": {
            "schemaVersion": "1.0.0",
            "version": 1,
            # Missing required 'metadata' and 'workflow' fields
        },
    }

    response = await test_client.post("/api/v1/workflows", json=invalid_workflow)

    assert response.status_code == 422
    data = response.json()
    assert "detail" in data


@pytest.mark.asyncio
async def test_post_workflow_missing_name(test_client: AsyncClient) -> None:
    """Test creating a workflow without a name.

    Expected: 422 Unprocessable Entity (validation error)
    """
    workflow_without_name = {
        "workflow_definition": create_minimal_workflow_definition(
            name="test",
            description="Test workflow",
        ),
    }

    response = await test_client.post("/api/v1/workflows", json=workflow_without_name)

    assert response.status_code == 422
    data = response.json()
    assert "detail" in data


@pytest.mark.asyncio
async def test_post_workflow_duplicate_name(test_client: AsyncClient) -> None:
    """Test creating a workflow with a duplicate name.

    Expected: 400 Bad Request with conflict error
    """
    workflow = {
        "name": "duplicate-workflow",
        "workflow_definition": create_minimal_workflow_definition(
            name="duplicate-workflow",
            description="Test workflow",
        ),
    }

    # Create first workflow
    response1 = await test_client.post("/api/v1/workflows", json=workflow)
    assert response1.status_code == 201

    # Try to create duplicate
    response2 = await test_client.post("/api/v1/workflows", json=workflow)
    assert response2.status_code == 400
    data = response2.json()
    assert "detail" in data
    assert "duplicate" in data["detail"].lower() or "exists" in data["detail"].lower()


@pytest.mark.asyncio
async def test_post_workflow_missing_required_fields(test_client: AsyncClient) -> None:
    """Test creating a workflow with definition missing required fields.

    Expected: 422 Unprocessable Entity (Pydantic validation error)
    """
    workflow_missing_fields = {
        "name": "incomplete-workflow",
        "workflow_definition": {
            "schemaVersion": "1.0.0",
            "version": 1,
            # Missing required 'metadata' and 'workflow' fields
        },
    }

    response = await test_client.post("/api/v1/workflows", json=workflow_missing_fields)

    assert response.status_code == 422
    data = response.json()
    assert "detail" in data


@pytest.mark.asyncio
async def test_post_workflow_response_schema(test_client: AsyncClient) -> None:
    """Test that the response matches the expected schema.

    Expected: Response contains all required fields with correct types
    """
    workflow = {
        "name": "schema-test-workflow",
        "description": "Testing response schema",
        "workflow_definition": create_minimal_workflow_definition(
            name="schema-test", description="Testing response schema", activity_id="test_activity", activity_type="task"
        ),
    }

    response = await test_client.post("/api/v1/workflows", json=workflow)

    assert response.status_code == 201
    data = response.json()

    # Verify response schema
    required_fields = [
        "id",
        "name",
        "description",
        "current_version",
        "is_enabled",
        "created_at",
        "updated_at",
    ]

    for field in required_fields:
        assert field in data, f"Missing required field: {field}"

    # Verify types
    assert isinstance(data["id"], str)
    assert isinstance(data["name"], str)
    assert isinstance(data["current_version"], int)
    assert isinstance(data["is_enabled"], bool)
    assert isinstance(data["created_at"], str)
    assert isinstance(data["updated_at"], str)


@pytest.mark.asyncio
async def test_post_workflow_with_labels(test_client: AsyncClient) -> None:
    """Test creating a workflow with labels.

    Expected: 201 Created with labels included
    """
    workflow_with_labels = {
        "name": "labeled-workflow",
        "workflow_definition": create_minimal_workflow_definition(
            name="labeled-workflow",
            description="Workflow with labels",
        ),
        "labels": {
            "environment": "test",
            "team": "engineering",
        },
    }

    response = await test_client.post("/api/v1/workflows", json=workflow_with_labels)

    assert response.status_code == 201
    data = response.json()
    assert "labels" in data
    assert data["labels"]["environment"] == "test"
    assert data["labels"]["team"] == "engineering"
