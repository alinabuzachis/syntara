"""Tests for the MCP server health check adapter."""

from __future__ import annotations

import logging
import ssl
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from httpx import HTTPStatusError, Response

from nexus.integrations.adapters.mcp_server import MCPServerHealthCheck
from nexus.integrations.adapters.protocol import (
    HealthCheckErrorType,
    IntegrationHealthCheckAdapter,
)
from nexus.integrations.models.integration_configuration import MCPServerConfiguration


@pytest.fixture
def mcp_config() -> MCPServerConfiguration:
    """Create a test MCP server configuration."""
    return MCPServerConfiguration(base_url="http://localhost:8080")


def _mock_client(side_effect: Exception | None = None, tools: list[Any] | None = None) -> MagicMock:
    """Create a mock MultiServerMCPClient."""
    client = MagicMock()
    if side_effect:
        client.get_tools = AsyncMock(side_effect=side_effect)
    else:
        client.get_tools = AsyncMock(return_value=tools or [])
    return client


def _mock_http_error(status_code: int) -> HTTPStatusError:
    """Create a mock HTTPStatusError with the given status code."""
    response = Response(status_code=status_code)
    return HTTPStatusError(
        message=f"HTTP {status_code}",
        request=httpx.Request("GET", "http://localhost:8080"),
        response=response,
    )


class TestMCPServerHealthCheckProtocol:
    """Tests that MCPServerHealthCheck satisfies the adapter Protocol."""

    def test_is_instance_of_protocol(self, mcp_config: MCPServerConfiguration) -> None:
        """Verify MCPServerHealthCheck implements IntegrationHealthCheckAdapter."""
        adapter = MCPServerHealthCheck(mcp_config)
        assert isinstance(adapter, IntegrationHealthCheckAdapter)


class TestMCPServerHealthCheckSuccess:
    """Tests for successful MCP health checks."""

    @pytest.mark.asyncio
    async def test_returns_discovered_tools(self, mcp_config: MCPServerConfiguration) -> None:
        """Successful health check returns tool names and descriptions."""
        mock_tool = MagicMock()
        mock_tool.name = "search"
        mock_tool.description = "Search the web"

        adapter = MCPServerHealthCheck(mcp_config)

        with patch(
            "nexus.integrations.adapters.mcp_server.MultiServerMCPClient",
        ) as mock_client_cls:
            mock_client_cls.return_value = _mock_client(tools=[mock_tool])

            result = await adapter.health_check(
                resolved_credential={"bearer_token": "test-key"},
                timeout_seconds=10,
            )

        assert result.success is True
        assert result.discovered_tools is not None
        assert len(result.discovered_tools) == 1
        assert result.discovered_tools[0].name == "search"
        assert result.discovered_tools[0].description == "Search the web"
        assert result.error is None

    @pytest.mark.asyncio
    async def test_empty_tools_list(self, mcp_config: MCPServerConfiguration) -> None:
        """MCP server with no tools returns success with empty list."""
        adapter = MCPServerHealthCheck(mcp_config)

        with patch(
            "nexus.integrations.adapters.mcp_server.MultiServerMCPClient",
        ) as mock_client_cls:
            mock_client_cls.return_value = _mock_client(tools=[])

            result = await adapter.health_check(
                resolved_credential={"bearer_token": "test"},
                timeout_seconds=10,
            )

        assert result.success is True
        assert result.discovered_tools == []

    @pytest.mark.asyncio
    async def test_tool_without_description(self, mcp_config: MCPServerConfiguration) -> None:
        """Tools without a description attribute get description=None."""
        mock_tool = MagicMock(spec=["name"])
        mock_tool.name = "bare_tool"

        adapter = MCPServerHealthCheck(mcp_config)

        with patch(
            "nexus.integrations.adapters.mcp_server.MultiServerMCPClient",
        ) as mock_client_cls:
            mock_client_cls.return_value = _mock_client(tools=[mock_tool])

            result = await adapter.health_check(
                resolved_credential={"bearer_token": "test"},
                timeout_seconds=10,
            )

        assert result.discovered_tools is not None
        assert result.discovered_tools[0].description is None

    @pytest.mark.asyncio
    async def test_passes_bearer_token_in_auth_header(
        self,
        mcp_config: MCPServerConfiguration,
    ) -> None:
        """Adapter passes bearer_token as Authorization header."""
        adapter = MCPServerHealthCheck(mcp_config)

        with patch(
            "nexus.integrations.adapters.mcp_server.MultiServerMCPClient",
        ) as mock_client_cls:
            mock_client_cls.return_value = _mock_client()

            await adapter.health_check(
                resolved_credential={"bearer_token": "my-secret-key"},
                timeout_seconds=10,
            )

            call_args = mock_client_cls.call_args[0][0]
            assert call_args["health-check"]["headers"] == {
                "Authorization": "Bearer my-secret-key",
            }

    @pytest.mark.asyncio
    async def ***REMOVED***(
        self,
        mcp_config: MCPServerConfiguration,
    ) -> None:
        """Adapter does not add auth header when bearer_token not in credential."""
        adapter = MCPServerHealthCheck(mcp_config)

        with patch(
            "nexus.integrations.adapters.mcp_server.MultiServerMCPClient",
        ) as mock_client_cls:
            mock_client_cls.return_value = _mock_client()

            await adapter.health_check(
                resolved_credential={},
                timeout_seconds=10,
            )

            call_args = mock_client_cls.call_args[0][0]
            assert "headers" not in call_args["health-check"]


