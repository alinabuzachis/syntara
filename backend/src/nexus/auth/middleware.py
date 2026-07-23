"""Stale token rejection and disabled-principal enforcement middleware.

Checks whether the authenticated principal's access token has an outdated
``token_ver`` claim by comparing it against the ``token_version`` column
on the users or service_accounts table.  When stale, returns a 401
``TOKEN_STALE`` response so the client re-authenticates.

Also rejects requests from disabled users and disabled/deleted service
accounts with a 401 response.

Uses in-process TTLCaches (5s) to avoid a DB query on every request.
"""

import structlog
from cachetools import TTLCache
from fastapi import status
from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from nexus.auth.services.token_service import TokenPayload, TokenService
from nexus.core.database.session import AsyncSessionLocal
from nexus.core.error_handlers import PROBLEM_TYPES, create_problem_details_response

logger = structlog.stdlib.get_logger(__name__)

_user_status_cache: TTLCache[str, tuple[int, bool]] = TTLCache(maxsize=4096, ttl=5)
_SA_NOT_FOUND: tuple[str, int] = ("__not_found__", -1)
_sa_status_cache: TTLCache[str, tuple[str, int]] = TTLCache(maxsize=4096, ttl=5)
_stale_audit_cache: TTLCache[str, bool] = TTLCache(maxsize=4096, ttl=60)

_GET_USER_STATUS_SQL = "SELECT token_version, is_enabled FROM users WHERE id = :uid"
_GET_SA_STATUS_SQL = "SELECT sa.status, sa.token_version FROM service_accounts sa WHERE sa.id = :sa_id"


async def _check_sa_status(sa_id: str) -> tuple[str, int] | None:
    """Look up service account status (cached 5s). Returns (status, token_version) or None if not found."""
    cached = _sa_status_cache.get(sa_id)
    if cached is not None:
        return None if cached is _SA_NOT_FOUND else cached

    async with AsyncSessionLocal() as session:
        result = await session.exec(  # type: ignore[call-overload]
            text(_GET_SA_STATUS_SQL),
            params={"sa_id": sa_id},
        )
        row = result.one_or_none()
        if row:
            status_val, token_ver = str(row[0]), int(row[1])
            _sa_status_cache[sa_id] = (status_val, token_ver)
            return status_val, token_ver
        _sa_status_cache[sa_id] = _SA_NOT_FOUND
        return None


