"""Audit event tracking for system activities and user actions.

Key exports:
    - AuditEvent: SQLModel for audit event data
    - ActorContext: Result of actor extraction
    - track_event: Decorator for automatic function instrumentation
    - actor_context / audit_context: Context managers for audit capture
    - AuditMiddleware: ASGI middleware for HTTP request auditing
"""

from nexus.audit.actor_extractor import ActorContext
from nexus.audit.context_managers import actor_context, audit_context
from nexus.audit.decorators import track_event
from nexus.audit.middleware import AuditMiddleware
from nexus.audit.models import (
    ActorType,
    AuditEvent,
    EventCategory,
    EventSeverity,
    EventStatus,
)

__all__ = [
    "ActorContext",
    "ActorType",
    "AuditEvent",
    "AuditMiddleware",
    "EventCategory",
    "EventSeverity",
    "EventStatus",
    "actor_context",
    "audit_context",
    "track_event",
]
