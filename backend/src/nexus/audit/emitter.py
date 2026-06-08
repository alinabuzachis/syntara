"""Audit event emission utilities."""

from __future__ import annotations

from contextvars import ContextVar
from typing import TYPE_CHECKING, NamedTuple

import structlog

from nexus.audit.models.audit_event import ActorType, AuditEvent
from nexus.audit.otel_logging import AUDIT_LOGGER_NAME
from nexus.audit.outbox.worker import get_outbox_worker
from nexus.audit.sanitization import sanitizer
from nexus.audit.truncation import DEFAULT_MAX_PAYLOAD_BYTES, enforce_payload_limit
from nexus.core.config.base import get_settings

if TYPE_CHECKING:
    from uuid import UUID

    from sqlalchemy.orm import Session

audit_logger = structlog.stdlib.get_logger(AUDIT_LOGGER_NAME)

# Operational logger for diagnostics when audit emission itself fails.
# Deliberately separate from ``audit_logger`` so failure notices don't
# pollute the audit stream.
logger = structlog.stdlib.get_logger(__name__)


class AuditActorContext(NamedTuple):
    """Minimal actor context for audit events.

    Contains only the fields needed for audit logging, extracted atomically
    from User objects to ensure integrity.
    """

    actor_id: UUID | None = None
    actor_username: str | None = None
    actor_type: ActorType = ActorType.SYSTEM


# Context variables for async-safe actor context management
actor_context_var: ContextVar[AuditActorContext | None] = ContextVar("actor", default=None)
workflow_id_context_var: ContextVar[UUID | None] = ContextVar("workflow_id", default=None)
activity_id_context_var: ContextVar[str | None] = ContextVar("activity_id", default=None)
execution_id_context_var: ContextVar[UUID | None] = ContextVar("execution_id", default=None)
request_id_context_var: ContextVar[UUID | None] = ContextVar("request_id", default=None)


def emit_audit_event(event: AuditEvent, session: Session | None = None) -> None:
    """Emit structured audit log entry to stdout and outbox with automatic context injection.

    Args:
        event: The audit event to emit
        session: Optional Session for transactional outbox write.
                If provided, the event is written to the outbox in the same
                transaction as the caller's business logic (guaranteeing
                at-least-once delivery).

    Fail-safe: any exception raised during context injection, sanitisation,
    payload enforcement, or the underlying log/outbox write is caught and
    reported via the operational logger. Audit capture must never fail the
    business operation it is instrumenting — callers can rely on this function
    not to raise.

    """
    try:
        # Inject current context if not already set
        _actor = actor_context_var.get()
        _workflow_id = workflow_id_context_var.get()
        _activity_id = activity_id_context_var.get()
        _execution_id = execution_id_context_var.get()
        _request_id = request_id_context_var.get()
        if event.actor_id is None and _actor is not None and _actor.actor_id is not None:
            event.actor_id = _actor.actor_id
        if event.actor_username is None and _actor is not None and _actor.actor_username is not None:
            event.actor_username = _actor.actor_username
        if event.actor_type is None and _actor is not None and _actor.actor_type is not None:
            event.actor_type = _actor.actor_type
        if event.workflow_id is None and _workflow_id is not None:
            event.workflow_id = _workflow_id
        if event.activity_id is None and _activity_id is not None:
            event.activity_id = _activity_id
        if event.execution_id is None and _execution_id is not None:
            event.execution_id = _execution_id

        # Inject request_id into structured_data if available and not already set
        if _request_id is not None and not hasattr(event.structured_data, "request_id"):
            event.structured_data.request_id = str(_request_id)

        # Sanitize and enforce payload limits before emitting
        event.structured_data = sanitizer.sanitize(event.structured_data)
        event.structured_data = enforce_payload_limit(event.structured_data, DEFAULT_MAX_PAYLOAD_BYTES)

        _do_emit_audit_event(event, session)
    except Exception:
        logger.exception(
            "Audit event emission failed — event dropped",
            event_category=getattr(event, "event_category", None),
            event_action=getattr(event, "event_action", None),
            source_component=getattr(event, "source_component", None),
        )


def _do_emit_audit_event(event: AuditEvent, session: Session | None = None) -> None:
    """Emit audit event to structured logs and outbox.

    Args:
        event: The audit event to emit (already sanitized and size-enforced)
        session: Optional Session for transactional outbox write.
                If provided, writes the outbox record to the session (caller must commit).
                This guarantees atomic write with business logic changes.
                If None, creates a background task to write to outbox with a new session.

    """
    # Check if auditing is globally enabled
    settings = get_settings()
    if not settings.auditing_enabled:
        return

    # Emit as structured log entry for downstream log aggregation.
    event_dict = event.model_dump(mode="json")
    audit_logger.info("audit_event", **event_dict)

    # Write to outbox table for guaranteed delivery
    outbox_worker = get_outbox_worker()
    outbox_worker.write_to_outbox(event, session)
