"""Workflow execution telemetry event models and builders.

Defines SQLModel models for workflow execution start and completion events,
plus builder classes for constructing events from workflow execution context.
"""

from __future__ import annotations

from typing import Literal

from sqlmodel import Field

from nexus.telemetry.events.base import BaseTelemetryEvent
from nexus.workflows.workflow_engine.models.workflow_definition import WorkflowTerminalStatus  # noqa: TC001


class WorkflowExecutionStartEvent(BaseTelemetryEvent):
    """Telemetry event emitted when workflow execution begins.

    Attributes:
        workflow_execution_id: Unique workflow execution identifier (UUID v4 format).

    """

    workflow_execution_id: str = Field(description="Unique workflow execution identifier (UUID v4)")


class WorkflowExecutionCompletedEvent(BaseTelemetryEvent):
    """Telemetry event emitted when workflow execution finishes.

    Attributes:
        workflow_execution_id: Unique workflow execution identifier (UUID v4 format).
        status: Final execution status.
        duration_ms: Duration in milliseconds.
        node_count: Total number of nodes executed.
        error_count: Number of nodes that failed.
        error_type: Categorized error type if workflow failed, null otherwise.

    """

    workflow_execution_id: str = Field(description="Unique workflow execution identifier (UUID v4)")
    status: WorkflowTerminalStatus
    duration_ms: int = Field(ge=0, description="Duration in milliseconds")
    node_count: int = Field(ge=0, description="Total number of nodes executed")
    error_count: int = Field(ge=0, description="Number of nodes that failed")
    error_type: Literal["ActivityExecutionError"] | None = Field(
        default=None,
        description="Categorized error type if workflow failed, null otherwise",
    )


class WorkflowExecutionEventBuilder:
    """Builder for constructing workflow execution telemetry events.

    Constructs both start and completion events from workflow execution context.
    """

    def build_start_event(
        self,
        workflow_execution_id: str,
        entitlement_id: str,
    ) -> WorkflowExecutionStartEvent:
        """Build a workflow execution start event.

        Args:
            workflow_execution_id: Unique workflow execution identifier (UUID v4).
            entitlement_id: Installation entitlement identifier.

        Returns:
            WorkflowExecutionStartEvent instance.

        """
        return WorkflowExecutionStartEvent(
            workflow_execution_id=workflow_execution_id,
            entitlement_id=entitlement_id,
        )

    def build_completed_event(
        self,
        workflow_execution_id: str,
        status: WorkflowTerminalStatus,
        duration_ms: int,
        node_count: int,
        error_count: int,
        entitlement_id: str,
        error_type: Literal["ActivityExecutionError"] | None = None,
    ) -> WorkflowExecutionCompletedEvent:
        """Build a workflow execution completed event.

        Args:
            workflow_execution_id: Unique workflow execution identifier (UUID v4).
            status: Final execution status.
            duration_ms: Duration in milliseconds.
            node_count: Total number of nodes executed.
            error_count: Number of nodes that failed.
            entitlement_id: Installation entitlement identifier.
            error_type: Categorized error type if workflow failed.

        Returns:
            WorkflowExecutionCompletedEvent instance.

        """
        return WorkflowExecutionCompletedEvent(
            workflow_execution_id=workflow_execution_id,
            status=status,
            duration_ms=duration_ms,
            node_count=node_count,
            error_count=error_count,
            error_type=error_type,
            entitlement_id=entitlement_id,
        )
