"""Workflow-completed domain event and audit handler.

Emits an audit trail event when a workflow execution reaches a terminal state.

Requirement: AAP-74303
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from nexus.audit.handler import AuditEventHandler
from nexus.audit.models.audit_event import AuditEvent, EventCategory, EventSeverity, EventStatus
from nexus.audit.models.structured_data import AuditContextData
from nexus.workflows.workflow_engine.models.workflow_definition import WorkflowTerminalStatus

if TYPE_CHECKING:
    from uuid import UUID


@dataclass
class WorkflowCompletedEvent:
    """Domain event fired when a workflow execution reaches a terminal state."""

    execution_id: UUID
    workflow_id: UUID
    status: WorkflowTerminalStatus
    duration_ms: int
    node_count: int
    error_count: int
    error_type: str | None = field(default=None)
    request_id: UUID | None = field(default=None)
    workflow_name: str | None = field(default=None)


_STATUS_MESSAGE: dict[WorkflowTerminalStatus, str] = {
    WorkflowTerminalStatus.COMPLETED: "Workflow execution completed",
    WorkflowTerminalStatus.FAILED: "Workflow execution failed",
    WorkflowTerminalStatus.CANCELLED: "Workflow execution cancelled",
}


class WorkflowCompletedHandler(AuditEventHandler[WorkflowCompletedEvent]):
    """Maps a WorkflowCompletedEvent to an AuditEvent."""

    def handle(self, event: WorkflowCompletedEvent) -> AuditEvent:
        """Map a WorkflowCompletedEvent to a normalized AuditEvent."""
        is_failure = event.status == WorkflowTerminalStatus.FAILED

        data = AuditContextData(
            data_type="workflow-execution-completed",
            error_type=event.error_type,
            status=event.status.value,
            duration_ms=event.duration_ms,
            node_count=event.node_count,
            error_count=event.error_count,
        )

        return AuditEvent(
            event_category=EventCategory.WORKFLOW_EVENT,
            event_severity=EventSeverity.ERROR if is_failure else EventSeverity.INFO,
            event_status=EventStatus.ERROR if is_failure else EventStatus.SUCCESS,
            event_action="workflow_execution_completed",
            event_message=_STATUS_MESSAGE.get(event.status, "Workflow execution completed"),
            source_component="nexus.workflows",
            structured_data=data,
            execution_id=event.execution_id,
            resource_urn=f"urn:nexus:workflow:{event.workflow_id}",
            resource_name=event.workflow_name,
        )
