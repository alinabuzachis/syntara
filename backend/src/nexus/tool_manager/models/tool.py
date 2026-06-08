"""Tool SQLModel definition for database storage.

This module contains the Tool and related SQLModel classes that extend the Resource base class
with tool-specific fields as defined in the OpenAPI specification.
"""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING, Any, ClassVar
from uuid import UUID

from pydantic import ConfigDict, field_validator
from sqlalchemy import Index, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import DateTime, Field, Relationship, SQLModel

from nexus.core.constants import FieldLimits
from nexus.core.exceptions import SafeValueError
from nexus.core.models.base import BaseResource, Resource
from nexus.core.models.pagination import ResourcesResponse
from nexus.core.utils.sqlmodel import postgres_enum_column

if TYPE_CHECKING:
    from nexus.tool_manager.models.tool_provider import ToolProvider


class ToolStatus(str, Enum):
    """Status of a tool."""

    AVAILABLE = "available"
    MISSING = "missing"
    ERROR = "error"


class ToolParameterType(str, Enum):
    """Parameter types for tools."""

    STRING = "string"
    NUMBER = "number"
    BOOLEAN = "boolean"
    OBJECT = "object"
    ARRAY = "array"


class ToolParameter(BaseResource, table=True):
    """Tool parameter definition stored in database.

    Represents a parameter that a tool accepts, with its type, validation rules,
    and example values.

    Inherits from BaseResource:
        id: UUID primary key
        created_at: Creation timestamp
        updated_at: Last update timestamp
        labels: Optional key-value metadata
    """

    __tablename__ = "tool_parameters"

    tool_id: UUID = Field(foreign_key="tools.id", ondelete="CASCADE", index=True)

    name: str = Field(
        min_length=1,
        max_length=FieldLimits.PARAMETER_NAME_MAX_LENGTH,
        sa_type=String(FieldLimits.PARAMETER_NAME_MAX_LENGTH),  # type: ignore[call-overload]
        description="Parameter name",
    )

    type: ToolParameterType = Field(
        sa_column=postgres_enum_column(
            ToolParameterType,
            "tool_parameter_type",
        ),
        description="Parameter type",
    )

    description: str = Field(
        sa_type=Text(),  # type: ignore[call-overload]
        description="Parameter description",
    )

    required: bool = Field(description="Whether this parameter is required")

    default_value: dict[str, Any] | None = Field(
        default=None, sa_type=JSONB, description="Default value for the parameter"
    )

    example_value: dict[str, Any] | None = Field(
        default=None, sa_type=JSONB, description="Example value for the parameter"
    )

    # Relationships
    tool: "Tool" = Relationship(back_populates="parameters")

    model_config: ClassVar[ConfigDict] = ConfigDict(
        extra="forbid",  # Reject unknown fields
    )


class ToolBase(Resource):
    """Tool base model.

    Represents a tool provided by an external tool provider.
    Extends the Resource base class with tool-specific fields.

    Attributes:
        provider_id: UUID of the associated tool provider
        namespaced_name: Unique namespaced name for the tool (max 200 chars)
        enabled: Whether the tool is enabled (default: True)
        status: Current status of the tool (default: available)
        last_executed_at: Timestamp of last execution (nullable)
        last_refreshed_at: Timestamp of last refresh from provider (nullable)
        refresh_error: Error message from last refresh attempt (nullable)

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

    provider_id: UUID = Field(
        foreign_key="tool_providers.id",
        ondelete="CASCADE",
        description="UUID of the associated tool provider",
        index=True,
    )

    namespaced_name: str = Field(
        min_length=1,
        max_length=FieldLimits.NAMESPACED_NAME_MAX_LENGTH,
        sa_type=String(FieldLimits.NAMESPACED_NAME_MAX_LENGTH),  # type: ignore[call-overload]
        description="Unique namespaced name for the tool",
        index=True,
    )

    enabled: bool = Field(default=True, description="Whether the tool is enabled", index=True)

    status: ToolStatus = Field(
        default=ToolStatus.AVAILABLE,
        sa_column=postgres_enum_column(
            ToolStatus,
            "tool_status",
            index=True,
        ),
        description="Current status of the tool",
    )

    last_executed_at: datetime | None = Field(
        default=None,
        description="Timestamp of last execution",
        sa_type=DateTime(timezone=True),  # type: ignore[call-overload]
        index=True,
    )

    last_refreshed_at: datetime | None = Field(
        default=None,
        description="Timestamp of last refresh from provider",
        sa_type=DateTime(timezone=True),  # type: ignore[call-overload]
        index=True,
    )

    refresh_error: str | None = Field(
        default=None,
        sa_type=Text(),  # type: ignore[call-overload]
        description="Error message from last refresh attempt",
    )

    model_config: ClassVar[ConfigDict] = ConfigDict(
        extra="forbid",  # Reject unknown fields
    )  # type: ignore[assignment]


class Tool(ToolBase, table=True):
    """Tool database model."""

    __tablename__ = "tools"

    # Define filterable fields for API endpoints - extend base Resource fields
    __filterable_fields__: ClassVar[list[str]] = [
        *Resource.__filterable_fields__,
        "enabled",
        "status",
        "provider_id",
        "namespaced_name",
    ]

    # Define sortable fields for API endpoints - extend base Resource fields
    __sortable_fields__: ClassVar[list[str]] = [
        *Resource.__sortable_fields__,
        "status",
    ]

    # Relationships
    parameters: list["ToolParameter"] = Relationship(back_populates="tool", cascade_delete=True)

    provider: "ToolProvider" = Relationship(back_populates="tools")

    # Table arguments for partial unique constraint and composite indexes
    __table_args__ = (
        # Partial unique index for namespaced_name (only for non-deleted tools)
        Index(
            "ix_tools_namespaced_name_unique",
            "namespaced_name",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
        # Composite index for pagination queries
        Index("ix_tools_created_at_id", "created_at", "id"),
        # Composite index for provider queries with pagination
        Index("ix_tools_provider_id_created_at_id", "provider_id", "created_at", "id"),
    )

    @field_validator("namespaced_name")
    @classmethod
    def validate_namespaced_name(cls, v: str) -> str:
        """Validate that namespaced_name is not empty."""
        if not v or not v.strip():
            msg = "namespaced_name cannot be empty"
            raise SafeValueError(msg)
        return v.strip()

    model_config: ClassVar[ConfigDict] = ConfigDict(
        extra="forbid",  # Reject unknown fields
    )


# ============================================================================
# API Request/Response Schemas
# ============================================================================


class ToolWithParameters(ToolBase):
    """Schema for Tool response with ToolParameter details."""

    parameters: list[ToolParameter] = Field(..., description="Tool parameters")


class ToolUpdate(SQLModel):
    """Model for updating tool configuration."""

    enabled: bool | None = Field(default=None, description="Whether the tool is enabled")
    status: ToolStatus | None = Field(default=None, description="Current status of the tool")
    refresh_error: str | None = Field(default=None, description="Error message from last refresh attempt")

    model_config: ClassVar[ConfigDict] = ConfigDict(
        extra="forbid",  # Reject unknown fields
    )  # type: ignore[assignment]


# ============================================================================
# List Response
# ============================================================================


class ToolListResponse(ResourcesResponse[ToolWithParameters]):
    """Paginated list response for tools."""
