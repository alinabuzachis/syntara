"""Contract tests for PATCH /api/v1/tool-providers/{provider_id} endpoint.

Tests partial update functionality.
"""

import pytest
from httpx import AsyncClient

from nexus.tool_manager.models import ToolProvider


class TestToolProvidersPatchContract:
    """Contract tests for tool provider patch endpoint."""

    @pytest.mark.asyncio
    async def test_patch_provider_success_contract(
        self, base_client: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test successful partial provider update returns 200."""
        patch_data = {"description": "Partially updated description", "status": "disabled"}

        response = await base_client.patch(
            f"/api/v1/tool-providers/{test_tool_provider.id}",
            json=patch_data,
            headers={"Content-Type": "application/merge-patch+json"},
        )

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: Must return updated provider with changes
        data = response.json()
        assert data["name"] == test_tool_provider.name
        assert data["description"] == patch_data["description"]
        assert data["configuration"] == test_tool_provider.configuration
        assert data["status"] == patch_data["status"]

    @pytest.mark.asyncio
    async def test_patch_provider_content_type_contract(
        self, base_client: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test application/merge-patch+json content type is required."""
        patch_data = {"status": "disabled"}

        response = await base_client.patch(
            f"/api/v1/tool-providers/{test_tool_provider.id}",
            json=patch_data,
            headers={"Content-Type": "application/merge-patch+json"},
        )

        # Contract: Must accept application/merge-patch+json
        assert response.status_code == 200

        # Contract: Must return updated provider with changes
        data = response.json()
        assert data["name"] == test_tool_provider.name
        assert data["description"] == test_tool_provider.description
        assert data["configuration"] == test_tool_provider.configuration
        assert data["status"] == patch_data["status"]

    @pytest.mark.asyncio
    async def test_patch_provider_preserve_existing_fields_contract(
        self, base_client: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test existing fields are preserved."""
        patch_data = {
            "configuration": {
                "provider_type": test_tool_provider.configuration["provider_type"],
                "base_url": "https://updated.example.com/mcp",
            }
        }

        response = await base_client.patch(
            f"/api/v1/tool-providers/{test_tool_provider.id}",
            json=patch_data,
            headers={"Content-Type": "application/merge-patch+json"},
        )

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: Must preserve existing fields
        data = response.json()
        assert data["name"] == test_tool_provider.name
        assert data["description"] == test_tool_provider.description
        assert data["configuration"] == test_tool_provider.configuration
        assert data["status"] == test_tool_provider.status

        assert "provider_type" in data["configuration"]
        assert "base_url" in data["configuration"]
        assert data["configuration"]["base_url"] == "https://updated.example.com/mcp"

    @pytest.mark.asyncio
    async def test_patch_provider_validation_error_contract(
        self, base_client: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test validation error when removing required fields."""
        patch_data = {
            "configuration": {
                "provider_type": None  # Attempt to remove required field
            }
        }

        response = await base_client.patch(
            f"/api/v1/tool-providers/{test_tool_provider.id}",
            json=patch_data,
            headers={"Content-Type": "application/merge-patch+json"},
        )

        # Contract: Must return 422 Unprocessable Entity for invalid configuration
        assert response.status_code == 422

        # Contract: Must return validation error
        data = response.json()
        error_message = str(data.get("error", data.get("detail", "")))
        assert "provider_type" in error_message.lower()

    @pytest.mark.asyncio
    async def test_patch_provider_not_found_contract(self, base_client: AsyncClient) -> None:
        """Test 404 error for non-existent provider."""
        provider_id = "99999999-9999-9999-9999-999999999999"
        patch_data = {"status": "disabled"}

        response = await base_client.patch(
            f"/api/v1/tool-providers/{provider_id}",
            json=patch_data,
            headers={"Content-Type": "application/merge-patch+json"},
        )

        # Contract: Must return 404 Not Found
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_patch_provider_minimal_update_contract(
        self, base_client: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test PATCH with single field update."""
        patch_data = {"status": "disabled"}

        response = await base_client.patch(
            f"/api/v1/tool-providers/{test_tool_provider.id}",
            json=patch_data,
            headers={"Content-Type": "application/merge-patch+json"},
        )

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: Must update only the specified field
        data = response.json()
        assert data["name"] == test_tool_provider.name
        assert data["description"] == test_tool_provider.description
        assert data["configuration"] == test_tool_provider.configuration
        assert data["status"] == patch_data["status"]

    @pytest.mark.asyncio
    async def test_patch_provider_empty_patch_contract(
        self, base_client: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test PATCH with empty object."""
        patch_data: dict[str, str] = {}

        response = await base_client.patch(
            f"/api/v1/tool-providers/{test_tool_provider.id}",
            json=patch_data,
            headers={"Content-Type": "application/merge-patch+json"},
        )

        # Contract: Must return 200 OK for empty patch
        assert response.status_code == 200

        # Contract: Must return provider unchanged
        data = response.json()
        assert data["name"] == test_tool_provider.name
        assert data["description"] == test_tool_provider.description
        assert data["configuration"] == test_tool_provider.configuration
        assert data["status"] == test_tool_provider.status

    @pytest.mark.asyncio
    async def test_patch_provider_name_conflict_contract(
        self, base_client: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test 409 conflict when patching to existing name."""
        # First create another provider with the name we'll try to patch to
        conflicting_provider_data = {
            "name": "existing-provider-name",
            "configuration": {"provider_type": "mock", "base_url": "https://example.com/mcp"},
        }
        create_response = await base_client.post("/api/v1/tool-providers", json=conflicting_provider_data)
        assert create_response.status_code == 201

        # Now try to patch the test provider to use the same name
        patch_data = {"name": "existing-provider-name"}

        response = await base_client.patch(
            f"/api/v1/tool-providers/{test_tool_provider.id}",
            json=patch_data,
            headers={"Content-Type": "application/merge-patch+json"},
        )

        # Contract: Must return 409 Conflict for duplicate name
        assert response.status_code == 409

    @pytest.mark.asyncio
    async def test_patch_provider_without_status_preserves_existing_value_contract(
        self, base_client: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test that patch without 'status' field preserves the existing status value."""
        # First, set the provider's status to disabled
        patch_data_disable = {"status": "disabled"}
        response = await base_client.patch(
            f"/api/v1/tool-providers/{test_tool_provider.id}",
            json=patch_data_disable,
            headers={"Content-Type": "application/merge-patch+json"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "disabled"

        # Now patch without the 'status' field - should preserve disabled
        patch_data_no_status = {
            "description": "Updated description without status field",
            "configuration": {
                "provider_type": test_tool_provider.configuration["provider_type"],
                "new_field": "added_value",
            },
        }

        response = await base_client.patch(
            f"/api/v1/tool-providers/{test_tool_provider.id}",
            json=patch_data_no_status,
            headers={"Content-Type": "application/merge-patch+json"},
        )

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: Must preserve existing 'status' value (disabled)
        data = response.json()
        assert data["status"] == "disabled"
        assert data["description"] == "Updated description without status field"
        assert data["configuration"]["new_field"] == "added_value"

        # Now set provider to available and test again
        patch_data_enable = {"status": "available"}
        response = await base_client.patch(
            f"/api/v1/tool-providers/{test_tool_provider.id}",
            json=patch_data_enable,
            headers={"Content-Type": "application/merge-patch+json"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "available"

        # Patch again without 'status' field - should preserve available
        patch_data_no_status_2 = {"description": "Another update without status field"}

        response = await base_client.patch(
            f"/api/v1/tool-providers/{test_tool_provider.id}",
            json=patch_data_no_status_2,
            headers={"Content-Type": "application/merge-patch+json"},
        )

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: Must preserve existing 'status' value (available)
        data = response.json()
        assert data["status"] == "available"
        assert data["description"] == "Another update without status field"
