"""ContextIntegrationEvent and ContextIntegrationHandler for context manager tracking."""

from dataclasses import dataclass
from enum import StrEnum
from uuid import UUID

from nexus.audit.emitter import AuditActorContext
from nexus.audit.handler import AuditEventHandler
from nexus.audit.models.audit_event import AuditEvent, EventCategory, EventSeverity, EventStatus
from nexus.audit.models.structured_data import AuditContextData

# ---------------------------------------------------------------------------
# Domain event
# ---------------------------------------------------------------------------


class ContextIntegrationStatus(StrEnum):
    """Status of context integration."""

    SUCCESS = "success"
    TIMEOUT = "timeout"
    FALLBACK = "fallback"


@dataclass
class ContextIntegrationEvent:
    """Track context manager integration.

    Emitted when context manager is called to enhance prompts.
    """

    session_id: str
    status: ContextIntegrationStatus
    grounding_score: float | None = None
    citations_count: int | None = None
    invocation_id: UUID | None = None
    execution_id: UUID | None = None
    actor_context: AuditActorContext | None = None
    error_type: str | None = None


# ---------------------------------------------------------------------------
# Handler
# ---------------------------------------------------------------------------

_STATUS_MESSAGE: dict[ContextIntegrationStatus, str] = {
    ContextIntegrationStatus.SUCCESS: "succeeded",
    ContextIntegrationStatus.TIMEOUT: "timed-out",
    ContextIntegrationStatus.FALLBACK: "fell back to original prompt",
}


class ContextIntegrationHandler(AuditEventHandler[ContextIntegrationEvent]):
    """Map ContextIntegrationEvent to normalized AuditEvent."""

    def handle(self, event: ContextIntegrationEvent) -> AuditEvent:
        """Map ContextIntegrationEvent to AuditEvent.

        Args:
            event: Domain event for context integration

        Returns:
            Normalized audit event

        """
        # Extract actor identity atomically from AuditActorContext
        actor_id = event.actor_context.actor_id if event.actor_context else None
        actor_username = event.actor_context.actor_username if event.actor_context else None
        actor_type = event.actor_context.actor_type if event.actor_context else None

        # Determine severity and status
        if event.status in (ContextIntegrationStatus.TIMEOUT, ContextIntegrationStatus.FALLBACK):
            severity = EventSeverity.WARNING
            status = EventStatus.SUCCESS
            error_type = None
            error_message = None
        else:
            severity = EventSeverity.INFO
            status = EventStatus.SUCCESS
            error_type = None
            error_message = None

        # Build structured data
        structured_data = AuditContextData(
            data_type="context_integration",
            error_type=error_type,
            error_message=error_message,
            status=event.status.value,
            session_id=event.session_id,
            invocation_id=event.invocation_id,
            grounding_score=event.grounding_score,
            citations_count=event.citations_count,
        )

        return AuditEvent(
            event_category=EventCategory.AGENT_INTERACTION,
            event_severity=severity,
            event_status=status,
            event_action="context_integration",
            event_message=f"Context integration {_STATUS_MESSAGE.get(event.status, 'succeeded')}",
            source_component="nexus.agent_orchestrator.agents.orchestrator",
            structured_data=structured_data,
            actor_id=actor_id,
            actor_username=actor_username,
            actor_type=actor_type,
            execution_id=event.execution_id,
            resource_urn=f"urn:nexus:execution:{event.execution_id}",
        )
