"""Contract tests for PATCH /api/v1/workflows/{id} endpoint.

Tests for updating workflow metadata.
Tests MUST FAIL before implementation (TDD approach).
"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_patch_workflow_name(test_client: AsyncClient) -> None:
    """Test updating workflow name.

    Expected: 200 OK with updated workflow
    """
    # Create workflow
    workflow = {
        "name": "original-name",
        "yaml_definition": """
schemaVersion: "1.0.0"
name: original
activities: []
""",
    }

    create_response = await test_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]

    # Update name
    update_data = {"name": "updated-name"}
    response = await test_client.patch(f"/api/v1/workflows/{workflow_id}", json=update_data)

    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "updated-name"
    assert data["id"] == workflow_id


@pytest.mark.asyncio
async def test_patch_workflow_description(test_client: AsyncClient) -> None:
    """Test updating workflow description.

    Expected: 200 OK with updated description
    """
    workflow = {
        "name": "test-workflow",
        "description": "Original description",
        "yaml_definition": """
schemaVersion: "1.0.0"
name: test
activities: []
""",
    }

    create_response = await test_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]

    # Update description
    update_data = {"description": "Updated description"}
    response = await test_client.patch(f"/api/v1/workflows/{workflow_id}", json=update_data)

    assert response.status_code == 200
    data = response.json()
    assert data["description"] == "Updated description"


@pytest.mark.asyncio
async def test_patch_workflow_is_enabled_toggle(test_client: AsyncClient) -> None:
    """Test toggling workflow enabled status.

    Expected: 200 OK with updated is_enabled status
    """
    workflow = {
        "name": "toggle-workflow",
        "yaml_definition": """
schemaVersion: "1.0.0"
name: toggle
activities: []
""",
    }

    create_response = await test_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]
    assert create_response.json()["is_enabled"] is True

    # Disable workflow
    response = await test_client.patch(f"/api/v1/workflows/{workflow_id}", json={"is_enabled": False})

    assert response.status_code == 200
    assert response.json()["is_enabled"] is False


@pytest.mark.asyncio
async def test_patch_workflow_labels(test_client: AsyncClient) -> None:
    """Test updating workflow labels.

    Expected: 200 OK with updated labels
    """
    workflow = {
        "name": "labeled-workflow",
        "yaml_definition": """
schemaVersion: "1.0.0"
name: labeled
activities: []
""",
        "labels": {"env": "dev"},
    }

    create_response = await test_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]

    # Update labels
    update_data = {"labels": {"env": "prod", "team": "engineering"}}
    response = await test_client.patch(f"/api/v1/workflows/{workflow_id}", json=update_data)

    assert response.status_code == 200
    data = response.json()
    assert data["labels"]["env"] == "prod"
    assert data["labels"]["team"] == "engineering"


@pytest.mark.asyncio
async def test_patch_workflow_updates_timestamp(test_client: AsyncClient) -> None:
    """Test that PATCH updates the updated_at timestamp.

    Expected: updated_at changes after update
    """
    workflow = {
        "name": "timestamp-test",
        "yaml_definition": """
schemaVersion: "1.0.0"
name: timestamp
activities: []
""",
    }

    create_response = await test_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]
    original_updated_at = create_response.json()["updated_at"]

    # Update workflow
    response = await test_client.patch(f"/api/v1/workflows/{workflow_id}", json={"description": "New description"})

    assert response.status_code == 200
    new_updated_at = response.json()["updated_at"]
    assert new_updated_at != original_updated_at


@pytest.mark.asyncio
async def test_patch_nonexistent_workflow(test_client: AsyncClient) -> None:
    """Test updating a non-existent workflow.

    Expected: 404 Not Found
    """
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await test_client.patch(f"/api/v1/workflows/{fake_id}", json={"name": "new-name"})

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_patch_workflow_validation_errors(test_client: AsyncClient) -> None:
    """Test validation errors on invalid update data.

    Expected: 400 Bad Request for invalid data
    """
    workflow = {
        "name": "validation-test",
        "yaml_definition": """
schemaVersion: "1.0.0"
name: validation
activities: []
""",
    }

    create_response = await test_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]

    # Try to set name to empty string
    response = await test_client.patch(f"/api/v1/workflows/{workflow_id}", json={"name": ""})

    assert response.status_code in [400, 422]


@pytest.mark.asyncio
async def test_patch_workflow_with_yaml_definition_creates_version(test_client: AsyncClient) -> None:
    """Test that PATCH with yaml_definition creates a new version.

    Expected: 200 OK, current_version incremented, new version created
    """
    workflow = {
        "name": "versioning-test",
        "yaml_definition": """
schemaVersion: "1.0.0"
name: versioning-test
activities: []
""",
    }

    create_response = await test_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]
    assert create_response.json()["current_version"] == 1

    # Update with new yaml_definition
    update_data = {
        "yaml_definition": """
schemaVersion: "1.0.0"
name: versioning-test
activities:
  - id: step1
    executor: script
