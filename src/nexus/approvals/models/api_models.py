"""API request/response models for approval endpoints.

This module contains SQLModel classes corresponding to the OpenAPI specification
components for type-safe API operations.
"""

from datetime import datetime
from enum import Enum
from typing import Any, ClassVar
from uuid import UUID

from pydantic import ConfigDict, Field
from sqlmodel import SQLModel

from nexus.core.constants import FieldLimits


class UserReference(SQLModel):
    """Minimal user identification for embedding in other resources.

    Matches the UserReference schema from the OpenAPI specification.
    This model captures user identity at the time of an action, providing
    a snapshot that doesn't change even if the user's details are updated later.
    """

    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)  # type: ignore[assignment]

    id: UUID = Field(..., description="User's unique identifier")
    name: str = Field(..., description="User's display name at time of action")


class ApprovalRequestStatus(str, Enum):
    """Approval request status enumeration."""

    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class ApprovalDecisionStatus(str, Enum):
    """Status values for approval decisions.

    This is a subset of ApprovalRequestStatus representing only the
    values that can be submitted in decision requests.
    """

    APPROVED = "approved"
    REJECTED = "rejected"


class BatchApprovalDecisionStatus(str, Enum):
    """Status values that can be submitted in batch approval decisions.

    This is a subset of ApprovalRequestStatus containing only system-actionable values.
    """

    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class ActivitySummary(SQLModel):
    """Activity Summary for workflow context.

    Summary of a workflow activity for display in approval context.
    Provides enough information for UI rendering without exposing
    full activity configuration details.
    """

    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)  # type: ignore[assignment]

    id: str = Field(..., description="Activity ID from workflow definition")
    name: str = Field(..., description="Human-readable activity name")
    type: str = Field(..., description="Activity type (task, approval, parallel, etc.)")


class PreviousStepContext(SQLModel):
    """Previous Step Context for workflow execution.

    The activity that immediately preceded this approval node, including its output.
    Null if the approval node is the first activity in the workflow.
    """

    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)  # type: ignore[assignment]

    id: str = Field(..., description="Activity ID from workflow definition")
    name: str = Field(..., description="Human-readable activity name")
    type: str = Field(..., description="Activity type (task, approval, parallel, etc.)")
    output: dict[str, Any] | None = Field(
        None, description="Output from the activity (structure varies per activity type)"
    )


class WorkflowContext(SQLModel):
    """Workflow Context for approvers.

    Essential context for approvers to make a decision.
    Contains workflow identification, inputs, and the output from the immediately
    preceding activity.
    """

    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)  # type: ignore[assignment]

    workflow_version_id: UUID = Field(..., description="ID of the workflow version being executed")
    workflow_name: str = Field(..., description="Name of the workflow")
    inputs: dict[str, Any] = Field(
        ..., description="Original workflow input parameters (structure varies per workflow)"
    )
    previous_step: PreviousStepContext | None = Field(None, description="Previous step context and output")


class ApprovalCreateRequest(SQLModel):
    """Request payload for creating an approval request.

    This is an internal schema used by the Workflows component.
    """

    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)  # type: ignore[assignment]

    execution_id: UUID = Field(..., description="Parent workflow execution ID")
    project_id: UUID | None = Field(None, description="Project ID (denormalized from execution)")
    approval_node_id: str = Field(..., description="Activity ID from workflow definition")
    name: str = Field(..., min_length=1, max_length=255, description="Display name for the approval request")
    timeout_at: datetime | None = Field(None, description="When this request expires (null = no timeout)")
    next_step_approved: ActivitySummary | None = Field(None, description="First activity that executes if approved")
    next_step_rejected: ActivitySummary | None = Field(None, description="First activity that executes if rejected")
    workflow_context: WorkflowContext = Field(..., description="Workflow execution context")


class ApprovalDecisionRequest(SQLModel):
    """Request payload for submitting an approval decision.

    Status values:
    - approved: Approver grants the request, workflow continues on approval path
    - rejected: Approver denies the request, workflow continues on rejection path
    - cancelled: Internal use only - set by workflow engine when parent workflow is cancelled
    """

    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)  # type: ignore[assignment]

    status: ApprovalDecisionStatus = Field(..., description="Decision status")
    notes: str | None = Field(
        None, max_length=FieldLimits.DESCRIPTION_MAX_LENGTH, description="Optional notes explaining the decision"
    )


class BatchApprovalDecision(SQLModel):
    """Single decision within a batch approval request."""

    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)  # type: ignore[assignment]

    approval_id: UUID = Field(..., description="ID of the approval request")
    status: BatchApprovalDecisionStatus = Field(..., description="Decision status")
    notes: str | None = Field(
        None, max_length=FieldLimits.DESCRIPTION_MAX_LENGTH, description="Optional notes explaining the decision"
    )


class BatchApprovalRequest(SQLModel):
    """Request payload for submitting multiple approval decisions at once."""

    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)  # type: ignore[assignment]

    decisions: list[BatchApprovalDecision] = Field(
        ..., min_length=1, max_length=100, description="List of approval decisions to submit"
    )
