"""Unit tests for the AuditMiddleware ASGI middleware.

Tests cover response logging:
- Response completion logged with method, path, query parameters, status code
- User information logged when authenticated
- Excluded paths are not logged
- Source component resolved from endpoint
- Context IDs (workflow, execution, activity) resolved from path params and context vars
- Path and method sanitization
- Error resilience
"""

from collections.abc import MutableMapping
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest

from nexus.api.constants import EXCLUDED_PATHS
from nexus.audit.middleware import AuditMiddleware
from nexus.audit.models import AuditEvent, EventSeverity, EventStatus, RequestCompletedData

_EMIT_PATCH = "nexus.audit.emitter._do_emit_audit_event"


class _MockRole:
    """Mock role object for testing."""

    def __init__(self, value: str) -> None:
        """Initialize mock role."""
        self.value = value


class _MockUser:
    """Mock user object for testing."""

    def __init__(
        self,
        user_id: UUID | None = None,
        username: str | None = None,
        role: str | None = None,
    ) -> None:
        """Initialize mock user."""
        self.id = user_id
        self.username = username
        self.role: _MockRole | None = _MockRole(role) if role else None


def _make_scope(
    path: str = "/api/v1/workflows",
    method: str = "GET",
    scope_type: str = "http",
    query_string: bytes = b"",
    user: Any = None,  # noqa: ANN401
    path_params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a minimal ASGI scope dict."""
    scope: dict[str, Any] = {
        "type": scope_type,
        "path": path,
        "method": method,
        "query_string": query_string,
        "headers": [],
    }
    if user is not None:
        scope["user"] = user
    if path_params is not None:
        scope["path_params"] = path_params
    return scope


def _make_app(status_code: int = 200) -> Any:  # noqa: ANN401
    """Create a fake ASGI app that sends a response with the given status."""

    async def app(scope: MutableMapping[str, Any], receive: Any, send: Any) -> None:  # noqa: ANN401
        await send({"type": "http.response.start", "status": status_code, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    return app


def _get_audit_events(mock_emit: MagicMock, event_action: str) -> list[AuditEvent]:
    """Extract AuditEvent objects with the given action from mock calls."""
    return [call[0][0] for call in mock_emit.call_args_list if call[0][0].event_action == event_action]


def _get_request_completed_data(mock_emit: MagicMock) -> list[RequestCompletedData]:
    """Extract typed RequestCompletedData from request_completed audit events."""
    events = _get_audit_events(mock_emit, "request_completed")
    result: list[RequestCompletedData] = []
    for event in events:
        assert isinstance(event.structured_data, RequestCompletedData)
        result.append(event.structured_data)
    return result


# =============================================================================
# AuditMiddleware - basic functionality
# =============================================================================


class TestAuditMiddlewareBasic:
    """Basic audit middleware functionality."""

    @pytest.mark.asyncio
    async def test_emits_single_request_completed_event(self) -> None:
        """A single request_completed event is emitted per request."""
        app = _make_app(status_code=200)
        middleware = AuditMiddleware(app)

        scope = _make_scope(path="/api/v1/workflows", method="GET")
        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(scope, AsyncMock(), AsyncMock())

        assert mock_emit.call_count == 1
        data = _get_request_completed_data(mock_emit)
        assert len(data) == 1
        assert data[0].method == "GET"
        assert data[0].path == "/api/v1/workflows"
        assert data[0].status_code == 200

    @pytest.mark.asyncio
    async def test_no_request_started_event(self) -> None:
        """No request_started event is emitted."""
        app = _make_app(status_code=200)
        middleware = AuditMiddleware(app)

        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(_make_scope(), AsyncMock(), AsyncMock())

        started = _get_audit_events(mock_emit, "request_started")
        assert len(started) == 0


# =============================================================================
# AuditMiddleware - query parameters
# =============================================================================


class TestAuditMiddlewareQueryParams:
    """Query parameter parsing and logging."""

    @pytest.mark.asyncio
    async def test_logs_query_parameters(self) -> None:
        """Query parameters are included in request_completed log."""
        app = _make_app(status_code=200)
        middleware = AuditMiddleware(app)

        scope = _make_scope(
            path="/api/v1/workflows",
            query_string=b"status=active&limit=10",
        )
        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(scope, AsyncMock(), AsyncMock())

        data = _get_request_completed_data(mock_emit)
        assert data[0].query_params is not None
        assert data[0].query_params["status"] == "active"
        assert data[0].query_params["limit"] == "10"

    @pytest.mark.asyncio
    async def test_no_query_params_logged_when_empty(self) -> None:
        """No query_params field when query string is empty."""
        app = _make_app(status_code=200)
        middleware = AuditMiddleware(app)

        scope = _make_scope(path="/api/v1/workflows", query_string=b"")
        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(scope, AsyncMock(), AsyncMock())

        data = _get_request_completed_data(mock_emit)
        assert data[0].query_params is None

    @pytest.mark.asyncio
    async def test_handles_invalid_query_string(self) -> None:
        """Invalid query strings are handled gracefully."""
        app = _make_app(status_code=200)
        middleware = AuditMiddleware(app)

        # Invalid UTF-8 sequence
        scope = _make_scope(path="/api/v1/workflows", query_string=b"\xff\xfe")
        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(scope, AsyncMock(), AsyncMock())

        data = _get_request_completed_data(mock_emit)
        assert data[0].query_params is not None
        assert "raw" in data[0].query_params

    @pytest.mark.asyncio
    async def test_handles_multi_value_query_params(self) -> None:
        """Multi-value query parameters are logged as lists."""
        app = _make_app(status_code=200)
        middleware = AuditMiddleware(app)

        scope = _make_scope(
            path="/api/v1/workflows",
            query_string=b"tag=foo&tag=bar",
        )
        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(scope, AsyncMock(), AsyncMock())

        data = _get_request_completed_data(mock_emit)
        assert data[0].query_params is not None
        assert data[0].query_params["tag"] == ["foo", "bar"]

    @pytest.mark.asyncio
    async def test_handles_mixed_single_and_multi_value_params(self) -> None:
        """Mixed single and multi-value params are parsed correctly."""
        app = _make_app(status_code=200)
        middleware = AuditMiddleware(app)

        scope = _make_scope(
            path="/api/v1/workflows",
            query_string=b"status=active&tag=foo&tag=bar&limit=10",
        )
        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(scope, AsyncMock(), AsyncMock())

        data = _get_request_completed_data(mock_emit)
        assert data[0].query_params is not None
        assert data[0].query_params["status"] == "active"
        assert data[0].query_params["tag"] == ["foo", "bar"]
        assert data[0].query_params["limit"] == "10"


# =============================================================================
# AuditMiddleware - exclusions
# =============================================================================


class TestAuditMiddlewareExclusions:
    """Excluded paths and non-HTTP scopes are not logged."""

    @pytest.mark.asyncio
    @pytest.mark.parametrize("path", sorted(EXCLUDED_PATHS))
    async def test_excluded_paths_not_logged(self, path: str) -> None:
        """Excluded paths do not generate log entries."""
        app = _make_app(status_code=200)
        middleware = AuditMiddleware(app)

        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(_make_scope(path=path), AsyncMock(), AsyncMock())

        assert mock_emit.call_count == 0

    @pytest.mark.asyncio
    async def test_excluded_paths_still_pass_to_app(self) -> None:
        """Excluded paths are still forwarded to the underlying app."""
        call_count = 0

        async def counting_app(scope: MutableMapping[str, Any], receive: Any, send: Any) -> None:  # noqa: ANN401
            nonlocal call_count
            call_count += 1

        middleware = AuditMiddleware(counting_app)
        await middleware(_make_scope(path="/health"), AsyncMock(), AsyncMock())

        assert call_count == 1

    @pytest.mark.asyncio
    async def test_non_http_scope_passthrough(self) -> None:
        """WebSocket and other non-HTTP scopes do not generate logs."""
        app = _make_app(status_code=200)
        middleware = AuditMiddleware(app)

        scope = _make_scope(scope_type="websocket")
        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(scope, AsyncMock(), AsyncMock())

        assert mock_emit.call_count == 0

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "path",
        [
            "/api/v1/workflows",
            "/auth/login",
            "/auth/callback",
            "/metrics",
            "/custom-endpoint",
        ],
    )
    async def test_non_excluded_paths_are_logged(self, path: str) -> None:
        """Non-excluded paths generate log entries."""
        app = _make_app(status_code=200)
        middleware = AuditMiddleware(app)

        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(_make_scope(path=path), AsyncMock(), AsyncMock())

        data = _get_request_completed_data(mock_emit)
        assert len(data) == 1
        assert data[0].path == path


# =============================================================================
# AuditMiddleware - user context
# =============================================================================


class TestAuditMiddlewareUserContext:
    """User information is logged when available."""

    @pytest.mark.asyncio
    async def test_logs_user_information(self) -> None:
        """User information is included in request logs when authenticated."""
        app = _make_app(status_code=200)
        middleware = AuditMiddleware(app)

        user_id = uuid4()
        user = _MockUser(user_id=user_id, username="testuser", role="creator")
        scope = _make_scope(path="/api/v1/workflows", user=user)

        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(scope, AsyncMock(), AsyncMock())

        events = _get_audit_events(mock_emit, "request_completed")
        assert len(events) == 1
        assert events[0].actor_id == user_id
        assert events[0].actor_type == "user"
        assert isinstance(events[0].structured_data, RequestCompletedData)
        assert events[0].structured_data.user_role == "creator"

    @pytest.mark.asyncio
    async def test_no_user_logs_without_authentication(self) -> None:
        """Requests without authentication still have user actor type."""
        app = _make_app(status_code=200)
        middleware = AuditMiddleware(app)

        scope = _make_scope(path="/api/v1/workflows")
        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(scope, AsyncMock(), AsyncMock())

        events = _get_audit_events(mock_emit, "request_completed")
        assert len(events) == 1
        assert events[0].actor_id is None
        assert events[0].actor_type == "user"
        assert isinstance(events[0].structured_data, RequestCompletedData)
        assert events[0].structured_data.user_role is None

    @pytest.mark.asyncio
    async def test_handles_partial_user_object(self) -> None:
        """Handles user objects with missing attributes gracefully."""
        app = _make_app(status_code=200)
        middleware = AuditMiddleware(app)

        # User with only username (id and role missing)
        user = _MockUser(username="partialuser")
        scope = _make_scope(path="/api/v1/workflows", user=user)

        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(scope, AsyncMock(), AsyncMock())

        events = _get_audit_events(mock_emit, "request_completed")
        assert len(events) == 1
        assert events[0].actor_id is None
        assert events[0].actor_type == "user"
        assert isinstance(events[0].structured_data, RequestCompletedData)
        assert events[0].structured_data.user_role is None

    @pytest.mark.asyncio
    async def test_user_id_converted_to_string(self) -> None:
        """User ID (UUID) is converted to string for logging."""
        app = _make_app(status_code=200)
        middleware = AuditMiddleware(app)

        user_id = uuid4()
        user = _MockUser(user_id=user_id)
        scope = _make_scope(user=user)

        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(scope, AsyncMock(), AsyncMock())

        events = _get_audit_events(mock_emit, "request_completed")
        assert len(events) == 1
        assert events[0].actor_id == user_id


# =============================================================================
# AuditMiddleware - response logging
# =============================================================================


class TestAuditMiddlewareResponse:
    """Response completion is logged with status code."""

    @pytest.mark.asyncio
    async def test_logs_status_code_from_response(self) -> None:
        """Status code is captured from the downstream app response."""
        app = _make_app(status_code=404)
        middleware = AuditMiddleware(app)

        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(_make_scope(), AsyncMock(), AsyncMock())

        data = _get_request_completed_data(mock_emit)
        assert data[0].status_code == 404

    @pytest.mark.asyncio
    async def test_logs_500_on_exception(self) -> None:
        """Unhandled exceptions produce a request_completed event with status 500."""

        async def failing_app(scope: MutableMapping[str, Any], receive: Any, send: Any) -> None:  # noqa: ANN401
            msg = "boom"
            raise RuntimeError(msg)

        middleware = AuditMiddleware(failing_app)
        with patch(_EMIT_PATCH) as mock_emit, pytest.raises(RuntimeError, match="boom"):
            await middleware(_make_scope(), AsyncMock(), AsyncMock())

        data = _get_request_completed_data(mock_emit)
        assert len(data) == 1
        assert data[0].status_code == 500

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("status_code", "expected_event_status"),
        [
            (200, EventStatus.SUCCESS),
            (201, EventStatus.SUCCESS),
            (204, EventStatus.SUCCESS),
            (301, EventStatus.SUCCESS),
            (399, EventStatus.SUCCESS),
            (400, EventStatus.ERROR),
            (403, EventStatus.ERROR),
            (404, EventStatus.ERROR),
            (500, EventStatus.ERROR),
            (503, EventStatus.ERROR),
        ],
    )
    async def test_event_status_derived_from_status_code(
        self, status_code: int, expected_event_status: EventStatus
    ) -> None:
        """event_status is SUCCESS for <400, ERROR for >=400."""
        app = _make_app(status_code=status_code)
        middleware = AuditMiddleware(app)

        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(_make_scope(), AsyncMock(), AsyncMock())

        events = _get_audit_events(mock_emit, "request_completed")
        assert len(events) == 1
        assert events[0].event_status == expected_event_status

    @pytest.mark.asyncio
    async def test_event_status_error_on_exception(self) -> None:
        """event_status is ERROR when the app raises an unhandled exception."""

        async def failing_app(scope: MutableMapping[str, Any], receive: Any, send: Any) -> None:  # noqa: ANN401
            msg = "boom"
            raise RuntimeError(msg)

        middleware = AuditMiddleware(failing_app)
        with patch(_EMIT_PATCH) as mock_emit, pytest.raises(RuntimeError, match="boom"):
            await middleware(_make_scope(), AsyncMock(), AsyncMock())

        events = _get_audit_events(mock_emit, "request_completed")
        assert len(events) == 1
        assert events[0].event_status == EventStatus.ERROR

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("status_code", "expected_event_severity"),
        [
            (200, EventSeverity.INFO),
            (201, EventSeverity.INFO),
            (301, EventSeverity.INFO),
            (399, EventSeverity.INFO),
            (400, EventSeverity.WARNING),
            (403, EventSeverity.WARNING),
            (404, EventSeverity.WARNING),
            (499, EventSeverity.WARNING),
            (500, EventSeverity.ERROR),
            (503, EventSeverity.ERROR),
        ],
    )
    async def test_event_severity_derived_from_status_code(
        self, status_code: int, expected_event_severity: EventSeverity
    ) -> None:
        """event_severity is INFO for <400, WARNING for 4xx, ERROR for 5xx."""
        app = _make_app(status_code=status_code)
        middleware = AuditMiddleware(app)

        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(_make_scope(), AsyncMock(), AsyncMock())

        events = _get_audit_events(mock_emit, "request_completed")
        assert len(events) == 1
        assert events[0].event_severity == expected_event_severity

    @pytest.mark.asyncio
    async def test_event_severity_error_on_exception(self) -> None:
        """event_severity is ERROR when the app raises an unhandled exception (forced 500)."""

        async def failing_app(scope: MutableMapping[str, Any], receive: Any, send: Any) -> None:  # noqa: ANN401
            msg = "boom"
            raise RuntimeError(msg)

        middleware = AuditMiddleware(failing_app)
        with patch(_EMIT_PATCH) as mock_emit, pytest.raises(RuntimeError, match="boom"):
            await middleware(_make_scope(), AsyncMock(), AsyncMock())

        events = _get_audit_events(mock_emit, "request_completed")
        assert len(events) == 1
        assert events[0].event_severity == EventSeverity.ERROR

    @pytest.mark.asyncio
    async def test_event_severity_matches_event_status_semantics(self) -> None:
        """Severity and status are consistent: a WARNING-severity event has ERROR status (4xx)."""
        app = _make_app(status_code=404)
        middleware = AuditMiddleware(app)

        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(_make_scope(), AsyncMock(), AsyncMock())

        events = _get_audit_events(mock_emit, "request_completed")
        assert len(events) == 1
        # 4xx should be WARNING severity but still ERROR status — the two fields
        # carry distinct information and must not be silently collapsed.
        assert events[0].event_severity == EventSeverity.WARNING
        assert events[0].event_status == EventStatus.ERROR

    @pytest.mark.asyncio
    async def test_fail_closed_when_response_start_never_sent(self) -> None:
        """An app that returns without sending http.response.start is classified as 500/ERROR/ERROR.

        The middleware initialises status_code to 500 fail-closed: if the
        downstream app returns normally but never emits an ``http.response.start``
        message, the audit event must still reflect an ERROR outcome — not a
        misleading INFO/SUCCESS with status_code=0.
        """

        async def silent_app(scope: MutableMapping[str, Any], receive: Any, send: Any) -> None:  # noqa: ANN401
            # Returns without ever calling send — simulates a broken
            # downstream app or a misconfigured middleware chain.
            return

        middleware = AuditMiddleware(silent_app)
        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(_make_scope(), AsyncMock(), AsyncMock())

        events = _get_audit_events(mock_emit, "request_completed")
        assert len(events) == 1
        assert events[0].event_severity == EventSeverity.ERROR
        assert events[0].event_status == EventStatus.ERROR
        data = _get_request_completed_data(mock_emit)
        assert data[0].status_code == 500

    @pytest.mark.asyncio
    async def test_exception_after_2xx_response_start_emits_500_error(self) -> None:
        """If the app sends a 2xx http.response.start but then raises during body streaming.

        The audit event must reflect 500/ERROR/ERROR — not the intercepted 2xx.
        """

        async def partial_sender(
            scope: MutableMapping[str, Any],
            receive: Any,  # noqa: ANN401
            send: Any,  # noqa: ANN401
        ) -> None:
            await send({"type": "http.response.start", "status": 200, "headers": []})
            msg = "body streaming failed"
            raise RuntimeError(msg)

        middleware = AuditMiddleware(partial_sender)
        with patch(_EMIT_PATCH) as mock_emit, pytest.raises(RuntimeError, match="body streaming failed"):
            await middleware(_make_scope(), AsyncMock(), AsyncMock())

        events = _get_audit_events(mock_emit, "request_completed")
        assert len(events) == 1
        assert events[0].event_severity == EventSeverity.ERROR
        assert events[0].event_status == EventStatus.ERROR
        data = _get_request_completed_data(mock_emit)
        assert data[0].status_code == 500

    @pytest.mark.asyncio
    async def test_exception_propagates(self) -> None:
        """The original exception is re-raised after logging."""

        async def failing_app(scope: MutableMapping[str, Any], receive: Any, send: Any) -> None:  # noqa: ANN401
            msg = "original error"
            raise ValueError(msg)

        middleware = AuditMiddleware(failing_app)
        with pytest.raises(ValueError, match="original error"):
            await middleware(_make_scope(), AsyncMock(), AsyncMock())

    @pytest.mark.asyncio
    async def test_completed_event_has_actor(self) -> None:
        """The request_completed event carries the authenticated actor."""
        app = _make_app(status_code=200)
        middleware = AuditMiddleware(app)

        user_id = uuid4()
        user = _MockUser(user_id=user_id, role="creator")
        scope = _make_scope(user=user)

        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(scope, AsyncMock(), AsyncMock())

        events = _get_audit_events(mock_emit, "request_completed")
        assert events[0].actor_id == user_id
        assert events[0].actor_type == "user"

    @pytest.mark.asyncio
    async def test_exception_preserves_actor_context(self) -> None:
        """Actor context is preserved in request_completed on exception path."""

        async def failing_app(scope: MutableMapping[str, Any], receive: Any, send: Any) -> None:  # noqa: ANN401
            msg = "boom"
            raise RuntimeError(msg)

        middleware = AuditMiddleware(failing_app)
        user_id = uuid4()
        user = _MockUser(user_id=user_id, role="creator")
        scope = _make_scope(user=user)

        with patch(_EMIT_PATCH) as mock_emit, pytest.raises(RuntimeError, match="boom"):
            await middleware(scope, AsyncMock(), AsyncMock())

        events = _get_audit_events(mock_emit, "request_completed")
        assert events[0].actor_id == user_id
        assert events[0].actor_type == "user"


# =============================================================================
# AuditMiddleware - source component resolution
# =============================================================================


class TestAuditMiddlewareSourceComponent:
    """request_completed uses the resolved endpoint module as source_component."""

    @pytest.mark.asyncio
    async def test_source_component_from_endpoint(self) -> None:
        """source_component is set to the endpoint's module on request_completed."""

        async def handler(scope: MutableMapping[str, Any], receive: Any, send: Any) -> None:  # noqa: ANN401
            scope["endpoint"] = handler
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b""})

        middleware = AuditMiddleware(handler)
        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(_make_scope(), AsyncMock(), AsyncMock())

        events = _get_audit_events(mock_emit, "request_completed")
        assert events[0].source_component == handler.__module__

    @pytest.mark.asyncio
    async def test_source_component_fallback_without_endpoint(self) -> None:
        """source_component falls back to the middleware module when no endpoint is set."""
        app = _make_app(status_code=200)
        middleware = AuditMiddleware(app)

        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(_make_scope(), AsyncMock(), AsyncMock())

        events = _get_audit_events(mock_emit, "request_completed")
        assert events[0].source_component == "nexus.audit.middleware"

    @pytest.mark.asyncio
    async def test_source_component_on_exception(self) -> None:
        """source_component resolves from endpoint even on the exception path."""

        async def failing_handler(scope: MutableMapping[str, Any], receive: Any, send: Any) -> None:  # noqa: ANN401
            scope["endpoint"] = failing_handler
            msg = "boom"
            raise RuntimeError(msg)

        middleware = AuditMiddleware(failing_handler)
        with patch(_EMIT_PATCH) as mock_emit, pytest.raises(RuntimeError, match="boom"):
            await middleware(_make_scope(), AsyncMock(), AsyncMock())

        events = _get_audit_events(mock_emit, "request_completed")
        assert events[0].source_component == failing_handler.__module__


