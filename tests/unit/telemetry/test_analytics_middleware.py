"""Unit tests for AnalyticsMiddleware."""

from __future__ import annotations

from collections.abc import MutableMapping
from typing import TYPE_CHECKING, Any
from unittest.mock import MagicMock, patch

import pytest

from nexus.api.constants import EXCLUDED_PATHS
from nexus.telemetry.events.api_call import APICallEvent
from nexus.telemetry.middleware import AnalyticsMiddleware

if TYPE_CHECKING:
    from starlette.types import Receive, Scope, Send

Message = MutableMapping[str, Any]


async def _make_ok_app(scope: Scope, receive: Receive, send: Send) -> None:
    """Minimal ASGI app that returns 200 OK."""
    await send({"type": "http.response.start", "status": 200, "headers": []})
    await send({"type": "http.response.body", "body": b"ok"})


async def _make_error_app(scope: Scope, receive: Receive, send: Send) -> None:
    """Minimal ASGI app that returns 500."""
    await send({"type": "http.response.start", "status": 500, "headers": []})
    await send({"type": "http.response.body", "body": b"error"})


async def _noop_receive() -> dict[str, str | bytes]:
    """No-op ASGI receive callable."""
    return {"type": "http.request", "body": b""}


def _make_http_scope(
    path: str = "/api/v1/test",
    method: str = "GET",
    headers: list[tuple[bytes, bytes]] | None = None,
) -> dict[str, Any]:
    """Build a minimal HTTP ASGI scope."""
    return {
        "type": "http",
        "path": path,
        "method": method,
        "headers": headers or [],
    }


def _make_registry_mock() -> MagicMock:
    """Build a mock TelemetryClientRegistry."""
    mock = MagicMock()
    mock.is_initialized.return_value = True
    mock.entitlement_id = ""
    return mock


class TestAnalyticsMiddlewareEventEmission:
    """Test that the middleware emits events on normal requests."""

    @pytest.mark.anyio
    async def test_emits_event_on_normal_request(self) -> None:
        registry = _make_registry_mock()
        middleware = AnalyticsMiddleware(app=_make_ok_app, registry=registry)

        sent_messages: list[Message] = []

        async def capture_send(message: Message) -> None:
            sent_messages.append(message)

        await middleware(_make_http_scope(), _noop_receive, capture_send)

        registry.send_event.assert_called_once()
        event = registry.send_event.call_args[0][0]
        assert isinstance(event, APICallEvent)
        assert event.endpoint == "/api/v1/test"
        assert event.http_method == "GET"
        assert event.status_code == 200

    @pytest.mark.anyio
    async def test_captures_status_code_from_response_start(self) -> None:
        registry = _make_registry_mock()
        middleware = AnalyticsMiddleware(app=_make_error_app, registry=registry)

        sent_messages: list[Message] = []

        async def capture_send(message: Message) -> None:
            sent_messages.append(message)

        await middleware(_make_http_scope(), _noop_receive, capture_send)

        event = registry.send_event.call_args[0][0]
        assert event.status_code == 500

    @pytest.mark.anyio
    async def test_measures_response_time(self) -> None:
        registry = _make_registry_mock()
        middleware = AnalyticsMiddleware(app=_make_ok_app, registry=registry)

        sent_messages: list[Message] = []

        async def capture_send(message: Message) -> None:
            sent_messages.append(message)

        await middleware(_make_http_scope(), _noop_receive, capture_send)

        event = registry.send_event.call_args[0][0]
        assert event.response_time_ms >= 0

    @pytest.mark.anyio
    async def test_reads_content_length_header(self) -> None:
        registry = _make_registry_mock()
        middleware = AnalyticsMiddleware(app=_make_ok_app, registry=registry)
        scope = _make_http_scope(
            method="POST",
            headers=[(b"content-length", b"1024")],
        )

        sent_messages: list[Message] = []

        async def capture_send(message: Message) -> None:
            sent_messages.append(message)

        await middleware(scope, _noop_receive, capture_send)

        event = registry.send_event.call_args[0][0]
        assert event.request_payload_size == 1024

    @pytest.mark.anyio
    async def test_zero_payload_size_when_no_content_length(self) -> None:
        registry = _make_registry_mock()
        middleware = AnalyticsMiddleware(app=_make_ok_app, registry=registry)

        sent_messages: list[Message] = []

        async def capture_send(message: Message) -> None:
            sent_messages.append(message)

        await middleware(_make_http_scope(), _noop_receive, capture_send)

        event = registry.send_event.call_args[0][0]
        assert event.request_payload_size == 0


class TestAnalyticsMiddlewareExcludedPaths:
    """Test that excluded paths are skipped."""

    @pytest.mark.anyio
    @pytest.mark.parametrize("path", sorted(EXCLUDED_PATHS))
    async def test_excluded_path_produces_no_event(self, path: str) -> None:
        registry = _make_registry_mock()
        middleware = AnalyticsMiddleware(app=_make_ok_app, registry=registry)

        sent_messages: list[Message] = []

        async def capture_send(message: Message) -> None:
            sent_messages.append(message)

        await middleware(_make_http_scope(path=path), _noop_receive, capture_send)

        registry.send_event.assert_not_called()

    @pytest.mark.anyio
    async def test_non_excluded_path_produces_event(self) -> None:
        registry = _make_registry_mock()
        middleware = AnalyticsMiddleware(app=_make_ok_app, registry=registry)

        sent_messages: list[Message] = []

        async def capture_send(message: Message) -> None:
            sent_messages.append(message)

        await middleware(
            _make_http_scope(path="/api/v1/workflows"),
            _noop_receive,
            capture_send,
        )

        registry.send_event.assert_called_once()


