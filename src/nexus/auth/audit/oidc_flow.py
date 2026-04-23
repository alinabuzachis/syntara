"""OIDCFlowEvent and OIDCFlowHandler for OIDC flow audit."""

from dataclasses import dataclass
from enum import StrEnum
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


class OIDCStage(StrEnum):
    """Stage of the OIDC flow being audited."""

    AUTHORIZE = "authorize"
    CALLBACK = "callback"


# ---------------------------------------------------------------------------
# Domain event
# ---------------------------------------------------------------------------


@dataclass
class OIDCFlowEvent:
    """Domain event representing a step or completion in an OIDC flow."""

    provider_id: UUID | None
    stage: OIDCStage
    user_id: UUID | None = None
    error_type: str | None = None


# ---------------------------------------------------------------------------
# Handler
# ---------------------------------------------------------------------------


class OIDCFlowHandler(AuditEventHandler[OIDCFlowEvent]):
    """Maps an OIDCFlowEvent to a normalized AuditEvent."""

    def handle(self, event: OIDCFlowEvent) -> AuditEvent:
        """Map an OIDCFlowEvent to a normalized AuditEvent."""
        provider_id_str = str(event.provider_id) if event.provider_id is not None else None
        actor_type = ActorType.USER if event.user_id else ActorType.SYSTEM
        action = f"oidc_{event.stage}"

        is_error = event.error_type is not None

        if is_error:
            category = EventCategory.SECURITY_EVENT
            status = EventStatus.ERROR
            severity = EventSeverity.ERROR
            message = f"OIDC {event.stage} failed"
            error_message: str | None = "Look at the Operational Logs for full diagnosis"
        else:
            category = EventCategory.USER_ACTION
            severity = EventSeverity.INFO
            status = EventStatus.SUCCESS
            message = f"OIDC {event.stage} completed"
            error_message = None

        data = AuditContextData(
            data_type="oidc-context",
            error_type=event.error_type,
            error_message=error_message,
            provider_id=provider_id_str,
            stage=event.stage.value,
        )

        return AuditEvent(
            event_category=category,
            event_severity=severity,
            event_status=status,
            event_action=action,
            event_message=message,
            source_component="nexus.auth.oidc",
            structured_data=data,
            actor_id=event.user_id,
            actor_type=actor_type,
        )
