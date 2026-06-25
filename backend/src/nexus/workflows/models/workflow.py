"""Workflow SQLModel for workflow definitions and metadata.

This module provides the Workflow table model and API request/response schemas following
SQLModel Pattern 1 (separate models with table=False for API operations).
"""

from datetime import datetime
from typing import TYPE_CHECKING, Any, ClassVar
from uuid import UUID

from pydantic import ConfigDict
from sqlmodel import CheckConstraint, Field, Index, Relationship, SQLModel, text

from nexus.core.constants import FieldLimits
from nexus.core.models.base import Resource
from nexus.core.models.pagination import ResourcesResponse
from nexus.workflows.models.workflow_definition import WorkflowDefinition

if TYPE_CHECKING:
    from nexus.workflows.models.execution import Execution
    from nexus.workflows.models.workflow_version import WorkflowVersion, WorkflowVersionRead


class Workflow(Resource, table=True):
    """Workflow model representing complete automation processes.

    Extends Resource (which combines NamedResource, UserOwnedResource, and SoftDeletableResource)
    with workflow-specific fields.

    Attributes:
        id: Primary key UUID (from BaseResource)
        name: Human-readable workflow name (from NamedResource, unique across non-deleted)
        description: Optional workflow description (from NamedResource)
        labels: JSONB key-value labels for categorization (from BaseResource)
        created_at: Timestamp of workflow creation (from BaseResource)
        updated_at: Timestamp of last update (from BaseResource)
        created_by: UUID of user who created this workflow (from UserOwnedResource)
        updated_by: UUID of user who last updated this workflow (from UserOwnedResource)
        deleted_at: Soft delete timestamp (from SoftDeletableResource)
        deleted_by: UUID of user who performed soft delete (from SoftDeletableResource)
        current_version: Current active version number
        is_enabled: Whether workflow is enabled for execution

    Relationships:
        versions: All versions of this workflow
        executions: All executions of this workflow

    """

    __tablename__ = "workflows"

    # Define filterable fields for API endpoints - extend base Resource fields
    __filterable_fields__: ClassVar[list[str]] = [
        *Resource.__filterable_fields__,
        "is_builtin",
        "is_enabled",
        "published_version",
        "project_id",
    ]

    # Define sortable fields for API endpoints - extend base Resource fields
    __sortable_fields__: ClassVar[list[str]] = [
        *Resource.__sortable_fields__,
    ]

    # Workflow-specific fields
    current_version: int = Field(
        default=1,
        description="Current active version number",
        index=True,
    )

    is_enabled: bool = Field(
        default=False,
        description="Derived field: True when a version is published. Managed by publish/unpublish.",
        index=True,
    )

    published_version: int | None = Field(
        default=None,
        description="Version number of the currently published version",
        index=True,
    )

    is_builtin: bool = Field(
        default=False,
        description="Whether this is a built-in workflow",
        index=True,
        sa_column_kwargs={"server_default": text("false")},
    )

    project_id: UUID = Field(
        foreign_key="projects.id",
        description="Project namespace for resource isolation",
        index=True,
    )

    # Relationships
    # Note: cascade_delete=False to match DB constraint ondelete="RESTRICT"
    # The database prevents deleting a Workflow if it has WorkflowVersions.
    # Use soft delete (workflow.soft_delete()) which doesn't cascade to versions,
    # or manually delete versions first if hard delete is needed.
    versions: list["WorkflowVersion"] = Relationship(
        back_populates="workflow",
        cascade_delete=False,
    )

    executions: list["Execution"] = Relationship(
        back_populates="workflow",
        cascade_delete=False,
    )

    # Table arguments for indexes and constraints
    __table_args__ = (
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
        CheckConstraint(
            "(published_version IS NULL) = (NOT is_enabled)",
            name="ck_workflows_is_enabled_published_version",
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


# ============================================================================
# API Request/Response Schemas (Pattern 1: Separate models with table=False)
# ============================================================================


class WorkflowBase(SQLModel):
    """Base schema with shared workflow fields (used for inheritance)."""

    name: str = Field(..., min_length=1, max_length=255, description="Workflow name")
    description: str | None = Field(
        None, max_length=FieldLimits.DESCRIPTION_MAX_LENGTH, description="Workflow description"
    )
    labels: dict[str, Any] = Field(default_factory=dict, description="Workflow labels")


class WorkflowCreate(WorkflowBase):
    """Schema for creating a new workflow (POST /workflows).

    Excludes auto-generated fields: id, created_at, updated_at, created_by (set by backend).
    """

    workflow_definition: WorkflowDefinition = Field(..., description="Workflow definition object")
    project_id: UUID = Field(..., description="Project to assign workflow to")


class WorkflowUpdate(SQLModel):
    """Schema for updating workflow (PATCH /workflows/{id}).

    All fields are optional for partial updates.
    Supports metadata updates and workflow definition updates (creates new version).
    """

    name: str | None = Field(None, min_length=1, max_length=255, description="Update workflow name")
    description: str | None = Field(
        None, max_length=FieldLimits.DESCRIPTION_MAX_LENGTH, description="Update workflow description"
    )
    labels: dict[str, Any] | None = Field(None, description="Update workflow labels")
    workflow_definition: WorkflowDefinition | None = Field(
        None, description="New workflow definition (auto-creates version)"
    )
    change_description: str | None = Field(None, description="Description of changes for version history")


class WorkflowRead(WorkflowBase):
    """Schema for workflow response (GET /workflows/{id}).

    Includes all fields from the database table model.
    Note: deleted_at and deleted_by are None since soft-deleted workflows are excluded from queries.
    """

    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)  # type: ignore[assignment]

    id: UUID
    current_version: int
    is_builtin: bool = False
    is_enabled: bool
    published_version: int | None = None
    created_by: UUID
    project_id: UUID
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None
    deleted_by: UUID | None = None


class WorkflowReadWithVersion(WorkflowRead):
    """Schema for workflow response with current version details.

    Used when retrieving a single workflow to include the active workflow definition.
    """

    version: "WorkflowVersionRead" = Field(..., description="Current active version details")


# ============================================================================
# List Response
# ============================================================================


class WorkflowListResponse(ResourcesResponse[WorkflowRead]):
    """Paginated list response for workflows."""
