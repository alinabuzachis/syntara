"""Integration configuration models.

Configuration classes for different integration types.
Each configuration class defines the non-sensitive parameters for
connecting to a specific integration type. Sensitive fields (API keys,
tokens, passwords) are stored in the linked Credential, not here.
"""

from enum import StrEnum
from typing import Annotated, ClassVar, Literal, Self

from pydantic import ConfigDict, Field, field_validator, model_validator
from sqlmodel import SQLModel

from nexus.core.lib.url_validation import validate_endpoint_url, validate_host_url


class LLMProviderHint(StrEnum):
    """LLM provider backend type."""

    RED_HAT_AI = "red_hat_ai"
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GEMINI = "gemini"
    CUSTOM = "custom"


def _validate_http_url(v: str) -> str:
    return validate_host_url(v, allow_http=True)


def _validate_http_endpoint_url(v: str) -> str:
    return validate_endpoint_url(v, allow_http=True)


class MCPServerConfigurationInput(SQLModel):
    """Admin-provided fields for MCP server integrations (used by create/patch)."""

    integration_type: Literal["mcp_server"] = "mcp_server"

    base_url: str = Field(description="Base URL for the MCP server", json_schema_extra={"format": "uri"})

    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")  # type: ignore[assignment]

    @field_validator("base_url")
    @classmethod
    def validate_base_url(cls, v: str) -> str:
        """Validate MCP endpoint URL (paths allowed, e.g. /mcp)."""
        return _validate_http_endpoint_url(v)


class LLMProviderConfiguration(SQLModel):
    """Configuration for LLM provider integrations."""

    integration_type: Literal["llm_provider"] = "llm_provider"

    provider_hint: LLMProviderHint = Field(
        description="LLM provider backend type",
    )

    base_url: str | None = Field(
        default=None,
        description="Base URL for the LLM provider API. Required for red_hat_ai and custom providers.",
        json_schema_extra={"format": "uri"},
    )

    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")  # type: ignore[assignment]

    @field_validator("base_url")
    @classmethod
    def validate_base_url(cls, v: str | None) -> str | None:
        """Validate and normalize URL to prevent SSRF."""
        if not v:
            return None
        return _validate_http_endpoint_url(v)

    @model_validator(mode="after")
    def validate_base_url_required_for_provider(self) -> Self:
        """Require base_url for providers that have no default endpoint."""
        if self.provider_hint in (LLMProviderHint.RED_HAT_AI, LLMProviderHint.CUSTOM) and not self.base_url:
            msg = f"base_url is required for {self.provider_hint} provider"
            raise ValueError(msg)
        return self


class AAPConfiguration(SQLModel):
    """Configuration for Ansible Automation Platform integrations."""

    integration_type: Literal["ansible_automation_platform"] = "ansible_automation_platform"

    aap_url: str = Field(
        title="AAP URL",
        description="URL of the Ansible Automation Platform",
        json_schema_extra={"format": "uri"},
    )

    insecure_skip_tls_verify: bool = Field(
        default=False,
        description="Disable TLS certificate verification. Insecure; do not enable in production.",
    )

    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")  # type: ignore[assignment]

    @field_validator("aap_url")
    @classmethod
    def validate_aap_url(cls, v: str) -> str:
        """Validate and normalize URL to prevent SSRF."""
        return validate_host_url(v)


# Configuration types (used by DB model, read schema, and create/patch)
IntegrationConfigurationTypes = MCPServerConfigurationInput | LLMProviderConfiguration | AAPConfiguration
IntegrationConfiguration = Annotated[
    IntegrationConfigurationTypes,
    Field(discriminator="integration_type"),
]

# Aliases: collapse Input vs Full distinction now that system-managed
# fields (discovered_tools) are stored as separate Tool records.
IntegrationConfigurationInputTypes = IntegrationConfigurationTypes
IntegrationConfigurationInput = IntegrationConfiguration
MCPServerConfiguration = MCPServerConfigurationInput
