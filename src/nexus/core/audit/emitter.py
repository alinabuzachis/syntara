"""Audit event emission utilities."""

from contextvars import ContextVar
from typing import Any
from uuid import UUID

import structlog

from nexus.core.audit.sanitization import EventSanitizer, redact_by_partial_key, redact_email
from nexus.core.audit.types import ActorType, AuditEvent

audit_logger = structlog.stdlib.get_logger("nexus.audit")

# Context variables for async-safe actor context management
actor_id_context_var: ContextVar[UUID | None] = ContextVar("actor_id", default=None)
actor_type_context_var: ContextVar[ActorType] = ContextVar("actor_type", default=ActorType.SYSTEM)
workflow_id_context_var: ContextVar[UUID | None] = ContextVar("workflow_id", default=None)
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
        "execution_id": execution_id_context_var.get(),
    }


def emit_audit_event(event: AuditEvent) -> None:
    """Emit structured audit log entry to stdout with automatic context injection."""
    # Inject current context if not already set
    context = _get_current_actor_context()
    if not event.actor_id and context["actor_id"]:
        event.actor_id = context["actor_id"]
    if not event.workflow_id and context["workflow_id"]:
        event.workflow_id = context["workflow_id"]
    if not event.execution_id and context["execution_id"]:
        event.execution_id = context["execution_id"]

    # Prepare and emit event
    event_dict = event.model_dump(mode="json")
    event_dict["structured_data"] = _sanitizer.sanitize(event_dict["structured_data"])

    _do_emit_audit_event(event_dict)


def _do_emit_audit_event(event_dict: dict[str, Any]) -> None:
    # Emit as structured log entry for downstream log aggregation
    # This will be replaced with something to store the AuditEvent in Postgres etc.
    # Alternative implementations could emit the AuditEvent to OTEL etc.

    audit_logger.info("audit_event", **event_dict)
