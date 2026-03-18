"""Telemetry collector service.

Provides the main service for capturing and sending telemetry events
during workflow and activity execution.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Literal

import structlog

from nexus.telemetry.client import TelemetryClientRegistry, get_telemetry_registry
from nexus.telemetry.events.activity_execution import ActivityExecutionEventBuilder
from nexus.telemetry.events.workflow_execution import WorkflowExecutionEventBuilder
from nexus.workflows.models.activity_execution import ActivityExecution, ActivityStatus
from nexus.workflows.workflow_engine.models.workflow_definition import ActivityTerminalStatus

if TYPE_CHECKING:
    from uuid import UUID

    from nexus.workflows.workflow_engine.models.workflow_definition import (
        ActivityType,
        WorkflowTerminalStatus,
    )

logger = structlog.stdlib.get_logger(__name__)

# Terminal activity statuses that should trigger telemetry emission
_TERMINAL_STATUSES = {
    ActivityStatus.COMPLETED,
    ActivityStatus.FAILED,
    ActivityStatus.SKIPPED,
    ActivityStatus.CANCELLED,
}


def _is_terminal_status(status: ActivityStatus | None) -> bool:
    """Check if a status is terminal."""
    return status in _TERMINAL_STATUSES if status else False


def _format_status_value(status: ActivityStatus | str | None) -> str | None:
    """Format a status value for logging."""
    if status is None:
        return None
    if isinstance(status, ActivityStatus):
        return status.value
    return str(status)


# Mapping from DB ActivityStatus to telemetry status enum
_STATUS_TO_TELEMETRY: dict[ActivityStatus, ActivityTerminalStatus] = {
    ActivityStatus.COMPLETED: ActivityTerminalStatus.COMPLETED,
    ActivityStatus.FAILED: ActivityTerminalStatus.FAILED,
    ActivityStatus.SKIPPED: ActivityTerminalStatus.SKIPPED,
    ActivityStatus.CANCELLED: ActivityTerminalStatus.CANCELLED,
}


class TelemetryCollector:
    """Service for capturing and sending telemetry events.

    Coordinates event building and transmission for workflow and activity
    execution telemetry. All operations are fire-and-forget.
    """

    def __init__(
        self,
        registry: TelemetryClientRegistry | None = None,
    ) -> None:
        """Initialize the telemetry collector.

        Args:
            registry: Optional registry override (for testing).

        """
        self._registry = registry or get_telemetry_registry()
        self._workflow_builder = WorkflowExecutionEventBuilder()
        self._activity_builder = ActivityExecutionEventBuilder()

    def capture_workflow_start(
        self,
        workflow_execution_id: str,
    ) -> None:
        """Capture a workflow execution start event (fire-and-forget).

        Args:
            workflow_execution_id: Unique workflow execution identifier (UUID v4).

        """
        try:
            event = self._workflow_builder.build_start_event(
                workflow_execution_id=workflow_execution_id,
                entitlement_id=self._registry.entitlement_id,
            )
            self._registry.send_event(event)
        except Exception:
            logger.exception("Failed to capture workflow start event (fire-and-forget)")

    def capture_workflow_completed(
        self,
        workflow_execution_id: str,
        status: WorkflowTerminalStatus,
        duration_ms: int,
        activity_count: int,
        error_count: int,
        error_type: Literal["ActivityExecutionError"] | None = None,
    ) -> None:
        """Capture a workflow execution completed event (fire-and-forget).

        Args:
            workflow_execution_id: Unique workflow execution identifier (UUID v4).
            status: Final execution status.
            duration_ms: Duration in milliseconds.
            activity_count: Total number of activities executed.
            error_count: Number of activities that failed.
            error_type: Categorized error type if workflow failed.

        """
        try:
            event = self._workflow_builder.build_completed_event(
                workflow_execution_id=workflow_execution_id,
                status=status,
                duration_ms=duration_ms,
                activity_count=activity_count,
                error_count=error_count,
                error_type=error_type,
                entitlement_id=self._registry.entitlement_id,
            )
            self._registry.send_event(event)
        except Exception:
            logger.exception("Failed to capture workflow completed event (fire-and-forget)")

    def capture_activity_executed(
        self,
        workflow_execution_id: str,
        activity_type: ActivityType,
        activity_def: dict[str, object],
        status: ActivityTerminalStatus,
        duration_ms: int | None = None,
        action_type: str | None = None,
        inbound_activities: list[str] | None = None,
        outbound_activities: list[str] | None = None,
        error_type: Literal["ActivityExecutionError"] | None = None,
    ) -> None:
        """Capture an activity execution event (fire-and-forget).

        Args:
            workflow_execution_id: Links to parent workflow execution (UUID v4).
            activity_type: Type of activity executed.
            activity_def: Activity definition dictionary.
            status: Activity execution outcome.
            duration_ms: Activity execution duration in milliseconds.
            action_type: Optional action type for task activities.
            inbound_activities: Optional array of preceding activity hashes.
            outbound_activities: Optional array of following activity hashes.
            error_type: Categorized error type if activity failed.

        """
        try:
            event = self._activity_builder.build_event(
                workflow_execution_id=workflow_execution_id,
                activity_type=activity_type,
                activity_def=activity_def,
                status=status,
                duration_ms=duration_ms,
                action_type=action_type,
                inbound_activities=inbound_activities,
                outbound_activities=outbound_activities,
                error_type=error_type,
                entitlement_id=self._registry.entitlement_id,
            )
            self._registry.send_event(event)
        except Exception:
            logger.exception("Failed to capture activity execution event (fire-and-forget)")

    def emit_activity_telemetry(
        self,
        execution_id: UUID,
        activity_definitions_map: dict[str, dict[str, Any]],
        updated_activities: list[tuple[ActivityExecution, dict[str, Any]]],
    ) -> None:
        """Emit telemetry for activities that transitioned to a terminal state.

        Only emits when transitioning from a non-terminal to a terminal state
        to avoid duplicate emissions on re-sync.

        Args:
            execution_id: Workflow execution UUID.
            activity_definitions_map: Map of activity name to definition dict.
            updated_activities: List of (activity, old_values) tuples from DB sync.

        """
        workflow_execution_id = str(execution_id)
        logger.info(
            "emit_activity_telemetry called",
            execution_id=str(execution_id),
            updated_activities_count=len(updated_activities),
        )

        for activity, old_values in updated_activities:
            self._process_activity_telemetry(
                activity=activity,
                old_values=old_values,
                workflow_execution_id=workflow_execution_id,
                activity_definitions_map=activity_definitions_map,
                execution_id=execution_id,
            )

    def _should_emit_activity_telemetry(
        self,
        activity: ActivityExecution,
        old_values: dict[str, Any],
    ) -> ActivityTerminalStatus | None:
        """Check if activity telemetry should be emitted.

        Returns the telemetry status string if the activity transitioned to a
        terminal state, None otherwise.
        """
        if activity.status not in _TERMINAL_STATUSES:
            return None

        old_status = old_values.get("status")
        if old_status in _TERMINAL_STATUSES:
            return None

        return _STATUS_TO_TELEMETRY.get(activity.status)

    def _compute_activity_duration_ms(self, activity: ActivityExecution) -> int | None:
        """Compute activity duration in milliseconds from timestamps."""
        if activity.started_at and activity.completed_at:
            return int((activity.completed_at - activity.started_at).total_seconds() * 1000)
        return None

    def _log_skipped_telemetry(
        self,
        activity: ActivityExecution,
        old_status: ActivityStatus | str | None,
    ) -> None:
        """Log when telemetry emission is skipped."""
        logger.info(
            "Skipping activity telemetry - not a terminal transition",
            activity_name=activity.activity_name,
            current_status=_format_status_value(activity.status),
            old_status=_format_status_value(old_status),
            old_status_is_terminal=_is_terminal_status(old_status) if isinstance(old_status, ActivityStatus) else False,
            current_is_terminal=_is_terminal_status(activity.status),
        )

    def _process_activity_telemetry(
        self,
        activity: ActivityExecution,
        old_values: dict[str, Any],
        workflow_execution_id: str,
        activity_definitions_map: dict[str, dict[str, Any]],
        execution_id: UUID,
    ) -> None:
        """Process telemetry emission for a single activity."""
        try:
            telemetry_status = self._should_emit_activity_telemetry(activity, old_values)
            if not telemetry_status:
                old_status = old_values.get("status")
                self._log_skipped_telemetry(activity, old_status)
                return

            activity_def = activity_definitions_map.get(activity.activity_name, {})
            activity_type = activity_def.get("type", "task")
            is_failed = activity.status == ActivityStatus.FAILED
            error_type: Literal["ActivityExecutionError"] | None = "ActivityExecutionError" if is_failed else None
            duration_ms = self._compute_activity_duration_ms(activity)

            logger.info(
                "Emitting activity telemetry",
                activity_name=activity.activity_name,
                activity_type=activity_type,
                status=telemetry_status,
                duration_ms=duration_ms,
                is_failed=is_failed,
                workflow_execution_id=workflow_execution_id,
            )

            self.capture_activity_executed(
                workflow_execution_id=workflow_execution_id,
                activity_type=activity_type,
                activity_def=activity_def,
                status=telemetry_status,
                duration_ms=duration_ms,
                error_type=error_type,
            )
        except Exception:  # noqa: BLE001
            logger.info(
                "Failed to emit activity telemetry (fire-and-forget)",
                activity_name=activity.activity_name,
                execution_id=execution_id,
            )
