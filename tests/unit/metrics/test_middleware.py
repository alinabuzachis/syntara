"""Unit tests for the MetricsMiddleware ASGI middleware.

Tests cover system overhead and error metrics:
- Total request duration recorded for every API request
- Component timing breakdown labels available
- Error counts by type (timeout, rate_limit, validation, internal)
- Error timestamps and correlation_id in labels
"""

import asyncio
from typing import Any
from unittest.mock import AsyncMock

import pytest
from prometheus_client import CollectorRegistry

from nexus.api.constants import EXCLUDED_PATHS
from nexus.metrics.middleware import (
    MetricsMiddleware,
    classify_error_type,
)
from nexus.metrics.recorder import MetricsRecorder
from nexus.metrics.types import MetricType


@pytest.fixture
def recorder() -> MetricsRecorder:
    """Fresh MetricsRecorder with an isolated Prometheus registry."""
    return MetricsRecorder(
        retention_seconds=3600,
        max_records=10_000,
        prometheus_registry=CollectorRegistry(),
    )


def _make_scope(
    path: str = "/api/v1/workflows",
    method: str = "GET",
    scope_type: str = "http",
) -> dict[str, Any]:
    """Build a minimal ASGI scope dict."""
    return {
        "type": scope_type,
        "path": path,
        "method": method,
        "headers": [],
    }


