"""Stale token detection middleware.

Checks whether the authenticated user's access token has an outdated
``token_ver`` claim by comparing it against the Redis token version
counter.  When stale, the response includes an ``X-Token-Stale: true``
header so the frontend can trigger a background token refresh.
"""

import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from nexus.auth.services.token_service import TokenService
from nexus.auth.session.session_store import SessionStore

logger = structlog.stdlib.get_logger(__name__)


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

            async with SessionStore() as store:
                current_ver = await store.get_token_version(user_id)

            if current_ver > token_ver:
                response.headers["X-Token-Stale"] = "true"

        except Exception:  # noqa: BLE001
            # Never block a request due to stale-check failures
            logger.debug("Stale token check failed, skipping", exc_info=True)

        return response
