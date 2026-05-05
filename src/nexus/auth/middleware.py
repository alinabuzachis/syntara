"""Stale token detection middleware.

Checks whether the authenticated user's access token has an outdated
``token_ver`` claim by comparing it against the ``token_version`` column
on the users table.  When stale, the response includes an
``X-Token-Stale: true`` header so the frontend can trigger a background
token refresh.

Uses an in-process TTLCache (5s) to avoid a DB query on every request.
"""

import structlog
from cachetools import TTLCache
from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from nexus.auth.services.token_service import TokenService
from nexus.core.database.session import AsyncSessionLocal

logger = structlog.stdlib.get_logger(__name__)

_token_version_cache: TTLCache[str, int] = TTLCache(maxsize=4096, ttl=5)

_GET_TOKEN_VERSION_SQL = "SELECT token_version FROM users WHERE id = :uid"  # noqa: S105


class StaleTokenMiddleware(BaseHTTPMiddleware):
    """Add ``X-Token-Stale: true`` header when the user's context has changed."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        """Check token_ver claim and set stale header if needed."""
        response = await call_next(request)

        auth_header = request.headers.get("authorization", "")
        if not auth_header.startswith("Bearer "):
            return response

        token = auth_header[7:]

        try:
            token_service = TokenService()
            payload = token_service.decode_token(token, token_type="access")  # noqa: S106
            user_id = payload.sub
            token_ver = payload.token_version or 0

            cached = _token_version_cache.get(user_id)
            if cached is not None:
                current_ver = cached
            else:
                async with AsyncSessionLocal() as session:
                    result = await session.execute(
                        text(_GET_TOKEN_VERSION_SQL),
                        {"uid": user_id},
                    )
                    row = result.one_or_none()
                    current_ver = row[0] if row else 0
                    _token_version_cache[user_id] = current_ver

            if current_ver > token_ver:
                response.headers["X-Token-Stale"] = "true"

        except Exception:  # noqa: BLE001
            logger.debug("Stale token check failed, skipping", exc_info=True)

        return response
