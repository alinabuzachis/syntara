"""ApprovalRequest SQLModel and ApprovalRequestStatus enum.

This module contains the ApprovalRequest model representing human-in-the-loop
decision points in workflow executions, and the associated status enumeration.
"""

from datetime import datetime
from typing import TYPE_CHECKING, Any, ClassVar
from uuid import UUID

from sqlalchemy import Column, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import DateTime, Field, Relationship

from nexus.approvals.models.api_models import ApprovalRequestStatus
from nexus.core.constants import FieldLimits
from nexus.core.models.base import BaseResource, ResourcesResponse
from nexus.core.utils.sqlmodel import postgres_enum_column

if TYPE_CHECKING:
    from nexus.core.models import User


class ApprovalRequest(BaseResource, table=True):
    """ApprovalRequest model representing human-in-the-loop decision points.

    Extends BaseResource with approval-specific fields for tracking workflow
    execution pauses requiring human oversight and decision-making.

    Attributes:
        id: Primary key UUID (from BaseResource)
        created_at: When approval was requested (from BaseResource)
        updated_at: Last update timestamp (from BaseResource)
        labels: JSONB key-value labels (from BaseResource)
        name: Display name for the approval request
        execution_id: Soft reference to parent execution (no foreign key constraint)
        approval_node_id: Activity ID from workflow definition
        status: Current approval status
        timeout_at: When this request expires (optional)
        next_step_approved: Next activity that executes if approved
        next_step_rejected: Next activity that executes if rejected
        workflow_context: Workflow inputs and previous step output
        decided_by: User who made the decision
        decided_at: When decision was made
        decision_notes: Notes provided with decision

    Relationships:
        decider: User who made the decision (many-to-one to User)

    """

    __tablename__ = "approval_requests"

    # Filterable and sortable fields for API endpoints
    __filterable_fields__: ClassVar[list[str]] = [
        *BaseResource.__filterable_fields__,
        "name",
        "execution_id",
        "status",
        "timeout_at",
    ]

    __sortable_fields__: ClassVar[list[str]] = [
        *BaseResource.__sortable_fields__,
        "name",
        "timeout_at",
        "decided_at",
    ]

    # User-provided identification
    name: str = Field(
        min_length=1,
        max_length=FieldLimits.NAME_MAX_LENGTH,
        sa_type=String(FieldLimits.NAME_MAX_LENGTH),  # type: ignore[call-overload]
        description="Human-readable name for the approval request",
        index=True,
    )

    # Soft reference to parent execution (no foreign key constraint)
    execution_id: UUID = Field(
        nullable=False,
        description="Parent execution ID",
        index=True,
    )

    # Approval identity
    approval_node_id: str = Field(
        min_length=1,
        max_length=FieldLimits.NAME_MAX_LENGTH,
        sa_type=String(FieldLimits.NAME_MAX_LENGTH),  # type: ignore[call-overload]
        description="Activity ID from workflow definition",
    )

    # Status
    status: ApprovalRequestStatus = Field(
        default=ApprovalRequestStatus.PENDING,
        description="Current approval status",
        sa_column=postgres_enum_column(
            ApprovalRequestStatus,
            "approvalrequeststatus",
            index=True,
            create_constraint=True,
            server_default=text("'pending'::approvalrequeststatus"),
        ),
    )

    # Timing
    timeout_at: datetime | None = Field(
        default=None,
        nullable=True,
        sa_type=DateTime(timezone=True),  # type: ignore[call-overload]
        description="When this request expires",
        index=True,
    )

    # Context for approvers - ActivitySummary structures
    next_step_approved: dict[str, Any] = Field(
        sa_column=Column(JSONB, nullable=False),
        description="First activity that executes if approved",
    )

    next_step_rejected: dict[str, Any] | None = Field(
        default=None,
        sa_column=Column(JSONB, nullable=True),
        description="First activity that executes if rejected",
    )

    workflow_context: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False, server_default=text("'{}'::jsonb")),
        description="Workflow inputs and previous step output",
    )

    # Decision fields
    decided_by: UUID | None = Field(
        default=None,
        foreign_key="users.id",
        nullable=True,
        ondelete="SET NULL",
        description="User who made the decision",
    )

    decided_at: datetime | None = Field(
        default=None,
        nullable=True,
        sa_type=DateTime(timezone=True),  # type: ignore[call-overload]
        description="When decision was made",
    )

    decision_notes: str | None = Field(
        default=None,
        max_length=FieldLimits.DESCRIPTION_MAX_LENGTH,
        sa_type=String(FieldLimits.DESCRIPTION_MAX_LENGTH),  # type: ignore[call-overload]
        description="Notes provided with decision",
    )

    # Relationships
    decider: "User" = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[ApprovalRequest.decided_by]"},
    )


# ============================================================================
# List Response Type Alias
# ============================================================================

ApprovalListResponse = ResourcesResponse[ApprovalRequest]
