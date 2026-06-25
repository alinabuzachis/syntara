"""MCP server adapter implementing validate() and discover().

validate(): Lightweight ping — currently returns success=True with a TODO
  because the MCP spec ping utility is not yet exposed by langchain-mcp-adapters.

discover(): Connects to the MCP server via MCPProvider.refresh_tools() and
  converts the full Tool objects (including parameters) into DiscoverResult.
  This reuses the same code path as _sync_mcp_tools() to avoid two separate
  connections.
"""

from __future__ import annotations

import asyncio
import ssl
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any, cast

if TYPE_CHECKING:
    from collections.abc import Sequence

    from nexus.tool_manager.models.tool import ToolParameter

import httpx
import structlog
from httpx import HTTPStatusError, codes

from nexus.core.utils.exceptions import extract_all_exceptions
from nexus.integrations.adapters.factory import register_health_check_adapter
from nexus.integrations.adapters.protocol import (
    DiscoveredTool,
    DiscoveredToolParameter,
    DiscoverResult,
    HealthCheckErrorType,
    ValidateResult,
)
from nexus.integrations.models.integration import IntegrationType
from nexus.integrations.models.integration_configuration import MCPServerConfigurationInput  # noqa: TC001
from nexus.tool_manager.lib.providers.mcp.mcp_provider import MCPProvider

logger = structlog.stdlib.get_logger(__name__)

# MCP servers authenticate via Bearer token. The expected credential type
# is "HTTP Bearer Token", whose InjectorResolver output maps the raw
# "token" input to "bearer_token" in extra_vars.
_MCP_CREDENTIAL_KEY = "bearer_token"


class MCPServerHealthCheck:
    """Adapter for MCP server integrations implementing validate() and discover()."""

    def __init__(self, config: MCPServerConfigurationInput) -> None:
        """Initialize with MCP server configuration."""
        self._config = config

    async def validate(
        self,
        resolved_credential: dict[str, Any],  # noqa: ARG002
        timeout_seconds: int,  # noqa: ARG002
    ) -> ValidateResult:
        """Run a lightweight connectivity ping against the MCP server.

        # TODO: implement MCP ping when available in langchain-mcp-adapters.
        # The MCP specification defines a ping utility at
        # https://modelcontextprotocol.io/specification/2025-03-26/basic/utilities/ping
        # but it is not yet exposed by the langchain-mcp-adapters library.
        # For now we return success=True without making a real network call.
        # When the library exposes a ping method, replace this no-op with an
        # actual ping call and propagate connection errors properly.
        """
        logger.info(
            "MCP validate (ping no-op — ping not yet available in library)",
            base_url=self._config.base_url,
        )
        return ValidateResult(
            success=True,
            checked_at=datetime.now(UTC),
        )

    async def discover(
        self,
        resolved_credential: dict[str, Any],
        timeout_seconds: int,
    ) -> DiscoverResult:
        """Discover tools from the MCP server using MCPProvider.refresh_tools().

        Uses MCPProvider (the same code path as _sync_mcp_tools) so we make
        a single connection to the MCP server rather than two.  The returned
        DiscoveredTool list includes parameter information, enabling
        _sync_mcp_tools to perform a full upsert from this result alone.
        """
        api_key = cast("str | None", resolved_credential.get(_MCP_CREDENTIAL_KEY))

        success = True
        error_msg: str | None = None
        error_type: HealthCheckErrorType | None = None
        discovered: list[DiscoveredTool] | None = None

        adapter = MCPProvider(
            base_url=self._config.base_url,
            api_key=api_key,
        )
        try:
            tools_metadata = await asyncio.wait_for(adapter.refresh_tools(), timeout=timeout_seconds)

            discovered = [_tool_to_discovered(t) for t in tools_metadata]

            logger.info(
                "MCP discover succeeded",
                base_url=self._config.base_url,
                tool_count=len(discovered),
            )

        except* TimeoutError:
            success = False
            error_msg = f"Connection timed out after {timeout_seconds}s"
            error_type = HealthCheckErrorType.TIMEOUT
            logger.warning(
                "MCP discover timed out",
                base_url=self._config.base_url,
                timeout_seconds=timeout_seconds,
            )

        except* HTTPStatusError as eg:
            success = False
            errors = extract_all_exceptions(eg)
            error_type, error_msg = _classify_http_error(errors)
            logger.warning(
                "MCP discover HTTP error",
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
                "MCP discover SSL error",
                base_url=self._config.base_url,
                error=str(errors[0]),
            )

        except* (httpx.ConnectError, ConnectionError, OSError) as eg:
            success = False
            errors = extract_all_exceptions(eg)
            error_msg = "Unable to connect to service"
            error_type = HealthCheckErrorType.CONNECTION_ERROR
            logger.warning(
                "MCP discover connection error",
                base_url=self._config.base_url,
                error=str(errors[0]),
            )

        except* Exception as eg:
            success = False
            errors = extract_all_exceptions(eg)
            error_msg = "Discovery failed unexpectedly"
            error_type = HealthCheckErrorType.CONNECTION_ERROR
            logger.exception(
                "Unexpected error during MCP discover",
                base_url=self._config.base_url,
            )
        finally:
            await adapter.close()

        return DiscoverResult(
            success=success,
            checked_at=datetime.now(UTC),
            error=error_msg,
            error_type=error_type,
            discovered_tools=discovered,
        )


def _tool_param_to_discovered(param: ToolParameter) -> DiscoveredToolParameter:
    """Convert a ToolParameter domain object to DiscoveredToolParameter."""
    return DiscoveredToolParameter(
        name=param.name,
        type=str(param.type.value) if hasattr(param.type, "value") else str(param.type),
        description=param.description or "",
        required=bool(param.required),
    )


def _tool_to_discovered(tool: object) -> DiscoveredTool:
    """Convert a Tool domain object returned by MCPProvider.refresh_tools() to DiscoveredTool."""
    # MCPProvider.refresh_tools() returns nexus.tool_manager.models.tool.Tool objects.
    # We access fields via getattr to avoid a circular import.
    name: str = getattr(tool, "name", "")
    description: str | None = getattr(tool, "description", None)
    raw_params: list[ToolParameter] | None = getattr(tool, "parameters", None)

    params: list[DiscoveredToolParameter] | None = None
    if raw_params:
        params = [_tool_param_to_discovered(p) for p in raw_params]

    return DiscoveredTool(name=name, description=description, parameters=params)


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
    lambda c: MCPServerHealthCheck(cast("MCPServerConfigurationInput", c)),
)
