"""ToolProviderUpdateEvent and handler for tool provider update audit."""

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
class ToolProviderUpdateEvent:
    """Domain event representing tool provider update.

    The error_type field can be:
    - None: Success (no error)
    - str: Technical exception class name (e.g., "ProviderNameConflictError", "ProviderNotFoundError")
    """

    provider_id: UUID
    provider_name: str
    updated_fields: list[str] = field(default_factory=list)
    provider_type: str | None = field(default=None)
    error_type: str | None = field(default=None)


# ---------------------------------------------------------------------------
# Handler
# ---------------------------------------------------------------------------


class ToolProviderUpdateHandler(AuditEventHandler[ToolProviderUpdateEvent]):
    """Maps a ToolProviderUpdateEvent to a normalized AuditEvent."""

    def handle(self, event: ToolProviderUpdateEvent) -> AuditEvent:
        """Map a ToolProviderUpdateEvent to a normalized AuditEvent."""
        action = "provider_updated"
        is_error = event.error_type is not None

        if is_error:
            category = EventCategory.SYSTEM_OPERATION
            severity = EventSeverity.ERROR
            status = EventStatus.ERROR
            message = f"Tool provider update failed: {event.provider_name}"
            error_message: str | None = "Look at the Operational Logs for full diagnosis"
        else:
            category = EventCategory.SYSTEM_OPERATION
            severity = EventSeverity.INFO
            status = EventStatus.SUCCESS
            message = f"Tool provider updated: {event.provider_name}"
            error_message = None

        data = AuditContextData(
            data_type="provider-update-context",
            error_type=event.error_type,
            error_message=error_message,
            provider_name=event.provider_name,
            provider_type=event.provider_type,
            updated_fields=event.updated_fields,
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
