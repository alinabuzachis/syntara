"""Contract tests for PATCH /api/v1/tool-providers/{provider_id} endpoint.

Tests partial update functionality.
"""

from collections.abc import Sequence
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.exc import IntegrityError

from nexus.tool_manager.models import ToolProvider


class TestToolProvidersPatchContract:
    """Contract tests for tool provider patch endpoint."""

    @pytest.mark.asyncio
    async def test_patch_provider_success_contract(
        self, base_client_with_provider_factory: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test successful partial provider update returns 200."""
        patch_data = {"description": "Partially updated description", "enabled": False}

        response = await base_client_with_provider_factory.patch(
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
        # Configuration should match the expected mock configuration
        expected_config = {
            "provider_type": "mcp",
            "base_url": "http://localhost:8080",
            "api_key": "test-key",
        }
        assert data["configuration"] == expected_config
        assert data["enabled"] == patch_data["enabled"]

    @pytest.mark.asyncio
    async def test_patch_provider_content_type_contract(
        self, base_client_with_provider_factory: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test application/merge-patch+json content type is required."""
        patch_data = {"enabled": False}

        response = await base_client_with_provider_factory.patch(
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
        # Configuration should be the mock configuration with defaults
        expected_config = {
            "provider_type": "mcp",
            "base_url": "http://localhost:8080",
            "api_key": "test-key",
        }
        assert data["configuration"] == expected_config
        assert data["enabled"] == patch_data["enabled"]

    @pytest.mark.asyncio
    async def test_patch_provider_preserve_existing_fields_contract(
        self, base_client_with_provider_factory: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test existing fields are preserved."""
        patch_data = {
            "configuration": {
                "provider_type": test_tool_provider.configuration.provider_type,
                "base_url": "http://somewhere:8000",
                "api_key": "new-key",
            }
        }

        response = await base_client_with_provider_factory.patch(
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
        # Configuration should be updated with simulate_timeout = True
        expected_config = {
            "provider_type": "mcp",
            "base_url": "http://somewhere:8000",
            "api_key": "new-key",
        }
        assert data["configuration"] == expected_config
        assert data["enabled"] == test_tool_provider.enabled

    @pytest.mark.asyncio
    async def test_patch_provider_validation_error_contract(
        self, base_client_with_provider_factory: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test validation error when removing required fields."""
        patch_data = {
            "configuration": {
                "provider_type": None  # Attempt to remove required field
            }
        }

        response = await base_client_with_provider_factory.patch(
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
    async def test_patch_provider_not_found_contract(self, base_client_with_provider_factory: AsyncClient) -> None:
        """Test 404 error for non-existent provider."""
        provider_id = "99999999-9999-9999-9999-999999999999"
        patch_data = {"enabled": False}

        response = await base_client_with_provider_factory.patch(
            f"/api/v1/tool-providers/{provider_id}",
            json=patch_data,
            headers={"Content-Type": "application/merge-patch+json"},
        )

        # Contract: Must return 404 Not Found
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_patch_provider_minimal_update_contract(
        self, base_client_with_provider_factory: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test PATCH with single field update."""
        patch_data = {"enabled": False}

        response = await base_client_with_provider_factory.patch(
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
        # Configuration should be the mock configuration with defaults
        expected_config = {
            "provider_type": "mcp",
            "base_url": "http://localhost:8080",
            "api_key": "test-key",
        }
        assert data["configuration"] == expected_config
        assert data["enabled"] == patch_data["enabled"]

    @pytest.mark.asyncio
    async def test_patch_provider_empty_patch_contract(
        self, base_client_with_provider_factory: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test PATCH with empty object."""
        patch_data: dict[str, str] = {}

        response = await base_client_with_provider_factory.patch(
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
        # Configuration should be the mock configuration with defaults
        expected_config = {
            "provider_type": "mcp",
            "base_url": "http://localhost:8080",
            "api_key": "test-key",
        }
        assert data["configuration"] == expected_config
        assert data["enabled"] == test_tool_provider.enabled

    @pytest.mark.asyncio
    async def test_patch_provider_name_conflict_contract(
        self, base_client_with_provider_factory: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test 409 conflict when patching to existing name."""
        # First create another provider with the name we'll try to patch to
        conflicting_provider_data = {
            "name": "existing-provider-name",
            "configuration": {"provider_type": "mcp", "base_url": "http://localhost:8080", "api_key": "test-key"},
        }
        create_response = await base_client_with_provider_factory.post(
            "/api/v1/tool-providers", json=conflicting_provider_data
        )
        assert create_response.status_code == 201

        # Now try to patch the test provider to use the same name
        patch_data = {"name": "existing-provider-name"}

        response = await base_client_with_provider_factory.patch(
            f"/api/v1/tool-providers/{test_tool_provider.id}",
            json=patch_data,
            headers={"Content-Type": "application/merge-patch+json"},
        )

        # Contract: Must return 409 Conflict for duplicate name
        assert response.status_code == 409

    @pytest.mark.asyncio
    async def test_patch_provider_integrity_error_non_name_conflict_contract(
        self, base_client_with_provider_factory: AsyncClient, test_tool_provider: ToolProvider, monkeypatch
    ) -> None:
        """Test 400 error for IntegrityError that is NOT a name conflict."""

        # Mock the database session flush to raise a non-name-conflict IntegrityError
        async def mock_flush(_: Sequence[Any] | None = None) -> None:
            # Create an IntegrityError that won't be detected as a name conflict
            msg: str = "CHECK constraint failed: some_other_constraint"
            raise IntegrityError(msg, None, BaseException())

        # Patch the database session flush method
        monkeypatch.setattr("sqlalchemy.ext.asyncio.AsyncSession.flush", mock_flush)

        patch_data = {"description": "Updated description"}

        response = await base_client_with_provider_factory.patch(
            f"/api/v1/tool-providers/{test_tool_provider.id}",
            json=patch_data,
            headers={"Content-Type": "application/merge-patch+json"},
        )

        # Contract: Must return 400 Bad Request for non-name-conflict IntegrityError
        assert response.status_code == 400

        # Contract: Must return error message with IntegrityError details
        data = response.json()
        error_message = str(data.get("error", data.get("detail", "")))
        assert "CHECK constraint failed" in error_message

    @pytest.mark.asyncio
    async def test_patch_provider_without_enabled_preserves_existing_value_contract(
        self, base_client_with_provider_factory: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test that patch without 'enabled' field preserves the existing enabled value."""
        # First, set the provider's enabled status to False
        patch_data_disable = {"enabled": False}
        response = await base_client_with_provider_factory.patch(
            f"/api/v1/tool-providers/{test_tool_provider.id}",
            json=patch_data_disable,
            headers={"Content-Type": "application/merge-patch+json"},
        )
        assert response.status_code == 200
        assert response.json()["enabled"] is False

        # Now patch without the 'enabled' field - should preserve False
        patch_data_no_enabled = {
            "description": "Updated description without enabled field",
            "configuration": {
                "provider_type": test_tool_provider.configuration.provider_type,
                "base_url": "http://localhost:8080",
                "api_key": "test-key",
            },
        }

        response = await base_client_with_provider_factory.patch(
            f"/api/v1/tool-providers/{test_tool_provider.id}",
            json=patch_data_no_enabled,
            headers={"Content-Type": "application/merge-patch+json"},
        )

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: Must preserve existing 'enabled' value (False)
        data = response.json()
        assert data["enabled"] is False
        assert data["description"] == "Updated description without enabled field"
        assert data["configuration"]["base_url"] == "http://localhost:8080"
        assert data["configuration"]["api_key"] == "test-key"

        # Now enable the provider and test again
        patch_data_enable = {"enabled": True}
        response = await base_client_with_provider_factory.patch(
            f"/api/v1/tool-providers/{test_tool_provider.id}",
            json=patch_data_enable,
            headers={"Content-Type": "application/merge-patch+json"},
        )
        assert response.status_code == 200
        assert response.json()["enabled"] is True

        # Patch again without 'enabled' field - should preserve True
        patch_data_no_enabled_2 = {"description": "Another update without enabled field"}

        response = await base_client_with_provider_factory.patch(
            f"/api/v1/tool-providers/{test_tool_provider.id}",
            json=patch_data_no_enabled_2,
            headers={"Content-Type": "application/merge-patch+json"},
        )

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: Must preserve existing 'enabled' value (True)
        data = response.json()
        assert data["enabled"] is True
        assert data["description"] == "Another update without enabled field"

    @pytest.mark.asyncio
    async def test_patch_provider_status_success_contract(
        self, base_client_with_provider_factory: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test successful status update via PATCH."""
        patch_data = {"status": "error"}

        response = await base_client_with_provider_factory.patch(
            f"/api/v1/tool-providers/{test_tool_provider.id}",
            json=patch_data,
            headers={"Content-Type": "application/merge-patch+json"},
        )

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: Must update status while preserving other fields
        data = response.json()
        assert data["status"] == "error"
        assert data["name"] == test_tool_provider.name
        assert data["description"] == test_tool_provider.description
        assert data["enabled"] == test_tool_provider.enabled
        expected_config = {
            "provider_type": "mcp",
            "base_url": "http://localhost:8080",
            "api_key": "test-key",
        }
        assert data["configuration"] == expected_config

    @pytest.mark.asyncio
    async def test_patch_provider_validation_error_success_contract(
        self, base_client_with_provider_factory: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test successful validation_error update via PATCH."""
        error_message = "Connection failed: timeout after 30 seconds"
        patch_data = {"validation_error": error_message}

        response = await base_client_with_provider_factory.patch(
            f"/api/v1/tool-providers/{test_tool_provider.id}",
            json=patch_data,
            headers={"Content-Type": "application/merge-patch+json"},
        )

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: Must update validation_error while preserving other fields
        data = response.json()
        assert data["validation_error"] == error_message
        assert data["name"] == test_tool_provider.name
        assert data["description"] == test_tool_provider.description
        assert data["enabled"] == test_tool_provider.enabled
        assert data["status"] == test_tool_provider.status.value

    @pytest.mark.asyncio
    async def test_patch_provider_status_and_validation_error_together_contract(
        self, base_client_with_provider_factory: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test updating both status and validation_error in single PATCH request."""
        error_message = "Provider validation failed: invalid configuration"
        patch_data = {"status": "error", "validation_error": error_message}

        response = await base_client_with_provider_factory.patch(
            f"/api/v1/tool-providers/{test_tool_provider.id}",
            json=patch_data,
            headers={"Content-Type": "application/merge-patch+json"},
        )

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: Must update both fields while preserving others
        data = response.json()
        assert data["status"] == "error"
        assert data["validation_error"] == error_message
        assert data["name"] == test_tool_provider.name
        assert data["description"] == test_tool_provider.description
        assert data["enabled"] == test_tool_provider.enabled

    @pytest.mark.asyncio
    async def test_patch_provider_status_all_valid_values_contract(
        self, base_client_with_provider_factory: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test PATCH with all valid status enum values."""
        valid_statuses = ["available", "error", "validating"]

        for status in valid_statuses:
            patch_data = {"status": status}

            response = await base_client_with_provider_factory.patch(
                f"/api/v1/tool-providers/{test_tool_provider.id}",
                json=patch_data,
                headers={"Content-Type": "application/merge-patch+json"},
            )

            # Contract: Must return 200 OK for all valid status values
            assert response.status_code == 200

            # Contract: Must update status correctly
            data = response.json()
            assert data["status"] == status

    @pytest.mark.asyncio
    async def test_patch_provider_status_invalid_value_contract(
        self, base_client_with_provider_factory: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test PATCH with invalid status value returns validation error."""
        patch_data = {"status": "invalid_status"}

        response = await base_client_with_provider_factory.patch(
            f"/api/v1/tool-providers/{test_tool_provider.id}",
            json=patch_data,
            headers={"Content-Type": "application/merge-patch+json"},
        )

        # Contract: Must return 422 Unprocessable Entity for invalid enum value
        assert response.status_code == 422

        # Contract: Must return validation error mentioning the invalid value
        data = response.json()
        error_message = str(data.get("error", data.get("detail", "")))
        assert "invalid_status" in error_message or "status" in error_message.lower()

    @pytest.mark.asyncio
    async def test_patch_provider_clear_validation_error_contract(
        self, base_client_with_provider_factory: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test clearing validation_error by setting it to null."""
        # First, set a validation error
        error_message = "Some validation error"
        patch_data = {"validation_error": error_message}
        response = await base_client_with_provider_factory.patch(
            f"/api/v1/tool-providers/{test_tool_provider.id}",
            json=patch_data,
            headers={"Content-Type": "application/merge-patch+json"},
        )
        assert response.status_code == 200
        assert response.json()["validation_error"] == error_message

        # Now clear it by setting to null
        patch_data_clear = {"validation_error": None}
        response = await base_client_with_provider_factory.patch(
            f"/api/v1/tool-providers/{test_tool_provider.id}",
            json=patch_data_clear,
            headers={"Content-Type": "application/merge-patch+json"},
        )

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: Must clear validation_error field
        data = response.json()
        assert data["validation_error"] is None

    @pytest.mark.asyncio
    async def test_patch_provider_preserve_status_and_validation_error_contract(
        self, base_client_with_provider_factory: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test that PATCH without status/validation_error fields preserves existing values."""
        # First, set both status and validation_error
        initial_patch = {"status": "error", "validation_error": "Initial error message"}
        response = await base_client_with_provider_factory.patch(
            f"/api/v1/tool-providers/{test_tool_provider.id}",
            json=initial_patch,
            headers={"Content-Type": "application/merge-patch+json"},
        )
        assert response.status_code == 200
        initial_data = response.json()
        assert initial_data["status"] == "error"
        assert initial_data["validation_error"] == "Initial error message"

        # Now patch without status or validation_error fields
        patch_other_fields = {"description": "Updated description only"}
        response = await base_client_with_provider_factory.patch(
            f"/api/v1/tool-providers/{test_tool_provider.id}",
            json=patch_other_fields,
            headers={"Content-Type": "application/merge-patch+json"},
        )

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: Must preserve existing status and validation_error values
        data = response.json()
        assert data["status"] == "error"  # Preserved from initial_patch
        assert data["validation_error"] == "Initial error message"  # Preserved from initial_patch
        assert data["description"] == "Updated description only"  # Updated field

    @pytest.mark.asyncio
    async def test_patch_provider_status_with_enabled_interaction_contract(
        self, base_client_with_provider_factory: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test interaction between status and enabled fields in PATCH."""
        # Test that setting status to 'error' and enabled to False works together
        patch_data = {"status": "error", "enabled": False, "validation_error": "Provider failed validation"}

        response = await base_client_with_provider_factory.patch(
            f"/api/v1/tool-providers/{test_tool_provider.id}",
            json=patch_data,
            headers={"Content-Type": "application/merge-patch+json"},
        )

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: Must update all fields correctly
        data = response.json()
        assert data["status"] == "error"
        assert data["enabled"] is False
        assert data["validation_error"] == "Provider failed validation"

        # Test recovery: set status back to available and enabled to True
        recovery_patch = {"status": "available", "enabled": True, "validation_error": None}
        response = await base_client_with_provider_factory.patch(
            f"/api/v1/tool-providers/{test_tool_provider.id}",
            json=recovery_patch,
            headers={"Content-Type": "application/merge-patch+json"},
        )

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: Must update all fields for recovery
        data = response.json()
        assert data["status"] == "available"
        assert data["enabled"] is True
        assert data["validation_error"] is None
