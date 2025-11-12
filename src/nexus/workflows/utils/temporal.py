"""Temporal-specific utility functions.

Provides utilities for Temporal workflow status conversion and synchronization.
"""

import logging
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy.ext.asyncio import AsyncSession
from temporalio.service import RPCError

from nexus.workflows.models.execution import Execution, ExecutionStatus

if TYPE_CHECKING:
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

        if new_status is not None and new_status != execution.status:
            execution.status = new_status
            status_changed = True

            # Set completed_at if workflow is now in terminal state
            if execution.status in terminal_states and status_response.close_time:
                execution.completed_at = datetime.fromisoformat(status_response.close_time)

            # Copy failure message if workflow failed
            if execution.status == ExecutionStatus.FAILED and status_response.failure_message:
                execution.error_details = status_response.failure_message
        elif new_status is None:
            logger.warning(
                "Could not map Temporal status '%s' to ExecutionStatus for execution %s, keeping current status %s",
                status_response.status,
                execution.id,
                execution.status.value,
            )
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
        await session.refresh(execution)

    return status_changed
