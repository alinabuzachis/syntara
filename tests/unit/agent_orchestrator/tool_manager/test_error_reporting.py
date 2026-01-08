"""Tests for ToolManagerClient error reporting and status update functionality."""

from typing import Any
from uuid import UUID, uuid4

import httpx
import pytest
import respx

from nexus.agent_orchestrator.tool_manager.tool_manager_client import ToolManagerClient
from nexus.tool_manager.models.tool import ToolStatus
from nexus.tool_manager.models.tool_provider import ProviderStatus


def _create_mock_tool_response(
    tool_id: UUID,
    status: str = "available",
    refresh_error: str | None = None,
    *,
    enabled: bool = True,
) -> dict[str, Any]:
    """Create a mock ToolWithParameters response that matches the OpenAPI spec."""
    return {
        "id": str(tool_id),
        "name": "Test Tool",
        "description": "A test tool",
        "provider_id": str(uuid4()),
        "namespaced_name": "test::tool",
        "enabled": enabled,
        "status": status,
        "last_executed_at": None,
        "last_refreshed_at": None,
        "refresh_error": refresh_error,
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z",
        "created_by": str(uuid4()),
        "updated_by": str(uuid4()),
        "deleted_at": None,
        "deleted_by": None,
        "labels": {},
        "parameters": [],
    }


def _create_mock_tool_provider_response(
    provider_id: UUID,
    status: str = "available",
    validation_error: str | None = None,
    *,
    enabled: bool = True,
) -> dict[str, Any]:
    """Create a mock ToolProviderWithConfiguration response that matches the OpenAPI spec."""
    return {
        "id": str(provider_id),
        "name": "Test Provider",
        "description": "A test provider",
        "enabled": enabled,
        "status": status,
        "last_validated_at": None,
        "validation_error": validation_error,
        "configuration": {
            "provider_type": "mcp",
            "base_url": "http://localhost:8080",
            "api_key": "test-key",
        },
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z",
        "created_by": str(uuid4()),
        "updated_by": str(uuid4()),
        "deleted_at": None,
        "deleted_by": None,
        "labels": {},
    }


