"""Tests for the MCP server adapter — validate() and discover() methods."""

from __future__ import annotations

import logging
import ssl
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from httpx import HTTPStatusError, Response

from nexus.integrations.adapters.mcp_server import MCPServerAdapter
from nexus.integrations.adapters.protocol import (
    HealthCheckErrorType,
    IntegrationAdapter,
)
from nexus.integrations.models.integration_configuration import MCPServerConfiguration


@pytest.fixture
def mcp_config() -> MCPServerConfiguration:
    """Create a test MCP server configuration."""
    return MCPServerConfiguration(base_url="http://localhost:8080")


def _mock_mcp_provider(side_effect: Exception | None = None, tools: list[Any] | None = None) -> MagicMock:
    """Create a mock MCPProvider for use in discover() tests."""
    provider = MagicMock()
    provider.close = AsyncMock()
    if side_effect:
        provider.refresh_tools = AsyncMock(side_effect=side_effect)
    else:
        provider.refresh_tools = AsyncMock(return_value=tools or [])
    return provider


def _mock_http_error(status_code: int) -> HTTPStatusError:
    """Create a mock HTTPStatusError with the given status code."""
    response = Response(status_code=status_code)
    return HTTPStatusError(
        message=f"HTTP {status_code}",
        request=httpx.Request("GET", "http://localhost:8080"),
        response=response,
    )


class TestMCPServerAdapterProtocol:
    """Tests that MCPServerAdapter satisfies the adapter Protocol."""

    def test_is_instance_of_protocol(self, mcp_config: MCPServerConfiguration) -> None:
        """Verify MCPServerAdapter implements IntegrationAdapter."""
        adapter = MCPServerAdapter(mcp_config)
        assert isinstance(adapter, IntegrationAdapter)


class TestMCPServerValidate:
    """Tests for MCPServerAdapter.validate() — lightweight ping no-op."""

    @pytest.mark.asyncio
    async def test_validate_returns_success(self, mcp_config: MCPServerConfiguration) -> None:
        """validate() returns success=True without making a network call."""
        adapter = MCPServerAdapter(mcp_config)
        result = await adapter.validate(resolved_credential={}, timeout_seconds=10)

        assert result.success is True
        assert result.error is None
        assert result.error_type is None
        assert result.checked_at is not None

    @pytest.mark.asyncio
    async def test_validate_no_tool_fields(self, mcp_config: MCPServerConfiguration) -> None:
        """validate() result does not have discovered_tools (those belong to DiscoverResult)."""
        adapter = MCPServerAdapter(mcp_config)
        result = await adapter.validate(resolved_credential={}, timeout_seconds=10)

        assert not hasattr(result, "discovered_tools")
        assert not hasattr(result, "tools_refreshed_count")


