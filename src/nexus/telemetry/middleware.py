"""ASGI analytics middleware for API request telemetry.

Captures per-request analytics events (endpoint, response time, status code,
payload size) and transmits them to Segment via TelemetryClientRegistry.
"""

from __future__ import annotations

import time
from typing import TYPE_CHECKING

import structlog

from nexus.api.constants import EXCLUDED_PATHS
from nexus.telemetry.events.api_call import APICallEvent

if TYPE_CHECKING:
    from starlette.types import ASGIApp, Message, Receive, Scope, Send

    from nexus.telemetry.client import TelemetryClientRegistry

logger = structlog.stdlib.get_logger(__name__)


class AnalyticsMiddleware:
    """ASGI middleware that emits analytics events for API requests.

    For every non-excluded HTTP request, the middleware:
    1. Records request start time via ``time.monotonic()``
    2. Intercepts ``http.response.start`` to capture the status code
    3. Computes response duration after the response is sent
    4. Reads ``content-length`` header for request payload size
    5. Builds an :class:`APICallEvent` and sends it fire-and-forget

    Privacy boundary:
    - Only ``scope["path"]`` and ``scope["method"]`` are read from the request.
    - ``scope["query_string"]`` is **never** read.
    - The request body is **never** consumed.
    - Only the ``content-length`` header value is extracted from request headers;
      no other header values (including Authorization) are accessed.
    """

    def __init__(self, app: ASGIApp, registry: TelemetryClientRegistry) -> None:
        """Initialize the analytics middleware.

        Args:
            app: The next ASGI application in the chain.
            registry: The telemetry client registry for sending events.

        """
        self.app = app
        self._registry = registry

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """Process an ASGI request.

        Non-HTTP requests and excluded paths are passed through without
        analytics collection.

        Args:
            scope: ASGI connection scope.
            receive: ASGI receive callable.
            send: ASGI send callable.

        """
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path: str = scope["path"]

        if path in EXCLUDED_PATHS:
            await self.app(scope, receive, send)
            return

        start_time = time.monotonic()
        status_code = 0

        async def send_wrapper(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
            await send(message)

        await self.app(scope, receive, send_wrapper)

        # Calculate response time
        duration_ms = int((time.monotonic() - start_time) * 1000)

        # Extract request payload size from content-length header (privacy-safe).
        # Only the content-length value is read; no other headers are accessed.
        payload_size = 0
        for header_name, header_value in scope.get("headers", []):
            if header_name == b"content-length":
                try:
                    payload_size = int(header_value)
                except (ValueError, TypeError):
                    payload_size = 0
                break

        method: str = scope["method"]

        try:
            event = APICallEvent(
                endpoint=path,
                http_method=method,
                status_code=status_code,
                response_time_ms=duration_ms,
                request_payload_size=payload_size,
                entitlement_id=self._registry.entitlement_id,
            )
            self._registry.send_event(event)
            logger.debug(
                "analytics_event_sent",
                endpoint=path,
                http_method=method,
                status_code=status_code,
                response_time_ms=duration_ms,
            )
        except Exception:  # noqa: BLE001
            logger.warning(
                "analytics_event_failed",
                endpoint=path,
                http_method=method,
                exc_info=True,
            )
