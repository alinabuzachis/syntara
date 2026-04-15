"""ASGI audit middleware.

Logs every HTTP response for observability and debugging.  Provides
structured logging with method, path, query parameters, user information
(if authenticated), response status code, and context IDs (workflow,
execution, activity) when available.

Also extracts the ``X-Request-Id`` header (UUID) from incoming requests
and propagates it via :data:`~nexus.audit.emitter.request_id_context_var`
so downstream middleware, handlers, and telemetry can access it.
"""

from __future__ import annotations

import contextlib
from http import HTTPStatus
from posixpath import normpath
from typing import TYPE_CHECKING, Any
from urllib.parse import parse_qs, unquote
from uuid import UUID

import structlog

from nexus.api.constants import EXCLUDED_PATHS
from nexus.audit.emitter import (
    emit_audit_event,
    execution_id_context_var,
    request_id_context_var,
    workflow_id_context_var,
)
from nexus.audit.models import ActorType, AuditEvent, EventCategory, EventSeverity, EventStatus, RequestCompletedData

logger = structlog.stdlib.get_logger(__name__)

if TYPE_CHECKING:
    from starlette.types import ASGIApp, Message, Receive, Scope, Send

_SOURCE_COMPONENT = "nexus.audit.middleware"
_MAX_PATH_LENGTH = 2048
_REQUEST_ID_HEADER: bytes = b"x-request-id"
_CONTROL_CHAR_TABLE = str.maketrans("", "", "".join(chr(c) for c in (*range(0x20), 0x7F)))


