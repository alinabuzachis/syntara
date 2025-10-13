"""Contract tests for POST /api/v1/workflows endpoint.

These tests verify the API contract for creating workflows.
Tests MUST FAIL before implementation (TDD approach).
"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_post_workflow_valid_yaml(test_client: AsyncClient) -> None:
    """Test creating a workflow with valid YAML definition.

    Expected: 201 Created with workflow object
    """
    valid_workflow = {
        "name": "test-workflow",
        "description": "A test workflow",
        "yaml_definition": """
schemaVersion: "1.0.0"
name: test-workflow
activities:
  - id: task1
    name: Task 1
    type: task
""",
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
async def test_post_workflow_invalid_yaml(test_client: AsyncClient) -> None:
    """Test creating a workflow with invalid YAML syntax.

    Expected: 400 Bad Request with error details
    """
    invalid_workflow = {
        "name": "invalid-workflow",
        "yaml_definition": "invalid: yaml: syntax: [[[",
    }

    response = await test_client.post("/api/v1/workflows", json=invalid_workflow)

    assert response.status_code == 400
    data = response.json()
    assert "detail" in data
    assert "yaml" in data["detail"].lower() or "invalid" in data["detail"].lower()


@pytest.mark.asyncio
async def test_post_workflow_missing_name(test_client: AsyncClient) -> None:
    """Test creating a workflow without a name.

    Expected: 422 Unprocessable Entity (validation error)
    """
    workflow_without_name = {
        "yaml_definition": """
schemaVersion: "1.0.0"
name: test
activities: []
""",
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
        "yaml_definition": """
schemaVersion: "1.0.0"
name: duplicate-workflow
activities: []
""",
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
async def test_post_workflow_missing_required_yaml_fields(test_client: AsyncClient) -> None:
    """Test creating a workflow with YAML missing required fields.

    Expected: 400 Bad Request with validation error
    """
    workflow_missing_fields = {
        "name": "incomplete-workflow",
        "yaml_definition": """
schemaVersion: "1.0.0"
# Missing 'name' and 'activities' fields
""",
    }

    response = await test_client.post("/api/v1/workflows", json=workflow_missing_fields)

    assert response.status_code == 400
    data = response.json()
    assert "detail" in data
    # Should mention missing required fields
    assert any(keyword in data["detail"].lower() for keyword in ["name", "activities", "required", "missing"])


@pytest.mark.asyncio
async def test_post_workflow_response_schema(test_client: AsyncClient) -> None:
    """Test that the response matches the expected schema.

    Expected: Response contains all required fields with correct types
    """
    workflow = {
        "name": "schema-test-workflow",
        "description": "Testing response schema",
        "yaml_definition": """
schemaVersion: "1.0.0"
name: schema-test
activities:
  - id: test_activity
    name: Test Activity
    type: task
""",
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
        "yaml_definition": """
schemaVersion: "1.0.0"
name: labeled-workflow
activities: []
""",
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
