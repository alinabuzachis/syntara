"""High-level workflow telemetry emitters.

Provides simple functions for emitting workflow telemetry events.
These functions handle all the mapping and calculation logic internally,
keeping the calling code clean.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Literal

import structlog

from nexus.telemetry.client import get_telemetry_registry
from nexus.telemetry.collector import _TERMINAL_STATUSES, TelemetryCollector
from nexus.workflows.models.activity_execution import ActivityStatus
from nexus.workflows.models.execution import ExecutionStatus
from nexus.workflows.workflow_engine.models.workflow_definition import ActivityName, WorkflowTerminalStatus

if TYPE_CHECKING:
    from datetime import datetime
    from uuid import UUID

    from nexus.workflows.models.activity_execution import ActivityExecution
    from nexus.workflows.models.execution import Execution

logger = structlog.stdlib.get_logger(__name__)


def emit_workflow_start(
    execution: Execution,
    *,
    request_id: UUID | None = None,
    trigger_activity_type: ActivityName | None = None,
) -> None:
    """Emit workflow start telemetry event.

    Called when an execution transitions from PENDING to RUNNING.

    Args:
        execution: The execution record.
        request_id: Optional X-Request-Id from the originating HTTP request.
        trigger_activity_type: Type of trigger that started the workflow.

    """
    try:
        registry = get_telemetry_registry()
        if not registry.is_initialized():
            return

        request_id_str = str(request_id) if request_id is not None else None

        collector = TelemetryCollector(registry=registry)
        collector.capture_workflow_start(
            execution_id=str(execution.id),
            request_id=request_id_str,
            trigger_activity_type=trigger_activity_type,
        )

        logger.debug(
            "Emitted workflow start telemetry",
            execution_id=execution.id,
        )

    except Exception:
        logger.exception(
            "Failed to emit workflow start telemetry (non-fatal)",
            execution_id=execution.id,
        )


def emit_workflow_completed(
    execution: Execution,
    status: ExecutionStatus,
    completed_at: datetime,
    error_details: str | None,
    *,
    request_id: UUID | None = None,
) -> None:
    """Emit workflow completed telemetry event.

    Called after all activity events have been processed, ensuring accurate
    activity counts. Counts are computed directly from the execution's
    activity records in the database.

    Args:
        execution: The execution record (with activities eagerly loaded).
        status: Final execution status.
        completed_at: Workflow completion timestamp.
        error_details: Error details if workflow failed.
        request_id: Optional X-Request-Id from the originating HTTP request.

    """
    try:
        registry = get_telemetry_registry()
        if not registry.is_initialized():
            return

        request_id_str = str(request_id) if request_id is not None else None

        # Map ExecutionStatus to telemetry status
        telemetry_status = _map_execution_status_to_telemetry(status)

        # Determine error type
        error_type: Literal["ActivityExecutionError"] | None = "ActivityExecutionError" if error_details else None

        # Calculate duration in milliseconds
        duration_ms = int((completed_at - execution.created_at).total_seconds() * 1000)

        # Compute node and error counts from loaded activities
        activities = execution.activities or []
        node_count = sum(1 for a in activities if a.status in _TERMINAL_STATUSES)
        error_count = sum(1 for a in activities if a.status == ActivityStatus.FAILED)

        # Emit telemetry
        collector = TelemetryCollector(registry=registry)
        collector.capture_workflow_completed(
            execution_id=str(execution.id),
            status=telemetry_status,
            duration_ms=duration_ms,
            node_count=node_count,
            error_count=error_count,
            error_type=error_type,
            request_id=request_id_str,
        )

        logger.debug(
            "Emitted workflow completed telemetry",
            execution_id=execution.id,
            status=telemetry_status,
            node_count=node_count,
            error_count=error_count,
        )

    except Exception:
        logger.exception(
            "Failed to emit workflow completed telemetry (non-fatal)",
            execution_id=execution.id,
        )


def emit_activities(
    execution_id: UUID,
    activity_definitions_map: dict[str, dict[str, Any]],
    updated_activities: list[tuple[ActivityExecution, dict[str, Any]]],
    *,
    request_id: UUID | None = None,
) -> None:
    """Emit activity telemetry for updated activities.

    Called when activities are updated in the database to emit telemetry
    for activities that reached terminal states.

    Args:
        execution_id: Database execution ID.
        activity_definitions_map: Map of activity ID to activity definition from workflow.
        updated_activities: List of (activity, old_values) tuples for activities that were updated.
        request_id: Optional X-Request-Id from the originating HTTP request.

    """
    try:
        registry = get_telemetry_registry()
        if not registry.is_initialized():
            return

        request_id_str = str(request_id) if request_id is not None else None

        collector = TelemetryCollector(registry=registry)
        collector.emit_activity_telemetry(
            execution_id=execution_id,
            activity_definitions_map=activity_definitions_map,
            updated_activities=updated_activities,
            request_id=request_id_str,
        )

        logger.debug(
            "Emitted activity telemetry",
            execution_id=execution_id,
            updated_activity_count=len(updated_activities),
        )

    except Exception:
        logger.exception(
            "Failed to emit activity telemetry (non-fatal)",
            execution_id=execution_id,
        )


def _map_execution_status_to_telemetry(status: ExecutionStatus) -> WorkflowTerminalStatus:
    """Map ExecutionStatus to WorkflowTerminalStatus for telemetry.

    Args:
        status: The execution status.

    Returns:
        The corresponding telemetry status.

    """
    if status == ExecutionStatus.COMPLETED:
        return WorkflowTerminalStatus.COMPLETED
    if status == ExecutionStatus.FAILED:
        return WorkflowTerminalStatus.FAILED
    return WorkflowTerminalStatus.CANCELLED