async def _make_app(status_code: int = 200, delay: float = 0.0) -> Any:  # noqa: ANN401
    """Create a fake ASGI app that sends a response with the given status."""

    async def app(scope: dict[str, Any], receive: Any, send: Any) -> None:  # noqa: ANN401
        if delay > 0:
            await asyncio.sleep(delay)
        await send({"type": "http.response.start", "status": status_code, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    return app


# =============================================================================
# Error type classification
# =============================================================================


class TestClassifyErrorType:
    """Tests for classify_error_type helper."""

    def test_timeout_408(self) -> None:
        """HTTP 408 is classified as timeout."""
        assert classify_error_type(408) == "timeout"

    def test_timeout_504(self) -> None:
        """HTTP 504 is classified as timeout."""
        assert classify_error_type(504) == "timeout"

    def test_rate_limit_429(self) -> None:
        """HTTP 429 is classified as rate_limit."""
        assert classify_error_type(429) == "rate_limit"

    def test_validation_400(self) -> None:
        """HTTP 400 is classified as validation."""
        assert classify_error_type(400) == "validation"

    def test_validation_422(self) -> None:
        """HTTP 422 is classified as validation."""
        assert classify_error_type(422) == "validation"

    def test_internal_500(self) -> None:
        """HTTP 500 is classified as internal."""
        assert classify_error_type(500) == "internal"

    def test_internal_502(self) -> None:
        """HTTP 502 is classified as internal."""
        assert classify_error_type(502) == "internal"

    def test_internal_503(self) -> None:
        """HTTP 503 is classified as internal."""
        assert classify_error_type(503) == "internal"

    def test_client_error_fallback(self) -> None:
        """Other 4xx codes default to validation."""
        assert classify_error_type(403) == "validation"
        assert classify_error_type(404) == "validation"
        assert classify_error_type(405) == "validation"

    def test_server_error_fallback(self) -> None:
        """Other 5xx codes default to internal."""
        assert classify_error_type(501) == "internal"

    def test_success_returns_none(self) -> None:
        """Status codes below 400 return None."""
        assert classify_error_type(200) is None
        assert classify_error_type(201) is None
        assert classify_error_type(301) is None


# =============================================================================
# MetricsMiddleware - request duration recording
# =============================================================================


class TestMetricsMiddlewareRequestDuration:
    """Total request duration recorded for every API request."""

    @pytest.mark.asyncio
    async def test_records_request_duration(self, recorder: MetricsRecorder) -> None:
        """Every non-excluded HTTP request gets a REQUEST_DURATION metric."""
        app = await _make_app(status_code=200)
        middleware = MetricsMiddleware(app, recorder=recorder)

        scope = _make_scope(path="/api/v1/workflows", method="GET")
        await middleware(scope, AsyncMock(), AsyncMock())

        results = list(recorder.query(metric_types={MetricType.REQUEST_DURATION}))
        assert len(results) == 1
        assert results[0].value >= 0
        assert results[0].unit == "ms"

    @pytest.mark.asyncio
    async def test_request_duration_labels(self, recorder: MetricsRecorder) -> None:
        """REQUEST_DURATION includes endpoint, method, and status labels."""
        app = await _make_app(status_code=200)
        middleware = MetricsMiddleware(app, recorder=recorder)

        scope = _make_scope(path="/api/v1/workflows", method="POST")
        await middleware(scope, AsyncMock(), AsyncMock())

        results = list(recorder.query(metric_types={MetricType.REQUEST_DURATION}))
        assert len(results) == 1
        labels = results[0].labels
        assert labels["endpoint"] == "/api/v1/workflows"
        assert labels["method"] == "POST"
        assert labels["status"] == "200"

    @pytest.mark.asyncio
    async def test_duration_is_positive(self, recorder: MetricsRecorder) -> None:
        """Recorded duration is a positive value in milliseconds."""
        app = await _make_app(status_code=200, delay=0.01)
        middleware = MetricsMiddleware(app, recorder=recorder)

        scope = _make_scope()
        await middleware(scope, AsyncMock(), AsyncMock())

        results = list(recorder.query(metric_types={MetricType.REQUEST_DURATION}))
        assert results[0].value >= 5

    @pytest.mark.asyncio
    async def test_increments_requests_counter(self, recorder: MetricsRecorder) -> None:
        """Each request increments the 'requests' summary counter."""
        app = await _make_app(status_code=200)
        middleware = MetricsMiddleware(app, recorder=recorder)

        for _ in range(3):
            await middleware(_make_scope(), AsyncMock(), AsyncMock())

        assert recorder.get_summary().total_requests == 3

    @pytest.mark.asyncio
    async def test_uses_route_template_as_endpoint_label(self, recorder: MetricsRecorder) -> None:
        """When Starlette resolves a route, the template is used instead of the raw path."""

        class _FakeRoute:
            path = "/api/v1/executions/{execution_id}"

        async def app_with_route(scope: dict[str, Any], receive: Any, send: Any) -> None:  # noqa: ANN401
            scope["route"] = _FakeRoute()
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b""})

        middleware = MetricsMiddleware(app_with_route, recorder=recorder)  # type: ignore[arg-type]
        scope = _make_scope(path="/api/v1/executions/3f129c38-1008-4383-a224-e20ddcf51755")
        await middleware(scope, AsyncMock(), AsyncMock())

        results = list(recorder.query(metric_types={MetricType.REQUEST_DURATION}))
        assert results[0].labels["endpoint"] == "/api/v1/executions/{execution_id}"

    @pytest.mark.asyncio
    async def test_falls_back_to_raw_path_when_no_route(self, recorder: MetricsRecorder) -> None:
        """Without a resolved route (e.g. 404), the raw path is used as endpoint label."""
        app = await _make_app(status_code=404)
        middleware = MetricsMiddleware(app, recorder=recorder)

        scope = _make_scope(path="/api/v1/nonexistent")
        await middleware(scope, AsyncMock(), AsyncMock())

        results = list(recorder.query(metric_types={MetricType.REQUEST_DURATION}))
        assert results[0].labels["endpoint"] == "/api/v1/nonexistent"


# =============================================================================
# MetricsMiddleware - correlation ID
# =============================================================================


