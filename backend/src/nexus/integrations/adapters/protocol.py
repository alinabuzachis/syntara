"""Adapter protocol and result types for integration validation and discovery."""

from __future__ import annotations

from collections.abc import Sequence  # noqa: TC003 — runtime import for classify_http_error
from datetime import datetime  # noqa: TC003 — runtime import required by SQLModel field
from enum import StrEnum
from typing import TYPE_CHECKING, Protocol, runtime_checkable

if TYPE_CHECKING:
    from typing import Any

from httpx import HTTPStatusError, codes
from sqlmodel import SQLModel


class HealthCheckErrorType(StrEnum):
    """Classification of health check failures."""

    AUTH_FAILURE = "auth_failure"
    CONNECTION_ERROR = "connection_error"
    RATE_LIMIT = "rate_limit"
    SSL_ERROR = "ssl_error"
    TIMEOUT = "timeout"


class DiscoveredLLMModel(SQLModel):
    """A model discovered from an LLM provider."""

    id: str
    name: str
    description: str | None = None


class DiscoveredToolParameter(SQLModel):
    """A parameter belonging to a discovered tool."""

    name: str
    type: str = "string"
    description: str = ""
    required: bool = False


class DiscoveredTool(SQLModel):
    """A tool discovered from an MCP server.

    Carries parameter information so that _sync_mcp_tools() can do a full
    upsert without re-fetching from MCP.
    """

    name: str
    description: str | None = None
    parameters: list[DiscoveredToolParameter] | None = None


class ValidateResult(SQLModel):
    """Result of a lightweight connectivity ping (validate endpoint).

    Contains only connection-health fields. No resource discovery fields.
    """

    success: bool
    checked_at: datetime
    error: str | None = None
    error_type: HealthCheckErrorType | None = None


class DiscoverResult(SQLModel):
    """Result of a resource-discovery operation (discover endpoint).

    Returned by the unsaved-connection test (POST /integrations/discover)
    and used internally by refresh_resources() to drive tool sync.
    """

    success: bool
    checked_at: datetime
    error: str | None = None
    error_type: HealthCheckErrorType | None = None
    discovered_tools: list[DiscoveredTool] | None = None
    discovered_models: list[DiscoveredLLMModel] | None = None


def classify_http_error(
    errors: Sequence[BaseException],
) -> tuple[HealthCheckErrorType, str]:
    """Classify HTTP status errors into auth vs. connection failures.

    Shared by all adapter implementations. Iterates errors and returns
    AUTH_FAILURE for 401/403, CONNECTION_ERROR for other HTTP statuses.
    """
    for error in errors:
        if isinstance(error, HTTPStatusError):
            status = error.response.status_code
            if status in (codes.UNAUTHORIZED, codes.FORBIDDEN):
                return (
                    HealthCheckErrorType.AUTH_FAILURE,
                    f"Authentication failed: HTTP {status}",
                )
            if status == codes.TOO_MANY_REQUESTS:
                return (
                    HealthCheckErrorType.RATE_LIMIT,
                    f"Rate limit exceeded: HTTP {status}",
                )
            return (
                HealthCheckErrorType.CONNECTION_ERROR,
                f"HTTP error: {status}",
            )
    return (
        HealthCheckErrorType.CONNECTION_ERROR,
        f"Request failed: {type(errors[0]).__name__}" if errors else "HTTP error: unknown",
    )


@runtime_checkable
class IntegrationAdapter(Protocol):
    """Protocol for integration adapters.

    Each integration type (LLM, MCP, Ansible Automation Platform) implements this protocol.
    The adapter receives its typed configuration via the constructor; the
    validate and discover methods only take per-call parameters.

    The resolved_credential parameter is the extra_vars dict produced by
    InjectorResolver.resolve() — not the raw secret dict from SecretService.
    The service layer performs both decryption and injector resolution before
    calling the adapter.
    """

    async def validate(
        self,
        resolved_credential: dict[str, Any],
        timeout_seconds: int,
    ) -> ValidateResult:
        """Run a lightweight connectivity ping against the external service."""
        ...

    async def discover(
        self,
        resolved_credential: dict[str, Any],
        timeout_seconds: int,
    ) -> DiscoverResult:
        """Discover resources (tools, models) from the external service."""
        ...
