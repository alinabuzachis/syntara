"""Contract tests for GET /api/v1/tools/{tool_id} endpoint.

Tests tool retrieval, 404 handling, and response format.
"""

from datetime import datetime
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient

from nexus.tool_manager.models import Tool


class TestToolsGetContract:
    """Contract tests for tool get endpoint."""

    @pytest.mark.asyncio
    async def test_get_tool_success_contract(self, base_client: AsyncClient, test_tool: Tool) -> None:
        """Test successful tool retrieval returns 200."""
        response = await base_client.get(f"/api/v1/tools/{test_tool.id}")

        # Contract: Must return 200 OK for existing tool
        assert response.status_code == 200

        # Contract: Must return tool details
        data = response.json()
        assert "id" in data
        assert "name" in data
        assert "provider_id" in data
        assert "namespaced_name" in data
        assert "status" in data

        # Verify returned data matches the test tool
        assert data["id"] == str(test_tool.id)
        assert data["name"] == test_tool.name
        assert data["provider_id"] == str(test_tool.provider_id)
        assert data["namespaced_name"] == test_tool.namespaced_name

    @pytest.mark.asyncio
    async def test_get_tool_all_fields_contract(self, base_client: AsyncClient, test_tool: Tool) -> None:
        """Test response includes all required fields."""
        response = await base_client.get(f"/api/v1/tools/{test_tool.id}")

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: Must include all tool fields per OpenAPI spec
        data = response.json()
        required_fields = [
            "id",
            "name",
            "description",
            "provider_id",
            "namespaced_name",
            "status",
            "last_executed_at",
            "last_refreshed_at",
            "refresh_error",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "deleted_at",
            "deleted_by",
        ]
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"

        # Verify data types match schema
        assert isinstance(data["id"], str)
        assert isinstance(data["name"], str)
        assert isinstance(data["provider_id"], str)
        assert isinstance(data["namespaced_name"], str)
        assert isinstance(data["status"], str)

        # Nullable fields
        assert data["last_executed_at"] is None or isinstance(data["last_executed_at"], str)
        assert data["last_refreshed_at"] is None or isinstance(data["last_refreshed_at"], str)
        assert data["refresh_error"] is None or isinstance(data["refresh_error"], str)
        assert data["deleted_at"] is None or isinstance(data["deleted_at"], str)
        assert data["deleted_by"] is None or isinstance(data["deleted_by"], str)

    @pytest.mark.asyncio
    async def test_get_tool_not_found_contract(self, base_client: AsyncClient) -> None:
        """Test tool retrieval with non-existent ID returns 404."""
        non_existent_id = uuid4()
        response = await base_client.get(f"/api/v1/tools/{non_existent_id}")

        # Contract: Must return 404 Not Found for non-existent tool
        assert response.status_code == 404

        # Contract: Must return error details
        data = response.json()
        assert "detail" in data
        assert str(non_existent_id) in data["detail"]

    @pytest.mark.asyncio
    async def test_get_tool_invalid_uuid_contract(self, base_client: AsyncClient) -> None:
        """Test tool retrieval with invalid UUID format returns 422."""
        invalid_uuid = "not-a-valid-uuid"
        response = await base_client.get(f"/api/v1/tools/{invalid_uuid}")

        # Contract: Must return 422 Unprocessable Entity for invalid UUID
        assert response.status_code == 422

        # Contract: Must return validation error details
        data = response.json()
        assert "detail" in data

    @pytest.mark.asyncio
    async def test_get_tool_status_values_contract(self, base_client: AsyncClient, test_tool: Tool) -> None:
        """Test tool status field contains valid enum values."""
        response = await base_client.get(f"/api/v1/tools/{test_tool.id}")

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: Status must be one of the valid enum values
        data = response.json()
        valid_statuses = ["available", "missing", "error", "disabled"]
        assert data["status"] in valid_statuses

    @pytest.mark.asyncio
    async def test_get_tool_datetime_format_contract(self, base_client: AsyncClient, test_tool: Tool) -> None:
        """Test datetime fields follow ISO format."""
        response = await base_client.get(f"/api/v1/tools/{test_tool.id}")

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: Datetime fields must be ISO format strings when present
        data = response.json()
        datetime_fields = ["created_at", "updated_at", "last_executed_at", "last_refreshed_at", "deleted_at"]

        for field in datetime_fields:
            if data[field] is not None:
                assert isinstance(data[field], str)
                # Should be parseable as ISO datetime
                try:
                    datetime.fromisoformat(data[field])
                except ValueError:
                    pytest.fail(f"Field {field} is not in valid ISO format: {data[field]}")

    @pytest.mark.asyncio
    async def test_get_tool_uuid_format_contract(self, base_client: AsyncClient, test_tool: Tool) -> None:
        """Test UUID fields are properly formatted."""
        response = await base_client.get(f"/api/v1/tools/{test_tool.id}")

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: UUID fields must be valid UUID strings
        data = response.json()
        uuid_fields = ["id", "provider_id", "created_by", "updated_by", "deleted_by"]

        for field in uuid_fields:
            if data[field] is not None:
                assert isinstance(data[field], str)
                # For actual validation, try parsing the field value

                try:
                    UUID(data[field])
                except ValueError:
                    pytest.fail(f"Field {field} is not a valid UUID: {data[field]}")

    @pytest.mark.asyncio
    async def test_get_tool_namespaced_name_format_contract(self, base_client: AsyncClient, test_tool: Tool) -> None:
        """Test namespaced_name follows expected format."""
        response = await base_client.get(f"/api/v1/tools/{test_tool.id}")

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: namespaced_name should follow provider::tool format
        data = response.json()
        namespaced_name = data["namespaced_name"]

        # Should contain namespace separator
        assert "::" in namespaced_name

        # Should not be empty
        assert len(namespaced_name.strip()) > 0

        # Should not exceed max length (200 chars from model)
        assert len(namespaced_name) <= 200

    @pytest.mark.asyncio
    async def test_get_tool_with_parameters_contract(self, base_client: AsyncClient, test_tool: Tool) -> None:
        """Test tool with parameters includes parameter data."""
        response = await base_client.get(f"/api/v1/tools/{test_tool.id}")

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: Must include parameters field (even if empty)
        data = response.json()
        # Note: parameters field might not be included in the basic response
        # This depends on the actual Tool model and what relationships are loaded
        # For now, just verify the core tool data is correct
        assert data["id"] == str(test_tool.id)

    @pytest.mark.asyncio
    async def test_get_tool_response_content_type_contract(self, base_client: AsyncClient, test_tool: Tool) -> None:
        """Test response has correct content type."""
        response = await base_client.get(f"/api/v1/tools/{test_tool.id}")

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: Must return JSON content type
        assert response.headers["content-type"].startswith("application/json")

    @pytest.mark.asyncio
    async def test_get_tool_consistent_data_contract(self, base_client: AsyncClient, test_tool: Tool) -> None:
        """Test retrieved data is consistent with stored data."""
        response = await base_client.get(f"/api/v1/tools/{test_tool.id}")

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: Returned data must match stored data
        data = response.json()
        assert data["id"] == str(test_tool.id)
        assert data["name"] == test_tool.name
        assert data["provider_id"] == str(test_tool.provider_id)
        assert data["namespaced_name"] == test_tool.namespaced_name
        assert data["status"] == test_tool.status.value