class TestMetricsMiddlewareCorrelationId:
    """Correlation ID in response header (not in metric labels to avoid memory bloat)."""

    @pytest.mark.asyncio
    async def test_correlation_id_not_in_metric_labels(self, recorder: MetricsRecorder) -> None:
        """correlation_id is excluded from stored labels to avoid high-cardinality memory growth."""
        app = await _make_app(status_code=200)
        middleware = MetricsMiddleware(app, recorder=recorder)

        await middleware(_make_scope(), AsyncMock(), AsyncMock())

        results = list(recorder.query(metric_types={MetricType.REQUEST_DURATION}))
        assert "correlation_id" not in results[0].labels

    @pytest.mark.asyncio
    async def test_correlation_id_in_response_header(self, recorder: MetricsRecorder) -> None:
        """The correlation_id is added to the response via X-Correlation-ID header."""
        app = await _make_app(status_code=200)
        middleware = MetricsMiddleware(app, recorder=recorder)

        captured_headers: list[tuple[bytes, bytes]] = []

        async def capture_send(message: dict[str, Any]) -> None:
            if message["type"] == "http.response.start":
                captured_headers.extend(message.get("headers", []))

        scope = _make_scope()
        await middleware(scope, AsyncMock(), capture_send)  # type: ignore[arg-type]

        header_names = {h[0] for h in captured_headers}
        assert b"x-correlation-id" in header_names


# =============================================================================
# MetricsMiddleware - error metrics
# =============================================================================


class TestMetricsMiddlewareErrors:
    """Error counts recorded with error_type label."""

    @pytest.mark.asyncio
    async def test_error_recorded_for_4xx(self, recorder: MetricsRecorder) -> None:
        """4xx responses record an ERROR metric."""
        app = await _make_app(status_code=400)
        middleware = MetricsMiddleware(app, recorder=recorder)

        await middleware(_make_scope(), AsyncMock(), AsyncMock())

        errors = list(recorder.query(metric_types={MetricType.ERROR}))
        assert len(errors) == 1
        assert errors[0].labels["error_type"] == "validation"

    @pytest.mark.asyncio
    async def test_error_recorded_for_5xx(self, recorder: MetricsRecorder) -> None:
        """5xx responses record an ERROR metric with 'internal' type."""
        app = await _make_app(status_code=500)
        middleware = MetricsMiddleware(app, recorder=recorder)

        await middleware(_make_scope(), AsyncMock(), AsyncMock())

        errors = list(recorder.query(metric_types={MetricType.ERROR}))
        assert len(errors) == 1
        assert errors[0].labels["error_type"] == "internal"

    @pytest.mark.asyncio
    async def test_error_includes_endpoint_and_method(self, recorder: MetricsRecorder) -> None:
        """Error metrics include endpoint and method labels."""
        app = await _make_app(status_code=422)
        middleware = MetricsMiddleware(app, recorder=recorder)

        scope = _make_scope(path="/api/v1/invocations", method="POST")
        await middleware(scope, AsyncMock(), AsyncMock())

        errors = list(recorder.query(metric_types={MetricType.ERROR}))
        assert errors[0].labels["endpoint"] == "/api/v1/invocations"
        assert errors[0].labels["method"] == "POST"

    @pytest.mark.asyncio
    async def test_error_increments_errors_counter(self, recorder: MetricsRecorder) -> None:
        """Error responses increment the 'errors' summary counter."""
        app = await _make_app(status_code=500)
        middleware = MetricsMiddleware(app, recorder=recorder)

        await middleware(_make_scope(), AsyncMock(), AsyncMock())
        await middleware(_make_scope(), AsyncMock(), AsyncMock())

        assert recorder.get_summary().total_errors == 2

    @pytest.mark.asyncio
    async def test_no_error_recorded_for_2xx(self, recorder: MetricsRecorder) -> None:
        """Successful responses do not produce ERROR metrics."""
        app = await _make_app(status_code=200)
        middleware = MetricsMiddleware(app, recorder=recorder)

        await middleware(_make_scope(), AsyncMock(), AsyncMock())

        errors = list(recorder.query(metric_types={MetricType.ERROR}))
        assert len(errors) == 0

    @pytest.mark.asyncio
    async def test_rate_limit_error_type(self, recorder: MetricsRecorder) -> None:
        """429 responses are classified as rate_limit."""
        app = await _make_app(status_code=429)
        middleware = MetricsMiddleware(app, recorder=recorder)

        await middleware(_make_scope(), AsyncMock(), AsyncMock())

        errors = list(recorder.query(metric_types={MetricType.ERROR}))
        assert errors[0].labels["error_type"] == "rate_limit"

    @pytest.mark.asyncio
    @pytest.mark.parametrize("status_code", [408, 504])
    async def test_timeout_error_type(self, status_code: int) -> None:
        """Timeout status codes are classified as timeout."""
        rec = MetricsRecorder(
            retention_seconds=3600,
            max_records=10_000,
            prometheus_registry=CollectorRegistry(),
        )
        app = await _make_app(status_code=status_code)
        mw = MetricsMiddleware(app, recorder=rec)

        await mw(_make_scope(), AsyncMock(), AsyncMock())

        errors = list(rec.query(metric_types={MetricType.ERROR}))
        assert errors[0].labels["error_type"] == "timeout"


