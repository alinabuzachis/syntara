"""ToolProvider SQLModel definition for database storage.

This module contains the ToolProvider SQLModel class that extends the Resource base class
with tool provider specific fields as defined in the OpenAPI specification.
"""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING, Any

from pydantic import field_validator
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import DateTime, Field, Relationship, SQLModel

from nexus.core.constants import FieldLimits
from nexus.core.models import Resource

if TYPE_CHECKING:
    from nexus.tool_manager.models.tool import Tool
    from nexus.tool_manager.models.tool_execution import ToolExecution


class ProviderStatus(str, Enum):
    """Status of a tool provider."""

    AVAILABLE = "available"
    ERROR = "error"
    VALIDATING = "validating"


class MCPConfiguration(SQLModel):
    """Configuration for MCP (Model Context Protocol) providers."""

    provider_type: str = Field(default="mcp", description="Provider type - always 'mcp' for MCP providers")

    base_url: str = Field(description="Base URL for the MCP provider")

    api_key: str = Field(description="API key for authentication")

    @field_validator("provider_type")
    @classmethod
    def validate_provider_type(cls, v: str) -> str:
        """Ensure provider_type is 'mcp' for MCP configurations."""
        if v != "mcp":
            msg = "provider_type must be 'mcp' for MCPConfiguration"
            raise TypeError(msg)
        return v


class ToolProvider(Resource, table=True):
    """ToolProvider database model.

    Represents an external tool provider that can provide multiple tools.
    Extends the Resource base class with provider-specific fields.

    Attributes:
        configuration: Provider-specific configuration (stored as JSON)
        enabled: Whether the provider is enabled (default: True)
        status: Current status of the provider (default: validating)
        last_validated_at: Timestamp of last validation (nullable)
        validation_error: Error message from last validation attempt (nullable)
        tool_count: Number of tools provided by this provider (default: 0)

    Inherits from Resource:
        id: UUID primary key
        name: Human-readable name (1-255 chars)
        description: Optional detailed description (max 2000 chars)
        created_at: Creation timestamp
        updated_at: Last update timestamp
        created_by: UUID of user who created the resource
        updated_by: Optional UUID of user who last updated the resource
        deleted_at: Optional timestamp when resource was soft deleted
        deleted_by: Optional UUID of user who performed the soft delete
        labels: Optional key-value metadata

    """

    __tablename__ = "tool_providers"

    # Override name field from Resource to add unique constraint
    name: str = Field(
        min_length=1,
        max_length=FieldLimits.NAME_MAX_LENGTH,
        description="Human-readable provider name",
        index=True,
        unique=True,
    )

    configuration: dict[str, Any] = Field(sa_type=JSONB, description="Provider-specific configuration")

    enabled: bool = Field(default=True, description="Whether the provider is enabled")

    status: ProviderStatus = Field(default=ProviderStatus.VALIDATING, description="Current status of the provider")

    last_validated_at: datetime | None = Field(
        default=None,
        description="Timestamp of last validation",
        sa_type=DateTime(timezone=True),  # type: ignore[call-overload]
        index=True,
    )

    validation_error: str | None = Field(default=None, description="Error message from last validation attempt")

    tool_count: int = Field(default=0, ge=0, description="Number of tools provided by this provider")

    # Relationships
    tools: list["Tool"] = Relationship(back_populates="provider", cascade_delete=True)

    executions: list["ToolExecution"] = Relationship(back_populates="provider", cascade_delete=True)

    @field_validator("configuration")
    @classmethod
    def validate_configuration(cls, v: dict[str, Any]) -> dict[str, Any]:
        """Validate that configuration contains required provider_type field."""
        if not isinstance(v, dict):
            msg = "configuration must be a dictionary"  # type: ignore[unreachable]
            raise TypeError(msg)

        if "provider_type" not in v:
            msg = "configuration must contain 'provider_type' field"
            raise TypeError(msg)

        provider_type = v.get("provider_type")
        if not isinstance(provider_type, str) or not provider_type.strip():
            msg = "provider_type must be a non-empty string"
            raise TypeError(msg)

        return v
