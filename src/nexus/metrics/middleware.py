"""ASGI metrics middleware for system overhead and error instrumentation.

Records per-request metrics:

* Total request duration for every API request.
* Component timing breakdown labels (endpoint, method).
* Error counts categorised by type (timeout, rate_limit, validation, internal).
* Error timestamps and ``correlation_id`` attached to labels.

Each request receives a unique ``correlation_id`` (UUID4) that appears in
both the metric labels and the ``X-Correlation-ID`` response header, enabling
end-to-end tracing from the client through to metric records.
"""

from __future__ import annotations

import time
from typing import TYPE_CHECKING
from uuid import uuid4

import structlog

from nexus.api.constants import EXCLUDED_PATHS
from nexus.metrics.types import MetricType

if TYPE_CHECKING:
    from starlette.types import ASGIApp, Message, Receive, Scope, Send

    from nexus.metrics.recorder import MetricsRecorder

logger = structlog.stdlib.get_logger(__name__)

_CORRELATION_HEADER: bytes = b"x-correlation-id"

# ---- Error type classification -------------------------------------------------

_TIMEOUT_CODES: frozenset[int] = frozenset({408, 504})
_RATE_LIMIT_CODES: frozenset[int] = frozenset({429})


def classify_error_type(status_code: int) -> str | None:
    """Classify an HTTP status code into an error type label.

    Returns one of ``"timeout"``, ``"rate_limit"``, ``"validation"``,
    ``"internal"``, or ``None`` for non-error status codes (< 400).

    Args:
        status_code: HTTP response status code.

    Returns:
        Error type string or ``None`` for success responses.

    """
    if status_code < 400:  # noqa: PLR2004
        return None
    if status_code in _TIMEOUT_CODES:
        return "timeout"
    if status_code in _RATE_LIMIT_CODES:
        return "rate_limit"
    if 400 <= status_code < 500:  # noqa: PLR2004
        return "validation"
    return "internal"


# ---- Route resolution -----------------------------------------------------------


def _resolve_endpoint(scope: Scope, raw_path: str) -> str:
    """Extract the route template from the ASGI scope for use as a metric label.

    Starlette populates ``scope["route"]`` after routing completes.  Using
    the template (e.g. ``/api/v1/executions/{execution_id}``) instead of the
    raw path avoids unbounded label cardinality in Prometheus.

    Falls back to *raw_path* when no route is resolved (e.g. 404 responses).
    """
    route = scope.get("route")
    if route is not None and hasattr(route, "path"):
        return route.path  # type: ignore[no-any-return]
    return raw_path


# ---- Middleware ------------------------------------------------------------------


class MetricsMiddleware:
    """ASGI middleware that records request duration and error metrics.

    For every non-excluded HTTP request the middleware:

    1. Generates a unique ``correlation_id``.
    2. Times the full request lifecycle.
    3. Records a ``REQUEST_DURATION`` metric with endpoint, method, status,
       and correlation_id labels.
    4. For error responses (>= 400), records an ``ERROR`` metric with the
       classified ``error_type`` and the same correlation_id.
    5. Injects the ``X-Correlation-ID`` response header so clients can
       correlate their requests to server-side metrics.

    Args:
        app: The next ASGI application in the chain.
        recorder: The :class:`MetricsRecorder` to record metrics to.

    """

    def __init__(self, app: ASGIApp, recorder: MetricsRecorder) -> None:
        """Initialise the middleware.

        Args:
            app: The next ASGI application in the chain.
            recorder: The metrics recorder for recording request metrics.

        """
        self.app = app
        self._recorder = recorder

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """Process an ASGI request.

        Non-HTTP requests and excluded paths pass through without
        metrics collection.

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

        correlation_id = str(uuid4())
        method: str = scope.get("method", "UNKNOWN")
        status_code = 0
        start = time.perf_counter()

        async def send_wrapper(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                existing_headers: list[tuple[bytes, bytes]] = list(message.get("headers", []))
                existing_headers.append((_CORRELATION_HEADER, correlation_id.encode()))
                message = {**message, "headers": existing_headers}
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception:
            status_code = 500
            endpoint = _resolve_endpoint(scope, path)
            self._record_metrics(endpoint, method, status_code, start, correlation_id)
            raise

        endpoint = _resolve_endpoint(scope, path)
        self._record_metrics(endpoint, method, status_code, start, correlation_id)

    def _record_metrics(
        self,
        path: str,
        method: str,
        status_code: int,
        start: float,
        correlation_id: str,
    ) -> None:
        """Record request duration and error metrics.

        Args:
            path: Request path.
            method: HTTP method.
            status_code: Response status code.
            start: ``time.perf_counter()`` at request start.
            correlation_id: Unique request identifier.

        """
        duration_ms = (time.perf_counter() - start) * 1000
        status_str = str(status_code) if status_code else "0"

        labels = {
            "endpoint": path,
            "method": method,
            "status": status_str,
            "correlation_id": correlation_id,
        }

        try:
            self._recorder.record(
                MetricType.REQUEST_DURATION,
                duration_ms,
                unit="ms",
                labels=labels,
            )
            self._recorder.increment("requests")

            error_type = classify_error_type(status_code)
            if error_type is not None:
                self._recorder.record(
                    MetricType.ERROR,
                    1.0,
                    labels={
                        "error_type": error_type,
                        "endpoint": path,
                        "method": method,
                        "correlation_id": correlation_id,
                    },
                )
                self._recorder.increment("errors")
        except Exception:  # noqa: BLE001
            logger.warning(
                "metrics_recording_failed",
                endpoint=path,
                exc_info=True,
            )
