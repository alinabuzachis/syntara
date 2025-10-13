"""End-to-end integration test for workflow lifecycle.

Tests the complete workflow management lifecycle:
1. Create workflow
2. Create versions (via PATCH)
3. List versions
4. Get specific version
5. Update workflow metadata
6. Soft delete workflow
7. Verify soft delete prevents access
"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_workflow_complete_lifecycle(test_client: AsyncClient) -> None:  # noqa: PLR0915
    """Test complete workflow lifecycle from creation to deletion.

    This test verifies that all workflow operations work together correctly:
    - Creating a workflow automatically creates version 1
    - PATCH with yaml_definition creates new versions
    - Version history is maintained correctly
    - Metadata updates don't create versions
    - Soft delete prevents future access
    """
    # Step 1: Create workflow
    create_payload = {
        "name": "lifecycle-test-workflow",
        "description": "Testing complete lifecycle",
        "labels": {"env": "test", "purpose": "integration"},
        "yaml_definition": """
schemaVersion: "1.0.0"
name: lifecycle-test
description: Initial version
activities: []
""",
    }

    create_response = await test_client.post(
        "/api/v1/workflows",
        json=create_payload,
    )
    assert create_response.status_code == 201
    workflow = create_response.json()
    workflow_id = workflow["id"]

    assert workflow["name"] == "lifecycle-test-workflow"
    assert workflow["current_version"] == 1
    assert workflow["is_enabled"] is True
    assert workflow["labels"] == {"env": "test", "purpose": "integration"}

    # Note: POST returns WorkflowResponse (no version data)
    # Use GET to retrieve version data
    get_workflow_response = await test_client.get(f"/api/v1/workflows/{workflow_id}")
    assert get_workflow_response.status_code == 200
    workflow_with_version = get_workflow_response.json()

    # Verify workflow includes version data (WorkflowWithVersionResponse)
    assert "version" in workflow_with_version
    assert workflow_with_version["version"]["version"] == 1
    assert 'schemaVersion: "1.0.0"' in workflow_with_version["version"]["yaml_definition"]

    # Step 2: Create version 2 via PATCH
    version2_yaml = """
schemaVersion: "1.0.0"
name: lifecycle-test
description: Version 2 with new activity
activities:
  - id: activity_1
    name: Activity 1
    type: task
"""

    update_v2_payload = {
        "yaml_definition": version2_yaml,
        "change_description": "Added activity_1",
    }

    update_v2_response = await test_client.patch(
        f"/api/v1/workflows/{workflow_id}",
        json=update_v2_payload,
    )
    assert update_v2_response.status_code == 200
    workflow_v2 = update_v2_response.json()

    assert workflow_v2["current_version"] == 2
    assert workflow_v2["name"] == "lifecycle-test-workflow"  # Name unchanged
    assert "version" in workflow_v2
    assert workflow_v2["version"]["version"] == 2
    assert "activity_1" in workflow_v2["version"]["yaml_definition"]

    # Step 3: Create version 3 via PATCH
    version3_yaml = """
schemaVersion: "1.0.0"
name: lifecycle-test
description: Version 3 with two activities
activities:
  - id: activity_1
    name: Activity 1
    type: task
  - id: activity_2
    name: Activity 2
    type: task
