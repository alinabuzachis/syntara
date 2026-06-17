"""Unit tests for WorkflowCompletedEvent audit handler."""

from uuid import uuid4

from nexus.audit.models.audit_event import EventCategory, EventSeverity, EventStatus
from nexus.workflows.audit.workflow_completed import (
    WorkflowCompletedEvent,
    WorkflowCompletedHandler,
)
from nexus.workflows.workflow_engine.models.workflow_definition import WorkflowTerminalStatus

EXECUTION_ID = uuid4()
WORKFLOW_ID = uuid4()
REQUEST_ID = uuid4()


class TestWorkflowCompletedHandler:
    """Tests for WorkflowCompletedHandler."""

    def test_produces_audit_event_for_completed_workflow(self) -> None:
        event = WorkflowCompletedEvent(
            execution_id=EXECUTION_ID,
            workflow_id=WORKFLOW_ID,
            status=WorkflowTerminalStatus.COMPLETED,
            duration_ms=5000,
            node_count=10,
            error_count=0,
            request_id=REQUEST_ID,
        )

        handler = WorkflowCompletedHandler()
        audit_event = handler.handle(event)

        assert audit_event is not None
        assert audit_event.event_category == EventCategory.WORKFLOW_EVENT
        assert audit_event.event_severity == EventSeverity.INFO
        assert audit_event.event_status == EventStatus.SUCCESS
        assert audit_event.event_action == "workflow_execution_completed"
        assert audit_event.source_component == "nexus.workflows"
        assert audit_event.execution_id == EXECUTION_ID

    def test_produces_error_severity_for_failed_workflow(self) -> None:
        event = WorkflowCompletedEvent(
            execution_id=EXECUTION_ID,
            workflow_id=WORKFLOW_ID,
            status=WorkflowTerminalStatus.FAILED,
            duration_ms=3000,
            node_count=5,
            error_count=2,
            error_type="ActivityExecutionError",
        )

        handler = WorkflowCompletedHandler()
        audit_event = handler.handle(event)

        assert audit_event is not None
        assert audit_event.event_severity == EventSeverity.ERROR
        assert audit_event.event_status == EventStatus.ERROR

    def test_produces_info_severity_for_cancelled_workflow(self) -> None:
        event = WorkflowCompletedEvent(
            execution_id=EXECUTION_ID,
            workflow_id=WORKFLOW_ID,
            status=WorkflowTerminalStatus.CANCELLED,
            duration_ms=2000,
            node_count=3,
            error_count=0,
        )

        handler = WorkflowCompletedHandler()
        audit_event = handler.handle(event)

        assert audit_event is not None
        assert audit_event.event_severity == EventSeverity.INFO
        assert audit_event.event_status == EventStatus.SUCCESS

    def test_structured_data_fields(self) -> None:
        event = WorkflowCompletedEvent(
            execution_id=EXECUTION_ID,
            workflow_id=WORKFLOW_ID,
            status=WorkflowTerminalStatus.FAILED,
            duration_ms=8500,
            node_count=12,
            error_count=3,
            error_type="ConnectionError",
        )

        handler = WorkflowCompletedHandler()
        audit_event = handler.handle(event)

        assert audit_event is not None
        data = audit_event.structured_data
        assert data.data_type == "workflow-execution-completed"
        assert data.error_type == "ConnectionError"
        assert data.status == "failed"  # type: ignore[attr-defined]
        assert data.duration_ms == 8500  # type: ignore[attr-defined]
        assert data.node_count == 12  # type: ignore[attr-defined]
        assert data.error_count == 3  # type: ignore[attr-defined]

    def test_event_message_for_completed_status(self) -> None:
        event = WorkflowCompletedEvent(
            execution_id=EXECUTION_ID,
            workflow_id=WORKFLOW_ID,
            status=WorkflowTerminalStatus.COMPLETED,
            duration_ms=1000,
            node_count=5,
            error_count=0,
        )

        handler = WorkflowCompletedHandler()
        audit_event = handler.handle(event)

        assert audit_event is not None
        assert audit_event.event_message == "Workflow execution completed"

    def test_event_message_for_failed_status(self) -> None:
        event = WorkflowCompletedEvent(
            execution_id=EXECUTION_ID,
            workflow_id=WORKFLOW_ID,
            status=WorkflowTerminalStatus.FAILED,
            duration_ms=1000,
            node_count=5,
            error_count=1,
        )

        handler = WorkflowCompletedHandler()
        audit_event = handler.handle(event)

        assert audit_event is not None
        assert audit_event.event_message == "Workflow execution failed"

    def test_resource_fields_with_workflow_name(self) -> None:
        """Resource fields use workflow_id for URN and workflow_name for resource_name."""
        event = WorkflowCompletedEvent(
            execution_id=EXECUTION_ID,
            workflow_id=WORKFLOW_ID,
            status=WorkflowTerminalStatus.COMPLETED,
            duration_ms=5000,
            node_count=10,
            error_count=0,
            workflow_name="Deploy to Production",
        )

        handler = WorkflowCompletedHandler()
        audit_event = handler.handle(event)

        assert audit_event.resource_urn == f"urn:nexus:workflow:{WORKFLOW_ID}"
        assert audit_event.resource_name == "Deploy to Production"

    def test_resource_fields_without_workflow_name(self) -> None:
        """Resource URN is set even when workflow_name is None."""
        event = WorkflowCompletedEvent(
            execution_id=EXECUTION_ID,
            workflow_id=WORKFLOW_ID,
            status=WorkflowTerminalStatus.COMPLETED,
            duration_ms=5000,
            node_count=10,
            error_count=0,
            workflow_name=None,
        )

        handler = WorkflowCompletedHandler()
        audit_event = handler.handle(event)

        assert audit_event.resource_urn == f"urn:nexus:workflow:{WORKFLOW_ID}"
        assert audit_event.resource_name is None
