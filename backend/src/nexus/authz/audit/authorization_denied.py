"""AuthorizationDeniedEvent and handler for authz-domain audit."""

from dataclasses import dataclass, field
from uuid import UUID

from nexus.audit.handler import AuditEventHandler
from nexus.audit.models.audit_event import (
    ActorType,
    AuditEvent,
    EventCategory,
    EventSeverity,
    EventStatus,
)
from nexus.audit.models.structured_data import AuditContextData


@dataclass
class AuthorizationDeniedEvent:
    """Domain event emitted when a user is denied access to a resource."""

    user_id: UUID
    username: str
    resource_type: str
    action: str
    denied_by: str | None = field(default=None)


class AuthorizationDeniedHandler(AuditEventHandler[AuthorizationDeniedEvent]):
    """Maps an AuthorizationDeniedEvent to a normalized AuditEvent."""

    def handle(self, event: AuthorizationDeniedEvent) -> AuditEvent:
        """Map an AuthorizationDeniedEvent to a normalized AuditEvent."""
        data = AuditContextData(
            data_type="authorization-denied",
            resource_type=event.resource_type,
            action=event.action,
            denied_by=event.denied_by,
        )

        return AuditEvent(
            event_category=EventCategory.SECURITY_EVENT,
            event_severity=EventSeverity.WARNING,
            event_status=EventStatus.ERROR,
            event_action="authorization_denied",
            event_message=f"Authorization denied: {event.action} on {event.resource_type}",
            source_component="nexus.authz",
            structured_data=data,
            actor_id=event.user_id,
            actor_type=ActorType.USER,
            actor_username=event.username,
        )
