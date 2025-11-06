"""Contract tests for POST /api/v1/tool-providers/{provider_id}/validate endpoint.

Tests provider connection validation and status updates.
"""

import pytest
from httpx import AsyncClient

from nexus.tool_manager.models import ToolProvider


class TestToolProvidersValidateContract:
    """Contract tests for tool provider validate endpoint."""

    @pytest.mark.asyncio
    async def test_validate_provider_success_contract(self, base_client: AsyncClient) -> None:
        """Test successful provider validation returns 200."""
        # Create a test provider first
        provider_data = {
            "name": "test-validate-provider",
            "description": "Test provider for validation",
            "configuration": {"provider_type": "mock", "provider_name": "test_mock"},
        }

        create_response = await base_client.post("/api/v1/tool-providers", json=provider_data)
        assert create_response.status_code == 201
        provider_id = create_response.json()["id"]

        response = await base_client.post(f"/api/v1/tool-providers/{provider_id}/validate")

        # Contract: Must return 200 OK for successful validation
        assert response.status_code == 200

        # Contract: Must return validation results
        data = response.json()
        assert "valid" in data
        assert isinstance(data["valid"], bool)

    @pytest.mark.asyncio
    async def test_validate_provider_response_fields_contract(
        self, base_client: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test response includes all required validation fields."""
        response = await base_client.post(f"/api/v1/tool-providers/{test_tool_provider.id}/validate")

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: Must include all validation response fields per OpenAPI spec
        data = response.json()
        required_fields = ["valid", "provider_type", "validated_at"]
        for field in required_fields:
            assert field in data

    @pytest.mark.asyncio
    async def test_validate_provider_failure_contract(
        self, base_client: AsyncClient, test_tool_provider: ToolProvider, test_db_session
    ) -> None:
        """Test validation failure returns 400 with error details."""
        # Modify the test provider's base_url to cause validation failure
        # MockProvider should fail when trying to validate an invalid URL
        test_tool_provider.configuration = {"provider_type": "mock", "simulate_connection_error": "true"}
        test_db_session.add(test_tool_provider)
        await test_db_session.commit()
        await test_db_session.refresh(test_tool_provider)

        response = await base_client.post(f"/api/v1/tool-providers/{test_tool_provider.id}/validate")

        # Contract: Must return 200 with validation result showing failure
        assert response.status_code == 200

        # Contract: Must return validation failure details
        data = response.json()
        assert data["valid"] is False
        assert data["error"] == "Provider connection validation failed: Simulated connection error"

    @pytest.mark.asyncio
    async def test_validate_provider_not_found_contract(self, base_client: AsyncClient) -> None:
        """Test 404 error for non-existent provider."""
        provider_id = "99999999-9999-9999-9999-999999999999"

        response = await base_client.post(f"/api/v1/tool-providers/{provider_id}/validate")

        # Contract: Must return 404 Not Found
        assert response.status_code == 404

        # Contract: Must return error response
        data = response.json()
        assert "error" in data or "detail" in data

    @pytest.mark.asyncio
    async def test_validate_provider_status_update_contract(
        self, base_client: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test provider status is updated after validation."""
        # Validate the provider
        validate_response = await base_client.post(f"/api/v1/tool-providers/{test_tool_provider.id}/validate")
        assert validate_response.status_code == 200

        # Check provider status was updated
        get_response = await base_client.get(f"/api/v1/tool-providers/{test_tool_provider.id}")
        assert get_response.status_code == 200

        provider_data = get_response.json()
        # Status should be updated based on validation result
        assert provider_data["status"] in ["available", "error"]
        # last_validated_at should be updated
        assert provider_data["last_validated_at"] is not None

    @pytest.mark.asyncio
    async def test_validate_provider_error_status_update_contract(
        self, base_client: AsyncClient, test_tool_provider: ToolProvider, test_db_session
    ) -> None:
        """Test provider status is set to error on validation failure."""
        # Modify the test provider's base_url to cause validation failure
        # MockProvider should fail when trying to validate an invalid URL
        test_tool_provider.configuration = {"provider_type": "mock", "base_url": "invalid://bad-url"}
        test_db_session.add(test_tool_provider)
        await test_db_session.commit()
        await test_db_session.refresh(test_tool_provider)

        # Validate the provider (expecting failure)
        validate_response = await base_client.post(f"/api/v1/tool-providers/{test_tool_provider.id}/validate")
        assert validate_response.status_code == 200

        # Verify validation failed
        validation_data = validate_response.json()
        assert validation_data["valid"] is False

        # Check provider status was updated to error
        get_response = await base_client.get(f"/api/v1/tool-providers/{test_tool_provider.id}")
        assert get_response.status_code == 200

        provider_data = get_response.json()
        assert provider_data["status"] == "error"
        assert provider_data["validation_error"] is not None

    @pytest.mark.asyncio
    async def test_validate_provider_validated_at_format_contract(
        self, base_client: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test validated_at timestamp format."""
        response = await base_client.post(f"/api/v1/tool-providers/{test_tool_provider.id}/validate")

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: validated_at must be ISO format string
        data = response.json()
        assert "validated_at" in data
        assert isinstance(data["validated_at"], str)
        # Basic ISO format validation
        assert "T" in data["validated_at"]

    @pytest.mark.asyncio
    async def test_validate_provider_invalid_uuid_contract(self, base_client: AsyncClient) -> None:
        """Test 422 Unprocessable Entity error for invalid UUID format."""
        invalid_id = "not-a-uuid"

        response = await base_client.post(f"/api/v1/tool-providers/{invalid_id}/validate")

        # Contract: Must return 422 Unprocessable Entity for invalid UUID
        assert response.status_code == 422
