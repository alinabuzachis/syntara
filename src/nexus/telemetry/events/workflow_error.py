"""Workflow error telemetry event model and builder.

Defines the event emitted for engine-level (Temporal) workflow errors:
timeouts and automatic retries. Distinct from tool-level timeouts
tracked by ToolExecutionEvent.
"""

from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING

from sqlmodel import Field

if TYPE_CHECKING:
    from uuid import UUID

from nexus.telemetry.events.base import BaseTelemetryEvent

RETRY_REASON_MAX_LENGTH = 500


class TimedOutComponent(StrEnum):
    """Component that timed out in a workflow."""

    WORKFLOW = "workflow"
    ACTIVITY = "activity"


class WorkflowErrorEvent(BaseTelemetryEvent):
    """Telemetry event emitted when a workflow or activity times out at the engine level.

    Attributes:
        workflow_execution_id: Unique workflow execution identifier (UUID v4).
        timed_out_component: Whether the timeout occurred at the workflow or activity level.
        configured_timeout_seconds: The timeout threshold that was configured.
        elapsed_time_ms: Actual elapsed time before the timeout fired.
        activity_id: Activity node ID, populated only for activity-level timeouts.

    """

    workflow_execution_id: str = Field(description="Unique workflow execution identifier (UUID v4)")
    timed_out_component: TimedOutComponent = Field(
        description="Whether the workflow or an activity timed out",
    )
    configured_timeout_seconds: float = Field(
        ge=0,
        description="Configured timeout threshold in seconds",
    )
    elapsed_time_ms: int = Field(
        ge=0,
        description="Actual elapsed time in milliseconds before timeout",
    )
    activity_id: str | None = Field(
        default=None,
        description="Activity node ID (only for activity-level timeouts)",
    )
    retry_count: int = Field(
        default=0,
        ge=0,
        description="Number of retry attempts before timeout (0 = first attempt)",
    )
    error_type: str | None = Field(
        default=None,
        description="Name of the exception that caused the error",
    )
    retry_reason: str | None = Field(
        default=None,
        max_length=RETRY_REASON_MAX_LENGTH,
        description="Failure message from the previous attempt, truncated (only for retry events)",
    )


class WorkflowErrorEventBuilder:
    """Builder for constructing workflow error telemetry events."""

    def build_event(
        self,
        workflow_execution_id: str,
        timed_out_component: TimedOutComponent,
        configured_timeout_seconds: float,
        elapsed_time_ms: int,
        entitlement_id: str,
        activity_id: str | None = None,
        request_id: UUID | None = None,
        retry_count: int = 0,
        error_type: str | None = None,
        retry_reason: str | None = None,
    ) -> WorkflowErrorEvent:
        """Build a workflow error telemetry event.

        Args:
            workflow_execution_id: Unique workflow execution identifier (UUID v4).
            timed_out_component: Whether the workflow or an activity timed out.
            configured_timeout_seconds: Configured timeout threshold in seconds.
            elapsed_time_ms: Actual elapsed time in milliseconds.
            entitlement_id: Installation entitlement identifier.
            activity_id: Activity node ID (only for activity-level timeouts).
            request_id: Optional X-Request-Id from the originating HTTP request.
            retry_count: Number of retry attempts before timeout (0 = first attempt).
            error_type: Name of the exception that caused the error.
            retry_reason: Failure message from the previous attempt (only for retries).

        Returns:
            WorkflowErrorEvent instance.

        """
        return WorkflowErrorEvent(
            workflow_execution_id=workflow_execution_id,
            timed_out_component=timed_out_component,
            configured_timeout_seconds=configured_timeout_seconds,
            elapsed_time_ms=elapsed_time_ms,
            activity_id=activity_id,
            entitlement_id=entitlement_id,
            request_id=request_id,
            retry_count=retry_count,
            error_type=error_type,
            retry_reason=retry_reason,
        )