""",
        "change_description": "Added step1 activity",
    }
    response = await test_client.patch(f"/api/v1/workflows/{workflow_id}", json=update_data)

    assert response.status_code == 200
    data = response.json()
    assert data["current_version"] == 2
    assert data["version"]["version"] == 2
    assert data["version"]["change_description"] == "Added step1 activity"
    assert "step1" in data["version"]["yaml_definition"]


@pytest.mark.asyncio
async def test_patch_workflow_metadata_only_does_not_create_version(test_client: AsyncClient) -> None:
    """Test that PATCH with only metadata does NOT create a new version.

    Expected: 200 OK, current_version unchanged
    """
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
    assert create_response.json()["current_version"] == 1

    # Update only metadata fields
    update_data = {"name": "metadata-test-updated", "description": "Updated description"}
    response = await test_client.patch(f"/api/v1/workflows/{workflow_id}", json=update_data)

    assert response.status_code == 200
    data = response.json()
    assert data["current_version"] == 1  # Version should NOT be incremented
    assert data["name"] == "metadata-test-updated"
    assert data["description"] == "Updated description"


@pytest.mark.asyncio
async def test_patch_workflow_returns_version_data(test_client: AsyncClient) -> None:
    """Test that PATCH response includes version object with current version data.

    Expected: 200 OK with version object containing current active version
    """
    workflow = {
        "name": "version-response-test",
        "yaml_definition": """
schemaVersion: "1.0.0"
name: version-response-test
activities: []
""",
    }

    create_response = await test_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]

    # Update metadata
    update_data = {"description": "Testing version response"}
    response = await test_client.patch(f"/api/v1/workflows/{workflow_id}", json=update_data)

    assert response.status_code == 200
    data = response.json()

    # Verify version object is present
    assert "version" in data
    version = data["version"]
    assert version["version"] == 1
    assert version["workflow_id"] == workflow_id
    assert "yaml_definition" in version
    assert "schema_version" in version


@pytest.mark.asyncio
async def test_patch_workflow_with_unchanged_yaml_skips_version(test_client: AsyncClient) -> None:
    """Test that PATCH with identical YAML does NOT create new version (change detection).

    Expected: 200 OK, current_version unchanged when YAML is exactly identical.
    Note: Whitespace differences ARE considered changes (exact match required).
    """
    yaml_definition = """
schemaVersion: "1.0.0"
name: change-detection-test
activities:
  - id: step1
    executor: script
"""

    workflow = {
        "name": "change-detection-test",
        "yaml_definition": yaml_definition,
    }

    create_response = await test_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]
    assert create_response.json()["current_version"] == 1

    # Update with identical YAML (should NOT create new version)
    update_data = {
        "yaml_definition": yaml_definition,
        "change_description": "Testing change detection",
    }
    response = await test_client.patch(f"/api/v1/workflows/{workflow_id}", json=update_data)

    assert response.status_code == 200
    data = response.json()
    assert data["current_version"] == 1  # Version should NOT be incremented
    assert data["version"]["version"] == 1

    # Update with whitespace differences (should CREATE new version - exact match required)
    update_data_with_whitespace = {
        "yaml_definition": yaml_definition.strip() + "\n\n",  # Extra newlines
        "change_description": "Whitespace change",
    }
    response2 = await test_client.patch(f"/api/v1/workflows/{workflow_id}", json=update_data_with_whitespace)

    assert response2.status_code == 200
    data2 = response2.json()
    assert data2["current_version"] == 2  # Version increments due to whitespace difference

    # Update with actual YAML change (should create new version)
    updated_yaml = """
schemaVersion: "1.0.0"
name: change-detection-test
activities:
  - id: step1
    executor: script
  - id: step2
    executor: api
"""
    update_data_changed = {
        "yaml_definition": updated_yaml,
        "change_description": "Added step2",
    }
    response3 = await test_client.patch(f"/api/v1/workflows/{workflow_id}", json=update_data_changed)

    assert response3.status_code == 200
    data3 = response3.json()
    assert data3["current_version"] == 3  # Version 3 (initial -> whitespace -> content change)
    assert "step2" in data3["version"]["yaml_definition"]


@pytest.mark.asyncio
async def test_patch_workflow_duplicate_name_error(test_client: AsyncClient) -> None:
    """Test that renaming to an existing workflow name returns 400 error.

    Expected: 400 Bad Request (not 500 IntegrityError)
    """
    # Create two workflows
    workflow1 = {
        "name": "workflow-one",
        "yaml_definition": """
schemaVersion: "1.0.0"
name: workflow-one
activities: []
""",
    }

    workflow2 = {
        "name": "workflow-two",
        "yaml_definition": """
schemaVersion: "1.0.0"
name: workflow-two
activities: []
""",
    }

    response1 = await test_client.post("/api/v1/workflows", json=workflow1)
    workflow1_id = response1.json()["id"]

    response2 = await test_client.post("/api/v1/workflows", json=workflow2)
    workflow2_id = response2.json()["id"]

    # Try to rename workflow2 to workflow1's name (should fail)
    update_data = {"name": "workflow-one"}
    response = await test_client.patch(f"/api/v1/workflows/{workflow2_id}", json=update_data)

    # Should return 400 Bad Request (user error), not 500 (server error)
    assert response.status_code == 400
    assert "already exists" in response.json()["detail"].lower()

    # Verify workflow1 is unchanged
    get_response = await test_client.get(f"/api/v1/workflows/{workflow1_id}")
    assert get_response.status_code == 200
    assert get_response.json()["name"] == "workflow-one"
