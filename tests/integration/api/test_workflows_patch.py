"""Contract tests for PATCH /api/v1/workflows/{id} endpoint.

Tests for updating workflow metadata.
Tests MUST FAIL before implementation (TDD approach).
"""

import pytest
from httpx import AsyncClient

from tests.helpers import create_minimal_workflow_definition, create_workflow_definition_with_activities


@pytest.mark.asyncio
async def test_patch_workflow_name(base_client: AsyncClient) -> None:
    """Test updating workflow name.

    Expected: 200 OK with updated workflow
    """
    # Create workflow
    workflow = {
        "name": "original-name",
        "workflow_definition": create_minimal_workflow_definition(
            name="original",
            description="Original workflow",
            activity_id="task1",
        ),
    }

    create_response = await base_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]

    # Update name
    update_data = {"name": "updated-name"}
    response = await base_client.patch(f"/api/v1/workflows/{workflow_id}", json=update_data)

    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "updated-name"
    assert data["id"] == workflow_id


@pytest.mark.asyncio
async def test_patch_workflow_description(base_client: AsyncClient) -> None:
    """Test updating workflow description.

    Expected: 200 OK with updated description
    """
    workflow = {
        "name": "test-workflow",
        "description": "Original description",
        "workflow_definition": create_minimal_workflow_definition(
            name="test",
            description="Original description",
            activity_id="task1",
        ),
    }

    create_response = await base_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]

    # Update description
    update_data = {"description": "Updated description"}
    response = await base_client.patch(f"/api/v1/workflows/{workflow_id}", json=update_data)

    assert response.status_code == 200
    data = response.json()
    assert data["description"] == "Updated description"


@pytest.mark.asyncio
async def test_patch_workflow_is_enabled_toggle(base_client: AsyncClient) -> None:
    """Test toggling workflow enabled status.

    Expected: 200 OK with updated is_enabled status
    """
    workflow = {
        "name": "toggle-workflow",
        "workflow_definition": create_minimal_workflow_definition(
            name="toggle",
            description="Toggle test",
            activity_id="task1",
        ),
    }

    create_response = await base_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]
    assert create_response.json()["is_enabled"] is True

    # Disable workflow
    response = await base_client.patch(f"/api/v1/workflows/{workflow_id}", json={"is_enabled": False})

    assert response.status_code == 200
    assert response.json()["is_enabled"] is False


@pytest.mark.asyncio
async def test_patch_workflow_labels(base_client: AsyncClient) -> None:
    """Test updating workflow labels.

    Expected: 200 OK with updated labels
    """
    workflow = {
        "name": "labeled-workflow",
        "workflow_definition": create_minimal_workflow_definition(
            name="labeled",
            description="Labeled workflow",
            activity_id="task1",
        ),
        "labels": {"env": "dev"},
    }

    create_response = await base_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]

    # Update labels
    update_data = {"labels": {"env": "prod", "team": "engineering"}}
    response = await base_client.patch(f"/api/v1/workflows/{workflow_id}", json=update_data)

    assert response.status_code == 200
    data = response.json()
    assert data["labels"]["env"] == "prod"
    assert data["labels"]["team"] == "engineering"


@pytest.mark.asyncio
async def test_patch_workflow_updates_timestamp(base_client: AsyncClient) -> None:
    """Test that PATCH updates the updated_at timestamp.

    Expected: updated_at changes after update
    """
    workflow = {
        "name": "timestamp-test",
        "workflow_definition": create_minimal_workflow_definition(
            name="timestamp",
            description="Timestamp test",
            activity_id="task1",
        ),
    }

    create_response = await base_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]
    original_updated_at = create_response.json()["updated_at"]

    # Update workflow
    response = await base_client.patch(f"/api/v1/workflows/{workflow_id}", json={"description": "New description"})

    assert response.status_code == 200
    new_updated_at = response.json()["updated_at"]
    assert new_updated_at != original_updated_at


