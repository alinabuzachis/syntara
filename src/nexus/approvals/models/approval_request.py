"""ApprovalRequest SQLModel and ApprovalRequestStatus enum.

This module contains the ApprovalRequest model representing human-in-the-loop
decision points in workflow executions, and the associated status enumeration.
"""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING, Any, ClassVar
from uuid import UUID

from sqlalchemy import Column, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import DateTime, Field, Relationship

from nexus.core.constants import FieldLimits
from nexus.core.models.base import NamedResource
from nexus.core.utils.sqlmodel import postgres_enum_column

if TYPE_CHECKING:
    from nexus.core.models import User


class ApprovalRequestStatus(str, Enum):
    """Approval request status enumeration."""

    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class ApprovalRequest(NamedResource, table=True):
    """ApprovalRequest model representing human-in-the-loop decision points.

    Extends NamedResource with approval-specific fields for tracking workflow
    execution pauses requiring human oversight and decision-making.

    Attributes:
        id: Primary key UUID (from NamedResource)
        created_at: When approval was requested (from NamedResource)
        updated_at: Last update timestamp (from NamedResource)
        labels: JSONB key-value labels (from NamedResource)
        name: Display name for the approval request (from NamedResource)
        description: Optional detailed description (from NamedResource)
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
        *NamedResource.__filterable_fields__,
        "execution_id",
        "status",
        "timeout_at",
    ]

    __sortable_fields__: ClassVar[list[str]] = [
        *NamedResource.__sortable_fields__,
        "timeout_at",
        "decided_at",
    ]

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
