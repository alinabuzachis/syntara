"""Execution SQLModel for workflow runtime instances.

This module provides the Execution table model and API request/response schemas following
SQLModel Pattern 1 (separate models with table=False for API operations).
"""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING, Any, ClassVar
from uuid import UUID

from pydantic import ConfigDict
from sqlalchemy import BigInteger, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import CheckConstraint, Column, DateTime, Field, Index, Relationship, SQLModel

from nexus.core.constants import FieldLimits
from nexus.core.models.base import ResourcesResponse, SoftDeletableResource, UserOwnedResource
from nexus.core.utils.sqlmodel import postgres_enum_column

if TYPE_CHECKING:
    from nexus.workflows.models.activity_execution import ActivityExecution
    from nexus.workflows.models.workflow import Workflow
    from nexus.workflows.models.workflow_version import WorkflowVersion


class ExecutionStatus(str, Enum):
    """Execution status enumeration."""

    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class Execution(UserOwnedResource, SoftDeletableResource, table=True):
    """Execution model representing workflow runtime instances.

    Combines UserOwnedResource and SoftDeletableResource (both extend BaseResource)
    with execution-specific fields for tracking workflow execution state and results.

    Attributes:
        id: Primary key UUID (from BaseResource)
        created_at: Timestamp when execution was created/started (from BaseResource)
        updated_at: Timestamp of last update (from BaseResource)
        labels: JSONB key-value labels for categorization (from BaseResource)
        created_by: UUID of user who created/started this execution (from UserOwnedResource)
        updated_by: UUID of user who last updated this execution (from UserOwnedResource)
        deleted_at: Soft delete timestamp (from SoftDeletableResource)
        deleted_by: UUID of user who performed soft delete (from SoftDeletableResource)
        workflow_id: Foreign key to parent Workflow
        workflow_version_id: Foreign key to WorkflowVersion executed
        temporal_workflow_id: Temporal workflow ID for orchestration
        status: Current execution status (ExecutionStatus enum)
        completed_at: Timestamp when execution completed/failed/cancelled
        input_data: Input data passed to workflow execution (JSONB)
        error_details: Error message if execution failed
        last_processed_event_id: Last Temporal event ID processed (internal, for incremental sync)

    Relationships:
        workflow: Parent workflow
        workflow_version: Specific version executed
        creator: User who created (started) the execution (from UserOwnedResource)
        updater: User who last updated the execution (from UserOwnedResource)

    """

    __tablename__ = "executions"

    # Define filterable fields for API endpoints - extend base class fields (deduplicated)
    __filterable_fields__: ClassVar[list[str]] = list(
        dict.fromkeys(
            [
                *UserOwnedResource.__filterable_fields__,
                *SoftDeletableResource.__filterable_fields__,
                "workflow_id",
                "status",
                "completed_at",
            ]
        )
    )

    # Define sortable fields for API endpoints - extend base class fields (deduplicated)
    __sortable_fields__: ClassVar[list[str]] = list(
        dict.fromkeys(
            [
                *UserOwnedResource.__sortable_fields__,
                *SoftDeletableResource.__sortable_fields__,
                "completed_at",
                "status",
            ]
        )
    )

    # Foreign keys
    workflow_id: UUID = Field(
        foreign_key="workflows.id",
        nullable=False,
        ondelete="RESTRICT",
        description="Workflow ID being executed",
        index=True,
    )

    workflow_version_id: UUID = Field(
        foreign_key="workflow_versions.id",
        nullable=False,
        ondelete="RESTRICT",
        description="Workflow version ID executed",
    )

    # Temporal workflow ID
    temporal_workflow_id: str = Field(
        min_length=1,
        max_length=FieldLimits.NAME_MAX_LENGTH,
        sa_type=String(FieldLimits.NAME_MAX_LENGTH),  # type: ignore[call-overload]
        nullable=False,
        unique=True,
        index=True,
        description="Temporal workflow ID for orchestration",
    )

    # Status
    status: ExecutionStatus = Field(
        default=ExecutionStatus.PENDING,
        description="Current execution status",
        sa_column=postgres_enum_column(
            ExecutionStatus,
            "workflowexecutionstatus",
            index=True,
            create_constraint=True,
            server_default=text("'pending'::workflowexecutionstatus"),
        ),
    )

    # Completion timestamp
    completed_at: datetime | None = Field(
        default=None,
        nullable=True,
        sa_type=DateTime(timezone=True),  # type: ignore[call-overload]
        description="Timestamp when execution completed/failed/cancelled",
    )

    # Input data and error details
    input_data: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False, server_default=text("'{}'::jsonb")),
        description="Input data for workflow execution",
    )

    error_details: str | None = Field(
        default=None,
        nullable=True,
        sa_type=Text(),  # type: ignore[call-overload]
        description="Error message if execution failed",
    )

    # Incremental sync tracking (internal use only, not exposed in API)
    last_processed_event_id: int = Field(
        default=0,
        sa_column=Column(BigInteger, nullable=False, server_default=text("0")),
        description="Last Temporal event ID processed for incremental activity sync (0 = never synced)",
    )

    # Relationships
    workflow: "Workflow" = Relationship(
        back_populates="executions",
        sa_relationship_kwargs={"foreign_keys": "[Execution.workflow_id]"},
    )

    workflow_version: "WorkflowVersion" = Relationship(
        back_populates="executions",
        sa_relationship_kwargs={"foreign_keys": "[Execution.workflow_version_id]"},
    )

    activities: list["ActivityExecution"] = Relationship(back_populates="execution")

    # Note: creator and updater relationships inherited from UserOwnedResource
    # creator = User who started the execution (created_by)
    # updater = User who last modified the execution (updated_by)

    # Table arguments for indexes and constraints
    __table_args__ = (
        # Check constraint for timestamp validation
        CheckConstraint(
            "completed_at IS NULL OR completed_at > created_at",
            name="check_execution_completed_at_after_created_at",
        ),
        # Composite indexes for query performance
        Index("ix_executions_workflow_id_status", "workflow_id", "status"),
        Index("ix_executions_created_by_created_at", "created_by", "created_at"),
        # GIN index for JSONB labels
        Index(
            "ix_executions_labels",
            "labels",
            postgresql_using="gin",
        ),
    )

    def __repr__(self) -> str:
        """Return string representation of Execution.

        Returns:
            String representation

        """
        return f"<Execution(id={self.id}, workflow_id={self.workflow_id}, status={self.status.value})>"