@pytest.mark.asyncio
async def test_patch_nonexistent_workflow(base_client: AsyncClient) -> None:
    """Test updating a non-existent workflow.

    Expected: 404 Not Found
    """
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await base_client.patch(f"/api/v1/workflows/{fake_id}", json={"name": "new-name"})

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_patch_workflow_validation_errors(base_client: AsyncClient) -> None:
    """Test validation errors on invalid update data.

    Expected: 400 Bad Request for invalid data
    """
    workflow = {
        "name": "validation-test",
        "workflow_definition": create_minimal_workflow_definition(
            name="validation",
            description="Validation test",
            activity_id="task1",
        ),
    }

    create_response = await base_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]

    # Try to set name to empty string
    response = await base_client.patch(f"/api/v1/workflows/{workflow_id}", json={"name": ""})

    assert response.status_code in [400, 422]


@pytest.mark.asyncio
async def test_patch_workflow_with_workflow_definition_creates_version(base_client: AsyncClient) -> None:
    """Test that PATCH with workflow_definition creates a new version.

    Expected: 200 OK, current_version incremented, new version created
    """
    workflow = {
        "name": "versioning-test",
        "workflow_definition": create_minimal_workflow_definition(
            name="versioning-test",
            description="Initial version",
            activity_id="initial_task",
        ),
    }

    create_response = await base_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]
    assert create_response.json()["current_version"] == 1

    # Update with new workflow_definition
    update_data = {
        "workflow_definition": create_workflow_definition_with_activities(
            name="versioning-test",
            description="Version 2",
            activities=[
                {
                    "id": "step1",
                    "name": "Step 1",
                    "type": "task",
                    "task": {
                        "executor": "script",
                        "config": {
                            "language": "python",
                            "code": "print('step 1')",
                        },
                    },
                }
            ],
        ),
        "change_description": "Added step1 activity",
    }
    response = await base_client.patch(f"/api/v1/workflows/{workflow_id}", json=update_data)

    assert response.status_code == 200
    data = response.json()
    assert data["current_version"] == 2
    assert data["version"]["version"] == 2
    assert data["version"]["change_description"] == "Added step1 activity"
    workflow_def = data["version"]["workflow_definition"]
    assert workflow_def["workflow"]["activities"][0]["id"] == "step1"


@pytest.mark.asyncio
async def test_patch_workflow_metadata_only_does_not_create_version(base_client: AsyncClient) -> None:
    """Test that PATCH with only metadata does NOT create a new version.

    Expected: 200 OK, current_version unchanged
    """
    workflow = {
        "name": "metadata-test",
        "workflow_definition": create_minimal_workflow_definition(
            name="metadata-test",
            description="Initial description",
            activity_id="task1",
        ),
    }

    create_response = await base_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]
    assert create_response.json()["current_version"] == 1

    # Update only metadata fields
    update_data = {"name": "metadata-test-updated", "description": "Updated description"}
    response = await base_client.patch(f"/api/v1/workflows/{workflow_id}", json=update_data)

    assert response.status_code == 200
    data = response.json()
    assert data["current_version"] == 1  # Version should NOT be incremented
    assert data["name"] == "metadata-test-updated"
    assert data["description"] == "Updated description"


@pytest.mark.asyncio
async def test_patch_workflow_returns_version_data(base_client: AsyncClient) -> None:
    """Test that PATCH response includes version object with current version data.

    Expected: 200 OK with version object containing current active version
    """
    workflow = {
        "name": "version-response-test",
        "workflow_definition": create_minimal_workflow_definition(
            name="version-response-test",
            description="Initial version",
            activity_id="task1",
        ),
    }

    create_response = await base_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]

    # Update metadata
    update_data = {"description": "Testing version response"}
    response = await base_client.patch(f"/api/v1/workflows/{workflow_id}", json=update_data)

    assert response.status_code == 200
    data = response.json()

    # Verify version object is present
    assert "version" in data
    version = data["version"]
    assert version["version"] == 1
    assert version["workflow_id"] == workflow_id
    assert "workflow_definition" in version
    assert "schema_version" in version