class TestMCPServerDiscoverSuccess:
    """Tests for successful MCPServerAdapter.discover() calls."""

    @pytest.mark.asyncio
    async def test_returns_discovered_tools(self, mcp_config: MCPServerConfiguration) -> None:
        """Successful discover returns tool names and descriptions."""
        from nexus.tool_manager.models.tool import Tool

        mock_tool = MagicMock(spec=Tool)
        mock_tool.name = "search"
        mock_tool.description = "Search the web"
        mock_tool.parameters = []

        adapter = MCPServerAdapter(mcp_config)

        with patch(
            "nexus.integrations.adapters.mcp_server.MCPProvider",
        ) as mock_provider_cls:
            mock_provider_cls.return_value = _mock_mcp_provider(tools=[mock_tool])

            result = await adapter.discover(
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
        adapter = MCPServerAdapter(mcp_config)

        with patch(
            "nexus.integrations.adapters.mcp_server.MCPProvider",
        ) as mock_provider_cls:
            mock_provider_cls.return_value = _mock_mcp_provider(tools=[])

            result = await adapter.discover(
                resolved_credential={"bearer_token": "test"},
                timeout_seconds=10,
            )

        assert result.success is True
        assert result.discovered_tools == []


class TestMCPServerDiscoverErrors:
    """Tests for MCPServerAdapter.discover() error classification."""

    @pytest.mark.asyncio
    async def test_timeout_error(self, mcp_config: MCPServerConfiguration) -> None:
        """Timeout returns TIMEOUT error type with sanitized message."""
        adapter = MCPServerAdapter(mcp_config)

        with patch(
            "nexus.integrations.adapters.mcp_server.MCPProvider",
        ) as mock_provider_cls:
            mock_provider = _mock_mcp_provider(side_effect=TimeoutError("internal details"))
            mock_provider_cls.return_value = mock_provider

            result = await adapter.discover(
                resolved_credential={"bearer_token": "test"},
                timeout_seconds=5,
            )

        assert result.success is False
        assert result.error_type == HealthCheckErrorType.TIMEOUT
        assert result.error == "Connection timed out after 5s"
        mock_provider.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_connection_error(self, mcp_config: MCPServerConfiguration) -> None:
        """Connection error returns CONNECTION_ERROR with sanitized message."""
        adapter = MCPServerAdapter(mcp_config)

        with patch(
            "nexus.integrations.adapters.mcp_server.MCPProvider",
        ) as mock_provider_cls:
            mock_provider = _mock_mcp_provider(side_effect=ConnectionError("Connection refused"))
            mock_provider_cls.return_value = mock_provider

            result = await adapter.discover(
                resolved_credential={"bearer_token": "test"},
                timeout_seconds=10,
            )

        assert result.success is False
        assert result.error_type == HealthCheckErrorType.CONNECTION_ERROR
        assert result.error == "Unable to connect to service"
        mock_provider.close.assert_called_once()

    @pytest.mark.asyncio
    async def ***REMOVED***(self, mcp_config: MCPServerConfiguration) -> None:
        """HTTP 401 returns AUTH_FAILURE error type."""
        adapter = MCPServerAdapter(mcp_config)

        with patch(
            "nexus.integrations.adapters.mcp_server.MCPProvider",
        ) as mock_provider_cls:
            mock_provider_cls.return_value = _mock_mcp_provider(side_effect=_mock_http_error(401))

            result = await adapter.discover(
                resolved_credential={"bearer_token": "bad-token"},
                timeout_seconds=10,
            )

        assert result.success is False
        assert result.error_type == HealthCheckErrorType.AUTH_FAILURE
        assert "401" in (result.error or "")

    @pytest.mark.asyncio
    async def ***REMOVED***(self, mcp_config: MCPServerConfiguration) -> None:
        """HTTP 403 returns AUTH_FAILURE error type."""
        adapter = MCPServerAdapter(mcp_config)

        with patch(
            "nexus.integrations.adapters.mcp_server.MCPProvider",
        ) as mock_provider_cls:
            mock_provider_cls.return_value = _mock_mcp_provider(side_effect=_mock_http_error(403))

            result = await adapter.discover(
                resolved_credential={"bearer_token": "test"},
                timeout_seconds=10,
            )

        assert result.success is False
        assert result.error_type == HealthCheckErrorType.AUTH_FAILURE

    @pytest.mark.asyncio
    async def test_http_500_classified_as_connection_error(self, mcp_config: MCPServerConfiguration) -> None:
        """HTTP 500 returns CONNECTION_ERROR, not AUTH_FAILURE."""
        adapter = MCPServerAdapter(mcp_config)

        with patch(
            "nexus.integrations.adapters.mcp_server.MCPProvider",
        ) as mock_provider_cls:
            mock_provider_cls.return_value = _mock_mcp_provider(side_effect=_mock_http_error(500))

            result = await adapter.discover(
                resolved_credential={"bearer_token": "test"},
                timeout_seconds=10,
            )

        assert result.success is False
        assert result.error_type == HealthCheckErrorType.CONNECTION_ERROR

    @pytest.mark.asyncio
    async def test_ssl_error(self, mcp_config: MCPServerConfiguration) -> None:
        """SSL error returns SSL_ERROR with sanitized message."""
        adapter = MCPServerAdapter(mcp_config)

        with patch(
            "nexus.integrations.adapters.mcp_server.MCPProvider",
        ) as mock_provider_cls:
            mock_provider = _mock_mcp_provider(
                side_effect=ssl.SSLCertVerificationError("certificate verify failed"),
            )
            mock_provider_cls.return_value = mock_provider

            result = await adapter.discover(
                resolved_credential={"bearer_token": "test"},
                timeout_seconds=10,
            )

        assert result.success is False
        assert result.error_type == HealthCheckErrorType.SSL_ERROR
        assert result.error == "SSL/TLS verification failed"
        mock_provider.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_unexpected_exception_logged(
        self,
        mcp_config: MCPServerConfiguration,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        """Unexpected exceptions are logged and return sanitized message."""
        adapter = MCPServerAdapter(mcp_config)

        with (
            patch(
                "nexus.integrations.adapters.mcp_server.MCPProvider",
            ) as mock_provider_cls,
            caplog.at_level(logging.ERROR, logger="nexus.integrations.adapters.mcp_server"),
        ):
            mock_provider = _mock_mcp_provider(side_effect=RuntimeError("weird internal error"))
            mock_provider_cls.return_value = mock_provider

            result = await adapter.discover(
                resolved_credential={"bearer_token": "test"},
                timeout_seconds=10,
            )

        assert result.success is False
        assert result.error_type == HealthCheckErrorType.CONNECTION_ERROR
        assert result.error == "Discovery failed unexpectedly"
        assert any("Unexpected error" in r.message for r in caplog.records)
        mock_provider.close.assert_called_once()


class TestErrorMessageSanitization:
    """Tests that error messages don't leak sensitive information."""

    @pytest.mark.asyncio
    async def test_connection_error_does_not_leak_details(self, mcp_config: MCPServerConfiguration) -> None:
        """Connection error messages don't contain raw exception text."""
        adapter = MCPServerAdapter(mcp_config)

        with patch(
            "nexus.integrations.adapters.mcp_server.MCPProvider",
        ) as mock_provider_cls:
            mock_provider_cls.return_value = _mock_mcp_provider(
                side_effect=ConnectionError("connect to 10.0.0.5:8765 failed: Connection refused"),
            )

            result = await adapter.discover(
                resolved_credential={"bearer_token": "SECRET-TOKEN-12345"},
                timeout_seconds=10,
            )

        assert "10.0.0.5" not in (result.error or "")
        assert "SECRET-TOKEN-12345" not in (result.error or "")

    @pytest.mark.asyncio
    async def test_ssl_error_does_not_leak_cert_details(self, mcp_config: MCPServerConfiguration) -> None:
        """SSL error messages don't contain certificate subject names."""
        adapter = MCPServerAdapter(mcp_config)

        with patch(
            "nexus.integrations.adapters.mcp_server.MCPProvider",
        ) as mock_provider_cls:
            mock_provider_cls.return_value = _mock_mcp_provider(
                side_effect=ssl.SSLCertVerificationError("certificate verify failed: CN=internal.corp.example.com"),
            )

            result = await adapter.discover(
                resolved_credential={"bearer_token": "SECRET-TOKEN-12345"},
                timeout_seconds=10,
            )

        assert "internal.corp.example.com" not in (result.error or "")
        assert "SECRET-TOKEN-12345" not in (result.error or "")

    @pytest.mark.asyncio
    async def test_unexpected_error_does_not_leak_details(self, mcp_config: MCPServerConfiguration) -> None:
        """Unexpected error messages don't contain internal details."""
        adapter = MCPServerAdapter(mcp_config)

        with patch(
            "nexus.integrations.adapters.mcp_server.MCPProvider",
        ) as mock_provider_cls:
            mock_provider_cls.return_value = _mock_mcp_provider(
                side_effect=RuntimeError("KeyError at /home/user/.secrets/key.pem"),
            )

            result = await adapter.discover(
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
        adapter = MCPServerAdapter(mcp_config)
        secret = "SUPER-SECRET-KEY-999"  # noqa: S105

        with (
            patch(
                "nexus.integrations.adapters.mcp_server.MCPProvider",
            ) as mock_provider_cls,
            caplog.at_level(logging.DEBUG, logger="nexus.integrations.adapters.mcp_server"),
        ):
            mock_provider_cls.return_value = _mock_mcp_provider(side_effect=ConnectionError("refused"))

            await adapter.discover(
                resolved_credential={"bearer_token": secret},
                timeout_seconds=10,
            )

        assert secret not in caplog.text
