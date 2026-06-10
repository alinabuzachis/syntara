"""MCP server health check adapter.

Performs health checks against MCP servers by calling the tool listing
operation via the MCP protocol. A successful tool listing confirms both
endpoint reachability and credential validity.
"""

from __future__ import annotations

import asyncio
import ssl
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any, cast

if TYPE_CHECKING:
    from collections.abc import Sequence

import httpx
import structlog
from httpx import HTTPStatusError, codes
from langchain_mcp_adapters.client import MultiServerMCPClient  # type: ignore[import-untyped]

from nexus.core.utils.exceptions import extract_all_exceptions
from nexus.integrations.adapters.factory import register_health_check_adapter
from nexus.integrations.adapters.protocol import (
    DiscoveredTool,
    HealthCheckErrorType,
    HealthCheckResult,
)
from nexus.integrations.models.integration import IntegrationType
from nexus.integrations.models.integration_configuration import (  # noqa: TC001
    MCPServerConfiguration,
)

logger = structlog.stdlib.get_logger(__name__)

# MCP servers authenticate via Bearer token. The expected credential type
# is "HTTP Bearer Token", whose InjectorResolver output maps the raw
# "token" input to "bearer_token" in extra_vars.
_MCP_CREDENTIAL_KEY = "bearer_token"


class MCPServerHealthCheck:
    """Health check adapter for MCP server integrations."""

    def __init__(self, config: MCPServerConfiguration) -> None:
        """Initialize with MCP server configuration."""
        self._config = config

    async def health_check(
        self,
        resolved_credential: dict[str, Any],
        timeout_seconds: int,
    ) -> HealthCheckResult:
        """Run a health check against the MCP server.

        Calls the MCP tool listing operation to verify reachability and
        credential validity. Returns discovered tools on success.
        """
        api_key = resolved_credential.get(_MCP_CREDENTIAL_KEY)

        server_config: dict[str, dict[str, Any]] = {
            "health-check": {
                "transport": "streamable_http",
                "url": self._config.base_url,
            },
        }
        if api_key:
            server_config["health-check"]["headers"] = {
                "Authorization": f"Bearer {api_key}",
            }

        success = True
        error_msg: str | None = None
        error_type: HealthCheckErrorType | None = None
        discovered: list[DiscoveredTool] | None = None

        try:
            client = MultiServerMCPClient(server_config)
            tools = await asyncio.wait_for(
                client.get_tools(),
                timeout=timeout_seconds,
            )

            discovered = [DiscoveredTool(name=t.name, description=getattr(t, "description", None)) for t in tools]

            logger.debug(
                "MCP health check discovered tools",
                base_url=self._config.base_url,
                tools=[{"name": t.name, "description": t.description} for t in discovered],
            )
            logger.info(
                "MCP health check succeeded",
                base_url=self._config.base_url,
                tool_count=len(tools),
            )

        except* TimeoutError:
            success = False
            error_msg = f"Connection timed out after {timeout_seconds}s"
            error_type = HealthCheckErrorType.TIMEOUT
            logger.warning(
                "MCP health check timed out",
                base_url=self._config.base_url,
                timeout_seconds=timeout_seconds,
            )

        # httpx exceptions surface through MultiServerMCPClient's transport layer
        except* HTTPStatusError as eg:
            success = False
            errors = extract_all_exceptions(eg)
            error_type, error_msg = _classify_http_error(errors)
            logger.warning(
                "MCP health check HTTP error",
                base_url=self._config.base_url,
                error_type=error_type.value,
                status_codes=[e.response.status_code for e in errors if isinstance(e, HTTPStatusError)],
            )

        except* (ssl.SSLError, ssl.SSLCertVerificationError) as eg:
            success = False
            errors = extract_all_exceptions(eg)
            error_msg = "SSL/TLS verification failed"
            error_type = HealthCheckErrorType.SSL_ERROR
            logger.warning(
                "MCP health check SSL error",
                base_url=self._config.base_url,
                error=str(errors[0]),
            )

        except* (httpx.ConnectError, ConnectionError, OSError) as eg:
            success = False
            errors = extract_all_exceptions(eg)
            error_msg = "Unable to connect to service"
            error_type = HealthCheckErrorType.CONNECTION_ERROR
            logger.warning(
                "MCP health check connection error",
                base_url=self._config.base_url,
                error=str(errors[0]),
            )

        except* Exception as eg:
            success = False
            errors = extract_all_exceptions(eg)
            error_msg = "Health check failed unexpectedly"
            error_type = HealthCheckErrorType.CONNECTION_ERROR
            logger.exception(
                "Unexpected error during MCP health check",
                base_url=self._config.base_url,
            )

        return HealthCheckResult(
            success=success,
            checked_at=datetime.now(UTC),
            error=error_msg,
            error_type=error_type,
            discovered_tools=discovered,
        )


def _classify_http_error(
    errors: Sequence[BaseException],
) -> tuple[HealthCheckErrorType, str]:
    """Classify HTTP status errors into auth vs. connection failures."""
    for error in errors:
        if isinstance(error, HTTPStatusError):
            if error.response.status_code in (codes.UNAUTHORIZED, codes.FORBIDDEN):
                return (
                    HealthCheckErrorType.AUTH_FAILURE,
                    f"Authentication failed: HTTP {error.response.status_code}",
                )
            return (
                HealthCheckErrorType.CONNECTION_ERROR,
                f"HTTP error: {error.response.status_code}",
            )
    return (
        HealthCheckErrorType.CONNECTION_ERROR,
        f"HTTP error: {errors[0]}",
    )


register_health_check_adapter(
    IntegrationType.MCP_SERVER,
    lambda c: MCPServerHealthCheck(cast("MCPServerConfiguration", c)),
)
