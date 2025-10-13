"""Workflow model for workflow definitions and metadata."""

from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from nexus_api.models.base import Base, SoftDeleteMixin, TimestampMixin, generate_uuid

if TYPE_CHECKING:
    from nexus_api.models.user import User
    from nexus_api.models.workflow_version import WorkflowVersion


class Workflow(Base, TimestampMixin, SoftDeleteMixin):
    """Workflow model representing complete automation processes.

    Attributes:
        id: Primary key UUID
        name: Human-readable workflow name (unique across non-deleted)
        description: Optional workflow description
        labels: JSONB key-value labels for categorization
        current_version: Current active version number
        created_by: Foreign key to User who created this workflow
        created_at: Timestamp of workflow creation
        updated_at: Timestamp of last update
        is_enabled: Whether workflow is enabled for execution
        deleted_at: Soft delete timestamp
        deleted_by: User who performed soft delete

    Relationships:
        creator: User who created this workflow
        versions: All versions of this workflow

    """

    __tablename__ = "workflows"

    # Primary key
    id: Mapped[UUID] = mapped_column(
        Uuid,
        primary_key=True,
        default=generate_uuid,
    )

    # Required fields
    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        unique=False,  # Uniqueness enforced via partial index
    )

    # Optional fields
    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        default=None,
    )

    labels: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
    )

    current_version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
    )

    is_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )

    # Foreign keys
    created_by: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )

    deleted_by: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
        default=None,
    )

    # Relationships
    creator: Mapped["User"] = relationship(
        "User",
        foreign_keys=[created_by],
        back_populates="created_workflows",
        lazy="select",
    )

    versions: Mapped[list["WorkflowVersion"]] = relationship(
        "WorkflowVersion",
        foreign_keys="WorkflowVersion.workflow_id",
        back_populates="workflow",
        lazy="select",
        cascade="all, delete-orphan",
    )

    # Indexes and constraints
    __table_args__ = (
        # Index for creator queries
        Index("ix_workflows_created_by", "created_by"),
        # Composite index for creator + enabled status
        Index("ix_workflows_created_by_enabled", "created_by", "is_enabled"),
        # GIN index on labels for JSONB containment queries
        Index(
            "ix_workflows_labels",
            "labels",
            postgresql_using="gin",
        ),
        # Partial unique index for name (only for non-deleted workflows)
        Index(
            "ix_workflows_name_unique",
            "name",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    def __repr__(self) -> str:
        """Return string representation of Workflow.

        Returns:
            String representation

        """
        return f"<Workflow(id={self.id}, name={self.name}, version={self.current_version})>"

    def increment_version(self) -> int:
        """Increment current version and return new version number.

        Returns:
            New version number

        """
        self.current_version += 1
        return self.current_version
