"""Integration tests for malformed cursor handling across API endpoints.

Tests the end-to-end functionality for handling malformed cursor tokens
through various HTTP API endpoints, ensuring proper error responses.
"""

import pytest
from httpx import AsyncClient


class TestMalformedCursorHandling:
    """Integration tests for malformed cursor handling across API endpoints."""

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "endpoint",
        [
            "/api/v1/tool_manager/tool_providers",
            "/api/v1/tool_manager/tools",
            "/api/v1/workflows",
            "/api/v1/executions",
            "/api/v1/invocations",
        ],
    )
    async def test_malformed_cursor_returns_422_error(
        self,
        base_client: AsyncClient,
        endpoint: str,
    ) -> None:
        """Test that malformed cursor in API endpoints returns 422 Unprocessable Entity."""
        # Test with a malformed cursor that contains invalid base64 characters
        malformed_cursor = "invalid_base64!!!!"

        # Make request to the endpoint with malformed cursor
        response = await base_client.get(endpoint, params={"cursor": malformed_cursor})

        # Should return 422 Unprocessable Entity for malformed cursor
        assert response.status_code == 422

        data = response.json()
        assert "detail" in data
        assert "Invalid input value" in data["detail"]
