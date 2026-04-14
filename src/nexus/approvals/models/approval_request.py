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

from nexus.approvals.models.api_models import ApprovalRequestStatus, UserReference
from nexus.core.constants import FieldLimits
from nexus.core.models.base import BaseResource
from nexus.core.models.pagination import ResourcesResponse
from nexus.core.utils.sqlmodel import postgres_enum_column

if TYPE_CHECKING:
    from nexus.core.models import User


class BaseApprovalRequest(BaseResource, table=False):
    """Base approval request model with common fields.

    Contains all approval request fields except decided_by, allowing for different
    representations of the deciding user (UUID in database vs UserReference in API).
    """

    # Project scoping (denormalized from execution for efficient filtering)
    project_id: UUID | None = Field(
        default=None,
        foreign_key="projects.id",
        description="Project this approval belongs to (denormalized from execution)",
        index=True,
    )

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

    # Decision fields (without decided_by)
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


class ApprovalRequest(BaseApprovalRequest, table=True):
    """ApprovalRequest database model with UUID foreign key for decided_by.

    Extends BaseApprovalRequest with the database-specific decided_by field
    that stores a UUID foreign key to the users table.
    """

    __tablename__ = "approval_requests"

    # Filterable and sortable fields for API endpoints
    __filterable_fields__: ClassVar[list[str]] = [
        *BaseResource.__filterable_fields__,
        "name",
        "execution_id",
        "project_id",
        "status",
        "timeout_at",
    ]

    __sortable_fields__: ClassVar[list[str]] = [
        *BaseResource.__sortable_fields__,
        "name",
        "timeout_at",
        "decided_at",
    ]

    # Decision field - database stores UUID foreign key
    decided_by: UUID | None = Field(
        default=None,
        foreign_key="users.id",
        nullable=True,
        ondelete="SET NULL",
        description="User who made the decision",
    )

    # Relationships
    decider: "User" = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[ApprovalRequest.decided_by]"},
    )


class ApprovalRequestRead(BaseApprovalRequest, table=False):
    """ApprovalRequest API response model with UserReference for decided_by.

    Extends BaseApprovalRequest with the API-specific decided_by field
    that contains a UserReference object for API responses.
    """

    # Decision field - API returns UserReference object
    decided_by: UserReference | None = Field(
        default=None,
        description="User who made the decision",
    )


# ============================================================================
# List Response Type Alias
# ============================================================================

ApprovalListResponse = ResourcesResponse[ApprovalRequest]
