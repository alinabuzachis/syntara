"""WorkflowVersion SQLModel for workflow version history.

This module provides the WorkflowVersion table model and API response schemas following
SQLModel Pattern 1 (separate models with table=False for API operations).
"""

from datetime import datetime
from typing import TYPE_CHECKING, Any, ClassVar
from uuid import UUID

from pydantic import ConfigDict
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, Index, Relationship, SQLModel

from nexus.core.models.base import SoftDeletableResource, UserOwnedResource

if TYPE_CHECKING:
    from nexus.workflows.models.workflow import Workflow


class WorkflowVersion(UserOwnedResource, SoftDeletableResource, table=True):
    """WorkflowVersion model for maintaining version history.

    Combines UserOwnedResource and SoftDeletableResource (both extend BaseResource)
    with version-specific fields for tracking workflow definition evolution.

    Attributes:
        id: Primary key UUID (from BaseResource)
        created_at: Timestamp of version creation (from BaseResource)
        updated_at: Timestamp of last update (from BaseResource)
        labels: Optional key-value metadata (from BaseResource)
        created_by: UUID of user who created this version (from UserOwnedResource)
        updated_by: UUID of user who last updated this version (from UserOwnedResource)
        deleted_at: Soft delete timestamp (from SoftDeletableResource)
        deleted_by: UUID of user who performed soft delete (from SoftDeletableResource)
        workflow_id: Foreign key to parent Workflow
        version: Version number (auto-incremented per workflow)
        schema_version: Workflow schema version (e.g., "1.0.0")
        workflow_definition: Complete workflow definition as dict (JSONB)
        change_description: Optional description of changes in this version

    Relationships:
        workflow: Parent workflow

    """

    __tablename__ = "workflow_versions"

    # Foreign key to Workflow
    workflow_id: UUID = Field(
        foreign_key="workflows.id",
        description="Parent workflow ID",
        index=True,
    )

    # Version fields
    version: int = Field(
        description="Version number (increments per workflow)",
        index=True,
    )

    schema_version: str = Field(
        max_length=50,
        description="Workflow schema version (e.g., '1.0.0')",
        index=True,
    )

    workflow_definition: dict[str, Any] = Field(
        sa_type=JSONB,
        description="Complete workflow definition as JSONB",
    )

    change_description: str | None = Field(
        default=None,
        max_length=2000,
        description="Description of changes in this version",
    )

    # Relationships
    workflow: "Workflow" = Relationship(back_populates="versions")

    # Table arguments for indexes and constraints
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
    )

    def __repr__(self) -> str:
        """Return string representation of WorkflowVersion.

        Returns:
            String representation

        """
        return f"<WorkflowVersion(id={self.id}, workflow_id={self.workflow_id}, version={self.version})>"


# ============================================================================
# API Response Schemas (Pattern 1: Separate models with table=False)
# Note: WorkflowVersion is read-only, so no Create/Update schemas needed
# ============================================================================


class WorkflowVersionRead(SQLModel):
    """Schema for workflow version response (GET /workflows/{id}/versions/{version}).

    WorkflowVersion entities are read-only and managed automatically by the system.
    Note: deleted_at and deleted_by are None since soft-deleted versions are excluded from queries.
    """

    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)  # type: ignore[assignment]

    id: UUID
    workflow_id: UUID
    version: int
    schema_version: str
    workflow_definition: dict[str, Any]
    change_description: str | None = None
    created_by: UUID
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None
    deleted_by: UUID | None = None


class WorkflowVersionListResponse(SQLModel):
    """Schema for workflow version list response."""

    versions: list[WorkflowVersionRead]


# Rebuild models to resolve forward references
# This is needed because WorkflowReadWithVersion references WorkflowVersionRead
# which is defined in this module, creating a circular dependency.
from nexus.workflows.models.workflow import WorkflowReadWithVersion  # noqa: E402

WorkflowReadWithVersion.model_rebuild()
