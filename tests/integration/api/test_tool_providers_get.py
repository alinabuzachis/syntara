"""Contract tests for GET /api/v1/tool-providers/{provider_id} endpoint.

Tests provider retrieval, 404 handling, and response format.
"""

import pytest
from httpx import AsyncClient

from nexus.tool_manager.models import ToolProvider


class TestToolProvidersGetContract:
    """Contract tests for tool provider get endpoint."""

    @pytest.mark.asyncio
    async def test_get_provider_success_contract(
        self, base_client: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test successful provider retrieval returns 200."""
        response = await base_client.get(f"/api/v1/tool-providers/{test_tool_provider.id}")

        # Contract: Must return 200 OK for existing provider
        assert response.status_code == 200

        # Contract: Must return provider details
        data = response.json()
        assert "id" in data
        assert "name" in data
        assert "configuration" in data
        assert "status" in data

        # Verify returned data matches the test provider
        assert data["id"] == str(test_tool_provider.id)
        assert data["name"] == test_tool_provider.name

    @pytest.mark.asyncio
    async def test_get_provider_all_fields_contract(
        self, base_client: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test response includes all required fields."""
        response = await base_client.get(f"/api/v1/tool-providers/{test_tool_provider.id}")

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: Must include all provider fields per OpenAPI spec
        data = response.json()
        required_fields = [
            "id",
            "name",
            "description",
            "configuration",
            "status",
            "last_validated_at",
            "validation_error",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        for field in required_fields:
            assert field in data

    @pytest.mark.asyncio
    async def test_get_provider_last_validated_at_contract(
        self, base_client: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test response includes last_validated_at field."""
        response = await base_client.get(f"/api/v1/tool-providers/{test_tool_provider.id}")

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: Must include last_validated_at field (nullable)
        data = response.json()
        assert "last_validated_at" in data
        # Field can be null for unvalidated providers
        if data["last_validated_at"] is not None:
            assert isinstance(data["last_validated_at"], str)

    @pytest.mark.asyncio
    async def test_get_provider_not_found_contract(self, base_client: AsyncClient) -> None:
        """Test 404 error for non-existent provider."""
        provider_id = "99999999-9999-9999-9999-999999999999"

        response = await base_client.get(f"/api/v1/tool-providers/{provider_id}")

        # Contract: Must return 404 Not Found
        assert response.status_code == 404

        # Contract: Must return error response
        data = response.json()
        assert "error" in data or "detail" in data

    @pytest.mark.asyncio
    async def test_get_provider_invalid_uuid_contract(self, base_client: AsyncClient) -> None:
        """Test 400 error for invalid UUID format."""
        invalid_id = "not-a-uuid"

        response = await base_client.get(f"/api/v1/tool-providers/{invalid_id}")

        # Contract: Must return 422 Unprocessable Entity for invalid UUID format
        assert response.status_code == 422

        # Contract: Must return validation error
        data = response.json()
        assert "error" in data or "detail" in data

    @pytest.mark.asyncio
    async def test_get_provider_configuration_format_contract(
        self, base_client: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test configuration field format in response."""
        response = await base_client.get(f"/api/v1/tool-providers/{test_tool_provider.id}")

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: Configuration must be a JSON object
        data = response.json()
        assert "configuration" in data
        assert isinstance(data["configuration"], dict)
        assert "provider_type" in data["configuration"]

        # Verify configuration matches test provider
        assert data["configuration"]["provider_type"] == "mock"

    @pytest.mark.asyncio
    async def test_get_provider_status_values_contract(
        self, base_client: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test status field contains valid values."""
        response = await base_client.get(f"/api/v1/tool-providers/{test_tool_provider.id}")

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: Status must be one of valid enum values
        data = response.json()
        assert "status" in data
        valid_statuses = ["available", "error", "validating"]
        assert data["status"] in valid_statuses

    @pytest.mark.asyncio
    async def test_get_provider_timestamps_format_contract(
        self, base_client: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test timestamp fields are properly formatted."""
        response = await base_client.get(f"/api/v1/tool-providers/{test_tool_provider.id}")

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: Timestamp fields must be ISO format strings
        data = response.json()
        timestamp_fields = ["created_at", "updated_at"]
        for field in timestamp_fields:
            assert field in data
            assert isinstance(data[field], str)
            # Basic ISO format validation (contains T and Z/+)
            assert "T" in data[field]