class TestErrorReporting:
    """Test error reporting and status update scenarios."""

    @pytest.fixture
    def client(self) -> ToolManagerClient:
        """Create client instance for testing."""
        return ToolManagerClient(base_url="http://test-api/api/v1", timeout=30.0)

    @respx.mock
    async def test_update_tool_status_success(self, client: ToolManagerClient) -> None:
        """Test successful tool status update."""
        tool_id = uuid4()

        # Mock successful PATCH response
        mock_response = _create_mock_tool_response(
            tool_id=tool_id, status="error", refresh_error="Connection timeout during execution"
        )
        respx.patch(f"http://test-api/api/v1/tools/{tool_id}").mock(
            return_value=httpx.Response(200, json=mock_response)
        )

        await client.update_tool_status(
            tool_id=tool_id, status=ToolStatus.ERROR, refresh_error="Connection timeout during execution"
        )

        # Verify the request was made with correct data
        request = respx.calls.last.request
        assert request.method == "PATCH"
        assert f"/tools/{tool_id}" in str(request.url)

        # Check request body contains status and refresh_error
        request_data = request.content.decode()
        assert "error" in request_data
        assert "Connection timeout during execution" in request_data

    @respx.mock
    async def test_update_tool_status_without_error(self, client: ToolManagerClient) -> None:
        """Test tool status update without refresh_error."""
        tool_id = uuid4()

        mock_response = _create_mock_tool_response(tool_id=tool_id, status="available", refresh_error=None)
        respx.patch(f"http://test-api/api/v1/tools/{tool_id}").mock(
            return_value=httpx.Response(200, json=mock_response)
        )

        await client.update_tool_status(tool_id=tool_id, status=ToolStatus.AVAILABLE, refresh_error=None)

        # Verify the request was made without refresh_error
        request = respx.calls.last.request
        request_data = request.content.decode()
        assert "available" in request_data
        # refresh_error should not be present when None
        assert "refresh_error" not in request_data or "null" in request_data

    @respx.mock
    async def test_update_tool_status_missing_auto_disable(self, client: ToolManagerClient) -> None:
        """Test that MISSING status automatically disables the tool."""
        tool_id = uuid4()

        mock_response = _create_mock_tool_response(tool_id=tool_id, status="missing", enabled=False)
        respx.patch(f"http://test-api/api/v1/tools/{tool_id}").mock(
            return_value=httpx.Response(200, json=mock_response)
        )

        await client.update_tool_status(tool_id=tool_id, status=ToolStatus.MISSING, refresh_error=None)

        # Verify the request includes auto-disable for MISSING status
        request = respx.calls.last.request
        request_data = request.content.decode()
        assert "missing" in request_data
        assert '"enabled":false' in request_data  # Tool should be auto-disabled for MISSING status

    @respx.mock
    async def test_update_tool_status_error_auto_disable(self, client: ToolManagerClient) -> None:
        """Test that ERROR status automatically disables the tool."""
        tool_id = uuid4()

        mock_response = _create_mock_tool_response(
            tool_id=tool_id, status="error", refresh_error="Tool execution failed", enabled=False
        )
        respx.patch(f"http://test-api/api/v1/tools/{tool_id}").mock(
            return_value=httpx.Response(200, json=mock_response)
        )

        await client.update_tool_status(tool_id=tool_id, status=ToolStatus.ERROR, refresh_error="Tool execution failed")

        # Verify the request includes auto-disable for ERROR status
        request = respx.calls.last.request
        request_data = request.content.decode()
        assert "error" in request_data
        assert "Tool execution failed" in request_data
        assert '"enabled":false' in request_data  # Tool should be auto-disabled for ERROR status

    @respx.mock
    async def test_update_tool_status_tool_not_found(self, client: ToolManagerClient) -> None:
        """Test handling of tool not found error."""
        tool_id = uuid4()

        respx.patch(f"http://test-api/api/v1/tools/{tool_id}").mock(
            return_value=httpx.Response(
                404,
                json={
                    "type": "https://nexus.com/problems/tool-not-found",
                    "title": "Tool Not Found",
                    "status": 404,
                    "detail": f"Tool with ID {tool_id} not found",
                },
            )
        )

        with pytest.raises(httpx.HTTPStatusError) as exc_info:
            await client.update_tool_status(
                tool_id=tool_id, status=ToolStatus.ERROR, refresh_error="Tool execution failed"
            )

        assert exc_info.value.response.status_code == 404

    @respx.mock
    async def test_update_tool_status_api_error(self, client: ToolManagerClient) -> None:
        """Test handling of API errors during status update."""
        tool_id = uuid4()

        respx.patch(f"http://test-api/api/v1/tools/{tool_id}").mock(
            return_value=httpx.Response(500, text="Internal server error")
        )

        with pytest.raises(httpx.HTTPStatusError) as exc_info:
            await client.update_tool_status(
                tool_id=tool_id, status=ToolStatus.ERROR, refresh_error="Database connection failed"
            )

        assert exc_info.value.response.status_code == 500

    @respx.mock
    async def test_update_tool_status_timeout(self, client: ToolManagerClient) -> None:
        """Test handling of timeout during status update."""
        tool_id = uuid4()

        respx.patch(f"http://test-api/api/v1/tools/{tool_id}").mock(
            side_effect=httpx.TimeoutException("Request timeout")
        )

        with pytest.raises(httpx.TimeoutException):
            await client.update_tool_status(
                tool_id=tool_id, status=ToolStatus.ERROR, refresh_error="Tool execution timeout"
            )

    @respx.mock
    async def test_update_tool_status_network_error(self, client: ToolManagerClient) -> None:
        """Test handling of network errors during status update."""
        tool_id = uuid4()

        respx.patch(f"http://test-api/api/v1/tools/{tool_id}").mock(side_effect=httpx.ConnectError("Connection failed"))

        with pytest.raises(httpx.ConnectError):
            await client.update_tool_status(
                tool_id=tool_id, status=ToolStatus.ERROR, refresh_error="Network connectivity issue"
            )

    @respx.mock
    async def test_update_tool_status_validation_error(self, client: ToolManagerClient) -> None:
        """Test handling of validation errors during status update."""
        tool_id = uuid4()

        respx.patch(f"http://test-api/api/v1/tools/{tool_id}").mock(
            return_value=httpx.Response(
                400,
                json={
                    "type": "https://nexus.com/problems/validation-error",
                    "title": "Validation Error",
                    "status": 400,
                    "detail": "Invalid status value provided",
                },
            )
        )

        with pytest.raises(httpx.HTTPStatusError) as exc_info:
            await client.update_tool_status(
                tool_id=tool_id, status=ToolStatus.ERROR, refresh_error="Validation error test"
            )

        assert exc_info.value.response.status_code == 400

    @respx.mock
    async def test_update_tool_status_long_error_message(self, client: ToolManagerClient) -> None:
        """Test status update with long error message."""
        tool_id = uuid4()
        long_error = "A" * 5000  # Very long error message

        mock_response = _create_mock_tool_response(tool_id=tool_id, status="error", refresh_error=long_error)
        respx.patch(f"http://test-api/api/v1/tools/{tool_id}").mock(
            return_value=httpx.Response(200, json=mock_response)
        )

        await client.update_tool_status(tool_id=tool_id, status=ToolStatus.ERROR, refresh_error=long_error)

        # Verify request was made successfully (error message truncation handled by Tool Manager)
        request = respx.calls.last.request
        assert request.method == "PATCH"

    @respx.mock
    async def test_update_tool_status_concurrent_updates(self, client: ToolManagerClient) -> None:
        """Test handling of concurrent status updates."""
        tool_id = uuid4()

        respx.patch(f"http://test-api/api/v1/tools/{tool_id}").mock(
            return_value=httpx.Response(
                409,
                json={
                    "type": "https://nexus.com/problems/concurrent-modification",
                    "title": "Concurrent Modification",
                    "status": 409,
                    "detail": "Tool was modified by another process",
                },
            )
        )

        with pytest.raises(httpx.HTTPStatusError) as exc_info:
            await client.update_tool_status(
                tool_id=tool_id, status=ToolStatus.ERROR, refresh_error="Concurrent update conflict"
            )

        assert exc_info.value.response.status_code == 409

    @respx.mock
    async def test_update_tool_status_with_refresh_error_none(self, client: ToolManagerClient) -> None:
        """Test tool status update with explicit refresh_error=None to clear error."""
        tool_id = uuid4()

        mock_response = _create_mock_tool_response(tool_id=tool_id, status="available", refresh_error=None)
        respx.patch(f"http://test-api/api/v1/tools/{tool_id}").mock(
            return_value=httpx.Response(200, json=mock_response)
        )

        await client.update_tool_status(tool_id=tool_id, status=ToolStatus.AVAILABLE, refresh_error=None)

        # Verify the request was made with refresh_error explicitly set to null
        request = respx.calls.last.request
        request_data = request.content.decode()
        assert "available" in request_data
        assert '"refresh_error":null' in request_data  # Should explicitly include null

    @respx.mock
    async def test_update_tool_provider_status_success(self, client: ToolManagerClient) -> None:
        """Test successful tool provider status update."""
        provider_id = uuid4()

        # Mock successful PATCH response
        mock_response = _create_mock_tool_provider_response(
            provider_id=provider_id, status="error", validation_error="Connection timeout during validation"
        )
        respx.patch(f"http://test-api/api/v1/tool-providers/{provider_id}").mock(
            return_value=httpx.Response(200, json=mock_response)
        )

        await client.update_tool_provider_status(
            provider_id=provider_id,
            status=ProviderStatus.ERROR,
            validation_error="Connection timeout during validation",
        )

        # Verify the request was made with correct data
        request = respx.calls.last.request
        assert request.method == "PATCH"
        assert f"/tool-providers/{provider_id}" in str(request.url)

        # Check request body contains status and validation_error
        request_data = request.content.decode()
        assert "error" in request_data
        assert "Connection timeout during validation" in request_data

    @respx.mock
    async def test_update_tool_provider_status_with_validation_error_none(self, client: ToolManagerClient) -> None:
        """Test tool provider status update with explicit validation_error=None to clear error."""
        provider_id = uuid4()

        mock_response = _create_mock_tool_provider_response(
            provider_id=provider_id, status="available", validation_error=None
        )
        respx.patch(f"http://test-api/api/v1/tool-providers/{provider_id}").mock(
            return_value=httpx.Response(200, json=mock_response)
        )

        await client.update_tool_provider_status(
            provider_id=provider_id, status=ProviderStatus.AVAILABLE, validation_error=None
        )

        # Verify the request was made with validation_error explicitly set to null
        request = respx.calls.last.request
        request_data = request.content.decode()
        assert "available" in request_data
        assert '"validation_error":null' in request_data  # Should explicitly include null

    @respx.mock
    async def test_update_tool_provider_status_error_auto_disable(self, client: ToolManagerClient) -> None:
        """Test that ERROR status automatically disables the provider."""
        provider_id = uuid4()

        mock_response = _create_mock_tool_provider_response(
            provider_id=provider_id, status="error", validation_error="Provider validation failed", enabled=False
        )
        respx.patch(f"http://test-api/api/v1/tool-providers/{provider_id}").mock(
            return_value=httpx.Response(200, json=mock_response)
        )

        await client.update_tool_provider_status(
            provider_id=provider_id, status=ProviderStatus.ERROR, validation_error="Provider validation failed"
        )

        # Verify the request includes auto-disable for ERROR status
        request = respx.calls.last.request
        request_data = request.content.decode()
        assert "error" in request_data
        assert "Provider validation failed" in request_data
        assert '"enabled":false' in request_data  # Provider should be auto-disabled for ERROR status

    @respx.mock
    async def test_update_tool_provider_status_provider_not_found(self, client: ToolManagerClient) -> None:
        """Test handling of provider not found error."""
        provider_id = uuid4()

        respx.patch(f"http://test-api/api/v1/tool-providers/{provider_id}").mock(
            return_value=httpx.Response(
                404,
                json={
                    "type": "https://nexus.com/problems/provider-not-found",
                    "title": "Provider Not Found",
                    "status": 404,
                    "detail": f"Provider with ID {provider_id} not found",
                },
            )
        )

        with pytest.raises(httpx.HTTPStatusError) as exc_info:
            await client.update_tool_provider_status(
                provider_id=provider_id, status=ProviderStatus.ERROR, validation_error="Provider validation failed"
            )

        assert exc_info.value.response.status_code == 404

    @respx.mock
    async def test_update_tool_provider_status_api_error(self, client: ToolManagerClient) -> None:
        """Test handling of API errors during provider status update."""
        provider_id = uuid4()

        respx.patch(f"http://test-api/api/v1/tool-providers/{provider_id}").mock(
            return_value=httpx.Response(500, text="Internal server error")
        )

        with pytest.raises(httpx.HTTPStatusError) as exc_info:
            await client.update_tool_provider_status(
                provider_id=provider_id, status=ProviderStatus.ERROR, validation_error="Database connection failed"
            )

        assert exc_info.value.response.status_code == 500

    @respx.mock
    async def test_update_tool_status_available_auto_enable(self, client: ToolManagerClient) -> None:
        """Test that AVAILABLE status automatically re-enables the tool."""
        tool_id = uuid4()

        mock_response = _create_mock_tool_response(
            tool_id=tool_id, status="available", refresh_error=None, enabled=True
        )
        respx.patch(f"http://test-api/api/v1/tools/{tool_id}").mock(
            return_value=httpx.Response(200, json=mock_response)
        )

        await client.update_tool_status(tool_id=tool_id, status=ToolStatus.AVAILABLE, refresh_error=None)

        # Verify the request includes auto-enable for AVAILABLE status
        request = respx.calls.last.request
        request_data = request.content.decode()
        assert "available" in request_data
        assert '"refresh_error":null' in request_data
        assert '"enabled":true' in request_data  # Tool should be auto-enabled for AVAILABLE status

    @respx.mock
    async def test_update_tool_provider_status_available_auto_enable(self, client: ToolManagerClient) -> None:
        """Test that AVAILABLE status automatically re-enables the provider."""
        provider_id = uuid4()

        mock_response = _create_mock_tool_provider_response(
            provider_id=provider_id, status="available", validation_error=None, enabled=True
        )
        respx.patch(f"http://test-api/api/v1/tool-providers/{provider_id}").mock(
            return_value=httpx.Response(200, json=mock_response)
        )

        await client.update_tool_provider_status(
            provider_id=provider_id, status=ProviderStatus.AVAILABLE, validation_error=None
        )

        # Verify the request includes auto-enable for AVAILABLE status
        request = respx.calls.last.request
        request_data = request.content.decode()
        assert "available" in request_data
        assert '"validation_error":null' in request_data
        assert '"enabled":true' in request_data  # Provider should be auto-enabled for AVAILABLE status
