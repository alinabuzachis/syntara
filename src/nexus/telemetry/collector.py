"""Telemetry collector service.

Provides the main service for capturing and sending telemetry events
during workflow execution.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import structlog

from nexus.telemetry.client import TelemetryClientRegistry, get_telemetry_registry
from nexus.telemetry.events.tool_execution import ToolExecutionEventBuilder
from nexus.telemetry.events.workflow_error import (
    TimedOutComponent,
    WorkflowErrorEventBuilder,
)
from nexus.telemetry.events.workflow_execution import WorkflowExecutionEventBuilder
from nexus.workflows.models.activity_execution import ActivityStatus

if TYPE_CHECKING:
    from collections.abc import Callable
    from uuid import UUID

    from nexus.telemetry.events.base import BaseTelemetryEvent
    from nexus.tool_manager.models.tool_execution import ToolExecutionStatus
    from nexus.workflows.workflow_engine.models.workflow_definition import (
        ActivityName,
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
