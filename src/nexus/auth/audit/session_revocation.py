"""Audit events and handlers for targeted session revocation."""

from dataclasses import dataclass

from nexus.audit.handler import AuditEventHandler
from nexus.audit.models.audit_event import (
    ActorType,
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
class SessionRevocationEvent:
    """Domain event emitted when an admin revokes sessions for a user or IdP."""

    actor_username: str
    actor_source: str  # "cli" (future-proofing for "api")
    target_type: str  # "user" or "idp"
    target_identifier: str  # username or IdP name
    sessions_revoked: int


# ---------------------------------------------------------------------------
# Handler
# ---------------------------------------------------------------------------


class SessionRevocationHandler(AuditEventHandler[SessionRevocationEvent]):
    """Maps a SessionRevocationEvent to a normalized AuditEvent."""

    def handle(self, event: SessionRevocationEvent) -> AuditEvent:
        """Map a SessionRevocationEvent to a normalized AuditEvent."""
        data = AuditContextData(
            data_type="session-revocation",
            target_type=event.target_type,
            target_identifier=event.target_identifier,
            sessions_revoked=event.sessions_revoked,
            actor_source=event.actor_source,
        )

        return AuditEvent(
            event_category=EventCategory.SECURITY_EVENT,
            event_severity=EventSeverity.CRITICAL,
            event_status=EventStatus.SUCCESS,
            event_action="session_revocation",
            event_message=(
                f"Revoked {event.sessions_revoked} session(s) for "
                f"{event.target_type} '{event.target_identifier}' "
                f"by {event.actor_username} via {event.actor_source}"
            ),
            source_component="nexus.auth.revocation",
            structured_data=data,
            actor_type=ActorType.USER,
            actor_username=event.actor_username,
        )