# =============================================================================
# MetricsMiddleware - Prometheus integration
# =============================================================================


class TestMetricsMiddlewarePrometheus:
    """Verify Prometheus counters are updated by the middleware."""

    @pytest.mark.asyncio
    async def test_requests_total_incremented(self, recorder: MetricsRecorder) -> None:
        """nexus_requests_total Prometheus counter is incremented."""
        app = await _make_app(status_code=200)
        middleware = MetricsMiddleware(app, recorder=recorder)

        await middleware(
            _make_scope(path="/api/v1/test"),
            AsyncMock(),
            AsyncMock(),
        )

        value = recorder.prometheus.requests_total.labels(
            status="200",
            endpoint="/api/v1/test",
        )._value.get()
        assert value == pytest.approx(1.0)

    @pytest.mark.asyncio
    async def test_errors_total_incremented(self, recorder: MetricsRecorder) -> None:
        """nexus_errors_total Prometheus counter is incremented for errors."""
        app = await _make_app(status_code=500)
        middleware = MetricsMiddleware(app, recorder=recorder)

        await middleware(_make_scope(), AsyncMock(), AsyncMock())

        value = recorder.prometheus.errors_total.labels(
            error_type="internal",
        )._value.get()
        assert value == pytest.approx(1.0)

    @pytest.mark.asyncio
    async def test_request_duration_histogram_updated(self, recorder: MetricsRecorder) -> None:
        """nexus_request_duration_seconds histogram is observed."""
        app = await _make_app(status_code=200)
        middleware = MetricsMiddleware(app, recorder=recorder)

        await middleware(
            _make_scope(path="/api/v1/test"),
            AsyncMock(),
            AsyncMock(),
        )

        sample_sum = recorder.prometheus.request_duration_seconds.labels(
            endpoint="/api/v1/test",
        )._sum.get()
        assert sample_sum > 0


# =============================================================================
# MetricsMiddleware - exclusions
# =============================================================================


