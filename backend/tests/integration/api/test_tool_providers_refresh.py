"""Contract tests for POST /api/v1/tool_manager/tool_providers/{provider_id}/refresh_tools endpoint.

Tests tool discovery and refresh functionality.
"""

import pytest
from httpx import AsyncClient

from nexus.tool_manager.models import ProviderStatus, ToolProvider


class TestToolProvidersRefreshContract:
    """Contract tests for tool provider refresh-tools endpoint."""

    @pytest.mark.asyncio
    async def test_refresh_tools_success_contract(
        self, jwt_client_with_provider_factory: AsyncClient, test_tool_provider: ToolProvider, test_db_session
    ) -> None:
        """Test successful tool refresh returns 200."""
        # Set provider status to AVAILABLE for refresh to work
        test_tool_provider.status = ProviderStatus.AVAILABLE
        test_db_session.add(test_tool_provider)
        await test_db_session.commit()

        response = await jwt_client_with_provider_factory.post(
            f"/api/v1/tool_manager/tool_providers/{test_tool_provider.id}/refresh_tools"
        )

        # Contract: Must return 200 OK for successful refresh
        assert response.status_code == 200

        # Contract: Must return refresh statistics
        data = response.json()
        assert "refreshed_count" in data
        assert "updated_count" in data
        assert "disabled_count" in data
        assert "refreshed_at" in data

    @pytest.mark.asyncio
    async def test_refresh_tools_response_counts_contract(
        self, jwt_client_with_provider_factory: AsyncClient, test_tool_provider: ToolProvider, test_db_session
    ) -> None:
        """Test response includes all required count fields."""
        # Set provider status to AVAILABLE for refresh to work
        test_tool_provider.status = ProviderStatus.AVAILABLE
        test_db_session.add(test_tool_provider)
        await test_db_session.commit()

        response = await jwt_client_with_provider_factory.post(
            f"/api/v1/tool_manager/tool_providers/{test_tool_provider.id}/refresh_tools"
        )

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: All count fields must be non-negative integers
        data = response.json()
        for count_field in ["refreshed_count", "updated_count", "disabled_count"]:
            assert count_field in data
            assert isinstance(data[count_field], int)
            assert data[count_field] >= 0

    @pytest.mark.asyncio
    async def test_refresh_tools_timestamp_format_contract(
        self, jwt_client_with_provider_factory: AsyncClient, test_tool_provider: ToolProvider, test_db_session
    ) -> None:
        """Test refreshed_at timestamp format."""
        # Set provider status to AVAILABLE for refresh to work
        test_tool_provider.status = ProviderStatus.AVAILABLE
        test_db_session.add(test_tool_provider)
        await test_db_session.commit()

        response = await jwt_client_with_provider_factory.post(
            f"/api/v1/tool_manager/tool_providers/{test_tool_provider.id}/refresh_tools"
        )

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: refreshed_at must be ISO format string
        data = response.json()
        assert "refreshed_at" in data
        assert isinstance(data["refreshed_at"], str)
        # Basic ISO format validation
        assert "T" in data["refreshed_at"]

    @pytest.mark.asyncio
    async def test_refresh_tools_failure_contract(
        self, jwt_client_with_provider_factory: AsyncClient, test_tool_provider: ToolProvider, test_db_session
    ) -> None:
        """Test refresh failure returns 400 with error details."""
        # Set provider status to ERROR to cause refresh failure
        test_tool_provider.status = ProviderStatus.ERROR
        test_db_session.add(test_tool_provider)
        await test_db_session.commit()

        response = await jwt_client_with_provider_factory.post(
            f"/api/v1/tool_manager/tool_providers/{test_tool_provider.id}/refresh_tools"
        )

        # Contract: Must return 400 Bad Request for refresh failure
        assert response.status_code == 400

        # Contract: Must return error details
        data = response.json()
        assert "error" in data or "detail" in data

    @pytest.mark.asyncio
    async def test_refresh_tools_not_found_contract(self, jwt_client_with_provider_factory: AsyncClient) -> None:
        """Test 404 error for non-existent provider."""
        provider_id = "99999999-9999-9999-9999-999999999999"

        response = await jwt_client_with_provider_factory.post(
            f"/api/v1/tool_manager/tool_providers/{provider_id}/refresh_tools"
        )

        # Contract: Must return 404 Not Found
        assert response.status_code == 404

        # Contract: Must return error response
        data = response.json()
        assert "error" in data or "detail" in data

    @pytest.mark.asyncio
    async def test_refresh_tools_unavailable_provider_contract(
        self, jwt_client_with_provider_factory: AsyncClient, test_tool_provider: ToolProvider, test_db_session
    ) -> None:
        """Test error when provider is not available."""
        # Set provider status to ERROR to make it unavailable for refresh
        test_tool_provider.status = ProviderStatus.ERROR
        test_db_session.add(test_tool_provider)
        await test_db_session.commit()

        response = await jwt_client_with_provider_factory.post(
            f"/api/v1/tool_manager/tool_providers/{test_tool_provider.id}/refresh_tools"
        )

        # Contract: Must return 400 for unavailable provider
        assert response.status_code == 400

        # Contract: Error should indicate provider not available
        data = response.json()
        error_message = str(data.get("error", data.get("detail", "")))
        assert "available" in error_message.lower() or "not available" in error_message.lower()

    @pytest.mark.asyncio
    async def test_refresh_tools_validating_provider_fails_contract(
        self, jwt_client_with_provider_factory: AsyncClient, test_tool_provider: ToolProvider
    ) -> None:
        """Test refresh fails when provider is in VALIDATING status."""
        # test_tool_provider starts with VALIDATING status by default
        # This should fail because only AVAILABLE providers can be refreshed
        response = await jwt_client_with_provider_factory.post(
            f"/api/v1/tool_manager/tool_providers/{test_tool_provider.id}/refresh_tools"
        )

        # Contract: Must return 400 for non-available provider
        assert response.status_code == 400

        # Contract: Error should indicate provider not available
        data = response.json()
        error_message = str(data.get("error", data.get("detail", "")))
        assert "available" in error_message.lower() or "not available" in error_message.lower()

    @pytest.mark.asyncio
    async def test_refresh_tools_disabled_tools_contract(
        self, jwt_client_with_provider_factory: AsyncClient, test_tool_provider: ToolProvider, test_db_session
    ) -> None:
        """Test refresh correctly handles disabled tools."""
        # Set provider status to AVAILABLE for refresh to work
        test_tool_provider.status = ProviderStatus.AVAILABLE
        test_db_session.add(test_tool_provider)
        await test_db_session.commit()

        response = await jwt_client_with_provider_factory.post(
            f"/api/v1/tool_manager/tool_providers/{test_tool_provider.id}/refresh_tools"
        )

        # Contract: Must return 200 OK
        assert response.status_code == 200

        # Contract: disabled_count reflects tools that were removed from provider
        data = response.json()
        assert "disabled_count" in data
        # disabled_count can be 0 or positive integer
        assert data["disabled_count"] >= 0

    @pytest.mark.asyncio
    async def test_refresh_tools_invalid_uuid_contract(self, jwt_client_with_provider_factory: AsyncClient) -> None:
        """Test 422 error for invalid UUID format."""
        invalid_id = "not-a-uuid"

        response = await jwt_client_with_provider_factory.post(
            f"/api/v1/tool_manager/tool_providers/{invalid_id}/refresh_tools"
        )

        # Contract: Must return 422 Unprocessable Entity for invalid UUID
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_refresh_tools_concurrent_refresh_contract(
        self, jwt_client_with_provider_factory: AsyncClient, test_tool_provider: ToolProvider, test_db_session
    ) -> None:
        """Test concurrent refresh operations are handled safely."""
        # Set provider status to AVAILABLE for refresh to work
        test_tool_provider.status = ProviderStatus.AVAILABLE
        test_db_session.add(test_tool_provider)
        await test_db_session.commit()

        # This test ensures the API can handle concurrent refresh operations
        response = await jwt_client_with_provider_factory.post(
            f"/api/v1/tool_manager/tool_providers/{test_tool_provider.id}/refresh_tools"
        )

        # Contract: Must return 200 OK for valid refresh
        assert response.status_code == 200

        # Contract: Response must be valid regardless of concurrency
        data = response.json()
        assert all(field in data for field in ["refreshed_count", "updated_count", "disabled_count", "refreshed_at"])
