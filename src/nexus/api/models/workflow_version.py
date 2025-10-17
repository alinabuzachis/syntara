"""WorkflowVersion model for workflow version history."""

from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from nexus.api.models.base import Base, SoftDeleteMixin, TimestampMixin, generate_uuid

if TYPE_CHECKING:
    from nexus.api.models.user import User
    from nexus.api.models.workflow import Workflow


class WorkflowVersion(Base, TimestampMixin, SoftDeleteMixin):
    """WorkflowVersion model for maintaining version history.

    Attributes:
        id: Primary key UUID
        workflow_id: Foreign key to Workflow
        version: Version number (auto-incremented per workflow)
        schema_version: Workflow schema version (e.g., "1.0.0")
        workflow_definition: Complete workflow definition as dict (stored in JSONB column)
        created_by: Foreign key to User who created this version
        created_at: Timestamp of version creation
        change_description: Optional description of changes in this version
        deleted_at: Soft delete timestamp
        deleted_by: User who performed soft delete

    Relationships:
        workflow: Parent workflow
        creator: User who created this version

    """

    __tablename__ = "workflow_versions"

    # Primary key
    id: Mapped[UUID] = mapped_column(
        Uuid,
        primary_key=True,
        default=generate_uuid,
    )

    # Required fields
    workflow_id: Mapped[UUID] = mapped_column(
        ForeignKey("workflows.id", ondelete="RESTRICT"),
        nullable=False,
    )

    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    schema_version: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    workflow_definition: Mapped[dict[str, Any]] = mapped_column(
        postgresql.JSONB(astext_type=Text()),
        nullable=False,
    )

    created_by: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )

    # Optional fields
    change_description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        default=None,
    )

    deleted_by: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
        default=None,
    )

    # Relationships
    workflow: Mapped["Workflow"] = relationship(
        "Workflow",
        foreign_keys=[workflow_id],
        back_populates="versions",
        lazy="select",
    )

    creator: Mapped["User"] = relationship(
        "User",
        foreign_keys=[created_by],
        lazy="select",
    )

    # Indexes and constraints
    __table_args__ = (
        # Unique constraint on (workflow_id, version)
        Index(
            "ix_workflow_versions_workflow_version",
            "workflow_id",
            "version",
            unique=True,
        ),
        # Index for version history queries
        Index("ix_workflow_versions_workflow_created", "workflow_id", "created_at"),
        # Index for schema version queries
        Index("ix_workflow_versions_schema_version", "schema_version"),
    )

    def __repr__(self) -> str:
        """Return string representation of WorkflowVersion.

        Returns:
            String representation

        """
        return f"<WorkflowVersion(id={self.id}, workflow_id={self.workflow_id}, version={self.version})>"
