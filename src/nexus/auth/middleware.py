"""Stale token detection and disabled-user enforcement middleware.

Checks whether the authenticated user's access token has an outdated
``token_ver`` claim by comparing it against the ``token_version`` column
on the users table.  When stale, the response includes an
``X-Token-Stale: true`` header so the frontend can trigger a background
token refresh.

Also rejects requests from disabled users with a 401 response.  The
``is_enabled`` flag is fetched in the same query as ``token_version``
(zero additional DB round-trips).

Uses an in-process TTLCache (5s) to avoid a DB query on every request.
"""

import structlog
from cachetools import TTLCache
from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from nexus.auth.services.token_service import TokenService
from nexus.core.database.session import AsyncSessionLocal

logger = structlog.stdlib.get_logger(__name__)

_user_status_cache: TTLCache[str, tuple[int, bool]] = TTLCache(maxsize=4096, ttl=5)
_stale_audit_cache: TTLCache[str, bool] = TTLCache(maxsize=4096, ttl=60)

_GET_USER_STATUS_SQL = "SELECT token_version, is_enabled FROM users WHERE id = :uid"

_DISABLED_USER_RESPONSE = {
    "type": "https://api.nexus.com/errors/unauthorized",
    "title": "Unauthorized",
    "detail": "User account is disabled",
    "code": "ACCOUNT_DISABLED",
    "retryable": False,
}


class StaleTokenMiddleware(BaseHTTPMiddleware):
    """Enforce disabled-user rejection and stale-token detection."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        """Reject disabled users and set stale header when token is outdated."""
        auth_header = request.headers.get("authorization", "")
        if not auth_header.startswith("Bearer "):
            return await call_next(request)

        token = auth_header[7:]

        token_ver: int = 0
        current_ver: int = 0
        is_enabled: bool = True
        status_resolved: bool = False

        try:
            token_service = TokenService()
            payload = token_service.decode_token(token, token_type="access")  # noqa: S106
            user_id = payload.sub
            token_ver = payload.token_version or 0

            cached = _user_status_cache.get(user_id)
            if cached is not None:
                current_ver, is_enabled = cached
            else:
                async with AsyncSessionLocal() as session:
                    result = await session.execute(
                        text(_GET_USER_STATUS_SQL),
                        {"uid": user_id},
                    )
                    row = result.one_or_none()
                    if row:
                        current_ver, is_enabled = row[0], row[1]
                    else:
                        current_ver, is_enabled = 0, True
                    _user_status_cache[user_id] = (current_ver, is_enabled)

            status_resolved = True

        except Exception:  # noqa: BLE001
            logger.debug("Token/status check failed, skipping", exc_info=True)

        is_logout = request.url.path.rstrip("/").endswith("/auth/logout")
        if status_resolved and not is_enabled and not is_logout:
            from nexus.audit.dispatcher import AuditEventDispatcher  # noqa: PLC0415
            from nexus.auth.audit.disabled_user_rejection import (  # noqa: PLC0415
                DisabledUserRejectionEvent,
                RejectionContext,
            )

            AuditEventDispatcher.dispatch(
                DisabledUserRejectionEvent(user_id=user_id, context=RejectionContext.MIDDLEWARE)
            )
            logger.warning("Rejected request from disabled user", user_id=user_id)
            return JSONResponse(
                status_code=401,
                content=_DISABLED_USER_RESPONSE,
                media_type="application/problem+json",
            )

        response = await call_next(request)

        if status_resolved and current_ver > token_ver:
            response.headers["X-Token-Stale"] = "true"

            if user_id not in _stale_audit_cache:
                from nexus.audit.dispatcher import AuditEventDispatcher  # noqa: PLC0415
                from nexus.auth.audit.stale_token_detection import StaleTokenDetectionEvent  # noqa: PLC0415

                AuditEventDispatcher.dispatch(
                    StaleTokenDetectionEvent(
                        user_id=user_id,
                        token_version=token_ver,
                        current_version=current_ver,
                    )
                )
                _stale_audit_cache[user_id] = True

        return response
