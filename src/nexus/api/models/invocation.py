"""SQLAlchemy ORM model for invocations table."""

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import DateTime, Uuid

from nexus.api.models.base import Base, TimestampMixin, generate_uuid


class Invocation(Base, TimestampMixin):
    """ORM model for async workflow invocations.

    Attributes:
        id: Primary key UUID
        prompt: Natural language user request
        user_id: User identifier for authentication
        session_id: Session identifier for multi-tenant isolation
        status: Current invocation status (running, paused, cancelled, completed, failed)
        created_at: Timestamp when invocation was created
        started_at: Timestamp when workflow execution started
        completed_at: Timestamp when workflow completed
        updated_at: Timestamp of last update
        context_data: JSONB additional context for the request
        result: JSONB workflow result data
        error_message: Error message if invocation failed
        checkpoint_data: JSONB checkpoint data for pause/resume

    """

    __tablename__ = "invocations"

    # Primary key
    id: Mapped[UUID] = mapped_column(
        Uuid,
        primary_key=True,
        default=generate_uuid,
    )

    # Required fields
    prompt: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    user_id: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    session_id: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="running",
    )

    # Optional timestamp fields
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
    )

    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
    )

    # JSONB fields
    context_data: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
    )

    result: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB,
        nullable=True,
        default=None,
    )

    checkpoint_data: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB,
        nullable=True,
        default=None,
    )

    # Optional text fields
    error_message: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        default=None,
    )

    # Indexes
    __table_args__ = (
        # Index for status queries
        Index("ix_invocations_status", "status"),
        # Index for user_id queries
        Index("ix_invocations_user_id", "user_id"),
        # Index for session_id queries
        Index("ix_invocations_session_id", "session_id"),
        # Composite index for user + status queries
        Index("ix_invocations_user_id_status", "user_id", "status"),
        # Index for created_at for sorting
        Index("ix_invocations_created_at", "created_at"),
    )

    def __repr__(self) -> str:
        """Return string representation of Invocation.

        Returns:
            String representation

        """
        return f"<Invocation(id={self.id}, status={self.status})>"
