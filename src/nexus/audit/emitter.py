"""Audit event emission utilities."""

from contextvars import ContextVar
from typing import Any
from uuid import UUID

import structlog

from nexus.audit.models import ActorType, AuditEvent
from nexus.audit.sanitization import EventSanitizer, redact_by_partial_key, redact_email
from nexus.audit.truncation import DEFAULT_MAX_PAYLOAD_BYTES, enforce_payload_limit

audit_logger = structlog.stdlib.get_logger("nexus.audit")

# Context variables for async-safe actor context management
actor_id_context_var: ContextVar[UUID | None] = ContextVar("actor_id", default=None)
actor_type_context_var: ContextVar[ActorType | None] = ContextVar("actor_type", default=None)
workflow_id_context_var: ContextVar[UUID | None] = ContextVar("workflow_id", default=None)
activity_id_context_var: ContextVar[str | None] = ContextVar("activity_id", default=None)
execution_id_context_var: ContextVar[UUID | None] = ContextVar("execution_id", default=None)


# Fixed sanitizer with comprehensive PII detectors
_sanitizer = EventSanitizer(
    detectors=[
        redact_by_partial_key(
            [
                "password",
                "secret",
                "token",
                "_key",
                "key_",
                "auth",
                "credential",
                "credentials",
                "session",
                "cookie",
                "jwt",
                "bearer",
                "authorization_code",
                "certificate",
                "cert",
                "pem",
                "oauth",
                "authentication",
            ]
        ),
        redact_email,
    ]
)


def _get_current_actor_context() -> dict[str, Any]:
    """Get current actor context for event population."""
    return {
        "actor_id": actor_id_context_var.get(),
        "actor_type": actor_type_context_var.get(),
        "workflow_id": workflow_id_context_var.get(),
        "activity_id": activity_id_context_var.get(),
        "execution_id": execution_id_context_var.get(),
    }


def emit_audit_event(event: AuditEvent) -> None:
    """Emit structured audit log entry to stdout with automatic context injection."""
    # Inject current context if not already set
    context = _get_current_actor_context()
    if event.actor_id is None and context["actor_id"]:
        event.actor_id = context["actor_id"]
    if event.actor_type is None and context["actor_type"]:
        event.actor_type = context["actor_type"]
    if event.workflow_id is None and context["workflow_id"]:
        event.workflow_id = context["workflow_id"]
    if event.activity_id is None and context["activity_id"]:
        event.activity_id = context["activity_id"]
    if event.execution_id is None and context["execution_id"]:
        event.execution_id = context["execution_id"]

    # Sanitize and enforce payload limits before emitting
    event.structured_data = _sanitizer.sanitize(event.structured_data)
    event.structured_data = enforce_payload_limit(event.structured_data, DEFAULT_MAX_PAYLOAD_BYTES)

    _do_emit_audit_event(event)


def _do_emit_audit_event(event: AuditEvent) -> None:
    # Emit as structured log entry for downstream log aggregation
    # This will be replaced with something to store the AuditEvent in Postgres etc.
    # Alternative implementations could emit the AuditEvent to OTEL etc.

    event_dict = event.model_dump(mode="json")
    audit_logger.info("audit_event", **event_dict)
