"""Integration configuration models.

Configuration classes for different integration types.
Each configuration class defines the non-sensitive parameters for
connecting to a specific integration type. Sensitive fields (API keys,
tokens, passwords) are stored in the linked Credential, not here.
"""

from typing import Annotated, ClassVar, Literal

from pydantic import ConfigDict, Field, field_validator
from sqlmodel import SQLModel

from nexus.core.lib.url_validation import validate_host_url


def _validate_http_url(v: str) -> str:
    return validate_host_url(v, allow_http=True)


class MCPServerConfiguration(SQLModel):
    """Configuration for MCP (Model Context Protocol) server integrations."""

    integration_type: Literal["mcp_server"] = "mcp_server"

    base_url: str = Field(description="Base URL for the MCP server", json_schema_extra={"format": "uri"})

    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")  # type: ignore[assignment]

    @field_validator("base_url")
    @classmethod
    def validate_base_url(cls, v: str) -> str:
        """Validate and normalize URL to prevent SSRF."""
        return _validate_http_url(v)


class LLMProviderConfiguration(SQLModel):
    """Configuration for LLM provider integrations (OpenAI-compatible endpoints)."""

    integration_type: Literal["llm_provider"] = "llm_provider"

    base_url: str = Field(description="Base URL for the LLM provider API", json_schema_extra={"format": "uri"})

    provider_hint: str | None = Field(
        default=None,
        description="Hint indicating the LLM provider backend (e.g. openai, azure, ollama)",
    )

    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")  # type: ignore[assignment]

    @field_validator("base_url")
    @classmethod
    def validate_base_url(cls, v: str) -> str:
        """Validate and normalize URL to prevent SSRF."""
        return _validate_http_url(v)


class AAPGatewayConfiguration(SQLModel):
    """Configuration for Ansible Automation Platform Gateway integrations."""

    integration_type: Literal["aap_gateway"] = "aap_gateway"

    gateway_url: str = Field(description="URL of the AAP Gateway", json_schema_extra={"format": "uri"})

    insecure_skip_tls_verify: bool = Field(
        default=False,
        description="Disable TLS certificate verification. Insecure; do not enable in production.",
    )

    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")  # type: ignore[assignment]

    @field_validator("gateway_url")
    @classmethod
    def validate_gateway_url(cls, v: str) -> str:
        """Validate and normalize URL to prevent SSRF."""
        return validate_host_url(v)


IntegrationConfigurationTypes = MCPServerConfiguration | LLMProviderConfiguration | AAPGatewayConfiguration
IntegrationConfiguration = Annotated[
    IntegrationConfigurationTypes,
    Field(discriminator="integration_type"),
]
