"""ToolProviderDeleteEvent and handler for tool provider deletion audit."""

from dataclasses import dataclass, field
from uuid import UUID

from nexus.audit.handler import AuditEventHandler
from nexus.audit.models.audit_event import (
    AuditEvent,
    EventCategory,
    EventSeverity,
    EventStatus,
)
from nexus.audit.models.structured_data import AuditContextData

# ---------------------------------------------------------------------------
# Domain event
# ---------------------------------------------------------------------------


@dataclass
class ToolProviderDeleteEvent:
    """Domain event representing tool provider deletion (soft delete).

    The error_type field can be:
    - None: Success (no error)
    - str: Technical exception class name (e.g., "ProviderNotFoundError")
    """

    provider_id: UUID
    provider_name: str
    tools_deleted: int = field(default=0)
    error_type: str | None = field(default=None)


# ---------------------------------------------------------------------------
# Handler
# ---------------------------------------------------------------------------


class ToolProviderDeleteHandler(AuditEventHandler[ToolProviderDeleteEvent]):
    """Maps a ToolProviderDeleteEvent to a normalized AuditEvent."""

    def handle(self, event: ToolProviderDeleteEvent) -> AuditEvent:
        """Map a ToolProviderDeleteEvent to a normalized AuditEvent."""
        action = "provider_deleted"
        is_error = event.error_type is not None

        if is_error:
            category = EventCategory.SYSTEM_OPERATION
            severity = EventSeverity.ERROR
            status = EventStatus.ERROR
            message = f"Tool provider deletion failed: {event.provider_name}"
            error_message: str | None = "Look at the Operational Logs for full diagnosis"
        else:
            category = EventCategory.SYSTEM_OPERATION
            severity = EventSeverity.INFO
            status = EventStatus.SUCCESS
            message = f"Tool provider deleted: {event.provider_name}"
            error_message = None

        data = AuditContextData(
            data_type="provider-delete-context",
            error_type=event.error_type,
            error_message=error_message,
            provider_name=event.provider_name,
            tools_deleted=event.tools_deleted,
        )

        return AuditEvent(
            event_category=category,
            event_severity=severity,
            event_status=status,
            event_action=action,
            event_message=message,
            source_component="nexus.tool_manager.provider",
            structured_data=data,
            resource_urn=f"urn:nexus:tool-provider:{event.provider_id}",
            resource_name=event.provider_name,
        )