@pytest.mark.asyncio
async def test_patch_workflow_with_unchanged_yaml_skips_version(base_client: AsyncClient) -> None:
    """Test that PATCH with identical definition does NOT create new version (change detection).

    Expected: 200 OK, current_version unchanged when definition is exactly identical.
    """
    workflow_definition = create_workflow_definition_with_activities(
        name="change-detection-test",
        description="Change detection test",
        activities=[
            {
                "id": "step1",
                "name": "Step 1",
                "type": "task",
                "task": {
                    "executor": "script",
                    "config": {
                        "language": "python",
                        "code": "print('step 1')",
                    },
                },
            }
        ],
    )

    workflow = {
        "name": "change-detection-test",
        "workflow_definition": workflow_definition,
    }

    create_response = await base_client.post("/api/v1/workflows", json=workflow)
    workflow_id = create_response.json()["id"]
    assert create_response.json()["current_version"] == 1

    # Update with identical definition (should NOT create new version)
    update_data = {
        "workflow_definition": workflow_definition,
        "change_description": "Testing change detection",
    }
    response = await base_client.patch(f"/api/v1/workflows/{workflow_id}", json=update_data)

    assert response.status_code == 200
    data = response.json()
    assert data["current_version"] == 1  # Version should NOT be incremented
    assert data["version"]["version"] == 1

    # Update with actual definition change (should create new version)
    updated_definition = create_workflow_definition_with_activities(
        name="change-detection-test",
        description="Change detection test",
        activities=[
            {
                "id": "step1",
                "name": "Step 1",
                "type": "task",
                "task": {
                    "executor": "script",
                    "config": {
                        "language": "python",
                        "code": "print('step 1')",
                    },
                },
            },
            {
                "id": "step2",
                "name": "Step 2",
                "type": "task",
                "task": {
                    "executor": "api",
                    "config": {
                        "url": "https://example.com",
                    },
                },
            },
        ],
    )
    update_data_changed = {
        "workflow_definition": updated_definition,
        "change_description": "Added step2",
    }
    response2 = await base_client.patch(f"/api/v1/workflows/{workflow_id}", json=update_data_changed)

    assert response2.status_code == 200
    data2 = response2.json()
    assert data2["current_version"] == 2  # Version incremented due to content change
    workflow_def = data2["version"]["workflow_definition"]
    assert len(workflow_def["workflow"]["activities"]) == 2
    assert workflow_def["workflow"]["activities"][1]["id"] == "step2"


@pytest.mark.asyncio
async def test_patch_workflow_duplicate_name_error(base_client: AsyncClient) -> None:
    """Test that renaming to an existing workflow name returns 400 error.

    Expected: 400 Bad Request (not 500 IntegrityError)
    """
    # Create two workflows
    workflow1 = {
        "name": "workflow-one",
        "workflow_definition": create_minimal_workflow_definition(
            name="workflow-one",
            description="First workflow",
            activity_id="task1",
        ),
    }

    workflow2 = {
        "name": "workflow-two",
        "workflow_definition": create_minimal_workflow_definition(
            name="workflow-two",
            description="Second workflow",
            activity_id="task2",
        ),
    }

    response1 = await base_client.post("/api/v1/workflows", json=workflow1)
    workflow1_id = response1.json()["id"]

    response2 = await base_client.post("/api/v1/workflows", json=workflow2)
    workflow2_id = response2.json()["id"]

    # Try to rename workflow2 to workflow1's name (should fail)
    update_data = {"name": "workflow-one"}
    response = await base_client.patch(f"/api/v1/workflows/{workflow2_id}", json=update_data)

    # Should return 400 Bad Request (user error), not 500 (server error)
    assert response.status_code == 400
    assert "already exists" in response.json()["detail"].lower()

    # Verify workflow1 is unchanged
    get_response = await base_client.get(f"/api/v1/workflows/{workflow1_id}")
    assert get_response.status_code == 200
    assert get_response.json()["name"] == "workflow-one"