# ============================================================================
# API Request/Response Schemas (Pattern 1: Separate models with table=False)
# ============================================================================


class ExecutionCreate(SQLModel):
    """Schema for creating a new execution (POST /executions).

    Excludes auto-generated fields: id, created_at, created_by (set by backend).
    """

    workflow_id: UUID = Field(..., description="Workflow ID to execute")
    input_data: dict[str, Any] = Field(default_factory=dict, description="Input data for workflow execution")


class CurrentActivity(SQLModel):
    """Currently executing activity information."""

    activity_name: str = Field(..., description="Name of the activity")
    temporal_activity_id: str = Field(..., description="Temporal activity ID")
    iteration: int | None = Field(None, description="Iteration number for loops")


class ExecutionRead(SQLModel):
    """Schema for execution response (GET /executions/{id}).

    Includes all fields from the database table model.
    """

    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)  # type: ignore[assignment]

    id: UUID
    workflow_id: UUID
    workflow_version_id: UUID
    temporal_workflow_id: str
    status: ExecutionStatus
    created_by: UUID  # User who started the execution
    created_at: datetime  # Timestamp when execution was created/started
    completed_at: datetime | None
    updated_at: datetime
    updated_by: UUID | None  # User who last modified the execution
    input_data: dict[str, Any]
    error_details: str | None
    labels: dict[str, Any] = Field(default_factory=dict)
    current_activities: list[CurrentActivity] = Field(
        default_factory=list, description="Currently executing activities"
    )
    deleted_at: datetime | None = None
    deleted_by: UUID | None = None


# ============================================================================
# List Response Schema
# ============================================================================

ExecutionListResponse = ResourcesResponse[ExecutionRead]
