"""Telemetry collector service.

Provides the main service for capturing and sending telemetry events
during workflow and node execution.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import structlog

from nexus.telemetry.client import TelemetryClientRegistry, get_telemetry_registry
from nexus.telemetry.events.node_execution import NodeExecutionEventBuilder
from nexus.telemetry.events.tool_execution import ToolExecutionEventBuilder
from nexus.telemetry.events.workflow_error import (
    TimedOutComponent,
    WorkflowErrorEventBuilder,
)
from nexus.telemetry.events.workflow_execution import WorkflowExecutionEventBuilder
from nexus.workflows.models.activity_execution import ActivityExecution, ActivityStatus
from nexus.workflows.workflow_engine.models.workflow_definition import ActivityName, ActivityTerminalStatus

if TYPE_CHECKING:
    from collections.abc import Callable
    from uuid import UUID

    from nexus.telemetry.events.base import BaseTelemetryEvent
    from nexus.tool_manager.models.tool_execution import ToolExecutionStatus
    from nexus.workflows.workflow_engine.models.workflow_definition import (
        NodeType,
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

    Coordinates event building and transmission for workflow and node
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
        self._node_builder = NodeExecutionEventBuilder()
        self._tool_builder = ToolExecutionEventBuilder()
        self._error_builder = WorkflowErrorEventBuilder()

    def _capture(self, build_fn: Callable[[], BaseTelemetryEvent], description: str) -> None:
        """Build and send a telemetry event (fire-and-forget).

        All capture methods delegate here so error handling is centralized.
        """
        try:
            self._registry.send_event(build_fn())
        except Exception:
            logger.exception("Failed to capture %s (fire-and-forget)", description)

    def capture_workflow_start(
        self,
        execution_id: str,
        request_id: UUID | None = None,
        trigger_activity_type: ActivityName | None = None,
    ) -> None:
        """Capture a workflow execution start event (fire-and-forget).

        Args:
            execution_id: Unique workflow execution identifier (UUID v4).
            request_id: Optional X-Request-Id from the originating HTTP request.
            trigger_activity_type: Type of trigger that started the workflow.

        """
        self._capture(
            lambda: self._workflow_builder.build_start_event(
                execution_id=execution_id,
                entitlement_id=self._registry.entitlement_id,
                request_id=request_id,
                trigger_activity_type=trigger_activity_type,
            ),
            "workflow start event",
        )

    def capture_workflow_completed(
        self,
        execution_id: str,
        status: WorkflowTerminalStatus,
        duration_ms: int,
        node_count: int,
        error_count: int,
        error_type: str | None = None,
        request_id: UUID | None = None,
    ) -> None:
        """Capture a workflow execution completed event (fire-and-forget).

        Args:
            execution_id: Unique workflow execution identifier (UUID v4).
            status: Final execution status.
            duration_ms: Duration in milliseconds.
            node_count: Total number of nodes executed.
            error_count: Number of nodes that failed.
            error_type: Name of the exception that caused the error.
            request_id: Optional X-Request-Id from the originating HTTP request.

        """
        self._capture(
            lambda: self._workflow_builder.build_completed_event(
                execution_id=execution_id,
                status=status,
                duration_ms=duration_ms,
                node_count=node_count,
                error_count=error_count,
                error_type=error_type,
                entitlement_id=self._registry.entitlement_id,
                request_id=request_id,
            ),
            "workflow completed event",
        )

    def capture_node_executed(
        self,
        execution_id: str,
        node_type: NodeType,
        node_def: dict[str, object],
        status: ActivityTerminalStatus,
        duration_ms: int | None = None,
        inbound_nodes: list[str] | None = None,
        outbound_nodes: list[str] | None = None,
        error_type: str | None = None,
        request_id: UUID | None = None,
    ) -> None:
        """Capture a node execution event (fire-and-forget).

        Args:
            execution_id: Links to parent workflow execution (UUID v4).
            node_type: Type of node executed.
            node_def: Node definition dictionary.
            status: Node execution outcome.
            duration_ms: Node execution duration in milliseconds.
            inbound_nodes: Optional array of preceding node hashes.
            outbound_nodes: Optional array of following node hashes.
            error_type: Name of the exception that caused the error.
            request_id: Optional X-Request-Id from the originating HTTP request.

        """
        self._capture(
            lambda: self._node_builder.build_event(
                execution_id=execution_id,
                node_type=node_type,
                node_def=node_def,
                status=status,
                duration_ms=duration_ms,
                inbound_nodes=inbound_nodes,
                outbound_nodes=outbound_nodes,
                error_type=error_type,
                entitlement_id=self._registry.entitlement_id,
                request_id=request_id,
            ),
            "node execution event",
        )

    def capture_tool_executed(
        self,
        namespaced_name: str,
        status: ToolExecutionStatus,
        duration_ms: int,
        execution_id: UUID | None = None,
    ) -> None:
        """Capture a tool execution telemetry event (fire-and-forget).

        Args:
            namespaced_name: Tool namespaced name.
            status: Execution status.
            duration_ms: Execution duration in milliseconds.
            execution_id: Optional parent workflow execution ID.

        """
        self._capture(
            lambda: self._tool_builder.build_event(
                namespaced_name=namespaced_name,
                status=status,
                duration_ms=duration_ms,
                execution_id=execution_id,
                entitlement_id=self._registry.entitlement_id,
            ),
            "tool execution event",
        )

    def capture_workflow_error(
        self,
        workflow_execution_id: str,
        timed_out_component: TimedOutComponent,
        configured_timeout_seconds: float,
        elapsed_time_ms: int,
        activity_id: str | None = None,
        request_id: UUID | None = None,
        retry_count: int = 0,
        error_type: str | None = None,
        retry_reason: str | None = None,
    ) -> None:
        """Capture a workflow engine-level error event (fire-and-forget).

        Args:
            workflow_execution_id: Unique workflow execution identifier (UUID v4).
            timed_out_component: Whether the workflow or an activity timed out.
            configured_timeout_seconds: Configured timeout threshold in seconds.
            elapsed_time_ms: Actual elapsed time in milliseconds.
            activity_id: Activity node ID (only for activity-level timeouts).
            request_id: Optional X-Request-Id from the originating HTTP request.
            retry_count: Number of retry attempts before timeout (0 = first attempt).
            error_type: Name of the exception that caused the error.
            retry_reason: Failure message from the previous attempt (only for retries).

        """
        self._capture(
            lambda: self._error_builder.build_event(
                workflow_execution_id=workflow_execution_id,
                timed_out_component=timed_out_component,
                configured_timeout_seconds=configured_timeout_seconds,
                elapsed_time_ms=elapsed_time_ms,
                activity_id=activity_id,
                entitlement_id=self._registry.entitlement_id,
                request_id=request_id,
                retry_count=retry_count,
                error_type=error_type,
                retry_reason=retry_reason,
            ),
            "workflow error event",
        )

    def emit_activity_telemetry(
        self,
        execution_id: UUID,
        activity_definitions_map: dict[str, dict[str, Any]],
        updated_activities: list[tuple[ActivityExecution, dict[str, Any]]],
        request_id: UUID | None = None,
    ) -> None:
        """Emit telemetry for activities that transitioned to a terminal state.

        Only emits when transitioning from a non-terminal to a terminal state
        to avoid duplicate emissions on re-sync.

        Args:
            execution_id: Workflow execution UUID.
            activity_definitions_map: Map of activity name to definition dict.
            updated_activities: List of (activity, old_values) tuples from DB sync.
            request_id: Optional X-Request-Id from the originating HTTP request.

        """
        logger.info(
            "emit_activity_telemetry called",
            execution_id=str(execution_id),
            updated_activities_count=len(updated_activities),
        )

        for activity, old_values in updated_activities:
            self._process_activity_telemetry(
                activity=activity,
                old_values=old_values,
                execution_id=execution_id,
                activity_definitions_map=activity_definitions_map,
                request_id=request_id,
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
        execution_id: UUID,
        activity_definitions_map: dict[str, dict[str, Any]],
        request_id: UUID | None = None,
    ) -> None:
        """Process telemetry emission for a single activity."""
        try:
            telemetry_status = self._should_emit_activity_telemetry(activity, old_values)
            if not telemetry_status:
                old_status = old_values.get("status")
                self._log_skipped_telemetry(activity, old_status)
                return

            activity_def = activity_definitions_map.get(activity.activity_name, {})
            node_type = activity_def.get("type", "script")
            is_failed = activity.status == ActivityStatus.FAILED
            error_type: str | None = "ActivityExecutionError" if is_failed else None
            duration_ms = self._compute_activity_duration_ms(activity)

            logger.info(
                "Emitting node telemetry",
                activity_name=activity.activity_name,
                node_type=node_type,
                status=telemetry_status,
                duration_ms=duration_ms,
                is_failed=is_failed,
                execution_id=str(execution_id),
            )

            self.capture_node_executed(
                execution_id=str(execution_id),
                node_type=node_type,
                node_def=activity_def,
                status=telemetry_status,
                duration_ms=duration_ms,
                error_type=error_type,
                request_id=request_id,
            )
        except Exception:  # noqa: BLE001
            logger.info(
                "Failed to emit node telemetry (fire-and-forget)",
                activity_name=activity.activity_name,
                execution_id=execution_id,
            )