"""

    update_v3_payload = {
        "yaml_definition": version3_yaml,
        "change_description": "Added activity_2",
    }

    update_v3_response = await test_client.patch(
        f"/api/v1/workflows/{workflow_id}",
        json=update_v3_payload,
    )
    assert update_v3_response.status_code == 200
    workflow_v3 = update_v3_response.json()

    assert workflow_v3["current_version"] == 3
    assert workflow_v3["version"]["version"] == 3
    assert "activity_2" in workflow_v3["version"]["yaml_definition"]

    # Step 4: List all versions
    list_versions_response = await test_client.get(
        f"/api/v1/workflows/{workflow_id}/versions",
    )
    assert list_versions_response.status_code == 200
    versions_data = list_versions_response.json()

    assert "versions" in versions_data
    versions = versions_data["versions"]
    assert len(versions) == 3

    # Verify versions are ordered DESC (newest first)
    assert versions[0]["version"] == 3
    assert versions[1]["version"] == 2
    assert versions[2]["version"] == 1

    # Step 5: Get specific version (version 2)
    get_v2_response = await test_client.get(
        f"/api/v1/workflows/{workflow_id}/versions/2",
    )
    assert get_v2_response.status_code == 200
    v2_data = get_v2_response.json()

    assert v2_data["version"] == 2
    assert v2_data["workflow_id"] == workflow_id
    assert "activity_1" in v2_data["yaml_definition"]
    assert "activity_2" not in v2_data["yaml_definition"]
    assert v2_data["change_description"] == "Added activity_1"

    # Step 6: Update metadata only (should NOT create new version)
    metadata_update_payload = {
        "description": "Updated description",
        "labels": {"env": "production", "purpose": "integration", "team": "platform"},
        "is_enabled": False,
    }

    metadata_update_response = await test_client.patch(
        f"/api/v1/workflows/{workflow_id}",
        json=metadata_update_payload,
    )
    assert metadata_update_response.status_code == 200
    workflow_metadata = metadata_update_response.json()

    # Version should still be 3 (no yaml_definition in update)
    assert workflow_metadata["current_version"] == 3
    assert workflow_metadata["description"] == "Updated description"
    assert workflow_metadata["labels"] == {
        "env": "production",
        "purpose": "integration",
        "team": "platform",
    }
    assert workflow_metadata["is_enabled"] is False

    # Verify GET returns updated metadata
    get_workflow_response = await test_client.get(
        f"/api/v1/workflows/{workflow_id}",
    )
    assert get_workflow_response.status_code == 200
    workflow_updated = get_workflow_response.json()

    assert workflow_updated["is_enabled"] is False
    assert workflow_updated["description"] == "Updated description"
    assert workflow_updated["current_version"] == 3

    # Step 7: Soft delete workflow
    delete_response = await test_client.delete(
        f"/api/v1/workflows/{workflow_id}",
    )
    assert delete_response.status_code == 204

    # Step 8: Verify soft delete prevents access
    get_deleted_response = await test_client.get(
        f"/api/v1/workflows/{workflow_id}",
    )
    assert get_deleted_response.status_code == 404

    # Verify workflow not in list
    list_response = await test_client.get("/api/v1/workflows")
    assert list_response.status_code == 200
    workflows = list_response.json()["workflows"]

    # Workflow should not appear in list (soft deleted)
    workflow_ids = [w["id"] for w in workflows]
    assert workflow_id not in workflow_ids

    # Verify versions endpoint returns 404 for deleted workflow
    versions_deleted_response = await test_client.get(
        f"/api/v1/workflows/{workflow_id}/versions",
    )
    assert versions_deleted_response.status_code == 404


@pytest.mark.asyncio
async def test_workflow_version_immutability(test_client: AsyncClient) -> None:
    """Test that workflow versions are read-only and immutable."""
    # Create workflow
    create_payload = {
        "name": "immutable-test",
        "yaml_definition": """
schemaVersion: "1.0.0"
name: immutable-test
activities: []
""",
    }

    create_response = await test_client.post(
        "/api/v1/workflows",
        json=create_payload,
    )
    assert create_response.status_code == 201
    workflow = create_response.json()
    workflow_id = workflow["id"]

    # Create version 2
    update_payload = {
        "yaml_definition": """
schemaVersion: "1.0.0"
name: immutable-test
activities:
  - id: activity_1
    name: Activity 1
    type: task
""",
    }

    await test_client.patch(f"/api/v1/workflows/{workflow_id}", json=update_payload)

    # Get version 1
    v1_response = await test_client.get(
        f"/api/v1/workflows/{workflow_id}/versions/1",
    )
    assert v1_response.status_code == 200
    v1_original = v1_response.json()

    # Get version 1 again to verify it hasn't changed
    v1_again_response = await test_client.get(
        f"/api/v1/workflows/{workflow_id}/versions/1",
    )
    assert v1_again_response.status_code == 200
    v1_again = v1_again_response.json()

    # Verify version 1 is unchanged
    assert v1_original["yaml_definition"] == v1_again["yaml_definition"]
    assert v1_original["created_at"] == v1_again["created_at"]
    assert v1_original["version"] == 1

    # Verify current version is 2 but version 1 still accessible
    workflow_response = await test_client.get(f"/api/v1/workflows/{workflow_id}")
    assert workflow_response.status_code == 200
    current_workflow = workflow_response.json()

    assert current_workflow["current_version"] == 2
    assert "activity_1" in current_workflow["version"]["yaml_definition"]

    # But version 1 still has original definition
    assert "activity_1" not in v1_again["yaml_definition"]
