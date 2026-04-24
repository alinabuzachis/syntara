"""AuditEventDispatcher: type-based dispatch of domain events to audit handlers."""

from typing import Any, ClassVar

import structlog

from nexus.audit.emitter import emit_audit_event
from nexus.audit.handler import AuditEventHandler

logger = structlog.stdlib.get_logger(__name__)


class AuditEventDispatcher:
    """Dispatches domain events to registered :class:`AuditEventHandler` instances.

    All methods are static — callers use the class directly::

        AuditEventDispatcher.dispatch(login_event)

    Multiple handlers may be registered for the same event type (e.g. an
    audit handler *and* a telemetry handler).  Handlers are added
    incrementally via :meth:`register`, which appends to the class-level
    registry.  Call it once per domain package at startup.
    :meth:`reset` clears the registry (testing only).
    """

    _registry: ClassVar[dict[type, list[AuditEventHandler[Any]]]] = {}

    @staticmethod
    def register(handlers: dict[type, AuditEventHandler[Any]]) -> None:
        """Append *handlers* to the dispatcher registry.

        Call once per domain during application startup (typically with
        the output of :func:`nexus.audit.discovery.discover_handlers`).
        Safe to call multiple times; handlers are appended so multiple
        domains can each register a handler for the same event type.
        """
        for event_type, handler in handlers.items():
            AuditEventDispatcher._registry.setdefault(event_type, []).append(handler)

    @staticmethod
    def dispatch(event: object) -> None:
        """Route *event* to its handlers and emit any resulting AuditEvents.

        Never raises. Two distinct failure modes are logged separately
        so ops can tell them apart:

        - ``warning``: no handler is registered for this event type.
        - ``exception``: a handler raised while processing the event (traceback captured).
        """
        handlers = AuditEventDispatcher._registry.get(type(event))
        if not handlers:
            logger.warning(
                "No audit handler registered for event type — event dropped",
                event_type=type(event).__qualname__,
            )
            return

        for handler in handlers:
            try:
                audit_event = handler.handle(event)
                if audit_event is not None:
                    emit_audit_event(audit_event)
            except Exception:
                logger.exception(
                    "Audit handler raised — event dropped",
                    event_type=type(event).__qualname__,
                    handler=type(handler).__qualname__,
                )

    @staticmethod
    def reset() -> None:
        """Clear the registry (for testing only)."""
        AuditEventDispatcher._registry = {}
