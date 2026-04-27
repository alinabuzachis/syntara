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
import time
from http import HTTPStatus
from posixpath import normpath
from typing import TYPE_CHECKING, Any
from urllib.parse import parse_qs, unquote
from uuid import UUID

import structlog

from nexus.api.constants import EXCLUDED_PATH_PREFIXES, EXCLUDED_PATHS
from nexus.audit.dispatcher import AuditEventDispatcher
from nexus.audit.emitter import (
    execution_id_context_var,
    request_id_context_var,
    workflow_id_context_var,
)
from nexus.audit.events.http_request import HTTPRequestEvent
from nexus.audit.models.audit_event import ActorType

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
        Extracts id, username, role, and actor type for logging purposes.

        Args:
            scope: ASGI connection scope.

        Returns:
            Dictionary with actor_type=USER and optionally user_id, actor_name,
            and user_role if the user is authenticated.

        """
        user = scope.get("user")

        user_context: dict[str, Any] = {"actor_type": ActorType.USER}

        if user is None:
            return user_context

        # Extract user ID (convert UUID to string for logging)
        if hasattr(user, "id") and user.id is not None:
            user_context["user_id"] = str(user.id)

        # Extract username
        if hasattr(user, "username") and user.username is not None:
            user_context["actor_username"] = str(user.username)

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

        if path in EXCLUDED_PATHS or path.startswith(EXCLUDED_PATH_PREFIXES):
            await self.app(scope, receive, send)
            return

        # Extract X-Request-Id and content-length from incoming headers.
        # Only valid UUID values are accepted; malformed values are silently ignored.
        request_id: UUID | None = None
        request_payload_size: int = 0
        for header_name, header_value in scope.get("headers", []):
            lower_name = header_name.lower()
            if lower_name == _REQUEST_ID_HEADER:
                with contextlib.suppress(ValueError, UnicodeDecodeError):
                    request_id = UUID(header_value.decode("latin-1"))
            elif lower_name == b"content-length":
                with contextlib.suppress(ValueError, TypeError):
                    request_payload_size = int(header_value)
        token = request_id_context_var.set(request_id)

        # Fail-closed: default to 500 so a downstream app that returns without
        # ever sending ``http.response.start`` is classified as ERROR rather
        # than silently emitting a SUCCESS/INFO event for an un-observed
        # response.
        status_code: int = HTTPStatus.INTERNAL_SERVER_ERROR
        start_time = time.monotonic()

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
            raise
        finally:
            response_time_ms = int((time.monotonic() - start_time) * 1000)
            # Emit audit event for request completion (success or error)
            self._emit_completed(scope, path, status_code, response_time_ms, request_payload_size)
            request_id_context_var.reset(token)

    def _emit_completed(
        self,
        scope: Scope,
        path: str,
        status_code: int,
        response_time_ms: int,
        request_payload_size: int,
    ) -> None:
        """Emit a ``request_completed`` audit event via dispatcher.

        All context (user, source component, context IDs, query parameters)
        is resolved from the ASGI scope after routing has completed.

        Args:
            scope: ASGI connection scope with resolved routing context.
            path: Normalized request path.
            status_code: Response status code.
            response_time_ms: Response time in milliseconds.
            request_payload_size: Request body size in bytes from Content-Length.

        """
        try:
            method = self._strip_control_chars(scope.get("method", "UNKNOWN"))
            user_context = self._extract_user_context(scope)
            context_ids = self._resolve_context_ids(scope)

            actor_id = UUID(user_context["user_id"]) if "user_id" in user_context else None
            actor_type = user_context.get("actor_type", ActorType.SYSTEM)
            actor_username = user_context.get("actor_username")

            # Build and dispatch the domain event
            query_params = self._parse_query_params(scope.get("query_string", b""))

            # Extract context IDs with proper types
            workflow_id_value = context_ids["workflow_id"]
            execution_id_value = context_ids["execution_id"]
            activity_id_value = context_ids["activity_id"]

            event = HTTPRequestEvent(
                method=method,
                path=path,
                status_code=status_code,
                actor_id=actor_id,
                actor_type=actor_type,
                actor_username=actor_username,
                source_component=self._resolve_source_component(scope),
                query_params=query_params or None,
                user_role=user_context.get("user_role"),
                workflow_id=workflow_id_value if isinstance(workflow_id_value, UUID) else None,
                execution_id=execution_id_value if isinstance(execution_id_value, UUID) else None,
                activity_id=activity_id_value if isinstance(activity_id_value, str) else None,
                response_time_ms=response_time_ms,
                request_payload_size=request_payload_size,
            )

            AuditEventDispatcher.dispatch(event)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "audit_middleware_failed",
                path=path,
                status_code=status_code,
                error_type=type(exc).__name__,
                exc_info=True,
            )