class TestMetricsMiddlewareExclusions:
    """Verify that excluded paths and non-HTTP scopes are skipped."""

    @pytest.mark.asyncio
    @pytest.mark.parametrize("path", sorted(EXCLUDED_PATHS))
    async def test_excluded_paths_not_recorded(self, path: str, recorder: MetricsRecorder) -> None:
        """Excluded endpoint is not instrumented."""
        app = await _make_app(status_code=200)
        middleware = MetricsMiddleware(app, recorder=recorder)

        await middleware(_make_scope(path=path), AsyncMock(), AsyncMock())

        results = list(recorder.query(metric_types={MetricType.REQUEST_DURATION}))
        assert len(results) == 0

    @pytest.mark.asyncio
    async def test_non_http_scope_passthrough(self, recorder: MetricsRecorder) -> None:
        """WebSocket and other non-HTTP scopes pass through without metrics."""
        app = await _make_app(status_code=200)
        middleware = MetricsMiddleware(app, recorder=recorder)

        scope = _make_scope(scope_type="websocket")
        await middleware(scope, AsyncMock(), AsyncMock())

        results = list(recorder.query(metric_types={MetricType.REQUEST_DURATION}))
        assert len(results) == 0

    @pytest.mark.asyncio
    async def test_excluded_paths_still_pass_to_app(self, recorder: MetricsRecorder) -> None:
        """Excluded paths are still forwarded to the underlying app."""
        call_count = 0

        async def counting_app(scope: dict[str, Any], receive: Any, send: Any) -> None:  # noqa: ANN401
            nonlocal call_count
            call_count += 1

        middleware = MetricsMiddleware(counting_app, recorder=recorder)  # type: ignore[arg-type]
        await middleware(_make_scope(path="/health"), AsyncMock(), AsyncMock())

        assert call_count == 1


# =============================================================================
# MetricsMiddleware - disabled recorder
# =============================================================================


class TestMetricsMiddlewareDisabled:
    """When recorder is disabled, middleware still forwards requests."""

    @pytest.mark.asyncio
    async def test_disabled_recorder_no_metrics(self) -> None:
        """Disabled recorder produces no metric records."""
        disabled = MetricsRecorder(
            prometheus_registry=CollectorRegistry(),
            enabled=False,
        )
        app = await _make_app(status_code=200)
        middleware = MetricsMiddleware(app, recorder=disabled)

        await middleware(_make_scope(), AsyncMock(), AsyncMock())

        assert disabled.store.count() == 0

    @pytest.mark.asyncio
    async def test_disabled_recorder_still_forwards(self) -> None:
        """Even with disabled recorder, requests reach the app."""
        disabled = MetricsRecorder(
            prometheus_registry=CollectorRegistry(),
            enabled=False,
        )
        call_count = 0

        async def counting_app(scope: dict[str, Any], receive: Any, send: Any) -> None:  # noqa: ANN401
            nonlocal call_count
            call_count += 1

        middleware = MetricsMiddleware(counting_app, recorder=disabled)  # type: ignore[arg-type]
        await middleware(_make_scope(), AsyncMock(), AsyncMock())

        assert call_count == 1


# =============================================================================
# MetricsMiddleware - exception handling
# =============================================================================


class TestMetricsMiddlewareExceptions:
    """Middleware records metrics even when the app raises."""

    @pytest.mark.asyncio
    async def test_records_duration_on_app_exception(self, recorder: MetricsRecorder) -> None:
        """Request duration is recorded even if the app raises an exception."""
        msg = "unexpected"

        async def raising_app(scope: dict[str, Any], receive: Any, send: Any) -> None:  # noqa: ANN401
            raise RuntimeError(msg)

        middleware = MetricsMiddleware(raising_app, recorder=recorder)  # type: ignore[arg-type]

        with pytest.raises(RuntimeError, match=msg):
            await middleware(_make_scope(), AsyncMock(), AsyncMock())

        results = list(recorder.query(metric_types={MetricType.REQUEST_DURATION}))
        assert len(results) == 1
        assert results[0].labels["status"] == "500"

    @pytest.mark.asyncio
    async def test_error_recorded_on_app_exception(self, recorder: MetricsRecorder) -> None:
        """An ERROR metric is recorded when the app raises."""
        msg = "crash"

        async def raising_app(scope: dict[str, Any], receive: Any, send: Any) -> None:  # noqa: ANN401
            raise RuntimeError(msg)

        middleware = MetricsMiddleware(raising_app, recorder=recorder)  # type: ignore[arg-type]

        with pytest.raises(RuntimeError, match=msg):
            await middleware(_make_scope(), AsyncMock(), AsyncMock())

        errors = list(recorder.query(metric_types={MetricType.ERROR}))
        assert len(errors) == 1
        assert errors[0].labels["error_type"] == "internal"
