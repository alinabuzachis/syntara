"""Telemetry handler for HTTPRequestEvent.

Emits a Segment ``api_call`` analytics event for every HTTP request
that passes through the audit middleware, reusing the audit dispatcher
instead of a separate ASGI middleware.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, cast

import structlog

from nexus.audit.events.http_request import HTTPRequestEvent
from nexus.audit.handler import AuditEventHandler
from nexus.telemetry.client import get_telemetry_registry
from nexus.telemetry.events.api_call import APICallEvent

if TYPE_CHECKING:
    from nexus.audit.models.audit_event import AuditEvent

logger = structlog.stdlib.get_logger(__name__)


class APICallTelemetryHandler(AuditEventHandler[HTTPRequestEvent]):
    """Emits a Segment ``api_call`` event for each HTTP request."""

    def handle(self, event: HTTPRequestEvent) -> AuditEvent | None:
        """Emit telemetry (side-effect only, no AuditEvent produced)."""
        try:
            registry = get_telemetry_registry()
            if not registry.is_initialized():
                return None

            registry.send_event(
                APICallEvent(
                    endpoint=event.path,
                    http_method=cast("Any", event.method),
                    status_code=event.status_code,
                    response_time_ms=event.response_time_ms,
                    request_payload_size=event.request_payload_size,
                    entitlement_id=registry.entitlement_id,
                )
            )
            logger.debug(
                "analytics_event_sent",
                endpoint=event.path,
                http_method=event.method,
                status_code=event.status_code,
                response_time_ms=event.response_time_ms,
            )
        except Exception:  # noqa: BLE001
            logger.warning(
                "analytics_event_failed",
                endpoint=event.path,
                http_method=event.method,
                exc_info=True,
            )

        return None
