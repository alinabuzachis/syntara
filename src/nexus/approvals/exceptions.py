"""Exception classes for approvals component.

This module contains custom exceptions used by approval services and endpoints,
following the project's exception handling patterns.
"""

from uuid import UUID

from nexus.approvals.models.approval_request import ApprovalRequestStatus


class ApprovalNotFoundError(Exception):
    """Raised when an approval request is not found."""

    def __init__(self, approval_id: UUID) -> None:
        """Initialize exception with approval ID."""
        self.approval_id = approval_id
        super().__init__(f"Approval request {approval_id} not found")


class ApprovalAlreadyDecidedError(Exception):
    """Raised when attempting to decide an already-decided approval."""

    def __init__(self, approval_id: UUID, current_status: ApprovalRequestStatus) -> None:
        """Initialize exception with approval ID and current status."""
        self.approval_id = approval_id
        self.current_status = current_status
        super().__init__(f"Approval request {approval_id} is already decided with status '{current_status}'")
