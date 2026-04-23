"""SessionLifecycleEvent and SessionLifecycleHandler for auth-domain audit."""

from dataclasses import dataclass, field
from enum import StrEnum
from typing import ClassVar
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

# ---------------------------------------------------------------------------
# Helper types
# ---------------------------------------------------------------------------


class SessionAction(StrEnum):
    """Session lifecycle action being audited."""

    CREATE = "create"
    REVOKE = "revoke"
    REFRESH = "refresh"


# ---------------------------------------------------------------------------
# Domain event
# ---------------------------------------------------------------------------


@dataclass
class SessionLifecycleEvent:
    """Domain event representing a session lifecycle action."""

    action: SessionAction
    user_id: UUID
    jti: str | None = field(default=None)
    idp: str | None = field(default=None)
    error_type: str | None = field(default=None)


# ---------------------------------------------------------------------------
# Handler
# ---------------------------------------------------------------------------


class SessionLifecycleHandler(AuditEventHandler[SessionLifecycleEvent]):
    """Maps a SessionLifecycleEvent to a normalized AuditEvent."""

    _ACTION_NAMES: ClassVar[dict[SessionAction, str]] = {
        SessionAction.CREATE: "session_created",
        SessionAction.REVOKE: "session_revoked",
        SessionAction.REFRESH: "session_refreshed",
    }

    def handle(self, event: SessionLifecycleEvent) -> AuditEvent:
        """Map a SessionLifecycleEvent to a normalized AuditEvent."""
        action = SessionLifecycleHandler._ACTION_NAMES[event.action]
        is_error = event.error_type is not None

        if is_error:
            category = EventCategory.SECURITY_EVENT
            severity = EventSeverity.ERROR
            status = EventStatus.ERROR
            message = f"Session {event.action} failed"
            error_message: str | None = "Look at the Operational Logs for full diagnosis"
        else:
            category = EventCategory.USER_ACTION
            severity = EventSeverity.INFO
            status = EventStatus.SUCCESS
            message = f"Session {event.action}"
            error_message = None

        data = AuditContextData(
            data_type="session-lifecycle-context",
            error_type=event.error_type,
            error_message=error_message,
            jti=event.jti,
            idp=event.idp,
            lifecycle_action=event.action.value,
        )

        return AuditEvent(
            event_category=category,
            event_severity=severity,
            event_status=status,
            event_action=action,
            event_message=message,
            source_component="nexus.auth.session",
            structured_data=data,
            actor_id=event.user_id,
            actor_type=ActorType.USER,
        )