class TestMCPServerHealthCheckErrors:
    """Tests for MCP health check error classification."""

    @pytest.mark.asyncio
    async def test_timeout_error(self, mcp_config: MCPServerConfiguration) -> None:
        """Timeout returns TIMEOUT error type with sanitized message."""
        adapter = MCPServerHealthCheck(mcp_config)

        with patch(
            "nexus.integrations.adapters.mcp_server.MultiServerMCPClient",
        ) as mock_client_cls:
            mock_client_cls.return_value = _mock_client(side_effect=TimeoutError("internal details"))

            result = await adapter.health_check(
                resolved_credential={"bearer_token": "test"},
                timeout_seconds=5,
            )

        assert result.success is False
        assert result.error_type == HealthCheckErrorType.TIMEOUT
        assert result.error == "Connection timed out after 5s"

    @pytest.mark.asyncio
    async def test_connection_error(self, mcp_config: MCPServerConfiguration) -> None:
        """Connection error returns CONNECTION_ERROR with sanitized message."""
        adapter = MCPServerHealthCheck(mcp_config)

        with patch(
            "nexus.integrations.adapters.mcp_server.MultiServerMCPClient",
        ) as mock_client_cls:
            mock_client_cls.return_value = _mock_client(side_effect=ConnectionError("Connection refused"))

            result = await adapter.health_check(
                resolved_credential={"bearer_token": "test"},
                timeout_seconds=10,
            )

        assert result.success is False
        assert result.error_type == HealthCheckErrorType.CONNECTION_ERROR
        assert result.error == "Unable to connect to service"

    @pytest.mark.asyncio
    async def ***REMOVED***(self, mcp_config: MCPServerConfiguration) -> None:
        """HTTP 401 returns AUTH_FAILURE error type."""
        adapter = MCPServerHealthCheck(mcp_config)

        with patch(
            "nexus.integrations.adapters.mcp_server.MultiServerMCPClient",
        ) as mock_client_cls:
            mock_client_cls.return_value = _mock_client(side_effect=_mock_http_error(401))

            result = await adapter.health_check(
                resolved_credential={"bearer_token": "bad-token"},
                timeout_seconds=10,
            )

        assert result.success is False
        assert result.error_type == HealthCheckErrorType.AUTH_FAILURE
        assert "401" in (result.error or "")

    @pytest.mark.asyncio
    async def ***REMOVED***(self, mcp_config: MCPServerConfiguration) -> None:
        """HTTP 403 returns AUTH_FAILURE error type."""
        adapter = MCPServerHealthCheck(mcp_config)

        with patch(
            "nexus.integrations.adapters.mcp_server.MultiServerMCPClient",
        ) as mock_client_cls:
            mock_client_cls.return_value = _mock_client(side_effect=_mock_http_error(403))

            result = await adapter.health_check(
                resolved_credential={"bearer_token": "test"},
                timeout_seconds=10,
            )

        assert result.success is False
        assert result.error_type == HealthCheckErrorType.AUTH_FAILURE

    @pytest.mark.asyncio
    async def test_http_500_classified_as_connection_error(self, mcp_config: MCPServerConfiguration) -> None:
        """HTTP 500 returns CONNECTION_ERROR, not AUTH_FAILURE."""
        adapter = MCPServerHealthCheck(mcp_config)

        with patch(
            "nexus.integrations.adapters.mcp_server.MultiServerMCPClient",
        ) as mock_client_cls:
            mock_client_cls.return_value = _mock_client(side_effect=_mock_http_error(500))

            result = await adapter.health_check(
                resolved_credential={"bearer_token": "test"},
                timeout_seconds=10,
            )

        assert result.success is False
        assert result.error_type == HealthCheckErrorType.CONNECTION_ERROR

    @pytest.mark.asyncio
    async def test_ssl_error(self, mcp_config: MCPServerConfiguration) -> None:
        """SSL error returns SSL_ERROR with sanitized message."""
        adapter = MCPServerHealthCheck(mcp_config)

        with patch(
            "nexus.integrations.adapters.mcp_server.MultiServerMCPClient",
        ) as mock_client_cls:
            mock_client_cls.return_value = _mock_client(
                side_effect=ssl.SSLCertVerificationError("certificate verify failed"),
            )

            result = await adapter.health_check(
                resolved_credential={"bearer_token": "test"},
                timeout_seconds=10,
            )

        assert result.success is False
        assert result.error_type == HealthCheckErrorType.SSL_ERROR
        assert result.error == "SSL/TLS verification failed"

    @pytest.mark.asyncio
    async def test_unexpected_exception_logged(
        self,
        mcp_config: MCPServerConfiguration,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        """Unexpected exceptions are logged and return sanitized message."""
        adapter = MCPServerHealthCheck(mcp_config)

        with (
            patch(
                "nexus.integrations.adapters.mcp_server.MultiServerMCPClient",
            ) as mock_client_cls,
            caplog.at_level(logging.ERROR, logger="nexus.integrations.adapters.mcp_server"),
        ):
            mock_client_cls.return_value = _mock_client(side_effect=RuntimeError("weird internal error"))

            result = await adapter.health_check(
                resolved_credential={"bearer_token": "test"},
                timeout_seconds=10,
            )

        assert result.success is False
        assert result.error_type == HealthCheckErrorType.CONNECTION_ERROR
        assert result.error == "Health check failed unexpectedly"
        assert any("Unexpected error" in r.message for r in caplog.records)


class TestErrorMessageSanitization:
    """Tests that error messages don't leak sensitive information."""

    @pytest.mark.asyncio
    async def test_connection_error_does_not_leak_details(self, mcp_config: MCPServerConfiguration) -> None:
        """Connection error messages don't contain raw exception text."""
        adapter = MCPServerHealthCheck(mcp_config)

        with patch(
            "nexus.integrations.adapters.mcp_server.MultiServerMCPClient",
        ) as mock_client_cls:
            mock_client_cls.return_value = _mock_client(
                side_effect=ConnectionError("connect to 10.0.0.5:8765 failed: Connection refused"),
            )

            result = await adapter.health_check(
                resolved_credential={"bearer_token": "SECRET-TOKEN-12345"},
                timeout_seconds=10,
            )

        assert "10.0.0.5" not in (result.error or "")
        assert "SECRET-TOKEN-12345" not in (result.error or "")

    @pytest.mark.asyncio
    async def test_ssl_error_does_not_leak_cert_details(self, mcp_config: MCPServerConfiguration) -> None:
        """SSL error messages don't contain certificate subject names."""
        adapter = MCPServerHealthCheck(mcp_config)

        with patch(
            "nexus.integrations.adapters.mcp_server.MultiServerMCPClient",
        ) as mock_client_cls:
            mock_client_cls.return_value = _mock_client(
                side_effect=ssl.SSLCertVerificationError("certificate verify failed: CN=internal.corp.example.com"),
            )

            result = await adapter.health_check(
                resolved_credential={"bearer_token": "SECRET-TOKEN-12345"},
                timeout_seconds=10,
            )

        assert "internal.corp.example.com" not in (result.error or "")
        assert "SECRET-TOKEN-12345" not in (result.error or "")

    @pytest.mark.asyncio
    async def test_unexpected_error_does_not_leak_details(self, mcp_config: MCPServerConfiguration) -> None:
        """Unexpected error messages don't contain internal details."""
        adapter = MCPServerHealthCheck(mcp_config)

        with patch(
            "nexus.integrations.adapters.mcp_server.MultiServerMCPClient",
        ) as mock_client_cls:
            mock_client_cls.return_value = _mock_client(
                side_effect=RuntimeError("KeyError at /home/user/.secrets/key.pem"),
            )

            result = await adapter.health_check(
                resolved_credential={"bearer_token": "SECRET-TOKEN-12345"},
                timeout_seconds=10,
            )

        assert "/home/user" not in (result.error or "")
        assert "SECRET-TOKEN-12345" not in (result.error or "")

    @pytest.mark.asyncio
    async def test_credentials_not_in_logs(
        self,
        mcp_config: MCPServerConfiguration,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        """Credential values do not appear in log output."""
        adapter = MCPServerHealthCheck(mcp_config)
        secret = "SUPER-SECRET-KEY-999"  # noqa: S105

        with (
            patch(
                "nexus.integrations.adapters.mcp_server.MultiServerMCPClient",
            ) as mock_client_cls,
            caplog.at_level(logging.DEBUG, logger="nexus.integrations.adapters.mcp_server"),
        ):
            mock_client_cls.return_value = _mock_client(side_effect=ConnectionError("refused"))

            await adapter.health_check(
                resolved_credential={"bearer_token": secret},
                timeout_seconds=10,
            )

        assert secret not in caplog.text
