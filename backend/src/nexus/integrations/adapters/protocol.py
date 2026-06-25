"""Adapter protocol and result types for integration validation and discovery."""

from __future__ import annotations

from datetime import datetime  # noqa: TC003 — runtime import required by SQLModel field
from enum import StrEnum
from typing import TYPE_CHECKING, Protocol, runtime_checkable

if TYPE_CHECKING:
    from typing import Any

from sqlmodel import SQLModel


class HealthCheckErrorType(StrEnum):
    """Classification of health check failures."""

    AUTH_FAILURE = "auth_failure"
    CONNECTION_ERROR = "connection_error"
    SSL_ERROR = "ssl_error"
    TIMEOUT = "timeout"


class DiscoveredLLMModel(SQLModel):
    """A model discovered from an LLM provider during health check."""

    id: str
    name: str
    description: str | None = None
    input_token_price_cents_per_million: int | None = None
    output_token_price_cents_per_million: int | None = None


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


@runtime_checkable
class IntegrationHealthCheckAdapter(Protocol):
    """Protocol for integration adapters.

    Each integration type (LLM, MCP, AAP Gateway) implements this protocol.
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