class StaleTokenMiddleware(BaseHTTPMiddleware):
    """Enforce disabled/deleted principal rejection and stale-token detection."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        """Reject disabled/deleted principals, and stale tokens."""
        auth_header = request.headers.get("authorization", "")
        if not auth_header.startswith("Bearer "):
            return await call_next(request)

        token = auth_header[7:]

        try:
            token_service = TokenService()
            payload = token_service.decode_token(token, token_type="access")  # noqa: S106
        except Exception:  # noqa: BLE001
            logger.debug("Token decode failed, skipping middleware checks", exc_info=True)
            return await call_next(request)

        is_sa_token = payload.token_type == "service_account"  # noqa: S105

        if is_sa_token:
            return await self._handle_sa_token(request, call_next, payload)
        return await self._handle_user_token(request, call_next, payload)

    async def _handle_sa_token(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
        payload: TokenPayload,
    ) -> Response:
        """Reject requests from disabled/deleted or token-revoked service accounts."""
        sa_id = payload.sub
        try:
            sa_result = await _check_sa_status(sa_id)
        except Exception:  # noqa: BLE001
            logger.debug("SA status check failed, skipping", exc_info=True)
            return await call_next(request)

        if sa_result is None:
            from nexus.audit.dispatcher import AuditEventDispatcher  # noqa: PLC0415
            from nexus.auth.audit.sa_rejection import DisabledSARejectionEvent  # noqa: PLC0415

            AuditEventDispatcher.dispatch(
                DisabledSARejectionEvent(
                    service_account_id=sa_id,
                    sa_status="deleted",
                    is_alive=False,
                )
            )
            logger.warning("Rejected request from deleted service account", service_account_id=sa_id)
            response = create_problem_details_response(
                status_code=status.HTTP_401_UNAUTHORIZED,
                problem_type=PROBLEM_TYPES["unauthorized"],
                title="Unauthorized",
                detail="Service account no longer exists",
                code="SA_DELETED",
                retryable=False,
                instance=str(request.url),
            )
            response.headers["X-Auth-Failure-Type"] = "deleted_sa"
            return response

        status_val, current_ver = sa_result
        token_ver = payload.token_version or 0

        if status_val != "active":
            from nexus.audit.dispatcher import AuditEventDispatcher  # noqa: PLC0415
            from nexus.auth.audit.sa_rejection import DisabledSARejectionEvent  # noqa: PLC0415

            AuditEventDispatcher.dispatch(
                DisabledSARejectionEvent(
                    service_account_id=sa_id,
                    sa_status=status_val,
                    is_alive=True,
                )
            )
            logger.warning(
                "Rejected request from disabled service account",
                service_account_id=sa_id,
                sa_status=status_val,
            )
            response = create_problem_details_response(
                status_code=status.HTTP_401_UNAUTHORIZED,
                problem_type=PROBLEM_TYPES["unauthorized"],
                title="Unauthorized",
                detail="Service account is disabled",
                code="SA_DISABLED",
                retryable=False,
                instance=str(request.url),
            )
            response.headers["X-Auth-Failure-Type"] = "disabled_sa"
            return response

        if current_ver > token_ver:
            if sa_id not in _stale_audit_cache:
                from nexus.audit.dispatcher import AuditEventDispatcher  # noqa: PLC0415
                from nexus.auth.audit.sa_rejection import StaleSATokenDetectionEvent  # noqa: PLC0415

                AuditEventDispatcher.dispatch(
                    StaleSATokenDetectionEvent(
                        service_account_id=sa_id,
                        token_version=token_ver,
                        current_version=current_ver,
                    )
                )
                _stale_audit_cache[sa_id] = True

            logger.warning(
                "Rejected request with stale service account token",
                service_account_id=sa_id,
                token_version=token_ver,
                current_version=current_ver,
            )
            response = create_problem_details_response(
                status_code=status.HTTP_401_UNAUTHORIZED,
                problem_type=PROBLEM_TYPES["unauthorized"],
                title="Unauthorized",
                detail="Service account token has been revoked",
                code="SA_TOKEN_REVOKED",
                retryable=False,
                instance=str(request.url),
            )
            response.headers["X-Auth-Failure-Type"] = "revoked_sa_token"
            return response

        return await call_next(request)

    async def _handle_user_token(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
        payload: TokenPayload,
    ) -> Response:
        """Reject disabled users and stale user tokens."""
        user_id = payload.sub
        token_ver = payload.token_version or 0
        current_ver: int = 0
        is_enabled: bool = True
        status_resolved: bool = False

        try:
            cached = _user_status_cache.get(user_id)
            if cached is not None:
                current_ver, is_enabled = cached
            else:
                async with AsyncSessionLocal() as session:
                    result = await session.exec(  # type: ignore[call-overload]
                        text(_GET_USER_STATUS_SQL),
                        params={"uid": user_id},
                    )
                    row = result.one_or_none()
                    if row:
                        current_ver, is_enabled = row[0], row[1]
                    else:
                        current_ver, is_enabled = 0, True
                    _user_status_cache[user_id] = (current_ver, is_enabled)

            status_resolved = True

        except Exception:  # noqa: BLE001
            logger.debug("User status check failed, skipping", exc_info=True)

        normalized_path = request.url.path.rstrip("/")
        is_logout = normalized_path == "/api/v1/auth/logout"
        is_auth_lifecycle = is_logout or normalized_path == "/api/v1/auth/refresh"
        if status_resolved and not is_enabled and not is_logout:
            from nexus.audit.dispatcher import AuditEventDispatcher  # noqa: PLC0415
            from nexus.auth.audit.disabled_user_rejection import (  # noqa: PLC0415
                DisabledUserRejectionEvent,
                RejectionContext,
            )

            AuditEventDispatcher.dispatch(
                DisabledUserRejectionEvent(
                    user_id=user_id, context=RejectionContext.MIDDLEWARE, user_name=payload.preferred_username
                )
            )
            logger.warning("Rejected request from disabled user", user_id=user_id)
            response = create_problem_details_response(
                status_code=status.HTTP_401_UNAUTHORIZED,
                problem_type=PROBLEM_TYPES["unauthorized"],
                title="Unauthorized",
                detail="User account is disabled",
                code="ACCOUNT_DISABLED",
                retryable=False,
                instance=str(request.url),
            )
            response.headers["X-Auth-Failure-Type"] = "disabled_user"
            return response

        if status_resolved and current_ver > token_ver and not is_auth_lifecycle:
            if user_id not in _stale_audit_cache:
                from nexus.audit.dispatcher import AuditEventDispatcher  # noqa: PLC0415
                from nexus.auth.audit.stale_token_detection import StaleTokenDetectionEvent  # noqa: PLC0415

                AuditEventDispatcher.dispatch(
                    StaleTokenDetectionEvent(
                        user_id=user_id,
                        token_version=token_ver,
                        current_version=current_ver,
                        user_name=payload.preferred_username,
                    )
                )
                _stale_audit_cache[user_id] = True

            logger.warning("Rejected request with stale token", user_id=user_id)
            response = create_problem_details_response(
                status_code=status.HTTP_401_UNAUTHORIZED,
                problem_type=PROBLEM_TYPES["unauthorized"],
                title="Unauthorized",
                detail="Token is outdated, please refresh",
                code="TOKEN_STALE",
                retryable=True,
                instance=str(request.url),
            )
            response.headers["X-Auth-Failure-Type"] = "stale_token"
            return response

        return await call_next(request)
