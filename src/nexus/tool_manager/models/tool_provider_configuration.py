"""Tool provider configuration models.

This module contains configuration classes for different tool provider types.
Each configuration class defines the required and optional parameters for
connecting to and interacting with a specific provider type.
"""

from typing import Annotated, ClassVar, Literal

from pydantic import ConfigDict, Field
from sqlmodel import SQLModel


class MCPConfiguration(SQLModel):
    """Configuration for MCP (Model Context Protocol) providers."""

    provider_type: Literal["mcp"] = "mcp"

    base_url: str = Field(description="Base URL for the MCP provider")

    api_key: str | None = Field(default=None, description="API key for authentication (optional)")

    model_config: ClassVar[ConfigDict] = ConfigDict(
        extra="forbid",  # Reject unknown fields
    )  # type: ignore[assignment]


# Discriminated union for all provider configurations
# When adding new provider types, add them to this union
ProviderConfigurationTypes = MCPConfiguration
ProviderConfiguration = Annotated[
    ProviderConfigurationTypes,
    Field(discriminator="provider_type"),
]