class AuditMiddleware:
    """ASGI middleware that logs HTTP request completion.

    For every HTTP request (excluding EXCLUDED_PATHS), the middleware
    intercepts ``http.response.start`` to capture the response status code
    and emits a single ``request_completed`` audit event after the downstream
    application has finished processing.

    Because the event is emitted *after* routing, all resolved context is
    available: endpoint module (``source_component``), path parameters
    (``workflow_id``, ``execution_id``, ``activity_id``), and any context
    variables set by the handler.

    If the downstream application raises an exception, a ``request_completed``
    event is still emitted with ``status_code=500`` before the exception
    propagates.

    Privacy notes:
    - Query parameters are logged (but not request bodies)
    - User information (id, role) is logged if authenticated
    - Request headers are NOT logged (including Authorization)

    Args:
        app: The next ASGI application in the chain.

    """

    def __init__(self, app: ASGIApp) -> None:
        """Initialize the audit middleware.

        Args:
            app: The next ASGI application in the chain.

        """
        self.app = app

    @staticmethod
    def _strip_control_chars(value: str) -> str:
        """Remove ASCII control characters from a string.

        Prevents log injection via newlines, carriage returns, or null bytes
        embedded in request fields.

        Args:
            value: The string to sanitize.

        Returns:
            The string with control characters removed.

        """
        return value.translate(_CONTROL_CHAR_TABLE)

    @staticmethod
    def _normalize_path(path: str) -> str:
        """Normalize and sanitize a URL path for safe logging.

        Decodes percent-encoded characters, collapses ``..``, ``//``, and
        ``.`` segments via POSIX normpath, strips control characters, and
        truncates to ``_MAX_PATH_LENGTH``.

        Args:
            path: The raw request path.

        Returns:
            A normalized, sanitized, and length-capped path string.

        """
        # Decode percent-encoded characters so that e.g. /%68ealth → /health
        decoded = unquote(path)
        # Normalize path traversals and redundant separators
        normalized = normpath(decoded)
        # Ensure leading slash is preserved (normpath removes it for "/")
        if not normalized.startswith("/"):
            normalized = "/" + normalized
        # Strip control characters
        normalized = normalized.translate(_CONTROL_CHAR_TABLE)
        # Truncate to max length
        return normalized[:_MAX_PATH_LENGTH]

    def _extract_user_context(self, scope: Scope) -> dict[str, Any]:
        """Extract user information from the ASGI scope if available.

        Looks for user information in scope["user"] set by authentication middleware.
        Extracts id, role, and actor type for logging purposes.

        Args:
            scope: ASGI connection scope.

        Returns:
            Dictionary with actor_type=USER and optionally user_id and user_role
            if the user is authenticated.

        """
        user = scope.get("user")

        user_context: dict[str, Any] = {"actor_type": ActorType.USER}

        if user is None:
            return user_context

        # Extract user ID (convert UUID to string for logging)
        if hasattr(user, "id") and user.id is not None:
            user_context["user_id"] = str(user.id)

        # Extract role (convert enum to string value)
        if hasattr(user, "role") and user.role is not None:
            user_context["user_role"] = str(user.role.value if hasattr(user.role, "value") else user.role)

        return user_context

    def _parse_query_params(self, query_string: bytes) -> dict[str, str | list[str]]:
        """Parse query string into a dictionary.

        Args:
            query_string: Raw query string bytes from ASGI scope.

        Returns:
            Dictionary of query parameters.

        """
        if not query_string:
            return {}

        try:
            parsed = parse_qs(query_string.decode("utf-8"))
            # Convert lists to single values for cleaner logging
            return {k: v[0] if len(v) == 1 else v for k, v in parsed.items()}
        except UnicodeDecodeError:
            # If query string can't be decoded, log raw bytes
            return {"raw": query_string.decode("utf-8", errors="replace")}

    @staticmethod
    def _resolve_source_component(scope: Scope) -> str:
        """Derive source_component from the resolved endpoint, if available.

        After Starlette/FastAPI route resolution, ``scope["endpoint"]`` holds
        the handler function.  Its ``__module__`` (e.g.
        ``nexus.workflows.router``) is a more specific source than the
        middleware's own module name.

        Args:
            scope: ASGI connection scope (may contain ``endpoint`` after routing).

        Returns:
            The endpoint's module name, or the default ``_SOURCE_COMPONENT``.

        """
        endpoint = scope.get("endpoint")
        if endpoint is not None and hasattr(endpoint, "__module__"):
            return str(endpoint.__module__)
        return _SOURCE_COMPONENT

    @staticmethod
    def _resolve_context_ids(scope: Scope) -> dict[str, UUID | str | None]:
        """Resolve workflow_id, execution_id, and activity_id from the request.

        Checks path parameters first (populated by Starlette after routing),
        then falls back to context variables that handlers may have set during
        request processing.

        Args:
            scope: ASGI connection scope (may contain ``path_params`` after routing).

        Returns:
            Dictionary with ``workflow_id``, ``execution_id``, and ``activity_id``.

        """
        path_params = scope.get("path_params", {})

        # Path params take precedence; fall back to context variables
        raw_workflow_id = path_params.get("workflow_id") or workflow_id_context_var.get()
        raw_execution_id = path_params.get("execution_id") or execution_id_context_var.get()

        try:
            workflow_id = UUID(str(raw_workflow_id)) if raw_workflow_id else None
        except ValueError:
            workflow_id = None

        try:
            execution_id = UUID(str(raw_execution_id)) if raw_execution_id else None
        except ValueError:
            execution_id = None

        # activity_id is a string on AuditEvent, only available from path params
        raw_activity_id = path_params.get("activity_id")
        activity_id = str(raw_activity_id) if raw_activity_id else None

        return {
            "workflow_id": workflow_id,
            "execution_id": execution_id,
            "activity_id": activity_id,
        }

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """Process an ASGI request.

        Non-HTTP requests and excluded paths are passed through without logging.

        Args:
            scope: ASGI connection scope.
            receive: ASGI receive callable.
            send: ASGI send callable.

        """
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path: str = self._normalize_path(scope["path"])

        if path in EXCLUDED_PATHS:
            await self.app(scope, receive, send)
            return

        # Extract X-Request-Id from incoming headers and propagate via ContextVar.
        # Only valid UUID values are accepted; malformed values are silently ignored.
        request_id: UUID | None = None
        for header_name, header_value in scope.get("headers", []):
            if header_name.lower() == _REQUEST_ID_HEADER:
                with contextlib.suppress(ValueError, UnicodeDecodeError):
                    request_id = UUID(header_value.decode("latin-1"))
                break
        token = request_id_context_var.set(request_id)

        # Fail-closed: default to 500 so a downstream app that returns without
        # ever sending ``http.response.start`` is classified as ERROR rather
        # than silently emitting a SUCCESS/INFO event for an un-observed
        # response.
        status_code: int = HTTPStatus.INTERNAL_SERVER_ERROR

        async def send_wrapper(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception:
            # Reset to 500 so an app that sent a 2xx response-start and then
            # raised during body streaming still emits ERROR, not the 2xx.
            status_code = HTTPStatus.INTERNAL_SERVER_ERROR
            self._emit_completed(scope, path, status_code)
            raise
        finally:
            request_id_context_var.reset(token)

        self._emit_completed(scope, path, status_code)

    def _emit_completed(
        self,
        scope: Scope,
        path: str,
        status_code: int,
    ) -> None:
        """Emit a ``request_completed`` audit event.

        All context (user, source component, context IDs, query parameters)
        is resolved from the ASGI scope after routing has completed.

        Args:
            scope: ASGI connection scope with resolved routing context.
            path: Normalized request path.
            status_code: Response status code.

        """
        try:
            method = self._strip_control_chars(scope.get("method", "UNKNOWN"))
            user_context = self._extract_user_context(scope)
            context_ids = self._resolve_context_ids(scope)

            actor_id = UUID(user_context["user_id"]) if "user_id" in user_context else None
            actor_type = user_context.get("actor_type", ActorType.SYSTEM)

            # Build structured data — query params are sanitized by emit_audit_event
            query_params = self._parse_query_params(scope.get("query_string", b""))
            structured_data = RequestCompletedData(
                method=method,
                path=path,
                status_code=status_code,
                query_params=query_params if query_params else None,
                user_role=user_context.get("user_role"),
            )

            # Derive severity and status from the HTTP response status code so that
            # downstream consumers (alerting, SIEM) can filter on severity alone.
            if status_code >= HTTPStatus.INTERNAL_SERVER_ERROR:
                event_severity = EventSeverity.ERROR
            elif status_code >= HTTPStatus.BAD_REQUEST:
                event_severity = EventSeverity.WARNING
            else:
                event_severity = EventSeverity.INFO
            event_status = EventStatus.SUCCESS if status_code < HTTPStatus.BAD_REQUEST else EventStatus.ERROR

            emit_audit_event(
                AuditEvent(
                    event_category=EventCategory.USER_ACTION,
                    event_action="request_completed",
                    event_severity=event_severity,
                    event_status=event_status,
                    actor_id=actor_id,
                    actor_type=actor_type,
                    source_component=self._resolve_source_component(scope),
                    workflow_id=context_ids["workflow_id"],
                    activity_id=context_ids["activity_id"],
                    execution_id=context_ids["execution_id"],
                    event_message=f"Request completed: {method} {path} {status_code}",
                    structured_data=structured_data,
                ),
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "audit_middleware_failed",
                path=path,
                status_code=status_code,
                error_type=type(exc).__name__,
                exc_info=True,
            )
