"""High-level workflow telemetry emitters.

Provides simple functions for emitting workflow telemetry events.
These functions handle all the mapping and calculation logic internally,
keeping the calling code clean.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import structlog

from nexus.telemetry.client import get_telemetry_registry
from nexus.telemetry.collector import TelemetryCollector
from nexus.workflows.models.execution import ExecutionStatus
from nexus.workflows.workflow_engine.models.workflow_definition import ActivityName, WorkflowTerminalStatus

if TYPE_CHECKING:
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
