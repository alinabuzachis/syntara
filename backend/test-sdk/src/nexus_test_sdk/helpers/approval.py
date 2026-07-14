"""Test fixtures and helpers for approval tests."""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.approvals.models import (
    ApprovalRequest,
    ApprovalRequestStatus,
)
from nexus.core.models import User

# Sentinel value to detect when a parameter was explicitly passed as None
_NOT_PROVIDED = object()


@dataclass
class DecisionFields:
    """Container for approval decision-related fields."""

    decided_by: UUID | None
    decided_at: datetime | None
    decision_notes: str | None
    timeout: datetime | None


def create_test_approval_request(
    execution_id: UUID | None = None,
    approval_node_id: str = "test_approval",
    name: str = "Test Approval",
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
        project_id=uuid4(),
        approval_node_id=approval_node_id,
        name=name,
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


class ApprovalsFactory:
    """Factory class for creating test approval requests with configurable properties."""

    def __init__(self, session: AsyncSession, user: User, project_id: UUID) -> None:
        """Initialize the ApprovalsFactory with database session and required entities.

        Args:
            session: AsyncSession for database operations
            user: User instance to set as creator/decider of approval requests
            project_id: Project UUID to assign to created approval requests

        """
        self.session = session
        self.user = user
        self.project_id = project_id
        self._node_counter = 0  # Global counter for unique approval_node_id values

    def _get_decision_fields(
        self, status: ApprovalRequestStatus, name_prefix: str, index: int, timeout_at: datetime
    ) -> DecisionFields:
        """Get decision-related fields based on approval status.

        Args:
            status: The approval status
            name_prefix: Prefix for generating decision notes
            index: Index for unique naming
            timeout_at: Default timeout for pending approvals

        Returns:
            DecisionFields container with decision-related data

        """
        decided_by = None
        decided_at = None
        decision_notes = None
        timeout = timeout_at if status == ApprovalRequestStatus.PENDING else None

        if status in [ApprovalRequestStatus.APPROVED, ApprovalRequestStatus.REJECTED]:
            decided_by = self.user.id
            decided_at = datetime.now(UTC)
            action = "Approved" if status == ApprovalRequestStatus.APPROVED else "Rejected"
            decision_notes = f"{action}: {name_prefix} {index + 1}"
        elif status == ApprovalRequestStatus.EXPIRED:
            timeout = datetime.now(UTC) - timedelta(hours=1)  # Expired 1 hour ago
            decision_notes = "Request automatically rejected due to timeout"
        elif status == ApprovalRequestStatus.CANCELLED:
            decision_notes = "Workflow execution was cancelled"

        return DecisionFields(
            decided_by=decided_by,
            decided_at=decided_at,
            decision_notes=decision_notes,
            timeout=timeout,
        )

    def _create_single_approval(
        self,
        index: int,
        status: ApprovalRequestStatus,
        execution_id: UUID,
        name_prefix: str,
        timeout_at: datetime,
    ) -> ApprovalRequest:
        """Create a single approval request with the given parameters.

        Args:
            index: Index for unique naming and IDs
            status: The approval status
            execution_id: The execution ID
            name_prefix: Prefix for approval names
            timeout_at: Default timeout for pending approvals

        Returns:
            Created ApprovalRequest object

        """
        decision_fields = self._get_decision_fields(status, name_prefix, index, timeout_at)

        # Increment global counter to ensure unique approval_node_id across all factory calls
        # This is required because (execution_id, approval_node_id) has a unique constraint
        self._node_counter += 1

        return ApprovalRequest(
            execution_id=execution_id,
            project_id=self.project_id,
            approval_node_id=f"approval_node_{self._node_counter}",
            name=f"{name_prefix} {index + 1}",
            status=status,
            timeout_at=decision_fields.timeout,
            next_step_approved={
                "id": f"approved_step_{index + 1}",
                "name": f"Approved Step {index + 1}",
                "type": "task",
                "description": f"Next step after approval {index + 1}",
            },
            next_step_rejected={
                "id": f"rejected_step_{index + 1}",
                "name": f"Rejected Step {index + 1}",
                "type": "task",
                "description": f"Next step after rejection {index + 1}",
            }
            if index % 2 == 0
            else None,  # Some approvals have no rejection path
            workflow_context={
                "workflow_version_id": str(uuid4()),
                "workflow_name": f"Test Workflow {index + 1}",
                "inputs": {
                    "environment": "test",
                    "version": f"1.0.{index}",
                    "approval_index": index + 1,
                },
                "previous_step": {
                    "id": f"prev_step_{index + 1}",
                    "name": f"Previous Step {index + 1}",
                    "type": "task",
                    "output": {"step_completed": True, "data_id": index + 1},
                },
            },
            decided_by=decision_fields.decided_by,
            decided_at=decision_fields.decided_at,
            decision_notes=decision_fields.decision_notes,
        )

    async def create_approvals(
        self,
        count: int,
        execution_id: UUID | None = None,
        name_prefix: str = "Test Approval",
        statuses: list[ApprovalRequestStatus] | None = None,
        timeout_hours: int = 24,
        *,
        same_execution: bool = True,
    ) -> list[ApprovalRequest]:
        """Create multiple test approval requests.

        Args:
            count: Number of approval requests to create
            execution_id: Execution ID for all approvals (generated if None and same_execution=True)
            name_prefix: Prefix for approval names (will be followed by numbers)
            statuses: List of statuses to cycle through (defaults to PENDING)
            timeout_hours: Hours from now when approvals timeout (for pending statuses)
            same_execution: If True, all approvals share the same execution_id

        Returns:
            List of created ApprovalRequest objects

        """
        if statuses is None:
            statuses = [ApprovalRequestStatus.PENDING]

        if same_execution and execution_id is None:
            execution_id = uuid4()

        timeout_at = datetime.now(UTC) + timedelta(hours=timeout_hours)

        approvals = []
        for i in range(count):
            status = statuses[i % len(statuses)]
            current_execution_id = execution_id if same_execution else uuid4()
            assert current_execution_id is not None  # Help mypy understand this can't be None

            approval = self._create_single_approval(i, status, current_execution_id, name_prefix, timeout_at)
            approvals.append(approval)

        self.session.add_all(approvals)
        await self.session.commit()
        return approvals

    async def create_pending_approvals(
        self,
        count: int,
        execution_id: UUID | None = None,
        **kwargs: Any,  # noqa: ANN401
    ) -> list[ApprovalRequest]:
        """Create multiple pending approval requests.

        Args:
            count: Number of pending approvals to create
            execution_id: Execution ID for all approvals (optional)
            **kwargs: Additional arguments to pass to create_approvals

        Returns:
            List of created pending ApprovalRequest objects

        """
        return await self.create_approvals(
            count=count,
            execution_id=execution_id,
            statuses=[ApprovalRequestStatus.PENDING],
            **kwargs,
        )

    async def create_mixed_status_approvals(
        self,
        pending_count: int = 2,
        approved_count: int = 1,
        rejected_count: int = 1,
        execution_id: UUID | None = None,
        **kwargs: Any,  # noqa: ANN401
    ) -> list[ApprovalRequest]:
        """Create approval requests with mixed statuses.

        Args:
            pending_count: Number of pending approvals
            approved_count: Number of approved approvals
            rejected_count: Number of rejected approvals
            execution_id: Execution ID for all approvals (optional)
            **kwargs: Additional arguments to pass to create_approvals

        Returns:
            List of created ApprovalRequest objects with mixed statuses

        """
        total_count = pending_count + approved_count + rejected_count
        statuses = (
            [ApprovalRequestStatus.PENDING] * pending_count
            + [ApprovalRequestStatus.APPROVED] * approved_count
            + [ApprovalRequestStatus.REJECTED] * rejected_count
        )

        return await self.create_approvals(
            count=total_count,
            execution_id=execution_id,
            statuses=statuses,
            **kwargs,
        )