# =============================================================================
# AuditMiddleware - context ID resolution
# =============================================================================


class TestAuditMiddlewareContextIds:
    """Context IDs (workflow, execution, activity) are resolved from the request."""

    @pytest.mark.asyncio
    async def test_workflow_id_from_path_params(self) -> None:
        """workflow_id is extracted from path_params when available."""
        wf_id = uuid4()
        app = _make_app(status_code=200)
        middleware = AuditMiddleware(app)

        scope = _make_scope(
            path=f"/api/v1/workflows/{wf_id}",
            path_params={"workflow_id": str(wf_id)},
        )
        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(scope, AsyncMock(), AsyncMock())

        events = _get_audit_events(mock_emit, "request_completed")
        assert events[0].workflow_id == wf_id

    @pytest.mark.asyncio
    async def test_execution_id_from_path_params(self) -> None:
        """execution_id is extracted from path_params when available."""
        exec_id = uuid4()
        app = _make_app(status_code=200)
        middleware = AuditMiddleware(app)

        scope = _make_scope(
            path=f"/api/v1/executions/{exec_id}",
            path_params={"execution_id": str(exec_id)},
        )
        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(scope, AsyncMock(), AsyncMock())

        events = _get_audit_events(mock_emit, "request_completed")
        assert events[0].execution_id == exec_id

    @pytest.mark.asyncio
    async def test_activity_id_from_path_params(self) -> None:
        """activity_id is extracted from path_params when available."""
        exec_id = uuid4()
        activity_id = "my-activity"
        app = _make_app(status_code=200)
        middleware = AuditMiddleware(app)

        scope = _make_scope(
            path=f"/api/v1/executions/{exec_id}/activities/{activity_id}/signal",
            path_params={"execution_id": str(exec_id), "activity_id": activity_id},
        )
        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(scope, AsyncMock(), AsyncMock())

        events = _get_audit_events(mock_emit, "request_completed")
        assert events[0].activity_id == activity_id
        assert events[0].execution_id == exec_id

    @pytest.mark.asyncio
    async def test_workflow_id_from_context_var(self) -> None:
        """workflow_id falls back to context variable when not in path_params."""
        wf_id = uuid4()

        async def app_that_sets_context(
            scope: MutableMapping[str, Any],
            receive: Any,  # noqa: ANN401
            send: Any,  # noqa: ANN401
        ) -> None:
            from nexus.audit.emitter import workflow_id_context_var

            workflow_id_context_var.set(wf_id)
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b""})

        middleware = AuditMiddleware(app_that_sets_context)
        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(_make_scope(), AsyncMock(), AsyncMock())

        events = _get_audit_events(mock_emit, "request_completed")
        assert events[0].workflow_id == wf_id

    @pytest.mark.asyncio
    async def test_path_params_take_precedence_over_context_var(self) -> None:
        """Path param workflow_id takes precedence over context variable."""
        path_wf_id = uuid4()
        ctx_wf_id = uuid4()

        async def app_that_sets_context(
            scope: MutableMapping[str, Any],
            receive: Any,  # noqa: ANN401
            send: Any,  # noqa: ANN401
        ) -> None:
            from nexus.audit.emitter import workflow_id_context_var

            workflow_id_context_var.set(ctx_wf_id)
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b""})

        middleware = AuditMiddleware(app_that_sets_context)
        scope = _make_scope(
            path=f"/api/v1/workflows/{path_wf_id}",
            path_params={"workflow_id": str(path_wf_id)},
        )
        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(scope, AsyncMock(), AsyncMock())

        events = _get_audit_events(mock_emit, "request_completed")
        assert events[0].workflow_id == path_wf_id

    @pytest.mark.asyncio
    async def test_malformed_workflow_id_defaults_to_none(self) -> None:
        """Malformed workflow_id in path params defaults to None."""
        app = _make_app(status_code=200)
        middleware = AuditMiddleware(app)

        scope = _make_scope(
            path="/api/v1/workflows/not-a-uuid",
            path_params={"workflow_id": "not-a-uuid"},
        )
        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(scope, AsyncMock(), AsyncMock())

        events = _get_audit_events(mock_emit, "request_completed")
        assert events[0].workflow_id is None

    @pytest.mark.asyncio
    async def test_malformed_execution_id_defaults_to_none(self) -> None:
        """Malformed execution_id in path params defaults to None."""
        app = _make_app(status_code=200)
        middleware = AuditMiddleware(app)

        scope = _make_scope(
            path="/api/v1/executions/not-a-uuid",
            path_params={"execution_id": "not-a-uuid"},
        )
        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(scope, AsyncMock(), AsyncMock())

        events = _get_audit_events(mock_emit, "request_completed")
        assert events[0].execution_id is None

    @pytest.mark.asyncio
    async def test_context_ids_none_when_not_available(self) -> None:
        """Context IDs are None when not in path params or context vars."""
        app = _make_app(status_code=200)
        middleware = AuditMiddleware(app)

        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(_make_scope(), AsyncMock(), AsyncMock())

        events = _get_audit_events(mock_emit, "request_completed")
        assert events[0].workflow_id is None
        assert events[0].execution_id is None
        assert events[0].activity_id is None


