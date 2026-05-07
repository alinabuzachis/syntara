"""High-level workflow telemetry emitters.

Provides simple functions for emitting workflow telemetry events.
These functions handle all the mapping and calculation logic internally,
keeping the calling code clean.
"""

from __future__ import annotations

import math
from typing import TYPE_CHECKING, Any

import structlog

from nexus.telemetry.client import get_telemetry_registry
from nexus.telemetry.collector import TelemetryCollector
from nexus.workflows.models.execution import ExecutionStatus
from nexus.workflows.workflow_engine.models.workflow_definition import ActivityName, WorkflowTerminalStatus

if TYPE_CHECKING:
    from uuid import UUID

    from nexus.telemetry.events.workflow_error import TimedOutComponent
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

        collector = TelemetryCollector(registry=registry)
        collector.capture_workflow_start(
            execution_id=str(execution.id),
            request_id=request_id,
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

        collector = TelemetryCollector(registry=registry)
        collector.emit_activity_telemetry(
            execution_id=execution_id,
            activity_definitions_map=activity_definitions_map,
            updated_activities=updated_activities,
            request_id=request_id,
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


def emit_workflow_error(
    execution_id: str,
    timed_out_component: TimedOutComponent,
    configured_timeout_seconds: float,
    elapsed_time_ms: int,
    activity_id: str | None = None,
    retry_count: int = 0,
    error_type: str | None = None,
    retry_reason: str | None = None,
    *,
    request_id: UUID | None = None,
) -> None:
    """Emit a workflow error telemetry event for engine-level errors.

    Called when a workflow or activity times out or is retried at the
    Temporal engine level.

    Args:
        execution_id: Unique workflow execution identifier (UUID v4).
        timed_out_component: Whether the workflow or an activity was affected.
        configured_timeout_seconds: Configured timeout threshold in seconds.
        elapsed_time_ms: Actual elapsed time in milliseconds.
        activity_id: Activity node ID (only for activity-level events).
        retry_count: Number of retry attempts (0 = first attempt).
        error_type: Name of the exception that caused the error.
        retry_reason: Failure message from the previous attempt (only for retries).
        request_id: Optional X-Request-Id from the originating HTTP request.

    """
    try:
        registry = get_telemetry_registry()
        if not registry.is_initialized():
            return

        if math.isclose(configured_timeout_seconds, 0.0):
            logger.debug(
                "Emitting workflow error with no configured timeout (possibly misconfigured)",
                execution_id=execution_id,
                timed_out_component=timed_out_component,
                activity_id=activity_id,
            )

        collector = TelemetryCollector(registry=registry)
        collector.capture_workflow_error(
            workflow_execution_id=execution_id,
            timed_out_component=timed_out_component,
            configured_timeout_seconds=configured_timeout_seconds,
            elapsed_time_ms=elapsed_time_ms,
            activity_id=activity_id,
            request_id=request_id,
            retry_count=retry_count,
            error_type=error_type,
            retry_reason=retry_reason,
        )

        logger.debug(
            "Emitted workflow error telemetry",
            execution_id=execution_id,
            timed_out_component=timed_out_component,
            activity_id=activity_id,
            error_type=error_type,
        )

    except Exception:
        logger.exception(
            "Failed to emit workflow error telemetry (non-fatal)",
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