class TestAnalyticsMiddlewareNonHttp:
    """Test that non-HTTP scopes are passed through."""

    @pytest.mark.anyio
    async def test_websocket_scope_passes_through(self) -> None:
        registry = _make_registry_mock()
        app_called = False

        async def ws_app(scope: Scope, receive: Receive, send: Send) -> None:
            nonlocal app_called
            app_called = True

        middleware = AnalyticsMiddleware(app=ws_app, registry=registry)

        async def noop_send(_message: Message) -> None:
            pass

        await middleware(
            {"type": "websocket", "path": "/ws"},
            _noop_receive,
            noop_send,
        )

        assert app_called
        registry.send_event.assert_not_called()


class TestAnalyticsMiddlewarePrivacy:
    """Test that sensitive data is never captured (US2)."""

    @pytest.mark.anyio
    async def test_authorization_header_not_in_event(self) -> None:
        registry = _make_registry_mock()
        middleware = AnalyticsMiddleware(app=_make_ok_app, registry=registry)
        scope = _make_http_scope(
            headers=[
                (b"authorization", b"Bearer secret-token-123"),
                (b"content-length", b"100"),
            ],
        )

        sent_messages: list[Message] = []

        async def capture_send(message: Message) -> None:
            sent_messages.append(message)

        await middleware(scope, _noop_receive, capture_send)

        event = registry.send_event.call_args[0][0]
        props = event.model_dump()
        # Only allowed fields
        assert set(props.keys()) == {
            "endpoint",
            "http_method",
            "status_code",
            "response_time_ms",
            "request_payload_size",
            "entitlement_id",
            "request_id",
        }
        # No header values in properties
        for value in props.values():
            if isinstance(value, str):
                assert "secret-token" not in value
                assert "Bearer" not in value

    @pytest.mark.anyio
    async def test_query_string_not_in_event(self) -> None:
        registry = _make_registry_mock()
        middleware = AnalyticsMiddleware(app=_make_ok_app, registry=registry)
        scope = _make_http_scope(path="/api/v1/test")
        scope["query_string"] = b"name=John&token=secret"

        sent_messages: list[Message] = []

        async def capture_send(message: Message) -> None:
            sent_messages.append(message)

        await middleware(scope, _noop_receive, capture_send)

        event = registry.send_event.call_args[0][0]
        props = event.model_dump()
        for value in props.values():
            if isinstance(value, str):
                assert "John" not in value
                assert "secret" not in value
                assert "query_string" not in value

    @pytest.mark.anyio
    async def test_event_has_only_five_allowed_fields(self) -> None:
        registry = _make_registry_mock()
        middleware = AnalyticsMiddleware(app=_make_ok_app, registry=registry)
        scope = _make_http_scope(
            method="POST",
            headers=[
                (b"authorization", b"Bearer xyz"),
                (b"content-type", b"application/json"),
                (b"content-length", b"256"),
                (b"x-custom-header", b"custom-value"),
            ],
        )
        scope["query_string"] = b"key=value"

        sent_messages: list[Message] = []

        async def capture_send(message: Message) -> None:
            sent_messages.append(message)

        await middleware(scope, _noop_receive, capture_send)

        event = registry.send_event.call_args[0][0]
        props = event.model_dump()
        assert set(props.keys()) == {
            "endpoint",
            "http_method",
            "status_code",
            "response_time_ms",
            "request_payload_size",
            "entitlement_id",
            "request_id",
        }


class TestAnalyticsMiddlewareErrorResilience:
    """Test fire-and-forget behavior (US3)."""

    @pytest.mark.anyio
    async def test_api_response_unaffected_when_track_raises(self) -> None:
        registry = _make_registry_mock()
        registry.send_event.side_effect = RuntimeError("Segment unavailable")
        middleware = AnalyticsMiddleware(app=_make_ok_app, registry=registry)

        sent_messages: list[Message] = []

        async def capture_send(message: Message) -> None:
            sent_messages.append(message)

        # Should not raise
        await middleware(_make_http_scope(), _noop_receive, capture_send)

        # Response should still be sent
        assert len(sent_messages) == 2
        assert sent_messages[0]["status"] == 200

    @pytest.mark.anyio
    async def test_failure_is_logged_as_warning(self) -> None:
        registry = _make_registry_mock()
        registry.send_event.side_effect = RuntimeError("Segment unavailable")
        middleware = AnalyticsMiddleware(app=_make_ok_app, registry=registry)

        sent_messages: list[Message] = []

        async def capture_send(message: Message) -> None:
            sent_messages.append(message)

        with patch("nexus.telemetry.middleware.logger") as mock_logger:
            await middleware(_make_http_scope(), _noop_receive, capture_send)
            mock_logger.warning.assert_called_once()
            call_args = mock_logger.warning.call_args
            assert "analytics_event_failed" in call_args[0]
