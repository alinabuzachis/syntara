"""Unit tests for workflow version lifecycle audit handlers."""

from uuid import uuid4

from nexus.audit.models.audit_event import EventCategory, EventSeverity, EventStatus
from nexus.workflows.audit.workflow_version import (
    WorkflowVersionCreatedEvent,
    WorkflowVersionPublishedEvent,
    WorkflowVersionRestoredEvent,
    WorkflowVersionUnpublishedEvent,
)
from nexus.workflows.audit.workflow_version_lifecycle import (
    WorkflowVersionCreatedAuditHandler,
    WorkflowVersionPublishedAuditHandler,
    WorkflowVersionRestoredAuditHandler,
    WorkflowVersionUnpublishedAuditHandler,
)

WORKFLOW_ID = uuid4()


class TestWorkflowVersionCreatedAuditHandler:
    """Tests for WorkflowVersionCreatedAuditHandler."""

    def test_produces_audit_event(self) -> None:
        event = WorkflowVersionCreatedEvent(workflow_id=WORKFLOW_ID, workflow_name="test-wf", version=3)
        audit_event = WorkflowVersionCreatedAuditHandler().handle(event)

        assert audit_event is not None
        assert audit_event.event_category == EventCategory.WORKFLOW_EVENT
        assert audit_event.event_severity == EventSeverity.INFO
        assert audit_event.event_status == EventStatus.SUCCESS
        assert audit_event.event_action == "workflow_version_created"
        assert audit_event.source_component == "nexus.workflows"
        assert audit_event.workflow_id == WORKFLOW_ID
        assert audit_event.resource_urn == f"urn:nexus:workflow:{WORKFLOW_ID}"
        assert audit_event.resource_name == "test-wf"
        assert audit_event.event_message == "Workflow version 3 created"

    def test_structured_data_contains_version(self) -> None:
        event = WorkflowVersionCreatedEvent(workflow_id=WORKFLOW_ID, workflow_name="test-wf", version=5)
        audit_event = WorkflowVersionCreatedAuditHandler().handle(event)

        assert audit_event.structured_data.data_type == "workflow-version-created"
        assert audit_event.structured_data.version == 5  # type: ignore[attr-defined]


class TestWorkflowVersionRestoredAuditHandler:
    """Tests for WorkflowVersionRestoredAuditHandler."""

    def test_produces_audit_event(self) -> None:
        event = WorkflowVersionRestoredEvent(
            workflow_id=WORKFLOW_ID,
            workflow_name="test-wf",
            restored_from_version=2,
            new_version=6,
        )
        audit_event = WorkflowVersionRestoredAuditHandler().handle(event)

        assert audit_event is not None
        assert audit_event.event_category == EventCategory.WORKFLOW_EVENT
        assert audit_event.event_severity == EventSeverity.INFO
        assert audit_event.event_status == EventStatus.SUCCESS
        assert audit_event.event_action == "workflow_version_restored"
        assert audit_event.source_component == "nexus.workflows"
        assert audit_event.workflow_id == WORKFLOW_ID
        assert audit_event.resource_urn == f"urn:nexus:workflow:{WORKFLOW_ID}"
        assert audit_event.resource_name == "test-wf"
        assert "version 2" in audit_event.event_message
        assert "version 6" in audit_event.event_message

    def test_structured_data_contains_versions(self) -> None:
        event = WorkflowVersionRestoredEvent(
            workflow_id=WORKFLOW_ID,
            workflow_name="test-wf",
            restored_from_version=1,
            new_version=4,
        )
        audit_event = WorkflowVersionRestoredAuditHandler().handle(event)

        assert audit_event.structured_data.data_type == "workflow-version-restored"
        assert audit_event.structured_data.restored_from_version == 1  # type: ignore[attr-defined]
        assert audit_event.structured_data.new_version == 4  # type: ignore[attr-defined]


class TestWorkflowVersionPublishedAuditHandler:
    """Tests for WorkflowVersionPublishedAuditHandler."""

    def test_produces_audit_event(self) -> None:
        event = WorkflowVersionPublishedEvent(workflow_id=WORKFLOW_ID, workflow_name="test-wf", version=2)
        audit_event = WorkflowVersionPublishedAuditHandler().handle(event)

        assert audit_event is not None
        assert audit_event.event_category == EventCategory.WORKFLOW_EVENT
        assert audit_event.event_severity == EventSeverity.INFO
        assert audit_event.event_status == EventStatus.SUCCESS
        assert audit_event.event_action == "workflow_version_published"
        assert audit_event.source_component == "nexus.workflows"
        assert audit_event.workflow_id == WORKFLOW_ID
        assert audit_event.resource_urn == f"urn:nexus:workflow:{WORKFLOW_ID}"
        assert audit_event.resource_name == "test-wf"
        assert audit_event.event_message == "Workflow version 2 published"

    def test_structured_data_contains_version(self) -> None:
        event = WorkflowVersionPublishedEvent(workflow_id=WORKFLOW_ID, workflow_name="test-wf", version=3)
        audit_event = WorkflowVersionPublishedAuditHandler().handle(event)

        assert audit_event.structured_data.data_type == "workflow-version-published"
        assert audit_event.structured_data.version == 3  # type: ignore[attr-defined]


class TestWorkflowVersionUnpublishedAuditHandler:
    """Tests for WorkflowVersionUnpublishedAuditHandler."""

    def test_produces_audit_event(self) -> None:
        event = WorkflowVersionUnpublishedEvent(workflow_id=WORKFLOW_ID, workflow_name="test-wf", version=4)
        audit_event = WorkflowVersionUnpublishedAuditHandler().handle(event)

        assert audit_event is not None
        assert audit_event.event_category == EventCategory.WORKFLOW_EVENT
        assert audit_event.event_severity == EventSeverity.INFO
        assert audit_event.event_status == EventStatus.SUCCESS
        assert audit_event.event_action == "workflow_version_unpublished"
        assert audit_event.source_component == "nexus.workflows"
        assert audit_event.workflow_id == WORKFLOW_ID
        assert audit_event.resource_urn == f"urn:nexus:workflow:{WORKFLOW_ID}"
        assert audit_event.resource_name == "test-wf"
        assert audit_event.event_message == "Workflow version 4 unpublished"

    def test_structured_data_contains_version(self) -> None:
        event = WorkflowVersionUnpublishedEvent(workflow_id=WORKFLOW_ID, workflow_name="test-wf", version=1)
        audit_event = WorkflowVersionUnpublishedAuditHandler().handle(event)

        assert audit_event.structured_data.data_type == "workflow-version-unpublished"
        assert audit_event.structured_data.version == 1  # type: ignore[attr-defined]
