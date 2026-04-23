"""AuditEventDispatcher: type-based dispatch of domain events to audit handlers."""

from typing import Any, ClassVar

import structlog

from nexus.audit.emitter import emit_audit_event
from nexus.audit.handler import AuditEventHandler

logger = structlog.stdlib.get_logger(__name__)


class AuditEventDispatcher:
    """Dispatches domain events to the appropriate :class:`AuditEventHandler`.

    All methods are static — callers use the class directly::

        AuditEventDispatcher.dispatch(login_event)

    Handlers are added incrementally via :meth:`register`, which merges
    additional handlers into the class-level registry. Call it once per
    domain package at startup. :meth:`reset` clears the registry (testing
    only). Dispatch is O(1) via ``dict.get`` on ``type(event)``.
    """

    _registry: ClassVar[dict[type, AuditEventHandler[Any]]] = {}

    @staticmethod
    def register(handlers: dict[type, AuditEventHandler[Any]]) -> None:
        """Merge *handlers* into the dispatcher registry.

        Call once per domain during application startup (typically with
        the output of :func:`nexus.audit.discovery.discover_handlers`).
        Safe to call multiple times; later registrations for the same
        event type overwrite earlier ones and a warning is logged.
        """
        for event_type, handler in handlers.items():
            existing = AuditEventDispatcher._registry.get(event_type)
            if existing is not None:
                logger.warning(
                    "Audit handler overwritten during registration",
                    event_type=getattr(event_type, "__qualname__", repr(event_type)),
                    previous=type(existing).__qualname__,
                    replacement=type(handler).__qualname__,
                )
            AuditEventDispatcher._registry[event_type] = handler

    @staticmethod
    def dispatch(event: object) -> None:
        """Route *event* to its handler and emit the resulting AuditEvent.

        Never raises. Two distinct failure modes are logged separately
        so ops can tell them apart:

        - ``warning``: no handler is registered for this event type.
        - ``exception``: the handler raised while processing the event (traceback captured).
        """
        handler = AuditEventDispatcher._registry.get(type(event))
        if handler is None:
            logger.warning(
                "No audit handler registered for event type — event dropped",
                event_type=type(event).__qualname__,
            )
            return

        try:
            audit_event = handler.handle(event)
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
