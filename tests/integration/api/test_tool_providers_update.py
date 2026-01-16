"""Contract tests for PUT /api/v1/tool_manager/tool_providers/{provider_id} endpoint.

Tests complete provider configuration replacement.
"""

import pytest
from httpx import AsyncClient

from nexus.tool_manager.models import ToolProvider


class TestToolProvidersUpdateContract:
    """Contract tests for tool provider update endpoint."""

    @pytest.mark.asyncio
    async def test_update_provider_success_contract(
        self, base_client_with_provider_factory: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test successful provider update returns 200."""
        update_data = {
            "name": "updated-provider-name",
            "description": "Updated description",
            "configuration": {
                "provider_type": "mcp",
                "base_url": "https://updated.example.com/mcp",
                "api_key": "updated-api-key",
            },
        }

        response = await base_client_with_provider_factory.put(
            f"/api/v1/tool_manager/tool_providers/{test_tool_provider.id}", json=update_data
        )

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: Must return updated provider
        data = response.json()
        assert data["name"] == update_data["name"]
        assert data["description"] == update_data["description"]
        assert data["configuration"] == update_data["configuration"]

    @pytest.mark.asyncio
    async def test_update_provider_complete_replacement_contract(
        self, base_client_with_provider_factory: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test PUT performs complete configuration replacement."""
        update_data = {
            "name": "completely-new-name",
            "configuration": {
                "provider_type": "mcp",
                "base_url": "https://newurl.example.com/mcp",
                "api_key": "new-key",
            },
        }

        response = await base_client_with_provider_factory.put(
            f"/api/v1/tool_manager/tool_providers/{test_tool_provider.id}", json=update_data
        )

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: Must completely replace configuration
        data = response.json()
        assert data["configuration"] == update_data["configuration"]

    @pytest.mark.asyncio
    async def test_update_provider_required_fields_contract(
        self, base_client_with_provider_factory: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test validation of required fields in request body."""
        invalid_data = {
            "name": "missing-configuration"
            # Missing required configuration field
        }

        response = await base_client_with_provider_factory.put(
            f"/api/v1/tool_manager/tool_providers/{test_tool_provider.id}", json=invalid_data
        )

        # Contract: Must return 422 Unprocessable Entity for missing required fields
        assert response.status_code == 422

        # Contract: Must return validation error
        data = response.json()
        assert "error" in data or "detail" in data

    @pytest.mark.asyncio
    async def test_update_provider_configuration_validation_contract(
        self, base_client_with_provider_factory: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test configuration validation in update."""
        invalid_data = {
            "name": "invalid-config-test",
            "configuration": {
                # Missing required provider_type field
                "base_url": "https://example.com/mcp",
                "api_key": "test-key",
            },
        }

        response = await base_client_with_provider_factory.put(
            f"/api/v1/tool_manager/tool_providers/{test_tool_provider.id}", json=invalid_data
        )

        # Contract: Must return 422 Unprocessable Entity for invalid configuration
        assert response.status_code == 422

        # Contract: Must return validation error about provider_type
        data = response.json()
        error_message = str(data.get("error", data.get("detail", "")))
        assert "provider_type" in error_message.lower()

    @pytest.mark.asyncio
    async def test_update_provider_not_found_contract(self, base_client_with_provider_factory: AsyncClient) -> None:
        """Test 404 error for non-existent provider."""
        provider_id = "99999999-9999-9999-9999-999999999999"
        update_data = {
            "name": "not-found-test",
            "configuration": {"provider_type": "mcp", "base_url": "https://example.com/mcp", "api_key": "test-key"},
        }

        response = await base_client_with_provider_factory.put(
            f"/api/v1/tool_manager/tool_providers/{provider_id}", json=update_data
        )

        # Contract: Must return 404 Not Found
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_update_provider_name_conflict_contract(
        self, base_client_with_provider_factory: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test 409 conflict when updating to existing name."""
        # First create another provider with the name we'll try to update to
        conflicting_provider_data = {
            "name": "existing-provider-name",
            "configuration": {"provider_type": "mcp", "base_url": "http://localhost:8080", "api_key": "test-key"},
        }
        create_response = await base_client_with_provider_factory.post(
            "/api/v1/tool_manager/tool_providers", json=conflicting_provider_data
        )
        assert create_response.status_code == 201

        # Now try to update the test provider to use the same name
        update_data = {
            "name": "existing-provider-name",  # Name already taken by another provider
            "configuration": {"provider_type": "mcp", "base_url": "http://localhost:8080", "api_key": "test-key"},
        }

        response = await base_client_with_provider_factory.put(
            f"/api/v1/tool_manager/tool_providers/{test_tool_provider.id}", json=update_data
        )

        # Contract: Must return 409 Conflict for duplicate name
        assert response.status_code == 409

    @pytest.mark.asyncio
    async def test_update_provider_invalid_uuid_contract(self, base_client_with_provider_factory: AsyncClient) -> None:
        """Test 422 Unprocessable Entity error for invalid UUID format."""
        invalid_id = "not-a-uuid"
        update_data = {
            "name": "invalid-uuid-test",
            "configuration": {"provider_type": "mcp", "base_url": "https://example.com/mcp", "api_key": "test-key"},
        }

        response = await base_client_with_provider_factory.put(
            f"/api/v1/tool_manager/tool_providers/{invalid_id}", json=update_data
        )

        # Contract: Must return 422 Unprocessable Entity for invalid UUID
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_update_provider_response_schema_contract(
        self, base_client_with_provider_factory: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test response matches OpenAPI specification schema."""
        update_data = {
            "name": "schema-test-update",
            "configuration": {"provider_type": "mcp", "base_url": "https://example.com/mcp", "api_key": "test-key"},
        }

        response = await base_client_with_provider_factory.put(
            f"/api/v1/tool_manager/tool_providers/{test_tool_provider.id}", json=update_data
        )

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: Must include all required response fields
        data = response.json()
        assert data["name"] == "schema-test-update"
        assert data["description"] is None
        assert data["configuration"] == {
            "provider_type": "mcp",
            "base_url": "https://example.com/mcp",
            "api_key": "test-key",
        }
        assert data["enabled"]

    @pytest.mark.asyncio
    async def test_update_provider_timestamps_updated_contract(
        self, base_client_with_provider_factory: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test updated_at timestamp is modified."""
        update_data = {
            "name": "timestamp-test-update",
            "configuration": {"provider_type": "mcp", "base_url": "https://example.com/mcp", "api_key": "test-key"},
        }

        response = await base_client_with_provider_factory.put(
            f"/api/v1/tool_manager/tool_providers/{test_tool_provider.id}", json=update_data
        )

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: Must update the updated_at timestamp
        data = response.json()
        assert "updated_at" in data
        assert isinstance(data["updated_at"], str)
