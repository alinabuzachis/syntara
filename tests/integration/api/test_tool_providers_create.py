"""Contract tests for POST /api/v1/tool_manager/tool_providers endpoint.

Tests provider registration, validation, and conflict handling.
"""

from collections.abc import Sequence
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.exc import IntegrityError


class TestToolProvidersCreateContract:
    """Contract tests for tool providers create endpoint."""

    @pytest.mark.asyncio
    async def test_create_provider_success_contract(self, base_client_with_provider_factory: AsyncClient) -> None:
        """Test successful provider registration returns 201."""
        provider_data = {
            "name": "test-mcp-provider",
            "description": "Test MCP Tool Provider",
            "configuration": {
                "provider_type": "mcp",
                "base_url": "http://localhost:8000/mcp",
                "api_key": "api-key",
            },
        }

        response = await base_client_with_provider_factory.post(
            "/api/v1/tool_manager/tool_providers", json=provider_data
        )

        # Contract: Must return 201 Created
        assert response.status_code == 201

        # Contract: Must return created provider details
        data = response.json()
        assert "id" in data
        assert data["name"] == provider_data["name"]
        # Configuration should include the input fields plus defaults for mock provider
        expected_config = {
            "provider_type": "mcp",
            "base_url": "http://localhost:8000/mcp",
            "api_key": "api-key",
        }
        assert data["configuration"] == expected_config
        assert data["status"] == "validating"

    @pytest.mark.asyncio
    async def test_create_provider_with_long_description(self, base_client_with_provider_factory: AsyncClient) -> None:
        """Test successful provider registration returns 422."""
        provider_data = {
            "name": "test-mcp-provider",
            "description": "=" * 2001,
            "configuration": {
                "provider_type": "mcp",
                "base_url": "http://localhost:8000/mcp",
                "api_key": "api-key",
            },
        }

        response = await base_client_with_provider_factory.post(
            "/api/v1/tool_manager/tool_providers", json=provider_data
        )

        # Contract: Must return 422 Unprocessable
        assert response.status_code == 422
        data = response.json()
        assert "detail" in data
        assert isinstance(data["detail"], list)
        details: list[Any] = data["detail"]
        assert len(details) == 1
        assert isinstance(details[0], dict)
        result: dict[str, Any] = details[0]
        assert "loc" in result
        assert result.get("loc") == ["body", "description"]
        assert "msg" in result
        assert "String should have at most 2000 characters" in result.get("msg", "")

    @pytest.mark.asyncio
    async def test_create_provider_without_api_key_success_contract(
        self, base_client_with_provider_factory: AsyncClient
    ) -> None:
        """Test successful provider creation without api_key (optional)."""
        provider_data = {
            "name": "no-api-key-test",
            "description": "Test MCP provider without API key",
            "configuration": {
                "provider_type": "mcp",
                "base_url": "http://localhost:8000/mcp",
            },
        }

        response = await base_client_with_provider_factory.post(
            "/api/v1/tool_manager/tool_providers", json=provider_data
        )

        # Contract: Must return 201 Created
        assert response.status_code == 201

        # Contract: Must return created provider details
        data = response.json()
        assert "id" in data
        assert data["name"] == provider_data["name"]
        assert data["description"] == provider_data["description"]

        # Configuration should not include api_key when not provided
        expected_config = {
            "provider_type": "mcp",
            "base_url": "http://localhost:8000/mcp",
            "api_key": None,
        }
        assert data["configuration"] == expected_config
        assert data["status"] == "validating"

    @pytest.mark.asyncio
    async def test_create_provider_duplicate_name_conflict_contract(
        self, base_client_with_provider_factory: AsyncClient
    ) -> None:
        """Test 409 conflict for duplicate provider names."""
        provider_data = {
            "name": "test-provider",
            "configuration": {"provider_type": "mcp", "base_url": "https://alpha.example.com", "api_key": "alpha-key"},
        }

        # Create first provider
        response1 = await base_client_with_provider_factory.post(
            "/api/v1/tool_manager/tool_providers", json=provider_data
        )

        # Attempt to create duplicate
        response2 = await base_client_with_provider_factory.post(
            "/api/v1/tool_manager/tool_providers", json=provider_data
        )

        # Contract: First creation must succeed
        assert response1.status_code == 201

        # Contract: Duplicate must return 409 Conflict
        assert response2.status_code == 409

        # Contract: Must return error message
        error_data = response2.json()
        assert "error" in error_data or "detail" in error_data

    @pytest.mark.asyncio
    async def test_create_provider_missing_configuration_contract(
        self, base_client_with_provider_factory: AsyncClient
    ) -> None:
        """Test validation error for missing configuration."""
        provider_data = {"name": "missing-config-test"}

        response = await base_client_with_provider_factory.post(
            "/api/v1/tool_manager/tool_providers", json=provider_data
        )

        # Contract: Must return 422 Unprocessable Entity
        assert response.status_code == 422

        # Contract: Must return validation error
        data = response.json()
        assert "error" in data or "detail" in data

    @pytest.mark.asyncio
    async def test_create_provider_missing_provider_type_contract(
        self, base_client_with_provider_factory: AsyncClient
    ) -> None:
        """Test validation error for missing provider_type."""
        provider_data = {
            "name": "missing-type-test",
            "configuration": {"base_url": "https://example.com/mcp", "api_key": "test-key"},
        }

        response = await base_client_with_provider_factory.post(
            "/api/v1/tool_manager/tool_providers", json=provider_data
        )

        # Contract: Must return 422 Unprocessable Entity
        assert response.status_code == 422

        # Contract: Must return validation error about provider_type
        data = response.json()
        error_message = str(data.get("error", data.get("detail", "")))
        assert "provider_type" in error_message.lower()

    @pytest.mark.asyncio
    async def test_create_provider_invalid_json_contract(self, base_client_with_provider_factory: AsyncClient) -> None:
        """Test 422 error for invalid JSON."""
        response = await base_client_with_provider_factory.post(
            "/api/v1/tool_manager/tool_providers", json={}, headers={"Content-Type": "application/json"}
        )

        # Contract: Must return 422 Unprocessable Entity
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_provider_optional_fields_contract(
        self, base_client_with_provider_factory: AsyncClient
    ) -> None:
        """Test creation with optional fields."""
        provider_data = {
            "name": "optional-fields-test",
            "configuration": {"provider_type": "mcp", "base_url": "https://alpha.example.com", "api_key": "alpha-key"},
        }

        response = await base_client_with_provider_factory.post(
            "/api/v1/tool_manager/tool_providers", json=provider_data
        )

        # Contract: Must return 201 Created
        assert response.status_code == 201

        # Contract: Must preserve optional fields
        data = response.json()
        assert data["name"] == provider_data["name"]
        assert data["description"] is None
        # Configuration should include defaults for mock provider
        expected_config = {"provider_type": "mcp", "base_url": "https://alpha.example.com", "api_key": "alpha-key"}
        assert data["configuration"] == expected_config

    @pytest.mark.asyncio
    async def test_create_provider_response_schema_contract(
        self, base_client_with_provider_factory: AsyncClient
    ) -> None:
        """Test response matches OpenAPI specification schema."""
        provider_data = {
            "name": "schema-test-provider",
            "configuration": {"provider_type": "mcp", "base_url": "https://alpha.example.com", "api_key": "alpha-key"},
        }

        response = await base_client_with_provider_factory.post(
            "/api/v1/tool_manager/tool_providers", json=provider_data
        )

        # Contract: Must return 201 Created
        assert response.status_code == 201

        # Contract: Must include all required response fields
        data = response.json()
        required_fields = ["id", "name", "configuration", "enabled", "status", "created_at", "updated_at"]
        for field in required_fields:
            assert field in data

    @pytest.mark.asyncio
    async def test_create_provider_integrity_error_non_name_conflict_contract(
        self, base_client_with_provider_factory: AsyncClient, monkeypatch
    ) -> None:
        """Test 400 error for IntegrityError that is NOT a name conflict."""

        # Mock the database session flush to raise a non-name-conflict IntegrityError
        async def mock_flush(_: Sequence[Any] | None = None) -> None:
            # Create an IntegrityError that won't be detected as a name conflict
            msg: str = "CHECK constraint failed: some_other_constraint"
            raise IntegrityError(msg, None, BaseException())

        # Patch the database session flush method
        monkeypatch.setattr("sqlalchemy.ext.asyncio.AsyncSession.flush", mock_flush)

        provider_data = {
            "name": "integrity-error-test",
            "configuration": {"provider_type": "mcp", "base_url": "https://example.com/mcp", "api_key": "test-key"},
        }

        response = await base_client_with_provider_factory.post(
            "/api/v1/tool_manager/tool_providers", json=provider_data
        )

        # Contract: Must return 400 Bad Request for non-name-conflict IntegrityError
        assert response.status_code == 400

        # Contract: Must return error message with IntegrityError details
        data = response.json()
        error_message = str(data.get("error", data.get("detail", "")))
        assert "CHECK constraint failed" in error_message

    @pytest.mark.asyncio
    async def test_create_provider_validation_status_contract(
        self, base_client_with_provider_factory: AsyncClient
    ) -> None:
        """Test new provider starts with 'validating' status."""
        provider_data = {
            "name": "validation-status-test",
            "configuration": {"provider_type": "mcp", "base_url": "https://alpha.example.com", "api_key": "alpha-key"},
        }

        response = await base_client_with_provider_factory.post(
            "/api/v1/tool_manager/tool_providers", json=provider_data
        )

        # Contract: Must return 201 Created
        assert response.status_code == 201

        # Contract: New provider must start in validating status
        data = response.json()
        assert data["status"] == "validating"
