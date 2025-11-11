"""ToolProvider SQLModel definition for database storage.

This module contains the ToolProvider SQLModel class that extends the Resource base class
with tool provider specific fields as defined in the OpenAPI specification.
"""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING, Any, ClassVar

from pydantic import ConfigDict, field_validator
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import DateTime, Field, Relationship, SQLModel

from nexus.core.constants import FieldLimits
from nexus.core.models import Resource, ResourcesResponse
from nexus.core.models.base import NamedResource
from nexus.core.utils.sqlmodel import postgres_enum_column

if TYPE_CHECKING:
    from nexus.tool_manager.models.tool import Tool


def _validate_provider_configuration(v: dict[str, Any]) -> dict[str, Any]:
    """Shared validation logic for provider configuration."""
    if not isinstance(v, dict):
        msg = "configuration must be a dictionary"  # type: ignore[unreachable]
        raise ValueError(msg)  # noqa: TRY004

    if "provider_type" not in v:
        msg = "configuration must contain 'provider_type' field"
        raise ValueError(msg)

    provider_type = v.get("provider_type")
    if not isinstance(provider_type, str) or not provider_type.strip():
        msg = "provider_type must be a non-empty string"
        raise ValueError(msg)

    return v


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
            raise ValueError(msg)
        return v

    model_config: ClassVar[ConfigDict] = ConfigDict(
        extra="forbid",  # Reject unknown fields
    )  # type: ignore[assignment]


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

    # Define filterable fields for API endpoints - extend base Resource fields
    __filterable_fields__: ClassVar[list[str]] = [
        *Resource.__filterable_fields__,
        "status",
        "enabled",
        "provider_type",
        "configuration.provider_type",
        "configuration.base_url",
    ]

    # Define sortable fields for API endpoints - extend base Resource fields
    __sortable_fields__: ClassVar[list[str]] = [
        *Resource.__sortable_fields__,
        "status",
        "enabled",
    ]

    # Override name field from Resource to add unique constraint
    name: str = Field(
        min_length=1,
        max_length=FieldLimits.NAME_MAX_LENGTH,
        description="Human-readable provider name",
        index=True,
        unique=True,
    )

    configuration: dict[str, Any] = Field(sa_type=JSONB, description="Provider-specific configuration")

    enabled: bool = Field(default=True, description="Enable/disable the provider")

    status: ProviderStatus = Field(
        default=ProviderStatus.VALIDATING,
        sa_column=postgres_enum_column(
            ProviderStatus,
            "tool_provider_status",
            index=True,
        ),
        description="Current status of the provider",
    )

    last_validated_at: datetime | None = Field(
        default=None,
        description="Timestamp of last validation",
        sa_type=DateTime(timezone=True),  # type: ignore[call-overload]
        index=True,
    )

    validation_error: str | None = Field(default=None, description="Error message from last validation attempt")

    # Relationships
    tools: list["Tool"] = Relationship(back_populates="provider", cascade_delete=True)

    @field_validator("configuration")
    @classmethod
    def validate_configuration(cls, v: dict[str, Any]) -> dict[str, Any]:
        """Validate configuration using shared validation logic."""
        return _validate_provider_configuration(v)


class ToolProviderCreate(NamedResource):
    """ToolProviderCreate model for creating new tool providers.

    Extends NamedResource with provider-specific configuration field.
    This model is used for API requests when creating new tool providers.

    Attributes:
        configuration: Provider-specific configuration (required)

    Inherits from NamedResource:
        name: Human-readable name (required, 1-255 chars)
        description: Optional detailed description (max 2000 chars)

    Inherits from BaseResource:
        id: UUID primary key
        created_at: Creation timestamp
        updated_at: Last update timestamp
        labels: Optional key-value metadata

    """

    configuration: dict[str, Any] = Field(description="Provider-specific configuration")

    @field_validator("configuration")
    @classmethod
    def validate_configuration(cls, v: dict[str, Any]) -> dict[str, Any]:
        """Validate configuration using shared validation logic."""
        return _validate_provider_configuration(v)


class ToolProviderPatch(SQLModel):
    """ToolProviderPatch model for partially updating tool providers.

    All fields are optional to support.
    This model is used for API PATCH requests when updating existing tool providers.

    Attributes:
        name: Optional human-readable name (1-255 chars)
        description: Optional detailed description (max 2000 chars)
        configuration: Optional provider-specific configuration

    """

    name: str | None = Field(
        default=None,
        min_length=1,
        max_length=FieldLimits.NAME_MAX_LENGTH,
        description="Human-readable name for the provider",
    )

    description: str | None = Field(
        default=None,
        max_length=FieldLimits.DESCRIPTION_MAX_LENGTH,
        description="Detailed description of the provider",
    )

    configuration: dict[str, Any] | None = Field(
        default=None,
        description="Provider-specific configuration",
    )

    enabled: bool | None = Field(default=None, description="Enable/disable the provider")

    @field_validator("configuration")
    @classmethod
    def validate_configuration(cls, v: dict[str, Any]) -> dict[str, Any]:
        """Validate configuration using shared validation logic."""
        return _validate_provider_configuration(v)

    model_config: ClassVar[ConfigDict] = ConfigDict(
        extra="forbid",  # Reject unknown fields
    )  # type: ignore[assignment]


# Type alias for ToolProvider list responses using the standard pagination model
ToolProviderListResponse = ResourcesResponse[ToolProvider]
