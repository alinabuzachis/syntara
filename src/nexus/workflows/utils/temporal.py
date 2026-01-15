"""Temporal-specific utility functions.

Provides utilities for Temporal workflow status conversion and synchronization.
"""

import logging
from datetime import datetime, timedelta
from typing import TYPE_CHECKING

from sqlmodel.ext.asyncio.session import AsyncSession
from temporalio.service import RPCError

from nexus.workflows.models.execution import Execution, ExecutionStatus

if TYPE_CHECKING:
    from nexus.workflows.workflow_engine.models.responses import WorkflowStatusResponse
    from nexus.workflows.workflow_engine.services.temporal_execution_service import TemporalExecutionService

logger = logging.getLogger(__name__)


def temporal_status_to_execution_status(temporal_status: str) -> ExecutionStatus | None:
    """Convert Temporal workflow status to ExecutionStatus enum.

    Temporal uses American spelling (canceled) while we use British spelling (cancelled).
    This function handles the conversion and normalization.

    Args:
        temporal_status: Status string from Temporal (e.g., "canceled", "completed", "failed")

    Returns:
        ExecutionStatus enum member, or None if status cannot be mapped

    Example:
        >>> temporal_status_to_execution_status("canceled")
        ExecutionStatus.CANCELLED

        >>> temporal_status_to_execution_status("completed")
        ExecutionStatus.COMPLETED

    """
    # Normalize to lowercase
    status_lower = temporal_status.lower().strip()

    # Handle American vs British spelling: Temporal uses "canceled", we use "cancelled"
    if status_lower == "canceled":
        status_lower = "cancelled"

    # Try direct enum conversion
    try:
        return ExecutionStatus(status_lower)
    except ValueError:
        logger.warning("Unknown Temporal status '%s', cannot map to ExecutionStatus", temporal_status)
        return None


def _calculate_completed_at(execution: Execution, close_time_str: str) -> datetime:
    """Calculate the completed_at timestamp ensuring it's after created_at.

    Args:
        execution: Execution model instance
        close_time_str: ISO format timestamp string from Temporal

    Returns:
        Adjusted datetime that satisfies created_at < completed_at constraint

    """
    close_time = datetime.fromisoformat(close_time_str)

    # Ensure completed_at is always greater than created_at to satisfy DB constraint
    if close_time <= execution.created_at:
        # Use created_at + 1 microsecond to satisfy the constraint
        adjusted_time = execution.created_at + timedelta(microseconds=1)
        logger.warning(
            "Workflow %s completed (%s) before database record created (%s), "
            "adjusting completed_at to %s to satisfy constraint",
            execution.temporal_workflow_id,
            close_time.isoformat(),
            execution.created_at.isoformat(),
            adjusted_time.isoformat(),
        )
        return adjusted_time

    return close_time


def _update_execution_from_temporal_status(
    execution: Execution,
    new_status: ExecutionStatus,
    status_response: "WorkflowStatusResponse",
    terminal_states: set[ExecutionStatus],
) -> None:
    """Update execution with new status and related metadata.

    Args:
        execution: Execution model instance to update
        new_status: New status from Temporal
        status_response: Response object from Temporal service
        terminal_states: Set of terminal execution states

    """
    execution.status = new_status

    # Set completed_at if workflow is now in terminal state
    if execution.status in terminal_states and status_response.close_time:
        execution.completed_at = _calculate_completed_at(execution, status_response.close_time)

    # Copy failure message if workflow failed
    if execution.status == ExecutionStatus.FAILED and status_response.failure_message:
        execution.error_details = status_response.failure_message


async def sync_execution_status_from_temporal(
    execution: Execution,
    temporal_service: "TemporalExecutionService",
    session: AsyncSession | None = None,
    *,
    persist: bool = False,
) -> bool:
    """Sync execution status from Temporal workflow.

    Examines current status and does nothing if already in terminal state.
    Otherwise queries Temporal and updates execution with actual status.

    Args:
        execution: Execution model instance to update
        temporal_service: Temporal service to query workflow status
        session: Optional database session for persisting changes
        persist: If True, commit changes to database (requires session)

    Returns:
        True if status was synced, False if skipped (already terminal)

    Raises:
        ValueError: If persist=True but session is None

    Example:
        >>> # Sync status without persisting
        >>> await sync_execution_status_from_temporal(execution, temporal_service)
        True  # Status was synced from Temporal

        >>> # Sync status and persist to database
        >>> await sync_execution_status_from_temporal(
        ...     execution, temporal_service, session=session, persist=True
        ... )
        True  # Status was synced and committed to DB

        >>> execution.status = ExecutionStatus.COMPLETED
        >>> await sync_execution_status_from_temporal(execution, temporal_service)
        False  # Skipped - already in terminal state

    """
    # Validate persist requires session
    if persist and session is None:
        msg = "Cannot persist changes without a database session"
        raise ValueError(msg)

    # Terminal states that cannot be transitioned from
    terminal_states = {ExecutionStatus.COMPLETED, ExecutionStatus.FAILED, ExecutionStatus.CANCELLED}

    # Skip if already in terminal state
    if execution.status in terminal_states:
        return False

    # Track if status actually changed
    status_changed = False

    try:
        # Query Temporal for actual workflow status
        status_response = await temporal_service.get_workflow_status(
            temporal_workflow_id=execution.temporal_workflow_id
        )

        # Convert Temporal status to ExecutionStatus
        new_status = temporal_status_to_execution_status(status_response.status)

        if new_status is None:
            logger.warning(
                "Could not map Temporal status '%s' to ExecutionStatus for execution %s, keeping current status %s",
                status_response.status,
                execution.id,
                execution.status.value,
            )
        elif new_status != execution.status:
            _update_execution_from_temporal_status(execution, new_status, status_response, terminal_states)
            status_changed = True
    except RPCError as e:
        # Workflow not found in Temporal - this can happen in tests or if workflow was purged
        # Just log and skip the sync
        logger.debug(
            "Workflow %s not found in Temporal (execution %s): %s",
            execution.temporal_workflow_id,
            execution.id,
            e,
        )
        return False

    # Persist changes only if status changed and persist is requested
    if persist and status_changed and session is not None:
        await session.commit()

    return status_changed
