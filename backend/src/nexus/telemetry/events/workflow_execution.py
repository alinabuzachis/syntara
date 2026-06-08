"""Workflow execution telemetry event models.

Defines SQLModel models for workflow execution start and completion events.
"""

from __future__ import annotations

from sqlmodel import Field

from nexus.telemetry.events.base import BaseTelemetryEvent
from nexus.workflows.workflow_engine.models.workflow_definition import (  # noqa: TC001
    ActivityName,
    WorkflowTerminalStatus,
)


class WorkflowExecutionStartEvent(BaseTelemetryEvent):
    """Telemetry event emitted when workflow execution begins.

    Attributes:
        workflow_execution_id: Unique workflow execution identifier (UUID v4 format).
        trigger_type: Type of trigger that started the workflow (e.g. manual_trigger).

    """

    workflow_execution_id: str = Field(description="Unique workflow execution identifier (UUID v4)")
    trigger_type: ActivityName | None = Field(default=None, description="Type of trigger that started the workflow")


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
    error_type: str | None = Field(
        default=None,
        description="Name of the exception that caused the error, null otherwise",
    )
