"""SQLModel definition for invocations table and related schemas."""

from datetime import datetime
from enum import Enum
from typing import ClassVar

from sqlalchemy import Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import DateTime
from sqlmodel import Field

from nexus.core.constants import FieldLimits
from nexus.core.models.base import ResourcesResponse, UserOwnedResource
from nexus.core.utils.sqlmodel import postgres_enum_column


class InvocationStatus(str, Enum):
    """Status enum for invocation lifecycle."""

    CREATED = "created"
    RUNNING = "running"
    PAUSED = "paused"
    CANCELLED = "cancelled"
    COMPLETED = "completed"
    FAILED = "failed"


class Invocation(UserOwnedResource, table=True):
    """SQLModel for async workflow invocations.

    Attributes:
        id: Primary key UUID (inherited from BaseResource)
        created_at: Timestamp when invocation was created
            (inherited from BaseResource)
        updated_at: Timestamp of last update (inherited from BaseResource)
        created_by: UUID of user who created the invocation
            (inherited from UserOwnedResource)
        updated_by: UUID of user who last updated the invocation
            (inherited from UserOwnedResource)
        labels: Optional key-value metadata (inherited from BaseResource)
        prompt: Natural language user request
        session_id: Session identifier for multi-tenant isolation
        status: Current invocation status (running, paused, cancelled, completed, failed)
        started_at: Timestamp when workflow execution started
        completed_at: Timestamp when workflow completed
        context_data: Additional context for the request
        result: Workflow result data
        error_message: Error message if invocation failed
        checkpoint_data: Checkpoint data for pause/resume

    """

    __tablename__ = "invocations"

    # SQLModel configuration is inherited from base classes

    # Define composite indexes
    __table_args__ = (Index("ix_invocations_created_by_status", "created_by", "status"),)

    # Define filterable fields for API endpoints - extend base UserOwnedResource fields
    __filterable_fields__: ClassVar[list[str]] = [
        *UserOwnedResource.__filterable_fields__,
        "status",
        "session_id",
        "started_at",
        "completed_at",
        "prompt",
    ]

    # Define sortable fields for API endpoints - extend base UserOwnedResource fields
    __sortable_fields__: ClassVar[list[str]] = [
        *UserOwnedResource.__sortable_fields__,
        "started_at",
        "completed_at",
        "status",
    ]

    # Required fields
    prompt: str = Field(
        min_length=1,
        max_length=10000,
        sa_type=Text(),  # type: ignore[call-overload]
        description="Natural language user request",
    )

    session_id: str = Field(
        min_length=1,
        max_length=FieldLimits.NAME_MAX_LENGTH,
        sa_type=String(FieldLimits.NAME_MAX_LENGTH),  # type: ignore[call-overload]
        description="Session identifier for multi-tenant isolation",
        index=True,
    )

    status: InvocationStatus = Field(
        default=InvocationStatus.CREATED,
        sa_column=postgres_enum_column(
            InvocationStatus,
            "invocationstatus",
            index=True,
        ),
        description="Current invocation status",
    )

    # Optional timestamp fields
    started_at: datetime | None = Field(
        default=None,
        description="Timestamp when workflow execution started",
        # SQLAlchemy's DateTime() signature expects no args in stubs,
        # but actually supports timezone parameter at runtime
        sa_type=DateTime(timezone=True),  # type: ignore[call-overload]
    )

    completed_at: datetime | None = Field(
        default=None,
        description="Timestamp when workflow completed",
        # SQLAlchemy's DateTime() signature expects no args in stubs,
        # but actually supports timezone parameter at runtime
        sa_type=DateTime(timezone=True),  # type: ignore[call-overload]
    )

    # JSONB fields
    # Note: context_data may contain:
    # - file_ids: list[str] - File IDs referencing FileMetadata table
    # - Other context fields as needed
    context_data: dict[str, object] = Field(
        default_factory=dict,
        sa_type=JSONB,
        description="Additional context for the request, including file_ids array if files uploaded",
    )

    result: dict[str, object] | None = Field(
        default=None,
        sa_type=JSONB,
        description="Workflow result data",
    )

    checkpoint_data: dict[str, object] | None = Field(
        default=None,
        sa_type=JSONB,
        description="Checkpoint data for pause/resume",
    )

    # Optional text fields
    error_message: str | None = Field(
        default=None,
        sa_type=Text(),  # type: ignore[call-overload]
        description="Error message if invocation failed",
    )

    def __repr__(self) -> str:
        """Return string representation of Invocation.

        Returns:
            String representation

        """
        return f"<Invocation(id={self.id}, status={self.status})>"


# Type alias for invocation list responses using the standard pagination model
InvocationListResponse = ResourcesResponse[Invocation]
