"""Test fixtures and helpers for approval tests."""

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from nexus.approvals.models.approval_request import (
    ApprovalRequest,
    ApprovalRequestStatus,
)

# Sentinel value to detect when a parameter was explicitly passed as None
_NOT_PROVIDED = object()


def create_test_approval_request(
    execution_id: UUID | None = None,
    approval_node_id: str = "test_approval",
    name: str = "Test Approval",
    description: str | None = "Test approval description",
    status: ApprovalRequestStatus = ApprovalRequestStatus.PENDING,
    timeout_at: datetime | None = None,
    next_step_approved: dict[str, Any] | None | object = _NOT_PROVIDED,
    next_step_rejected: dict[str, Any] | None | object = _NOT_PROVIDED,
    workflow_context: dict[str, Any] | None = None,
    decided_by: UUID | None = None,
    decided_at: datetime | None = None,
    decision_notes: str | None = None,
) -> ApprovalRequest:
    """Create test ApprovalRequest with default values.

    Args:
        execution_id: Parent execution UUID (generated if None)
        approval_node_id: Activity ID from workflow definition
        name: Display name for the approval request
        description: Optional description for context
        status: Current approval status
        timeout_at: When request expires (1 day from now if None)
        next_step_approved: Activity summary for approved path
        next_step_rejected: Activity summary for rejected path
        workflow_context: Workflow inputs and previous step output
        decided_by: User ID who made decision (None for pending)
        decided_at: When decision was made (None for pending)
        decision_notes: Notes provided with decision

    Returns:
        ApprovalRequest instance for testing

    """
    if execution_id is None:
        execution_id = uuid4()

    if timeout_at is None and status == ApprovalRequestStatus.PENDING:
        timeout_at = datetime.now(UTC) + timedelta(days=1)

    # Only set defaults if not explicitly provided
    if next_step_approved is _NOT_PROVIDED:
        next_step_approved = {
            "id": "apply_changes",
            "name": "Apply Changes",
            "type": "task",
            "description": "Apply the approved changes",
        }

    if next_step_rejected is _NOT_PROVIDED:
        next_step_rejected = {
            "id": "log_rejection",
            "name": "Log Rejection",
            "type": "task",
            "description": "Log the rejection reason",
        }

    if workflow_context is None:
        workflow_context = {
            "workflow_version_id": str(uuid4()),
            "workflow_name": "Test Workflow",
            "inputs": {"environment": "production", "version": "1.0.0"},
            "previous_step": {
                "id": "prepare_data",
                "name": "Prepare Data",
                "type": "task",
                "output": {"data_prepared": True, "row_count": 1000},
            },
        }

    return ApprovalRequest(
        execution_id=execution_id,
        approval_node_id=approval_node_id,
        name=name,
        description=description,
        status=status,
        timeout_at=timeout_at,
        next_step_approved=next_step_approved,
        next_step_rejected=next_step_rejected,
        workflow_context=workflow_context,
        decided_by=decided_by,
        decided_at=decided_at,
        decision_notes=decision_notes,
    )


def create_approved_approval_request(
    decided_by: UUID | None = None,
    decision_notes: str = "Approved after review",
    **kwargs: Any,  # noqa: ANN401
) -> ApprovalRequest:
    """Create test ApprovalRequest in approved state.

    Args:
        decided_by: User ID who approved (generated if None)
        decision_notes: Notes provided with approval
        **kwargs: Additional arguments to pass to create_test_approval_request

    Returns:
        ApprovalRequest instance in approved state

    """
    if decided_by is None:
        decided_by = uuid4()

    return create_test_approval_request(
        status=ApprovalRequestStatus.APPROVED,
        decided_by=decided_by,
        decided_at=datetime.now(UTC),
        decision_notes=decision_notes,
        **kwargs,
    )


def create_rejected_approval_request(
    decided_by: UUID | None = None,
    decision_notes: str = "Rejected due to insufficient justification",
    **kwargs: Any,  # noqa: ANN401
) -> ApprovalRequest:
    """Create test ApprovalRequest in rejected state.

    Args:
        decided_by: User ID who rejected (generated if None)
        decision_notes: Notes provided with rejection
        **kwargs: Additional arguments to pass to create_test_approval_request

    Returns:
        ApprovalRequest instance in rejected state

    """
    if decided_by is None:
        decided_by = uuid4()

    return create_test_approval_request(
        status=ApprovalRequestStatus.REJECTED,
        decided_by=decided_by,
        decided_at=datetime.now(UTC),
        decision_notes=decision_notes,
        **kwargs,
    )


def create_expired_approval_request(
    **kwargs: Any,  # noqa: ANN401
) -> ApprovalRequest:
    """Create test ApprovalRequest in expired state.

    Args:
        **kwargs: Additional arguments to pass to create_test_approval_request

    Returns:
        ApprovalRequest instance in expired state

    """
    return create_test_approval_request(
        status=ApprovalRequestStatus.EXPIRED,
        timeout_at=datetime.now(UTC) - timedelta(hours=1),  # Expired 1 hour ago
        decision_notes="Request automatically rejected due to timeout",
        **kwargs,
    )


def create_cancelled_approval_request(
    **kwargs: Any,  # noqa: ANN401
) -> ApprovalRequest:
    """Create test ApprovalRequest in cancelled state.

    Args:
        **kwargs: Additional arguments to pass to create_test_approval_request

    Returns:
        ApprovalRequest instance in cancelled state

    """
    return create_test_approval_request(
        status=ApprovalRequestStatus.CANCELLED,
        decision_notes="Workflow execution was cancelled",
        **kwargs,
    )
