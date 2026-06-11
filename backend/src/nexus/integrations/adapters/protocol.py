"""Health check adapter protocol and result types."""

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


class DiscoveredTool(SQLModel):
    """A tool discovered from an MCP server during health check."""

    name: str
    description: str | None = None


class HealthCheckResult(SQLModel):
    """Structured result of a health check operation.

    Returned by every adapter's health_check() method. Common fields are
    always populated; resource fields are populated only by the adapter
    type that discovers them.
    """

    success: bool
    checked_at: datetime
    error: str | None = None
    error_type: HealthCheckErrorType | None = None
    discovered_models: list[DiscoveredLLMModel] | None = None
    discovered_tools: list[DiscoveredTool] | None = None


@runtime_checkable
class IntegrationHealthCheckAdapter(Protocol):
    """Protocol for integration health check adapters.

    Each integration type (LLM, MCP, AAP Gateway) implements this protocol.
    The adapter receives its typed configuration via the constructor; the
    health_check method only takes per-call parameters.

    The resolved_credential parameter is the extra_vars dict produced by
    InjectorResolver.resolve() — not the raw secret dict from SecretService.
    The service layer performs both decryption and injector resolution before
    calling the adapter.
    """

    async def health_check(
        self,
        resolved_credential: dict[str, Any],
        timeout_seconds: int,
    ) -> HealthCheckResult:
        """Run a health check against the external service."""
        ...
