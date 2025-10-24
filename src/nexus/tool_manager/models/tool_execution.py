"""Tool metrics models for database storage and summary responses."""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import DateTime, Field, Relationship, SQLModel

from nexus.core.models.base.user_owned import UserOwnedResource

if TYPE_CHECKING:
    from nexus.tool_manager.models.tool import Tool
    from nexus.tool_manager.models.tool_provider import ToolProvider


class ExecutionStatus(str, Enum):
    """Status of a tool execution."""

    RUNNING = "running"
    SUCCESS = "success"
    ERROR = "error"
    TIMEOUT = "timeout"


class ToolExecution(UserOwnedResource, table=True):
    """Tool execution records stored in database.

    Records individual Tool executions for performance monitoring and analysis.
    This model matches the ToolExecution schema from the metrics contract.

    Inherits from UserOwnedResource:
        id: UUID primary key
        created_at: Creation timestamp
        updated_at: Last update timestamp
        created_by: UUID of user who created the resource
        updated_by: Optional UUID of user who last updated the resource
        deleted_at: Optional timestamp when resource was soft deleted
        deleted_by: Optional UUID of user who performed the soft delete
        labels: Optional key-value metadata
    """

    __tablename__ = "tool_executions"

    tool_id: UUID = Field(foreign_key="tools.id", description="Foreign key to Tool", index=True)

    provider_id: UUID = Field(foreign_key="tool_providers.id", description="Foreign key to Tool Provider", index=True)

    user_id: UUID = Field(description="Identifier of executing user/agent", index=True)

    execution_start: datetime = Field(
        description="Execution start timestamp",
        sa_type=DateTime(timezone=True),  # type: ignore[call-overload]
        index=True,
    )

    execution_end: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore[call-overload]
        description="Execution completion timestamp",
    )

    duration_ms: int | None = Field(default=None, ge=0, description="Execution duration in milliseconds")

    status: ExecutionStatus = Field(description="Execution status")

    input_parameters: dict[str, Any] = Field(sa_type=JSONB, description="Tool input parameters")

    output_data: dict[str, Any] | None = Field(default=None, sa_type=JSONB, description="Tool output data")

    error_message: str | None = Field(default=None, description="Error description for failed executions")

    error_code: str | None = Field(default=None, description="Structured error code")

    # Relationships
    tool: "Tool" = Relationship(back_populates="executions")

    provider: "ToolProvider" = Relationship(back_populates="executions")


class ToolMetricsSummary(SQLModel):
    """Summary of tool usage metrics.

    Attributes:
        total_executions: Total number of tool executions
        success_count: Number of successful executions
        failure_count: Number of failed executions
        avg_duration_ms: Average execution duration in milliseconds
        p95_duration_ms: 95th percentile execution duration in milliseconds
        time_window: Time window for the metrics (hour/day/week/month)
        generated_at: Timestamp when metrics were generated

    """

    total_executions: int
    success_count: int
    failure_count: int
    avg_duration_ms: int
    p95_duration_ms: int
    time_window: str
    generated_at: datetime