# =============================================================================
# AuditMiddleware - path and method sanitization
# =============================================================================


class TestAuditMiddlewareSanitization:
    """Path normalization, control character stripping, and length capping."""

    @pytest.mark.asyncio
    async def test_path_normalized_before_logging(self) -> None:
        """Path traversals and redundant separators are normalized."""
        app = _make_app(status_code=200)
        middleware = AuditMiddleware(app)

        scope = _make_scope(path="/api/v1/../v1/workflows")
        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(scope, AsyncMock(), AsyncMock())

        data = _get_request_completed_data(mock_emit)
        assert data[0].path == "/api/v1/workflows"

    @pytest.mark.asyncio
    async def test_path_double_slashes_normalized(self) -> None:
        """Double slashes in path are collapsed."""
        app = _make_app(status_code=200)
        middleware = AuditMiddleware(app)

        scope = _make_scope(path="/api//v1///workflows")
        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(scope, AsyncMock(), AsyncMock())

        data = _get_request_completed_data(mock_emit)
        assert data[0].path == "/api/v1/workflows"

    @pytest.mark.asyncio
    async def test_control_chars_stripped_from_path(self) -> None:
        """Control characters in path are removed before logging."""
        app = _make_app(status_code=200)
        middleware = AuditMiddleware(app)

        scope = _make_scope(path="/api/v1/work\r\nflows")
        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(scope, AsyncMock(), AsyncMock())

        data = _get_request_completed_data(mock_emit)
        assert data[0].path == "/api/v1/workflows"

    @pytest.mark.asyncio
    async def test_null_bytes_stripped_from_path(self) -> None:
        """Null bytes in path are removed."""
        app = _make_app(status_code=200)
        middleware = AuditMiddleware(app)

        scope = _make_scope(path="/api/v1/work\x00flows")
        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(scope, AsyncMock(), AsyncMock())

        data = _get_request_completed_data(mock_emit)
        assert data[0].path == "/api/v1/workflows"

    @pytest.mark.asyncio
    async def test_control_chars_stripped_from_method(self) -> None:
        """Control characters in HTTP method are removed."""
        app = _make_app(status_code=200)
        middleware = AuditMiddleware(app)

        scope = _make_scope(method="GE\nT")
        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(scope, AsyncMock(), AsyncMock())

        data = _get_request_completed_data(mock_emit)
        assert data[0].method == "GET"

    @pytest.mark.asyncio
    async def test_path_truncated_at_max_length(self) -> None:
        """Paths longer than 2048 characters are truncated."""
        app = _make_app(status_code=200)
        middleware = AuditMiddleware(app)

        long_path = "/" + "a" * 3000
        scope = _make_scope(path=long_path)
        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(scope, AsyncMock(), AsyncMock())

        data = _get_request_completed_data(mock_emit)
        assert len(data[0].path) == 2048

    @pytest.mark.asyncio
    async def test_normalized_path_used_for_exclusion_check(self) -> None:
        """Exclusion check uses the normalized path."""
        app = _make_app(status_code=200)
        middleware = AuditMiddleware(app)

        # Use path traversal to reach an excluded path
        excluded = next(iter(sorted(EXCLUDED_PATHS)))
        traversal_path = "/dummy/../" + excluded.lstrip("/")
        scope = _make_scope(path=traversal_path)

        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(scope, AsyncMock(), AsyncMock())

        assert mock_emit.call_count == 0

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "encoded_path",
        [
            "/%68ealth",  # /health
            "/%68%65alth",  # /health (multiple encoded chars)
            "/hea%6Cth",  # /health
        ],
    )
    async def test_percent_encoded_excluded_path_still_excluded(self, encoded_path: str) -> None:
        """Percent-encoded excluded paths are decoded before exclusion check."""
        app = _make_app(status_code=200)
        middleware = AuditMiddleware(app)

        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(_make_scope(path=encoded_path), AsyncMock(), AsyncMock())

        assert mock_emit.call_count == 0

    @pytest.mark.asyncio
    async def test_percent_encoded_path_decoded_in_log(self) -> None:
        """Percent-encoded path segments are decoded before logging."""
        app = _make_app(status_code=200)
        middleware = AuditMiddleware(app)

        scope = _make_scope(path="/api/v1/%77orkflows")
        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(scope, AsyncMock(), AsyncMock())

        data = _get_request_completed_data(mock_emit)
        assert data[0].path == "/api/v1/workflows"

    @pytest.mark.asyncio
    async def test_sanitized_values_in_event_message(self) -> None:
        """Event message uses sanitized method and path."""
        app = _make_app(status_code=200)
        middleware = AuditMiddleware(app)

        scope = _make_scope(path="/api//v1/work\nflows", method="PO\rST")
        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(scope, AsyncMock(), AsyncMock())

        events = _get_audit_events(mock_emit, "request_completed")
        assert events[0].event_message == "Request completed: POST /api/v1/workflows 200"

    @pytest.mark.asyncio
    async def test_event_message_excludes_query_params(self) -> None:
        """Query params are not included in event_message to avoid leaking sensitive values."""
        app = _make_app(status_code=200)
        middleware = AuditMiddleware(app)

        scope = _make_scope(
            path="/api/v1/auth",
            method="GET",
            query_string=b"username=admin&password=hunter2",
        )
        with patch(_EMIT_PATCH) as mock_emit:
            await middleware(scope, AsyncMock(), AsyncMock())

        events = _get_audit_events(mock_emit, "request_completed")
        assert events[0].event_message == "Request completed: GET /api/v1/auth 200"
        assert "hunter2" not in events[0].event_message
        assert "username" not in events[0].event_message


