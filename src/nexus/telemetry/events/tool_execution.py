"""Tool execution telemetry event model and builder.

Defines the event emitted for each tool execution reaching a terminal state.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID  # noqa: TC003

from sqlmodel import Field

from nexus.telemetry.events.base import BaseTelemetryEvent
from nexus.tool_manager.models.tool_execution import ToolExecutionStatus  # noqa: TC001


class ToolExecutionEvent(BaseTelemetryEvent):
    """Telemetry event emitted for each tool execution reaching a terminal state."""

    namespaced_name: str = Field(description="Tool namespaced name (e.g., mcp::get_greeting)")
    status: ToolExecutionStatus = Field(description="Execution status: success, error, timeout")
    duration_ms: int = Field(ge=0, description="Execution duration in milliseconds")
    workflow_execution_id: UUID | None = Field(
        default=None,
        description="Parent workflow execution identifier (UUID v4)",
    )


class ToolExecutionEventBuilder:
    """Builder for constructing tool execution telemetry events."""

    def build_event(
        self,
        namespaced_name: str,
        status: ToolExecutionStatus,
        duration_ms: int,
        entitlement_id: str,
        execution_id: UUID | None = None,
    ) -> ToolExecutionEvent:
        """Build a tool execution telemetry event.

        Args:
            namespaced_name: Tool namespaced name.
            status: Execution status.
            duration_ms: Execution duration in milliseconds.
            entitlement_id: Installation entitlement identifier.
            execution_id: Optional parent workflow execution ID.

        Returns:
            ToolExecutionEvent instance.

        """
        return ToolExecutionEvent(
            namespaced_name=namespaced_name,
            status=status,
            duration_ms=duration_ms,
            workflow_execution_id=execution_id,
            entitlement_id=entitlement_id,
        )


@dataclass
class ToolExecutedEvent:
    """Domain event fired when a tool execution reaches a terminal state."""

    namespaced_name: str
    status: ToolExecutionStatus
    duration_ms: int
    execution_id: UUID | None = field(default=None)
