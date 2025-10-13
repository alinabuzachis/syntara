"""Pydantic schemas for workflow request/response validation."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class WorkflowBase(BaseModel):
    """Base schema for Workflow."""

    name: str = Field(..., min_length=1, max_length=255, description="Workflow name")
    description: str | None = Field(None, description="Workflow description")
    labels: dict[str, Any] = Field(default_factory=dict, description="Workflow labels")


class CreateWorkflowRequest(WorkflowBase):
    """Schema for creating a new workflow."""

    yaml_definition: str = Field(..., min_length=1, description="YAML workflow definition")
    is_enabled: bool = Field(default=True, description="Enable workflow for execution (defaults to True)")


class UpdateWorkflowRequest(BaseModel):
    """Schema for updating workflow via PATCH.

    Supports both metadata-only updates and workflow definition updates:
    - Metadata only (name, description, is_enabled, labels): Updates without creating new version
    - With yaml_definition: Validates YAML, compares with current version, creates new WorkflowVersion
      only if YAML differs (change detection optimization)

    Note: WorkflowVersion entities are read-only and managed automatically by the system.
    """

    name: str | None = Field(None, min_length=1, max_length=255, description="Update workflow name")
    description: str | None = Field(None, description="Update workflow description")
    labels: dict[str, Any] | None = Field(None, description="Update workflow labels")
    is_enabled: bool | None = Field(None, description="Enable/disable workflow")
    yaml_definition: str | None = Field(None, min_length=1, description="New YAML definition (auto-creates version)")
    change_description: str | None = Field(None, description="Description of changes (for version history)")


class WorkflowResponse(WorkflowBase):
    """Schema for workflow response (metadata only).

    Note: deleted_at and deleted_by are always None in responses since
    soft-deleted workflows are excluded from GET queries.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    current_version: int
    is_enabled: bool
    created_by: UUID
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None
    deleted_by: UUID | None = None


class WorkflowWithVersionResponse(WorkflowResponse):
    """Schema for workflow response including current version details.

    Used when retrieving a single workflow to provide complete information
    including the active YAML definition specified by current_version.
    """

    version: "WorkflowVersionResponse" = Field(..., description="Current active version details")


class WorkflowListResponse(BaseModel):
    """Schema for workflow list response."""

    workflows: list[WorkflowResponse]
    total: int
    limit: int | None = None
    offset: int | None = None


class WorkflowVersionResponse(BaseModel):
    """Schema for workflow version response.

    Note: deleted_at and deleted_by are always None in responses since
    soft-deleted versions are excluded from GET queries.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workflow_id: UUID
    version: int
    schema_version: str
    yaml_definition: str
    change_description: str | None = None
    created_by: UUID
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None
    deleted_by: UUID | None = None


class WorkflowVersionListResponse(BaseModel):
    """Schema for workflow version list response."""

    versions: list[WorkflowVersionResponse]
