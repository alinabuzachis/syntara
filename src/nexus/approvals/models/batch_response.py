"""Models for batch approval response."""

from datetime import datetime
from uuid import UUID

from sqlmodel import Field, SQLModel

from nexus.approvals.models import ApprovalRequestStatus
from nexus.core.models import User


class BatchApprovalResult(SQLModel):
    """Result for a single approval within a batch response.

    Matches the BatchApprovalResult schema from the OpenAPI specification.
    """

    approval_id: UUID = Field(description="ID of the approval request")
    success: bool = Field(description="Whether the decision was successfully recorded")
    status: ApprovalRequestStatus | None = Field(
        default=None, description="New status after the decision (if successful)"
    )
    decided_at: datetime | None = Field(default=None, description="When decision was recorded (if successful)")
    decided_by: User | None = Field(default=None, description="User who made the decision (if successful)")
    decision_notes: str | None = Field(
        default=None, description="Notes provided with the decision (echoed back from request)"
    )
    error: str | None = Field(default=None, description="Error message if the decision failed")


class BatchApprovalResponse(SQLModel):
    """Response for batch approval submission.

    Matches the BatchApprovalResponse schema from the OpenAPI specification.
    """

    results: list[BatchApprovalResult] = Field(description="Individual results for each decision")
    total_success: int = Field(ge=0, description="Number of successfully processed decisions")
    total_failed: int = Field(ge=0, description="Number of failed decisions")
