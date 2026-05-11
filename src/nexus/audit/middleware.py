"""ASGI audit middleware.

Logs every HTTP response for observability and debugging.  Provides
structured logging with method, path, query parameters, user information
(if authenticated), response status code, and context IDs (workflow,
execution, activity) when available.

Also extracts the ``X-Request-Id`` header (UUID) from incoming requests
and propagates it via :data:`~nexus.audit.emitter.audit_context_var`
so downstream middleware, handlers, and telemetry can access it.
"""

from __future__ import annotations

import contextlib
import time
from http import HTTPStatus
from posixpath import normpath
from typing import TYPE_CHECKING, NamedTuple
from urllib.parse import parse_qs, unquote
from uuid import UUID

import jwt
import structlog
from starlette.routing import Match

from nexus.api.constants import EXCLUDED_PATH_PREFIXES, EXCLUDED_PATHS
from nexus.audit.dispatcher import AuditEventDispatcher
from nexus.audit.emitter import (
    AuditActorContext,
    activity_id_context_var,
    actor_context_var,
    execution_id_context_var,
    request_id_context_var,
    workflow_id_context_var,
)
from nexus.audit.events.http_request import HTTPRequestEvent
from nexus.audit.utils import escalate_actor_type_from_jwt
from nexus.core.auth.jwt_utils import extract_actor_claims

logger = structlog.stdlib.get_logger(__name__)

if TYPE_CHECKING:
    from fastapi import FastAPI
    from starlette.types import ASGIApp, Message, Receive, Scope, Send


class ContextIds(NamedTuple):
    """Resolved context identifiers from a request.

    Attributes:
        workflow_id: The workflow UUID if present in the request path.
        execution_id: The execution UUID if present in the request path.
        activity_id: The activity ID string if present in the request path.

    """

    workflow_id: UUID | None
    execution_id: UUID | None
    activity_id: str | None


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

    def __init__(self, app: ASGIApp, fastapi_app: FastAPI) -> None:
        """Initialize the audit middleware.

        Args:
            app: The next ASGI application in the chain.
            fastapi_app: The FastAPI application instance (for route matching).

        """
        self.app = app

        # Pre-filter routes to only those containing context ID path params
        # This optimizes _resolve_context_ids from O(n) to O(m) where m << n
        self._context_routes = [
            route
            for route in fastapi_app.router.routes
            if hasattr(route, "path")
            and any(param in route.path for param in ["{workflow_id}", "{execution_id}", "{activity_id}"])
        ]

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

    def _extract_user(self, scope: Scope) -> AuditActorContext:
        """Extract actor information from JWT token without signature verification.

        Performs unverified JWT decode to extract actor_id (sub) and actor_username
        (preferred_username) claims for audit logging. This avoids the crypto overhead
        of signature verification since:
        1. The middleware doesn't gate access (the endpoint does)
        2. If the token is forged, the endpoint will reject it with 401
        3. The audit log still captures the failed attempt

        This eliminates double-authentication overhead (middleware + endpoint) and
        removes coupling to TokenService/User/get_current_user.

        Args:
            scope: ASGI connection scope.

        Returns:
            AuditActorContext with actor_id and actor_username from JWT claims,
            or empty context if token is missing or malformed.

        """
        # Extract Authorization header from ASGI scope
        authorization_header: str | None = None
        for header_name, header_value in scope.get("headers", []):
            if header_name.lower() == b"authorization":
                try:
                    authorization_header = header_value.decode("latin-1")
                except UnicodeDecodeError:
                    # Malformed header, return empty context
                    return AuditActorContext()
                break

        if not authorization_header:
            return AuditActorContext()

        # Extract bearer token from "Bearer <token>" format
        parts = authorization_header.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":  # noqa: PLR2004
            return AuditActorContext()

        token = parts[1]

        # Decode JWT without signature verification
        try:
            claims = jwt.decode(
                token,
                options={"verify_signature": False},
                # Algorithm doesn't matter since we're not verifying
                # This is however the same as auth.services.token_service.JWT_ALGORITHM
                algorithms=["ES256"],
            )

            # Extract actor claims using shared utility to ensure consistency
            # with auth.dependencies._user_from_payload
            actor_claims = extract_actor_claims(claims)

            if actor_claims.actor_id or actor_claims.actor_username:
                # Determine actor type based on authentication method reference
                # Service tokens (amr=["service"]) are SYSTEM, all others are USER
                actor_type = escalate_actor_type_from_jwt(actor_claims)
                return AuditActorContext(
                    actor_id=actor_claims.actor_id,
                    actor_username=actor_claims.actor_username,
                    actor_type=actor_type,
                )

        except (jwt.DecodeError, ValueError, KeyError):
            # Malformed JWT or invalid UUID - return empty context
            # The endpoint's authentication will handle the actual error
            pass

        return AuditActorContext()

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

    def _resolve_context_ids(self, scope: Scope) -> ContextIds:
        """Resolve workflow_id, execution_id, and activity_id from the request.

        Matches the request against registered routes to extract path parameters
        before routing occurs. Falls back to context variables that handlers may
        have set during request processing.

        Args:
            scope: ASGI connection scope.

        Returns:
            ContextIds containing ``workflow_id``, ``execution_id``, and ``activity_id``.

        """
        # Try to match the route to extract path_params before routing occurs
        # Only check routes that have context ID params (pre-filtered in __init__)
        path_params = {}
        for route in self._context_routes:
            match, child_scope = route.matches(scope)
            if match == Match.FULL:
                path_params = child_scope.get("path_params", {})
                break

        # If no route matched, fall back to already-populated path_params (if routing has occurred)
        if not path_params:
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

        return ContextIds(
            workflow_id=workflow_id,
            execution_id=execution_id,
            activity_id=activity_id,
        )

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
                    size = int(header_value)
                    if size >= 0:
                        request_payload_size = size
        request_id_token = request_id_context_var.set(request_id)

        # Extract actor information from JWT (unverified decode for audit logging only)
        _actor_context = self._extract_user(scope)
        actor_token = actor_context_var.set(_actor_context)

        # Resolve context IDs from the path (before routing) and set context variables
        # This makes workflow_id, execution_id, and activity_id available to route handlers
        context_ids = self._resolve_context_ids(scope)
        workflow_token = workflow_id_context_var.set(context_ids.workflow_id)
        activity_token = activity_id_context_var.set(context_ids.activity_id)
        execution_token = execution_id_context_var.set(context_ids.execution_id)

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

            # Reset context variables
            actor_context_var.reset(actor_token)
            workflow_id_context_var.reset(workflow_token)
            activity_id_context_var.reset(activity_token)
            execution_id_context_var.reset(execution_token)
            request_id_context_var.reset(request_id_token)

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

            # Extract user information for logging
            _actor_context = actor_context_var.get()

            # Extract context information for logging
            workflow_id = workflow_id_context_var.get()
            activity_id = activity_id_context_var.get()
            execution_id = execution_id_context_var.get()

            # Build and dispatch the domain event
            query_params = self._parse_query_params(scope.get("query_string", b""))

            event = HTTPRequestEvent(
                method=method,
                path=path,
                status_code=status_code,
                actor_context=_actor_context if _actor_context else AuditActorContext(),
                source_component=self._resolve_source_component(scope),
                query_params=query_params or None,
                workflow_id=workflow_id,
                execution_id=execution_id,
                activity_id=activity_id,
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
