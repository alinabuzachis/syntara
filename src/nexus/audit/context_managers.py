"""Context managers for audit event capture and specialized use cases."""

from collections.abc import Generator
from contextlib import contextmanager
from typing import Any
from uuid import UUID

from nexus.audit.dispatcher import AuditEventDispatcher
from nexus.audit.emitter import (
    AuditActorContext,
    activity_id_context_var,
    actor_context_var,
    execution_id_context_var,
    workflow_id_context_var,
)
from nexus.audit.events.audit_context import AuditContextEvent
from nexus.audit.models.audit_event import ActorType, EventCategory, EventSeverity
from nexus.audit.models.structured_data import AuditContextData
from nexus.audit.utils import escalate_severity
from nexus.core.models.user import User

_RESERVED_AUDIT_FIELDS = frozenset(AuditContextData.model_fields.keys())


@contextmanager
def actor_context(
    *,
    actor: User | None = None,
    workflow_id: UUID | None = None,
    activity_id: str | None = None,
    execution_id: UUID | None = None,
) -> Generator[None, None, None]:
    """Context manager to inject actor context for audit events.

    Ensures all audit events within this context include proper actor linkage.
    Extracts actor_id, actor_type, and actor_name atomically from the User object
    to guarantee integrity (prevents mismatched id/username pairs).

    Args:
        actor: User object to extract actor information from. If None, events
            will have actor_id=None, actor_type=SYSTEM, actor_name=None.
        workflow_id: Optional workflow identifier for workflow-scoped events
        activity_id: Optional workflow activity identifier for workflow-scoped events
        execution_id: Optional execution identifier for execution tracing

    """
    # Extract actor fields atomically from User object to ensure integrity
    actor_id = actor.id if actor is not None else None
    actor_username = actor.username if actor is not None else None
    actor_type = ActorType.USER if actor is not None else ActorType.SYSTEM

    _actor_context = AuditActorContext(
        actor_id=actor_id,
        actor_username=actor_username,
        actor_type=actor_type,
    )

    # Set new context using context variables for async-safe operations
    token_actor = actor_context_var.set(_actor_context)
    token_workflow_id = workflow_id_context_var.set(workflow_id)
    token_activity_id = activity_id_context_var.set(activity_id)
    token_execution_id = execution_id_context_var.set(execution_id)

    try:
        yield
    finally:
        # Restore previous context using reset tokens
        actor_context_var.reset(token_actor)
        workflow_id_context_var.reset(token_workflow_id)
        activity_id_context_var.reset(token_activity_id)
        execution_id_context_var.reset(token_execution_id)


@contextmanager
def audit_context(
    event_category: EventCategory,
    event_action: str,
    source_component: str,
    *,
    actor: User | None,
    event_severity: EventSeverity = EventSeverity.INFO,
    resource_urn: str | None = None,
    resource_name: str | None = None,
    **context_data: Any,  # noqa: ANN401
) -> Generator[None, None, None]:
    """Context manager for capturing audit events with additional context.

    Extracts actor_id, actor_type, and actor_name atomically from the User object
    to guarantee integrity (prevents mismatched id/username pairs).

    Args:
        event_category: Category of the audit event
        event_action: Action being performed
        source_component: Component performing the action
        actor: User object to extract actor information from. If None, events
            will have actor_id=None, actor_type=SYSTEM, actor_name=None.
        event_severity: Severity level of the audit event (defaults to INFO).
            On exception, severity is escalated to at least ERROR; a
            caller-declared CRITICAL severity is preserved.
        resource_urn: RFC 8141 compliant URN identifying the resource
        resource_name: Human-readable name of the resource at event creation time
        **context_data: Additional structured data for the event

    """
    if overlap := _RESERVED_AUDIT_FIELDS & set(context_data.keys()):
        msg = f"Reserved audit field names cannot be passed as context_data: {overlap}"
        raise ValueError(msg)

    # Extract actor fields atomically from User object to ensure integrity
    actor_id = actor.id if actor is not None else None
    actor_username = actor.username if actor is not None else None
    actor_type = ActorType.USER if actor is not None else ActorType.SYSTEM

    _actor_context = AuditActorContext(
        actor_id=actor_id,
        actor_username=actor_username,
        actor_type=actor_type,
    )

    # Set actor context for this audit operation
    token_actor = actor_context_var.set(_actor_context)

    # Track error state and severity (updated in except block if exception occurs)
    error_type: str | None = None
    error_message: str | None = None

    try:
        yield

    except Exception as e:
        # Escalate severity on exception: unexpected failures are at least ERROR,
        # but a caller-declared CRITICAL severity is preserved (never downgraded).
        event_severity = escalate_severity(event_severity, EventSeverity.ERROR)
        error_type = type(e).__name__
        error_message = "Look at the Operational Logs for full diagnosis"
        raise
    finally:
        # Construct and dispatch the event (success or error)
        event = AuditContextEvent(
            event_category=event_category,
            event_action=event_action,
            source_component=source_component,
            actor_context=_actor_context,
            event_severity=event_severity,
            resource_urn=resource_urn,
            resource_name=resource_name,
            error_type=error_type,
            error_message=error_message,
            context_data=context_data,
        )
        AuditEventDispatcher.dispatch(event)

        # Restore previous actor context
        actor_context_var.reset(token_actor)
