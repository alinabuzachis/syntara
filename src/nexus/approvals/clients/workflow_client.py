"""Client for communicating with workflow engine for approval signals.

=== THIS IS A STUB IMPLEMENTATION ===

=== IT WILL BE REPLACED WHEN AAP-64406 IS IMPLEMENTED ===
"""

from types import TracebackType
from uuid import UUID

import structlog

logger = structlog.stdlib.get_logger(__name__)


class WorkflowApiClient:
    """Client for communicating with workflow engine for approval signals."""

    def __init__(self) -> None:
        """Initialize the workflow API client."""
        self.timeout = 10.0

    async def __aenter__(self) -> "WorkflowApiClient":
        """Async context manager entry."""
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        """Async context manager exit."""

    async def send_approval_signal(
        self,
        execution_id: UUID,
        approval_node_id: str,
        status: str,
        approval_id: UUID,
        notes: str | None = None,  # noqa: ARG002
    ) -> None:
        """Send approval decision signal to workflow engine.

        Args:
            execution_id: Workflow execution ID
            approval_node_id: ID of the approval activity in workflow
            status: Decision status ('approved' or 'rejected')
            approval_id: ID of the approval request
            notes: Optional decision notes

        Raises:
            httpx.RequestError: If signal delivery fails

        """
        logger.info(
            "Sending approval signal to workflow",
            execution_id=execution_id,
            approval_node_id=approval_node_id,
            status=status,
            approval_id=approval_id,
        )

        # Generate the proper signal URL using workflow utils
        # signal_url = generate_activity_signal_url(execution_id, approval_node_id) noqa: ERA001
