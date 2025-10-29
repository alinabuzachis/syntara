"""Tool SQLModel definition for database storage.

This module contains the Tool and related SQLModel classes that extend the Resource base class
with tool-specific fields as defined in the OpenAPI specification.
"""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING, Any, ClassVar
from uuid import UUID

from pydantic import ConfigDict, field_validator
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import DateTime, Field, Relationship, SQLModel

from nexus.core.models import Resource
from nexus.core.models.base import BaseResource

if TYPE_CHECKING:
    from nexus.tool_manager.models.tool_execution import ToolExecution
    from nexus.tool_manager.models.tool_provider import ToolProvider


class ToolStatus(str, Enum):
    """Status of a tool."""

    AVAILABLE = "available"
    MISSING = "missing"
    ERROR = "error"
    DISABLED = "disabled"


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

    tool_id: UUID = Field(foreign_key="tools.id", index=True)

    name: str = Field(max_length=100, description="Parameter name")

    type: ToolParameterType = Field(description="Parameter type")

    description: str = Field(description="Parameter description")

    required: bool = Field(description="Whether this parameter is required")

    default_value: dict[str, Any] | None = Field(
        default=None, sa_type=JSONB, description="Default value for the parameter"
    )

    example_value: dict[str, Any] | None = Field(
        default=None, sa_type=JSONB, description="Example value for the parameter"
    )

    # Relationships
    tool: "Tool" = Relationship(back_populates="parameters")


class Tool(Resource, table=True):
    """Tool database model.

    Represents a tool provided by an external tool provider.
    Extends the Resource base class with tool-specific fields.

    Attributes:
        provider_id: UUID of the associated tool provider
        namespaced_name: Unique namespaced name for the tool (max 200 chars)
        enabled: Whether the tool is enabled (default: True)
        status: Current status of the tool (default: available)
        execution_count: Number of times this tool has been executed (default: 0)
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

    __tablename__ = "tools"

    provider_id: UUID = Field(
        foreign_key="tool_providers.id", description="UUID of the associated tool provider", index=True
    )

    namespaced_name: str = Field(
        max_length=200, description="Unique namespaced name for the tool", index=True, unique=True
    )

    enabled: bool = Field(default=True, description="Whether the tool is enabled")

    status: ToolStatus = Field(default=ToolStatus.AVAILABLE, description="Current status of the tool")

    execution_count: int = Field(default=0, ge=0, description="Number of times this tool has been executed")

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

    refresh_error: str | None = Field(default=None, description="Error message from last refresh attempt")

    # Relationships
    parameters: list["ToolParameter"] = Relationship(back_populates="tool", cascade_delete=True)

    executions: list["ToolExecution"] = Relationship(back_populates="tool", cascade_delete=True)

    provider: "ToolProvider" = Relationship(back_populates="tools")

    @field_validator("namespaced_name")
    @classmethod
    def validate_namespaced_name(cls, v: str) -> str:
        """Validate that namespaced_name is not empty."""
        if not v or not v.strip():
            msg = "namespaced_name cannot be empty"
            raise ValueError(msg)
        return v.strip()

    model_config: ClassVar[ConfigDict] = ConfigDict(arbitrary_types_allowed=True)  # type: ignore[assignment]


class ToolUpdate(SQLModel):
    """Model for updating tool configuration."""

    enabled: bool = Field(description="Whether the tool is enabled")

    model_config: ClassVar[ConfigDict] = ConfigDict(
        extra="forbid",  # Reject unknown fields
    )  # type: ignore[assignment]
