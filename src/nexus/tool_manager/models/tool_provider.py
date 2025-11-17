"""ToolProvider SQLModel definition for database storage.

This module contains the ToolProvider SQLModel class that extends the Resource base class
with tool provider specific fields as defined in the OpenAPI specification.
"""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING, ClassVar

from pydantic import ConfigDict
from sqlalchemy import Index, String, Text, text
from sqlmodel import DateTime, Field, Relationship, SQLModel

from nexus.core.constants import FieldLimits
from nexus.core.models import Resource, ResourcesResponse
from nexus.core.utils.sqlmodel import DiscriminatedJSONB, postgres_enum_column
from nexus.tool_manager.models.tool_provider_configuration import ProviderConfiguration, ProviderConfigurationTypes

if TYPE_CHECKING:
    from nexus.tool_manager.models.tool import Tool


class ProviderStatus(str, Enum):
    """Status of a tool provider."""

    AVAILABLE = "available"
    ERROR = "error"
    VALIDATING = "validating"


class ToolProviderBase(Resource):
    """ToolProvider base model.

    Represents an external tool provider that can provide multiple tools.
    Extends the Resource base class with provider-specific fields.

    Attributes:
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

    # Override name field from Resource - unique constraint handled in __table_args__
    name: str = Field(
        min_length=1,
        max_length=FieldLimits.NAME_MAX_LENGTH,
        sa_type=String(FieldLimits.NAME_MAX_LENGTH),  # type: ignore[call-overload]
        description="Human-readable provider name",
        index=True,
    )

    enabled: bool = Field(default=True, description="Enable/disable the provider", index=True)

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

    validation_error: str | None = Field(
        default=None,
        sa_type=Text(),  # type: ignore[call-overload]
        description="Error message from last validation attempt",
    )


class ToolProvider(ToolProviderBase, table=True):
    """ToolProvider database model."""

    __tablename__ = "tool_providers"

    # Define filterable fields for API endpoints - extend base Resource fields
    __filterable_fields__: ClassVar[list[str]] = [
        *Resource.__filterable_fields__,
        "status",
        "enabled",
        "provider_type",
        "configuration.provider_type",
    ]

    # Define sortable fields for API endpoints - extend base Resource fields
    __sortable_fields__: ClassVar[list[str]] = [
        *Resource.__sortable_fields__,
        "status",
        "enabled",
    ]

    configuration: ProviderConfigurationTypes = Field(
        sa_type=DiscriminatedJSONB(ProviderConfiguration),  # type: ignore[call-overload]
        description="Provider-specific configuration",
    )

    # Relationships
    tools: list["Tool"] = Relationship(back_populates="provider", cascade_delete=True)

    # Table arguments for partial unique constraint
    __table_args__ = (
        # Partial unique index for name (only for non-deleted providers)
        Index(
            "ix_tool_providers_name_unique",
            "name",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
        # Composite index for pagination queries
        Index("ix_tool_providers_created_at_id", "created_at", "id"),
    )


# ============================================================================
# API Request/Response Schemas
# ============================================================================


class ToolProviderWithConfiguration(ToolProviderBase):
    """Schema for ToolProvider response with ProviderConfiguration details."""

    configuration: ProviderConfigurationTypes = Field(..., description="ToolProvider configuration")


class ToolProviderCreate(SQLModel):
    """ToolProviderCreate model for creating new tool providers.

    Contains only the fields needed to create a new tool provider.
    This model is used for API requests when creating new tool providers.

    Attributes:
        name: Human-readable name (required, 1-255 chars)
        description: Optional detailed description (max 2000 chars)
        configuration: Provider configuration (required)

    """

    name: str = Field(
        min_length=1, max_length=FieldLimits.NAME_MAX_LENGTH, description="Human-readable name for the provider"
    )

    description: str | None = Field(
        default=None, max_length=FieldLimits.DESCRIPTION_MAX_LENGTH, description="Detailed description of the provider"
    )

    configuration: ProviderConfiguration = Field(description="Provider configuration", discriminator="provider_type")


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

    configuration: ProviderConfiguration | None = Field(
        default=None,
        description="Provider-specific configuration",
        discriminator="provider_type",
    )

    enabled: bool | None = Field(default=None, description="Enable/disable the provider")

    model_config: ClassVar[ConfigDict] = ConfigDict(
        extra="forbid",  # Reject unknown fields
    )  # type: ignore[assignment]


# ============================================================================
# List Response Type Alias
# ============================================================================

ToolProviderListResponse = ResourcesResponse[ToolProviderWithConfiguration]
