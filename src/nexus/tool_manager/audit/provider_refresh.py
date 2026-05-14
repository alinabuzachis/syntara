"""ToolProviderRefreshEvent and handler for tool provider refresh audit."""

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
class ToolProviderRefreshEvent:
    """Domain event representing tool provider refresh operation.

    The error_type field can be:
    - None: Success (no error)
    - str: Technical exception class name (e.g., "ToolRefreshError")
    """

    provider_id: UUID
    provider_name: str
    refreshed_count: int = field(default=0)
    updated_count: int = field(default=0)
    disabled_count: int = field(default=0)
    error_type: str | None = field(default=None)


# ---------------------------------------------------------------------------
# Handler
# ---------------------------------------------------------------------------


class ToolProviderRefreshHandler(AuditEventHandler[ToolProviderRefreshEvent]):
    """Maps a ToolProviderRefreshEvent to a normalized AuditEvent."""

    def handle(self, event: ToolProviderRefreshEvent) -> AuditEvent:
        """Map a ToolProviderRefreshEvent to a normalized AuditEvent."""
        action = "provider_tools_refreshed"
        is_error = event.error_type is not None

        if is_error:
            category = EventCategory.SYSTEM_OPERATION
            severity = EventSeverity.ERROR
            status = EventStatus.ERROR
            message = f"Tool provider refresh failed: {event.provider_name}"
            error_message: str | None = "Look at the Operational Logs for full diagnosis"
        else:
            category = EventCategory.SYSTEM_OPERATION
            severity = EventSeverity.INFO
            status = EventStatus.SUCCESS
            message = f"Tool provider refresh completed: {event.provider_name}"
            error_message = None

        data = AuditContextData(
            data_type="provider-refresh-context",
            error_type=event.error_type,
            error_message=error_message,
            provider_name=event.provider_name,
            refreshed_count=event.refreshed_count,
            updated_count=event.updated_count,
            disabled_count=event.disabled_count,
            total_tools=event.refreshed_count + event.updated_count,
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