# =============================================================================
# AuditMiddleware - error resilience
# =============================================================================


class TestAuditMiddlewareErrorResilience:
    """Audit event emission failures do not crash requests."""

    @pytest.mark.asyncio
    async def test_request_succeeds_when_emit_raises(self) -> None:
        """Request completes normally even if audit event emission fails."""
        app = _make_app(status_code=200)
        middleware = AuditMiddleware(app)

        sent_messages: list[MutableMapping[str, Any]] = []

        async def capture_send(message: MutableMapping[str, Any]) -> None:
            sent_messages.append(message)

        emit_patch = "nexus.audit.middleware.emit_audit_event"
        with patch(emit_patch, side_effect=RuntimeError("emit broken")):
            await middleware(_make_scope(), AsyncMock(), capture_send)

        assert len(sent_messages) == 2
        assert sent_messages[0]["status"] == 200

    @pytest.mark.asyncio
    async def test_emit_failure_logged_as_warning_with_context(self) -> None:
        """Audit emission failure is logged with error_type and status_code for triage."""
        app = _make_app(status_code=200)
        middleware = AuditMiddleware(app)

        emit_patch = "nexus.audit.middleware.emit_audit_event"
        with (
            patch(emit_patch, side_effect=RuntimeError("emit broken")),
            patch("nexus.audit.middleware.logger") as mock_logger,
        ):
            await middleware(_make_scope(), AsyncMock(), AsyncMock())
            assert mock_logger.warning.call_count >= 1
            call_args = mock_logger.warning.call_args
            assert "audit_middleware_failed" in call_args[0]
            assert call_args[1]["error_type"] == "RuntimeError"
            assert call_args[1]["status_code"] == 200
