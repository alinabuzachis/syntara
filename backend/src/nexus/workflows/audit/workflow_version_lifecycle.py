"""Audit handlers for workflow version lifecycle events.

Produces persistent AuditEvent records for version creation, restore,
publish, and unpublish operations.
"""

from __future__ import annotations

from nexus.audit.handler import AuditEventHandler
from nexus.audit.models.audit_event import (
    AuditEvent,
    EventCategory,
    EventSeverity,
    EventStatus,
)
from nexus.audit.models.structured_data import AuditContextData
from nexus.workflows.audit.workflow_version import (
    WorkflowVersionCreatedEvent,
    WorkflowVersionPublishedEvent,
    WorkflowVersionRestoredEvent,
    WorkflowVersionUnpublishedEvent,
)


class WorkflowVersionCreatedAuditHandler(AuditEventHandler[WorkflowVersionCreatedEvent]):
    """Records an audit entry when a new workflow version is created."""

    def handle(self, event: WorkflowVersionCreatedEvent) -> AuditEvent:
        """Map a WorkflowVersionCreatedEvent to an AuditEvent."""
        return AuditEvent(
            event_category=EventCategory.WORKFLOW_EVENT,
            event_severity=EventSeverity.INFO,
            event_status=EventStatus.SUCCESS,
            event_action="workflow_version_created",
            event_message=f"Workflow version {event.version} created",
            source_component="nexus.workflows",
            structured_data=AuditContextData(
                data_type="workflow-version-created",
                version=event.version,
            ),
            workflow_id=event.workflow_id,
            resource_urn=f"urn:nexus:workflow:{event.workflow_id}",
            resource_name=event.workflow_name,
        )


class WorkflowVersionRestoredAuditHandler(AuditEventHandler[WorkflowVersionRestoredEvent]):
    """Records an audit entry when a workflow version is restored."""

    def handle(self, event: WorkflowVersionRestoredEvent) -> AuditEvent:
        """Map a WorkflowVersionRestoredEvent to an AuditEvent."""
        return AuditEvent(
            event_category=EventCategory.WORKFLOW_EVENT,
            event_severity=EventSeverity.INFO,
            event_status=EventStatus.SUCCESS,
            event_action="workflow_version_restored",
            event_message=(
                f"Workflow restored from version {event.restored_from_version} as version {event.new_version}"
            ),
            source_component="nexus.workflows",
            structured_data=AuditContextData(
                data_type="workflow-version-restored",
                restored_from_version=event.restored_from_version,
                new_version=event.new_version,
            ),
            workflow_id=event.workflow_id,
            resource_urn=f"urn:nexus:workflow:{event.workflow_id}",
            resource_name=event.workflow_name,
        )


class WorkflowVersionPublishedAuditHandler(AuditEventHandler[WorkflowVersionPublishedEvent]):
    """Records an audit entry when a workflow version is published."""

    def handle(self, event: WorkflowVersionPublishedEvent) -> AuditEvent:
        """Map a WorkflowVersionPublishedEvent to an AuditEvent."""
        return AuditEvent(
            event_category=EventCategory.WORKFLOW_EVENT,
            event_severity=EventSeverity.INFO,
            event_status=EventStatus.SUCCESS,
            event_action="workflow_version_published",
            event_message=f"Workflow version {event.version} published",
            source_component="nexus.workflows",
            structured_data=AuditContextData(
                data_type="workflow-version-published",
                version=event.version,
            ),
            workflow_id=event.workflow_id,
            resource_urn=f"urn:nexus:workflow:{event.workflow_id}",
            resource_name=event.workflow_name,
        )


class WorkflowVersionUnpublishedAuditHandler(AuditEventHandler[WorkflowVersionUnpublishedEvent]):
    """Records an audit entry when a workflow is unpublished."""

    def handle(self, event: WorkflowVersionUnpublishedEvent) -> AuditEvent:
        """Map a WorkflowVersionUnpublishedEvent to an AuditEvent."""
        return AuditEvent(
            event_category=EventCategory.WORKFLOW_EVENT,
            event_severity=EventSeverity.INFO,
            event_status=EventStatus.SUCCESS,
            event_action="workflow_version_unpublished",
            event_message=f"Workflow version {event.version} unpublished",
            source_component="nexus.workflows",
            structured_data=AuditContextData(
                data_type="workflow-version-unpublished",
                version=event.version,
            ),
            workflow_id=event.workflow_id,
            resource_urn=f"urn:nexus:workflow:{event.workflow_id}",
            resource_name=event.workflow_name,
        )
