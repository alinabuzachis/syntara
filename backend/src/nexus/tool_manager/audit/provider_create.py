"""ToolProviderCreateEvent and handler for tool provider creation audit."""

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
from nexus.tool_manager.models.tool_provider import ProviderStatus

# ---------------------------------------------------------------------------
# Domain event
# ---------------------------------------------------------------------------


@dataclass
class ToolProviderCreateEvent:
    """Domain event representing tool provider creation.

    The error_type field can be:
    - None: Success (no error)
    - str: Technical exception class name (e.g., "ProviderNameConflictError")
    """

    provider_id: UUID
    provider_name: str
    provider_type: str
    description: str | None = field(default=None)
    initial_status: ProviderStatus = field(default=ProviderStatus.VALIDATING)
    error_type: str | None = field(default=None)


# ---------------------------------------------------------------------------
# Handler
# ---------------------------------------------------------------------------


class ToolProviderCreateHandler(AuditEventHandler[ToolProviderCreateEvent]):
    """Maps a ToolProviderCreateEvent to a normalized AuditEvent."""

    def handle(self, event: ToolProviderCreateEvent) -> AuditEvent:
        """Map a ToolProviderCreateEvent to a normalized AuditEvent."""
        action = "provider_created"
        is_error = event.error_type is not None

        if is_error:
            category = EventCategory.SYSTEM_OPERATION
            severity = EventSeverity.ERROR
            status = EventStatus.ERROR
            message = f"Tool provider creation failed: {event.provider_name}"
            error_message: str | None = "Look at the Operational Logs for full diagnosis"
        else:
            category = EventCategory.SYSTEM_OPERATION
            severity = EventSeverity.INFO
            status = EventStatus.SUCCESS
            message = f"Tool provider created: {event.provider_name}"
            error_message = None

        data = AuditContextData(
            data_type="provider-create-context",
            error_type=event.error_type,
            error_message=error_message,
            provider_type=event.provider_type,
            provider_name=event.provider_name,
            description=event.description,
            initial_status=event.initial_status.value,
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
