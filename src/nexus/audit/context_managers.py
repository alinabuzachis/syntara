"""Context managers for audit event capture and specialized use cases."""

from collections.abc import Generator
from contextlib import contextmanager
from typing import Any
from uuid import UUID

from nexus.audit.emitter import (
    activity_id_context_var,
    actor_id_context_var,
    actor_type_context_var,
    emit_audit_event,
    execution_id_context_var,
    workflow_id_context_var,
)
from nexus.audit.models import (
    ActorType,
    AuditContextData,
    AuditEvent,
    BaseAuditData,
    EventCategory,
    EventSeverity,
    EventStatus,
)
from nexus.audit.utils import escalate_severity

_RESERVED_AUDIT_FIELDS = frozenset(BaseAuditData.model_fields.keys())


@contextmanager
def actor_context(
    actor_id: UUID | None = None,
    actor_type: ActorType = ActorType.USER,
    workflow_id: UUID | None = None,
    activity_id: str | None = None,
    execution_id: UUID | None = None,
) -> Generator[None, None, None]:
    """Context manager to inject actor context for audit events.

    Ensures all audit events within this context include proper actor linkage.

    Args:
        actor_id: The actor ID to associate with all events
        actor_type: Type of actor (user, system, service)
        workflow_id: Optional workflow identifier for workflow-scoped events
        activity_id: Optional workflow activity identifier for workflow-scoped events
        execution_id: Optional execution identifier for execution tracing

    """
    # Set new context using context variables for async-safe operations
    token_actor_id = actor_id_context_var.set(actor_id)
    token_actor_type = actor_type_context_var.set(actor_type)
    token_workflow_id = workflow_id_context_var.set(workflow_id)
    token_activity_id = activity_id_context_var.set(activity_id)
    token_execution_id = execution_id_context_var.set(execution_id)

    try:
        yield
    finally:
        # Restore previous context using reset tokens
        actor_id_context_var.reset(token_actor_id)
        actor_type_context_var.reset(token_actor_type)
        workflow_id_context_var.reset(token_workflow_id)
        activity_id_context_var.reset(token_activity_id)
        execution_id_context_var.reset(token_execution_id)


@contextmanager
def audit_context(
    event_category: EventCategory,
    event_action: str,
    source_component: str,
    actor_id: UUID | None,
    actor_type: ActorType,
    event_severity: EventSeverity = EventSeverity.INFO,
    **context_data: Any,  # noqa: ANN401
) -> Generator[None, None, None]:
    """Context manager for capturing audit events with additional context.

    Args:
        event_category: Category of the audit event
        event_action: Action being performed
        source_component: Component performing the action
        actor_id: The actor ID to associate with the audit event
        actor_type: Type of actor (user, system, service)
        event_severity: Severity level of the audit event (defaults to INFO).
            On exception, severity is escalated to at least ERROR; a
            caller-declared CRITICAL severity is preserved.
        **context_data: Additional structured data for the event

    """
    if overlap := _RESERVED_AUDIT_FIELDS & set(context_data.keys()):
        msg = f"Reserved audit field names cannot be passed as context_data: {overlap}"
        raise ValueError(msg)

    # Set actor context for this audit operation
    token_actor_id = actor_id_context_var.set(actor_id)
    token_actor_type = actor_type_context_var.set(actor_type)

    try:
        yield

        # Create success structured data
        success_data = AuditContextData(
            **context_data,
        )

        event = AuditEvent(
            event_category=event_category,
            event_severity=event_severity,
            event_status=EventStatus.SUCCESS,
            event_action=event_action,
            event_message=f"Operation {event_action} completed successfully",
            source_component=source_component,
            structured_data=success_data,
            actor_id=actor_id,
            actor_type=actor_type,
        )
        emit_audit_event(event)

    except Exception as e:
        # Create error structured data
        error_data = AuditContextData(
            error_type=type(e).__name__,
            error_message="Look at the Operational Logs for full diagnosis",
            **context_data,
        )

        # Escalate severity on exception: unexpected failures are at least ERROR,
        # but a caller-declared CRITICAL severity is preserved (never downgraded).
        error_severity = escalate_severity(event_severity, EventSeverity.ERROR)

        error_event = AuditEvent(
            event_category=event_category,
            event_severity=error_severity,
            event_status=EventStatus.ERROR,
            event_action=f"{event_action}_error",
            event_message=f"Operation {event_action} failed with {type(e).__name__}",
            source_component=source_component,
            structured_data=error_data,
            actor_id=actor_id,
            actor_type=actor_type,
        )
        emit_audit_event(error_event)
        raise
    finally:
        # Restore previous actor context
        actor_id_context_var.reset(token_actor_id)
        actor_type_context_var.reset(token_actor_type)
