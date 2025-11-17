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
            "/api/v1/tool-providers",
            "/api/v1/tools",
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

        error_data = response.json()
        assert "detail" in error_data

        # Verify error message indicates cursor format issue
        error_detail = str(error_data["detail"]).lower()
        assert "cursor" in error_detail
        assert "invalid" in error_detail or "format" in error_detail
