"""Authentication API endpoints.

This module provides endpoints for JWT token management, including:
- Login (username/password authentication)
- Token refresh (refresh token read from HttpOnly cookie)
- Logout (session revocation, clears refresh cookie)
- Current user information
- Auth providers listing (public, for login page)
- OIDC authorization code flow (authorize + callback)
"""

import base64
import json
import secrets
from datetime import UTC, datetime
from typing import Annotated, Any, Literal
from urllib.parse import quote, urlencode, urlparse
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import RedirectResponse
from redis.exceptions import ConnectionError as RedisConnectionError
from sqlalchemy.exc import IntegrityError
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.audit.decorators import audit
from nexus.audit.dispatcher import AuditEventDispatcher
from nexus.audit.models.audit_event import EventCategory
from nexus.auth.audit.login_attempt import LoginAttemptEvent, LoginErrorReason, LoginMethod
from nexus.auth.audit.oidc_flow import OIDCFlowEvent, OIDCStage
from nexus.auth.audit.session_lifecycle import SessionAction, SessionLifecycleEvent
from nexus.auth.audit.user_login import AMR, UserLoginEvent
from nexus.auth.cookies import (
    clear_refresh_cookie,
    get_refresh_token_from_cookie,
    set_refresh_cookie,
)
from nexus.auth.dependencies import _get_token_service, get_refresh_token, get_token_payload
from nexus.auth.exceptions import (
    AuthenticationRequiredError,
    InvalidTokenError,
    RefreshTokenRevokedError,
    SessionStoreUnavailableError,
)
from nexus.auth.passwords import verify_password
from nexus.auth.schemas import (
    AccessTokenResponse,
    AuthProviderInfo,
    AuthProvidersResponse,
    LoginRequest,
    UserInfo,
)
from nexus.auth.services.idp_group_sync import sync_idp_groups
from nexus.auth.services.oidc_service import OIDCError, OIDCService
from nexus.auth.services.token_service import TokenPayload
from nexus.auth.session.session_store import SessionInfo, SessionStore
from nexus.authz.dependencies import get_opa_client
from nexus.authz.engine import AuthzRequest, authorize
from nexus.authz.resolver import AUTHENTICATED_GROUP_NAME
from nexus.core.config.base import get_settings
from nexus.core.database.session import get_db
from nexus.core.lib.encryption import SecretEncryptor, key_from_string
from nexus.core.models import Group, User, UserIdentity
from nexus.core.models.group import user_groups
from nexus.core.services.secret_service import create_secret_service
from nexus.identity_providers.models.identity_provider import IdentityProvider
from nexus.identity_providers.models.identity_provider_configuration import (
    IdentityProviderConfigurationTypes,
    OIDCConfiguration,
)
from nexus.users.services.user_identity_service import UserIdentityService

logger = structlog.stdlib.get_logger(__name__)


async def _get_user_group_names(db: AsyncSession, user_id: UUID) -> list[str]:
    """Fetch group names for a user to include in JWT claims.

    Includes both explicit memberships (from the ``user_groups`` table) and
    the implicit ``authenticated`` group that all authenticated users belong to.
    """
    result = await db.exec(
        select(Group.name)
        .join(user_groups, Group.id == user_groups.c.group_id)  # type: ignore[arg-type]
        .where(
            user_groups.c.user_id == user_id,
            Group.deleted_at.is_(None),  # type: ignore[union-attr]
        )
        .order_by(col(Group.name))
    )
    names = list(result.all())

    # Add the implicit "authenticated" group if not already present
    if AUTHENTICATED_GROUP_NAME not in names:
        names.append(AUTHENTICATED_GROUP_NAME)
        names.sort()

    return names


router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/login",
    operation_id="login",
    summary="Login with username and password",
    description="""
    Authenticate with a username and password to receive a JWT access token.

    On success the response body contains an access token and the
    ``ao_refresh_token`` HttpOnly cookie is set.
    """,
    response_description="Successful authentication",
    responses={
        401: {"description": "Invalid username or password"},
    },
)
@audit(EventCategory.SECURITY_EVENT)
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AccessTokenResponse:
    """Login with username and password.

    Args:
        body: Login credentials (username and password)
        request: FastAPI request object (for client metadata)
        response: FastAPI response object (refresh cookie set here)
        db: Database session

    Returns:
        Access token response (refresh token travels via Set-Cookie header)

    Raises:
        AuthenticationRequiredError: If credentials are invalid

    """
    settings = get_settings()

    username = body.username.lower()
    client_host = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")

    # Look up user by username (case-insensitive)
    result = await db.exec(
        select(User).filter(
            User.username == username,  # type: ignore[arg-type]
            User.deleted_at.is_(None),  # type: ignore[union-attr]
        )
    )
    user = result.one_or_none()

    if not user or not user.password_hash:
        AuditEventDispatcher.dispatch(
            LoginAttemptEvent(username=username, method=LoginMethod.PASSWORD, error_type=LoginErrorReason.UNKNOWN_USER)
        )
        raise AuthenticationRequiredError

    if not verify_password(body.password, user.password_hash):
        AuditEventDispatcher.dispatch(
            LoginAttemptEvent(
                username=username,
                method=LoginMethod.PASSWORD,
                error_type=LoginErrorReason.BAD_PASSWORD,
                user_id=user.id,
            )
        )
        raise AuthenticationRequiredError

    if not user.is_enabled:
        AuditEventDispatcher.dispatch(
            LoginAttemptEvent(
                username=username,
                method=LoginMethod.PASSWORD,
                error_type=LoginErrorReason.INACTIVE_ACCOUNT,
                user_id=user.id,
            )
        )
        raise AuthenticationRequiredError

    # Resolve group names for JWT claims (before modifying session state)
    user_group_names = await _get_user_group_names(db, user.id)

    # Fetch current groups version from Redis
    async with SessionStore() as store:
        token_version = await store.get_token_version(user.id)

    # Update last_login (commit deferred until after Redis session is created
    # to avoid updating last_login when the session store is unreachable).
    is_first_login = user.last_login is None
    user.update_last_login()
    db.add(user)

    # Create access token
    token_service = _get_token_service()
    access_token = token_service.create_access_token(
        user_id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        amr=[AMR.PASSWORD],
        idp="local",
        groups=user_group_names,
        token_version=token_version,
    )

    # Create refresh token and store session
    refresh_token_str, jti, _exp = token_service.create_refresh_token(user.id)

    try:
        async with SessionStore() as store:
            await store.create(
                jti=jti,
                user_id=user.id,
                # Stored for future session management UI (e.g., "list active sessions")
                device=user_agent,
                ip_address=client_host,
                amr=[AMR.PASSWORD],
                idp="local",
            )
    except (OSError, RedisConnectionError, RuntimeError) as exc:
        AuditEventDispatcher.dispatch(
            SessionLifecycleEvent(
                action=SessionAction.CREATE,
                user_id=user.id,
                username=user.username,
                jti=jti,
                idp="local",
                error_type=type(exc).__name__,
            )
        )
        # Redis connection or session store errors — roll back last_login
        # so user state stays consistent (they didn't get a session).
        logger.exception("Redis connection failed during login", error=str(exc))
        await db.rollback()
        raise SessionStoreUnavailableError from exc
    AuditEventDispatcher.dispatch(
        SessionLifecycleEvent(
            action=SessionAction.CREATE, user_id=user.id, username=user.username, jti=jti, idp="local"
        )
    )

    # Commit last_login only after Redis session is successfully created
    await db.commit()
    AuditEventDispatcher.dispatch(
        UserLoginEvent(user_id=user.id, amr=[AMR.PASSWORD], idp="local", is_first_login=is_first_login)
    )
    logger.info("User logged in", user_id=str(user.id), username=user.username, amr=[AMR.PASSWORD], idp="local")

    # Set refresh cookie
    cookie_max_age = settings.jwt_refresh_token_lifetime_hours * 3600
    set_refresh_cookie(response, refresh_token_str, max_age=cookie_max_age)

    AuditEventDispatcher.dispatch(LoginAttemptEvent(username=username, method=LoginMethod.PASSWORD, user_id=user.id))
    return AccessTokenResponse(
        access_token=access_token,
        expires_in=settings.jwt_access_token_lifetime_minutes * 60,
    )


@router.post(
    "/refresh",
    operation_id="refresh_token",
    summary="Refresh access token",
    description="""
    Exchange a valid refresh token for a new access token.

    The refresh token is read from the ``ao_refresh_token`` HttpOnly cookie.
    It is not rotated — the same refresh token remains valid for its entire
    lifetime (default 8 hours from login).  The cookie is re-set on every
    successful refresh so the ``max-age`` counter restarts.
    """,
    response_description="New access token issued",
    responses={
        401: {"description": "Invalid or expired refresh token"},
    },
)
@audit(EventCategory.USER_ACTION)
async def refresh_token(
    raw_refresh_token: Annotated[str, Depends(get_refresh_token)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AccessTokenResponse:
    """Refresh access token using the refresh token cookie.

    The refresh token is validated but **not rotated** — this is an
    intentional architectural decision.  The fixed expiration on the
    refresh token acts as a hard session boundary, forcing users to
    re-authenticate with their IdP when the token expires.  This
    ensures group memberships are refreshed from the identity provider
    on a predictable cadence.

    If refresh-token rotation is added in the future, the *original*
    token's expiration timestamp must be preserved on every rotated
    successor so that the hard session expiration remains enforced.

    Args:
        raw_refresh_token: The refresh token extracted from the cookie
        db: Database session

    Returns:
        Access token response

    Raises:
        AuthenticationRequiredError: If refresh token is missing or invalid
        TokenExpiredError: If refresh token has expired
        RefreshTokenRevokedError: If refresh token has been revoked

    """
    settings = get_settings()
    token_service = _get_token_service()

    # Decode and validate refresh token
    try:
        payload: TokenPayload = token_service.decode_token(
            raw_refresh_token,
            token_type="refresh",  # noqa: S106
        )
    except InvalidTokenError:
        raise
    except Exception as e:
        logger.warning("Failed to decode refresh token", error=str(e))
        raise AuthenticationRequiredError from e

    # Check refresh token in Redis
    try:
        async with SessionStore() as store:
            session = await store.get(payload.jti) if payload.jti else None

            if session is None:
                logger.warning("Refresh token not found in session store", jti=payload.jti)
                raise RefreshTokenRevokedError

            # Acceptable race window: the refresh token could be revoked (e.g. via
            # logout or session revocation) between the session check above and the
            # access token creation below.  This is acceptable because the resulting
            # access token has a short lifetime (default 15 minutes) and is stateless,
            # so it cannot be individually revoked anyway.

            # Load user from database to get current info
            result = await db.exec(select(User).filter(User.id == payload.sub))  # type: ignore[arg-type]
            user = result.one_or_none()

            if not user:
                logger.warning("User not found for refresh token", user_id=payload.sub)
                raise AuthenticationRequiredError

            if not user.is_enabled:
                logger.warning("Inactive user attempted token refresh", user_id=payload.sub)
                raise AuthenticationRequiredError

            # Create new access token with fresh claims from the database.
            # Always use the DB username — the refresh token payload may contain
            # a stale preferred_username if the user renamed their account.
            username = user.username

            # Preserve amr/idp from the session metadata (set during login)
            amr = session.amr or payload.amr or ["pwd"]
            idp = session.idp or payload.idp or "local"

            # Refresh group memberships from DB on token refresh
            user_group_names = await _get_user_group_names(db, user.id)

            # Fetch current groups version from Redis
            token_version = await store.get_token_version(user.id)

            access_token = token_service.create_access_token(
                user_id=user.id,
                username=username,
                email=user.email,
                full_name=user.full_name,
                amr=amr,
                idp=idp,
                groups=user_group_names,
                token_version=token_version,
            )

            AuditEventDispatcher.dispatch(
                SessionLifecycleEvent(
                    action=SessionAction.REFRESH,
                    user_id=user.id,
                    username=user.username,
                    jti=payload.jti,
                    idp=idp,
                )
            )

            logger.info(
                "Token refreshed successfully",
                user_id=str(user.id),
                jti=payload.jti,
            )

            return AccessTokenResponse(
                access_token=access_token,
                expires_in=settings.jwt_access_token_lifetime_minutes * 60,
            )
    except (OSError, RedisConnectionError) as exc:
        logger.exception("Redis connection failed during refresh", error=str(exc))
        raise SessionStoreUnavailableError from exc


def _build_rp_logout_url(
    end_session_endpoint: str,
    id_token_hint: str | None,
    post_logout_redirect_uri: str,
) -> str:
    """Build OIDC RP-initiated logout URL per OpenID Connect RP-Initiated Logout 1.0.

    Args:
        end_session_endpoint: IdP's end_session_endpoint from discovery
        id_token_hint: The ID token to pass as hint (recommended by spec)
        post_logout_redirect_uri: URI to redirect to after IdP logout

    Returns:
        Full logout URL with encoded query parameters

    """
    params = {}

    if id_token_hint:
        params["id_token_hint"] = id_token_hint

    if post_logout_redirect_uri:
        params["post_logout_redirect_uri"] = post_logout_redirect_uri

    if params:
        return f"{end_session_endpoint}?{urlencode(params)}"
    return end_session_endpoint


async def _resolve_end_session_endpoint(config: OIDCConfiguration) -> str | None:
    """Resolve the end_session_endpoint, falling back to OIDC discovery.

    Prefers the statically configured value. If absent and auto_discovery
    is enabled, fetches the OIDC discovery document to find it.
    """
    if config.end_session_endpoint:
        return config.end_session_endpoint

    if not config.auto_discovery:
        return None

    try:
        async with OIDCService() as oidc_service:
            discovery = await oidc_service.fetch_discovery_config(config.issuer_url)
            return discovery.get("end_session_endpoint")
    except OIDCError:
        logger.warning("Failed to discover end_session_endpoint for RP logout")
        return None


async def _maybe_rp_logout(
    db: AsyncSession,
    session_info: SessionInfo | None,
    post_logout_redirect_uri: str,
) -> dict[str, str] | None:
    """Build RP-initiated logout info if applicable, else return None.

    Returns a dict with ``redirect_url`` (happy path) or ``auth_error``
    (failsafe when the IdP's end-session endpoint can't be resolved).
    The caller always includes ``detail`` before returning to the client.

    Args:
        db: Database session
        session_info: Session metadata from Redis (None for local sessions)
        post_logout_redirect_uri: Where to redirect after IdP logout
            (caller-provided post_logout_redirect_uri validated against
            CORS origins, or the global setting as fallback)

    """
    if not session_info or not session_info.idp_id:
        return None

    result = await db.exec(
        select(IdentityProvider).filter(
            IdentityProvider.id == UUID(session_info.idp_id),  # type: ignore[arg-type]
            IdentityProvider.deleted_at.is_(None),  # type: ignore[union-attr]
        )
    )
    provider = result.one_or_none()

    if (
        not provider
        or not isinstance(provider.configuration, OIDCConfiguration)
        or not provider.configuration.enable_rp_initiated_logout
    ):
        return None

    end_session_endpoint = await _resolve_end_session_endpoint(provider.configuration)
    if not end_session_endpoint:
        logger.warning(
            "RP-initiated logout enabled but end_session_endpoint could not be resolved",
            provider=provider.name,
        )
        return {"auth_error": _oidc_err_idp_logout_failed(provider.name)}

    # Decrypt the ID token hint if available
    decrypted_id_token_hint = None
    if session_info.id_token_hint:
        try:
            settings = get_settings()
            enc_key = key_from_string(settings.secret_encryption_key.get_secret_value())
            encryptor = SecretEncryptor(enc_key)
            decrypted_id_token_hint = encryptor.decrypt_field(session_info.id_token_hint, "session", "id_token_hint")
        except (RuntimeError, ValueError):
            logger.warning("Failed to decrypt id_token_hint for RP logout", provider=provider.name)

    logout_url = _build_rp_logout_url(
        end_session_endpoint=end_session_endpoint,
        id_token_hint=decrypted_id_token_hint,
        post_logout_redirect_uri=post_logout_redirect_uri,
    )

    logger.info("RP-initiated logout URL built", provider=provider.name, idp=session_info.idp)
    return {"redirect_url": logout_url}


@router.post(
    "/logout",
    summary="Terminate session",
    operation_id="logout",
    description="""
    Terminate the current session by revoking the refresh token.

    The refresh token is read from the ``ao_refresh_token`` HttpOnly cookie
    and revoked in the session store.  The cookie is cleared in the response.
    The associated access token remains valid until it expires (up to 15
    minutes) since access tokens are stateless JWTs validated without a
    server round-trip.
    """,
    responses={
        401: {"description": "Invalid or expired refresh token"},
    },
    response_model=None,
)
@audit(EventCategory.SECURITY_EVENT)
async def logout(
    raw_refresh_token: Annotated[str, Depends(get_refresh_token)],
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
    post_logout_redirect_uri: str | None = None,
) -> dict[str, str]:
    """Logout by revoking the refresh token session.

    The refresh token is revoked in Redis and the cookie is cleared.
    Always returns JSON. For OIDC sessions with RP-initiated logout
    enabled, the response includes a ``redirect_url`` the frontend
    should navigate to (``window.location.href``). If the IdP's
    end-session endpoint cannot be resolved, returns ``auth_error``
    instead so the frontend can warn the user.

    Args:
        raw_refresh_token: The refresh token extracted from the cookie
        request: FastAPI request object (for Referer origin extraction)
        response: FastAPI response object (cookie cleared here)
        db: Database session
        post_logout_redirect_uri: Optional post-logout redirect URL (validated against CORS origins)

    Returns:
        JSON with ``detail`` and optionally ``redirect_url`` or ``auth_error``

    Raises:
        AuthenticationRequiredError: If refresh token cookie is missing or invalid

    """
    token_service = _get_token_service()
    settings = get_settings()

    # Decode the refresh token to get the JTI
    try:
        payload: TokenPayload = token_service.decode_token(
            raw_refresh_token,
            token_type="refresh",  # noqa: S106
        )
    except InvalidTokenError:
        # Clear the cookie even if the token is invalid
        clear_refresh_cookie(response)
        raise
    except Exception as e:
        logger.warning("Failed to decode refresh token during logout", error=str(e))
        clear_refresh_cookie(response)
        raise AuthenticationRequiredError from e

    if not payload.jti:
        clear_refresh_cookie(response)
        raise AuthenticationRequiredError

    # Validate post_logout_redirect_uri against CORS origins (same as login flow)
    origin = _extract_referer_origin(request)
    post_logout_uri = (
        _safe_redirect_url(post_logout_redirect_uri, origin=origin)
        if post_logout_redirect_uri
        else settings.post_logout_redirect_uri
    )

    # Get session metadata before revoking (needed for RP-logout)
    session_metadata = None
    try:
        async with SessionStore() as store:
            session_metadata = await store.get(payload.jti)

            # Revoke the session in Redis
            revoked = await store.revoke(payload.jti)

            if revoked:
                logger.info(
                    "User logged out successfully",
                    user_id=payload.sub,
                    jti=payload.jti,
                )
            else:
                logger.info(
                    "Logout for already-expired session",
                    user_id=payload.sub,
                    jti=payload.jti,
                )
    except (OSError, RedisConnectionError) as exc:
        AuditEventDispatcher.dispatch(
            SessionLifecycleEvent(
                action=SessionAction.REVOKE,
                user_id=UUID(payload.sub),
                username=payload.preferred_username,
                jti=payload.jti,
                error_type=type(exc).__name__,
            )
        )
        logger.exception("Redis connection failed during logout", error=str(exc))
        raise SessionStoreUnavailableError from exc
    AuditEventDispatcher.dispatch(
        SessionLifecycleEvent(
            action=SessionAction.REVOKE, user_id=UUID(payload.sub), username=payload.preferred_username, jti=payload.jti
        )
    )

    # Clear the refresh cookie
    clear_refresh_cookie(response)

    # Build base response; merge RP-logout fields when applicable
    result: dict[str, str] = {"detail": "Successfully logged out"}

    rp_info = await _maybe_rp_logout(db, session_metadata, post_logout_uri)
    if rp_info:
        result.update(rp_info)

    return result


@router.get(
    "/me",
    operation_id="get_current_user",
    summary="Get current user",
    description="""
    Returns information about the currently authenticated user
    from the access token claims and session metadata.
    """,
    response_description="Current user information",
    responses={
        401: {"description": "Invalid or missing authentication"},
    },
)
@audit(EventCategory.USER_ACTION)
async def get_me(
    request: Request,
    payload: Annotated[TokenPayload, Depends(get_token_payload)],
) -> UserInfo:
    """Get current authenticated user information from token claims."""
    rp_logout_enabled = False

    raw_refresh_token = get_refresh_token_from_cookie(request)
    if raw_refresh_token:
        try:
            token_service = _get_token_service()
            token_payload = token_service.decode_token(raw_refresh_token, token_type="refresh")  # noqa: S106

            if token_payload.jti:
                async with SessionStore() as store:
                    session_metadata = await store.get(token_payload.jti)
                    if session_metadata:
                        rp_logout_enabled = session_metadata.rp_logout_enabled
        except (InvalidTokenError, RuntimeError, ValueError):
            logger.debug("Could not determine RP-logout status for /auth/me")

    return UserInfo(
        id=payload.sub,
        username=payload.preferred_username or "",
        email=payload.email or "",
        groups=payload.groups or [],
        rp_logout_enabled=rp_logout_enabled,
    )


@router.get(
    "/providers",
    operation_id="list_auth_providers",
    summary="List enabled identity providers",
    description="""
    Returns a list of enabled identity providers for the login page.
    This is a public endpoint that does not require authentication.
    Only returns provider id, name, and type — no secrets or configuration details.
    """,
    response_description="List of enabled identity providers",
)
@audit(EventCategory.USER_ACTION)
async def list_auth_providers(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AuthProvidersResponse:
    """List enabled identity providers for the login page. Public endpoint."""
    result = await db.exec(
        select(IdentityProvider).filter(
            col(IdentityProvider.enabled) == True,  # noqa: E712
            IdentityProvider.deleted_at.is_(None),  # type: ignore[union-attr]
        )
    )
    providers = result.all()

    return AuthProvidersResponse(
        providers=[
            AuthProviderInfo(
                id=str(p.id),
                name=p.name,
                provider_type=p.configuration.provider_type if p.configuration else "oidc",
                provider_template=getattr(p.configuration, "idp_type", None) if p.configuration else None,
            )
            for p in providers
        ]
    )


@router.get(
    "/oidc/authorize",
    operation_id="oidc_authorize",
    summary="Initiate OIDC login",
    description=(
        "Initiates the OIDC authorization code flow. Redirects the user's browser\n"
        "to the identity provider's authorization endpoint.\n\n"
        "This is a public endpoint (no authentication required). On any error it\n"
        "redirects to the frontend login page with an `auth_error` query parameter\n"
        "instead of returning a JSON error response.\n"
    ),
    responses={
        302: {"description": "Redirect to identity provider or frontend on error"},
    },
)
@audit(EventCategory.SECURITY_EVENT)
async def oidc_authorize(
    provider_id: Annotated[UUID, Query(description="UUID of the identity provider to use")],
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    redirect_to: Annotated[str | None, Query(description="URL to redirect to after successful login")] = None,
    flow: Literal["link", "test_signin"] | None = None,
) -> RedirectResponse:
    """Initiate OIDC login by redirecting to the provider's authorization endpoint."""
    origin = _extract_referer_origin(request)

    try:
        result = await _build_oidc_authorize_redirect(provider_id, request, db, redirect_to, flow=flow)
        AuditEventDispatcher.dispatch(OIDCFlowEvent(provider_id=provider_id, stage=OIDCStage.AUTHORIZE))
        return result
    except (OIDCError, _OIDCCallbackError) as e:
        AuditEventDispatcher.dispatch(
            OIDCFlowEvent(provider_id=provider_id, stage=OIDCStage.AUTHORIZE, error_type=type(e).__name__)
        )
        logger.warning("OIDC authorize failed, redirecting to login", provider_id=str(provider_id), error=str(e))
        base_url = _get_frontend_base_url(origin)
        return RedirectResponse(url=f"{base_url}?auth_error={quote(str(e))}", status_code=302)
    except Exception as e:
        AuditEventDispatcher.dispatch(
            OIDCFlowEvent(provider_id=provider_id, stage=OIDCStage.AUTHORIZE, error_type=type(e).__name__)
        )
        # Safety net: this is a browser endpoint — never return JSON errors
        logger.exception("Unexpected error during OIDC authorize", provider_id=str(provider_id))
        base_url = _get_frontend_base_url(origin)
        return RedirectResponse(url=f"{base_url}?auth_error={quote(_OIDC_ERR_DISCOVERY_FAILED)}", status_code=302)


async def _verify_idp_test_permission(request: Request, db: AsyncSession) -> None:
    """Verify the current user has identity-provider:test permission.

    Used by the test-signin flow which is a browser redirect (not a REST endpoint),
    so we can't use the standard ``Depends(PermissionChecker(...))`` pattern.
    Instead, we manually decode the refresh token and run the authz check.
    """
    raw_token = get_refresh_token_from_cookie(request)
    if not raw_token:
        msg = "Authentication required for test sign-in"
        raise OIDCError(msg)
    token_service = _get_token_service()
    try:
        payload = token_service.decode_token(raw_token, token_type="refresh")  # noqa: S106
    except Exception as e:
        msg = "Authentication required for test sign-in"
        raise OIDCError(msg) from e

    # Verify the session hasn't been revoked
    if payload.jti:
        async with SessionStore() as store:
            session = await store.get(payload.jti)
            if session is None:
                msg = "Session expired or revoked. Please log in again."
                raise OIDCError(msg)

    # Load the user for authz metadata
    user = await _find_non_deleted_user(db, UUID(str(payload.sub)))
    if not user:
        msg = "Authentication required for test sign-in"
        raise OIDCError(msg)

    # Run the same authz check as the identity-provider:test permission
    opa_client = get_opa_client(request)
    authz_result = await authorize(
        db,
        opa_client,
        AuthzRequest(
            user_id=user.id,
            action="test",
            resource_type="identity-provider",
            resource_id="",
            resource_project="",
            user_labels=user.labels,
            user_metadata=user.authz_metadata,
        ),
    )
    if not authz_result.allowed:
        msg = "Not authorized to perform test sign-in"
        raise OIDCError(msg)


async def _build_oidc_authorize_redirect(
    provider_id: UUID,
    request: Request,
    db: AsyncSession,
    redirect_to: str | None,
    *,
    flow: Literal["link", "test_signin"] | None = None,
) -> RedirectResponse:
    """Build the OIDC authorization redirect. Raises on any failure."""
    # For link flow, verify the user is authenticated via refresh token cookie
    flow_type: str | None = None
    link_user_id: str | None = None
    link_session_jti: str | None = None
    if flow == "test_signin":
        # Test sign-in requires identity-provider:test permission (admin only)
        await _verify_idp_test_permission(request, db)
        flow_type = "test_signin"
    elif flow == "link":
        raw_token = get_refresh_token_from_cookie(request)
        if not raw_token:
            msg = "Authentication required to link identity"
            raise OIDCError(msg)
        token_service = _get_token_service()
        try:
            payload = token_service.decode_token(raw_token, token_type="refresh")  # noqa: S106
        except Exception as e:
            msg = "Authentication required to link identity"
            raise OIDCError(msg) from e
        # Verify session is active
        async with SessionStore() as store:
            session = await store.get(payload.jti) if payload.jti else None
            if session is None:
                msg = "Session expired. Please log in again."
                raise OIDCError(msg)
        flow_type = "link"
        link_user_id = str(payload.sub)
        link_session_jti = payload.jti

    async with OIDCService() as oidc_service:
        provider = await _load_enabled_provider(db, provider_id)
        config = provider.configuration

        # Get OIDC endpoints (auto-discovery or manual)
        discovery = await _get_oidc_endpoints(oidc_service, config)

        # Generate state, nonce, and PKCE (recommended for all clients per OAuth 2.1)
        state, nonce = oidc_service.generate_state_and_nonce()
        code_verifier, code_challenge = oidc_service.generate_pkce()

        # Capture the frontend origin from the Referer header (validated against CORS origins)
        # so the callback can redirect back to the correct frontend.
        origin = _extract_referer_origin(request)

        # Validate and store redirect_to (prevents storing malicious URLs in Redis)
        safe_redirect = _safe_redirect_url(redirect_to, origin=origin) if redirect_to else None

        # Store state in Redis (including where to redirect after login)
        await oidc_service.store_oidc_state(
            state=state,
            provider_id=provider.id,
            nonce=nonce,
            code_verifier=code_verifier,
            redirect_to=safe_redirect,
            origin=origin,
            flow_type=flow_type,
            user_id=link_user_id,
            session_jti=link_session_jti,
        )

        # Use the redirect_uri configured on the provider
        redirect_uri = config.redirect_uri

        # Build authorization URL
        auth_url = oidc_service.build_authorization_url(
            authorization_endpoint=discovery["authorization_endpoint"],
            client_id=config.client_id,
            redirect_uri=redirect_uri,
            scopes=config.scopes,
            state=state,
            nonce=nonce,
            code_challenge=code_challenge,
        )

        logger.info("Redirecting to OIDC provider", provider_id=str(provider_id), provider_name=provider.name)

        return RedirectResponse(url=auth_url, status_code=302)


async def _get_oidc_endpoints(
    oidc_service: OIDCService,
    config: IdentityProviderConfigurationTypes,
) -> dict[str, Any]:
    """Get OIDC endpoints via auto-discovery or from manual configuration."""
    if config.auto_discovery:
        return await oidc_service.fetch_discovery_config(config.issuer_url)

    # Manual endpoints — validate required fields are present
    if not config.authorization_endpoint or not config.token_endpoint or not config.jwks_uri:
        msg = "Manual OIDC configuration requires authorization_endpoint, token_endpoint, and jwks_uri"
        raise OIDCError(msg)

    return {
        "authorization_endpoint": config.authorization_endpoint,
        "token_endpoint": config.token_endpoint,
        "jwks_uri": config.jwks_uri,
        "issuer": config.issuer_url,
        "userinfo_endpoint": config.userinfo_endpoint or "",
        "end_session_endpoint": config.end_session_endpoint or "",
    }


async def _load_enabled_provider(db: AsyncSession, provider_id: str | UUID) -> IdentityProvider:
    """Load an enabled, non-deleted identity provider or raise."""
    result = await db.exec(
        select(IdentityProvider).filter(
            IdentityProvider.id == provider_id,  # type: ignore[arg-type]  # SQLModel UUID comparison
            col(IdentityProvider.enabled) == True,  # noqa: E712
            IdentityProvider.deleted_at.is_(None),  # type: ignore[union-attr]  # SQLModel optional column
        )
    )
    provider = result.one_or_none()
    if not provider:
        # Intentionally use a generic message to avoid leaking whether a provider exists
        raise OIDCError(_OIDC_ERR_PROVIDER_UNAVAILABLE)
    return provider


async def _load_provider_config(db: AsyncSession, provider: IdentityProvider) -> OIDCConfiguration:
    """Load provider configuration with decrypted secrets for OIDC flows.

    Uses SecretService directly rather than IdentityProviderService.get_decrypted_config()
    because the OIDC callback is unauthenticated — there is no current User to satisfy
    BaseService.__init__. For authenticated flows, use IdentityProviderService instead.
    """
    config_data = provider.configuration.model_dump()
    if provider.secret_id:
        secret_service = create_secret_service(db)
        secrets = await secret_service.retrieve_secret(provider.secret_id)
        config_data = {**config_data, **secrets}
    return OIDCConfiguration.model_validate(config_data)


async def _exchange_and_validate_tokens(
    oidc_service: OIDCService,
    discovery: dict[str, Any],
    config: IdentityProviderConfigurationTypes,
    redirect_uri: str,
    code: str,
    code_verifier: str,
    nonce: str,
) -> tuple[dict[str, str | None], dict[str, Any], str]:
    """Exchange code for tokens, validate ID token, return user claims and raw claims.

    If the ID token is missing key user claims (email, name, preferred_username)
    and a userinfo endpoint is available, fetches additional claims from the
    userinfo endpoint per OIDC Core §5.3.  ID token claims take precedence.

    Returns:
        Tuple of (extracted user_claims, raw merged claims for JMESPath group mapping, id_token_raw)

    """
    token_response = await oidc_service.exchange_code_for_tokens(
        token_endpoint=discovery["token_endpoint"],
        code=code,
        redirect_uri=redirect_uri,
        client_id=config.client_id,
        client_secret=config.client_secret if config.client_secret else "",
        code_verifier=code_verifier,
    )

    id_token_raw = token_response.get("id_token")
    if not id_token_raw:
        logger.warning("No id_token in token response")
        msg = "Identity provider did not return an ID token"
        raise OIDCError(msg)

    id_token_claims = oidc_service.validate_id_token(
        id_token=id_token_raw,
        jwks_uri=discovery["jwks_uri"],
        issuer=discovery["issuer"],
        client_id=config.client_id,
        nonce=nonce,
    )

    logger.debug("Raw ID token claims from IdP", claims=list(id_token_claims.keys()))

    user_claims = oidc_service.extract_user_claims(id_token_claims, config.claim_mapping)

    # Start with ID token claims as the raw merged set
    raw_merged_claims: dict[str, Any] = dict(id_token_claims)

    # Fetch userinfo when key claims are missing OR when group mapping is configured
    # (group claims like aap_teams are often only available from the userinfo endpoint)
    userinfo_endpoint = discovery.get("userinfo_endpoint")
    access_token = token_response.get("access_token")
    missing_claims = not user_claims.get("email") or not user_claims.get("name")
    has_group_mapping = config.group_jmespath_expression is not None

    if (missing_claims or has_group_mapping) and userinfo_endpoint and access_token:
        try:
            userinfo = await oidc_service.fetch_userinfo(userinfo_endpoint, access_token)
            # Verify sub claim matches per OIDC Core §5.3.2
            if userinfo.get("sub") != id_token_claims.get("sub"):
                logger.warning("Userinfo sub mismatch, discarding userinfo")
            else:
                userinfo_claims = oidc_service.extract_user_claims(userinfo, config.claim_mapping)
                # ID token claims take precedence per OIDC Core §5.3.2
                for key, value in userinfo_claims.items():
                    if not user_claims.get(key) and value:
                        user_claims[key] = value
                # Merge raw userinfo into merged claims (ID token takes precedence)
                for key, value in userinfo.items():
                    if key not in raw_merged_claims:
                        raw_merged_claims[key] = value
                logger.debug("Supplemented user claims from userinfo endpoint")
        except OIDCError:
            logger.warning("Failed to fetch userinfo, proceeding with ID token claims only")

    return user_claims, raw_merged_claims, id_token_raw


async def _find_non_deleted_user(db: AsyncSession, user_id: UUID) -> User | None:
    """Load a non-deleted user by ID, or return None if deleted/missing."""
    result = await db.exec(
        select(User).filter(
            User.id == user_id,  # type: ignore[arg-type]
            User.deleted_at.is_(None),  # type: ignore[union-attr]
        )
    )
    return result.one_or_none()


async def _load_active_user(db: AsyncSession, user_id: UUID) -> User:
    """Load a non-deleted, active user or raise OIDCError."""
    user = await _find_non_deleted_user(db, user_id)
    if not user:
        msg = "Linked user account has been deleted. Contact your administrator."
        raise OIDCError(msg)
    if not user.is_enabled:
        msg = "User account is deactivated"
        raise OIDCError(msg)
    return user


async def _create_identity_with_race_handling(
    db: AsyncSession,
    identity_service: UserIdentityService,
    user: User,
    provider: IdentityProvider,
    issuer: str,
    sub: str,
) -> tuple[User, UserIdentity]:
    """Create an identity link, handling race conditions on the unique constraint.

    Returns:
        Tuple of (User, UserIdentity) for session tracking

    """
    try:
        identity = await identity_service.create_identity(
            user_id=user.id,
            identity_provider_id=provider.id,
            issuer=issuer,
            subject=sub,
        )
        identity.last_used_at = datetime.now(UTC)
        db.add(identity)
    except IntegrityError as e:
        await db.rollback()
        existing = await identity_service.find_by_issuer_and_subject(issuer, sub)
        if existing:
            # Re-load user from fresh session state after rollback
            user = await _load_active_user(db, existing.user_id)
            return (user, existing)
        msg = "Unable to sign in. Contact your administrator."
        raise OIDCError(msg) from e
    # Refresh user to ensure it's attached to the current session state
    await db.refresh(user)
    return (user, identity)


async def _resolve_oidc_user(
    db: AsyncSession,
    user_claims: dict[str, str | None],
    provider: IdentityProvider,
) -> tuple[User, UserIdentity]:
    """Resolve a user from OIDC claims using federated identity linking.

    1. Look up UserIdentity by (issuer, sub) — if found, return linked user.
    2. If not found — auto-create new user + identity.

    Returns:
        Tuple of (User, UserIdentity) for session tracking

    """
    email = user_claims.get("email")
    if not email or "@" not in email:
        logger.warning("Missing or invalid email claim in ID token", email=email)
        msg = "Identity provider did not return a valid email address"
        raise OIDCError(msg)

    sub = user_claims.get("sub")
    if not sub:
        logger.warning("Missing sub claim in ID token")
        msg = "Identity provider did not return a subject identifier"
        raise OIDCError(msg)

    issuer = provider.configuration.issuer_url
    identity_service = UserIdentityService(db)

    # Step 1: Look up by (issuer, sub)
    identity = await identity_service.find_by_issuer_and_subject(issuer, sub)
    if identity:
        linked_user = await _find_non_deleted_user(db, identity.user_id)
        if linked_user:
            if not linked_user.is_enabled:
                msg = "User account is deactivated"
                raise OIDCError(msg)
            identity.last_used_at = datetime.now(UTC)
            db.add(identity)
            return (linked_user, identity)
        # Linked user was deleted — remove stale identity and allow re-linking
        logger.warning(
            "Removing stale identity for deleted user",
            identity_id=str(identity.id),
            deleted_user_id=str(identity.user_id),
        )
        await identity_service.delete_identity(identity.id, force=True)

    # Step 2/3: Identity not found — create new user.
    # Retry once on OIDCError to handle concurrent-creation races: if a
    # concurrent request created the same user between our check and flush,
    # the second attempt re-runs the entire resolve flow from step 1 — which
    # will now find the identity created by the winning request.
    for attempt in range(2):
        try:
            user = await _auto_create_user(db, email, user_claims, provider.name)
            break
        except OIDCError:
            if attempt == 1:
                raise
            logger.info("Retrying user resolution after concurrent creation", email=email)

    return await _create_identity_with_race_handling(db, identity_service, user, provider, issuer, sub)


async def _is_username_taken(db: AsyncSession, value: str) -> bool:
    """Check if a username is already taken by a non-deleted user."""
    result = await db.exec(
        select(User).filter(
            User.username == value,  # type: ignore[arg-type]
            User.deleted_at.is_(None),  # type: ignore[union-attr]
        )
    )
    return result.one_or_none() is not None


async def _auto_create_user(
    db: AsyncSession,
    email: str,
    user_claims: dict[str, str | None],
    provider_name: str,
) -> User:
    """Auto-create a user from OIDC claims."""
    email = email.lower()
    preferred_username = (user_claims.get("preferred_username") or email.split("@", maxsplit=1)[0]).lower()
    full_name = user_claims.get("name") or preferred_username

    # Resolve unique username: try preferred, then append a random suffix
    username = preferred_username
    if await _is_username_taken(db, username):
        random_suffix = secrets.token_hex(8)
        username = f"{preferred_username}-{random_suffix}"
        if await _is_username_taken(db, username):
            logger.warning("OIDC username collision", username=username, email=email)
            msg = "Username already taken. Contact your administrator."
            raise OIDCError(msg)

    user = User(
        username=username,
        email=email,
        full_name=full_name,
        password_hash=None,
        is_enabled=True,
    )
    db.add(user)
    try:
        await db.flush()
    except IntegrityError as e:
        await db.rollback()
        constraint = getattr(e.orig, "constraint_name", None) if e.orig else None
        logger.warning(
            "OIDC auto-create user failed due to integrity constraint",
            constraint=constraint or "unknown",
            provider=provider_name,
        )
        msg = "Unable to create account. Contact your administrator."
        raise OIDCError(msg) from e
    logger.info("Auto-created user from OIDC", user_id=str(user.id), email=email, provider=provider_name)
    return user


class _OIDCCallbackError(Exception):
    """Internal exception for OIDC callback errors that should redirect to the login page."""

    def __init__(self, message: str, origin: str | None = None, redirect_to: str | None = None) -> None:
        super().__init__(message)
        self.origin = origin
        self.redirect_to = redirect_to


# User-facing error messages for OIDC callback failures
def _oidc_err_idp_logout_failed(provider_name: str | None = None) -> str:
    if provider_name:
        return f"Logged out of Nexus, but could not log out of {provider_name}."
    return "Logged out of Nexus, but could not log out of the identity provider."


_OIDC_ERR_MISSING_CODE = "Missing authorization code"
_OIDC_ERR_STATE_EXPIRED = "Login session expired. Please try again."
_OIDC_ERR_PROVIDER_UNAVAILABLE = "Identity provider not available"
_OIDC_ERR_DISCOVERY_FAILED = "Failed to connect to identity provider"
_OIDC_ERR_AUTH_FAILED = "Authentication failed. Please try again."
_OIDC_ERR_USER_FAILED = "Unable to sign in. Contact your administrator."
_OIDC_ERR_NO_GROUP_MATCH = (
    "Access denied. Your identity provider groups do not match any configured group mappings. "
    "Contact your administrator."
)


@router.get(
    "/oidc/callback",
    operation_id="oidc_callback",
    summary="OIDC callback",
    description=(
        "Handles the OIDC callback after the user authenticates at the identity provider.\n"
        "Exchanges the authorization code for tokens, validates the ID token,\n"
        "creates or maps a local user, and establishes a session.\n"
    ),
    responses={
        302: {"description": "Redirect to frontend after successful login"},
        401: {"description": "Authentication failed"},
    },
    response_model=None,
)
@audit(EventCategory.SECURITY_EVENT)
async def oidc_callback(
    state: Annotated[str, Query(description="OIDC state parameter for CSRF protection")],
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    code: Annotated[str | None, Query(description="Authorization code from identity provider")] = None,
    error: Annotated[str | None, Query(description="Error code from identity provider")] = None,
    error_description: Annotated[
        str | None, Query(description="Human-readable error description from identity provider")
    ] = None,
) -> RedirectResponse:
    """Handle OIDC callback. Exchanges code for tokens, creates session."""
    try:
        (
            user,
            provider,
            state_data,
            identity,
            raw_merged_claims,
            id_token_raw,
            is_first_login,
        ) = await _process_oidc_callback(
            state=state,
            db=db,
            code=code,
            error=error,
            error_description=error_description,
        )
        if user is not None:
            AuditEventDispatcher.dispatch(
                OIDCFlowEvent(
                    provider_id=provider.id, stage=OIDCStage.CALLBACK, user_id=user.id, username=user.username
                )
            )
    except _OIDCCallbackError as e:
        AuditEventDispatcher.dispatch(
            OIDCFlowEvent(provider_id=None, stage=OIDCStage.CALLBACK, error_type=type(e).__name__)
        )
        return _build_callback_error_redirect(e)
    except SessionStoreUnavailableError:
        raise
    except Exception:
        logger.exception(
            "Unexpected error during OIDC callback",
            state=state[:8] + "..." if state else None,
            code_present=code is not None,
            error=error,
        )
        base_url = _get_frontend_base_url(None)
        return RedirectResponse(url=f"{base_url}?auth_error={quote(_OIDC_ERR_AUTH_FAILED)}", status_code=302)

    flow_type = state_data.get("flow_type")

    # Handle test-signin flow — return raw claims to the popup window
    if flow_type == "test_signin":
        return _build_test_signin_response(raw_merged_claims, state_data.get("origin"))

    # For link flow, identity was already created — just redirect back (no session creation)
    if flow_type == "link":
        return _build_link_success_redirect(user, provider, state_data)

    # Login flow: user and identity are guaranteed non-None here
    if user is None or identity is None:  # pragma: no cover - defensive guard for type narrowing
        base_url = _get_frontend_base_url(None)
        return RedirectResponse(url=f"{base_url}?auth_error={quote(_OIDC_ERR_AUTH_FAILED)}", status_code=302)

    return await _build_login_session_redirect(
        user, provider, identity, state_data, request, db, id_token_raw, is_first_login=is_first_login
    )


def _build_callback_error_redirect(e: "_OIDCCallbackError") -> RedirectResponse:
    """Build error redirect for OIDC callback failures."""
    if e.redirect_to:
        safe_redirect = _safe_redirect_url(e.redirect_to, origin=e.origin)
        return RedirectResponse(url=f"{safe_redirect}?link_error={quote(str(e))}", status_code=302)
    base_url = _get_frontend_base_url(e.origin)
    return RedirectResponse(url=f"{base_url}?auth_error={quote(str(e))}", status_code=302)


def _build_link_success_redirect(
    user: User | None,
    provider: IdentityProvider,
    state_data: dict[str, str],
) -> RedirectResponse:
    """Build redirect after successful identity link."""
    stored_origin = state_data.get("origin")
    redirect_to = _safe_redirect_url(state_data.get("redirect_to"), origin=stored_origin)
    logger.info("OIDC identity link successful", user_id=str(user.id) if user else "unknown", provider=provider.name)
    return RedirectResponse(url=redirect_to, status_code=302)


async def _build_login_session_redirect(
    user: User,
    provider: IdentityProvider,
    identity: UserIdentity,
    state_data: dict[str, str],
    request: Request,
    db: AsyncSession,
    id_token_raw: str,
    *,
    is_first_login: bool,
) -> RedirectResponse:
    """Create session and build redirect after successful OIDC login."""
    client_host = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")

    token_service = _get_token_service()
    refresh_token_str, jti, _exp = token_service.create_refresh_token(user.id)

    # Encrypt ID token for RP-initiated logout if enabled for this provider
    encrypted_id_token: str | None = None
    rp_logout_enabled = (
        isinstance(provider.configuration, OIDCConfiguration) and provider.configuration.enable_rp_initiated_logout
    )
    if rp_logout_enabled:
        settings = get_settings()
        key = key_from_string(settings.secret_encryption_key.get_secret_value())
        encryptor = SecretEncryptor(key)
        encrypted_id_token = encryptor.encrypt_field(id_token_raw, "session", "id_token_hint")

    try:
        async with SessionStore() as store:
            await store.create(
                jti=jti,
                user_id=user.id,
                device=user_agent,
                ip_address=client_host,
                amr=[AMR.FEDERATED],
                idp=provider.name,
                idp_id=str(provider.id),
                identity_id=str(identity.id),
                issuer=identity.issuer,
                subject=identity.subject,
                id_token_hint=encrypted_id_token,
                rp_logout_enabled=rp_logout_enabled,
            )
    except (OSError, RedisConnectionError) as exc:
        AuditEventDispatcher.dispatch(
            SessionLifecycleEvent(
                action=SessionAction.CREATE,
                user_id=user.id,
                username=user.username,
                jti=jti,
                idp=provider.name,
                error_type=type(exc).__name__,
            )
        )
        AuditEventDispatcher.dispatch(
            LoginAttemptEvent(username=user.username, method=LoginMethod.OIDC, error_type=type(exc).__name__)
        )
        logger.exception("Redis connection failed during OIDC callback", error=str(exc))
        await db.rollback()
        raise SessionStoreUnavailableError from exc
    AuditEventDispatcher.dispatch(
        SessionLifecycleEvent(
            action=SessionAction.CREATE, user_id=user.id, username=user.username, jti=jti, idp=provider.name
        )
    )

    # Commit last_login only after Redis session is successfully created
    await db.commit()

    stored_origin = _revalidate_origin(state_data.get("origin"))
    redirect_to = _safe_redirect_url(state_data.get("redirect_to"), origin=stored_origin)
    response = RedirectResponse(url=redirect_to, status_code=302)
    settings = get_settings()
    cookie_max_age = settings.jwt_refresh_token_lifetime_hours * 3600
    set_refresh_cookie(response, refresh_token_str, max_age=cookie_max_age)

    AuditEventDispatcher.dispatch(
        UserLoginEvent(user_id=user.id, amr=[AMR.FEDERATED], idp=provider.name, is_first_login=is_first_login)
    )
    logger.info("OIDC login successful", user_id=str(user.id), provider=provider.name)
    AuditEventDispatcher.dispatch(LoginAttemptEvent(username=user.username, method=LoginMethod.OIDC, user_id=user.id))
    return response


def _extract_referer_origin(request: Request) -> str | None:
    """Extract the origin from the Referer header, validated against CORS allowed origins.

    Only returns the origin if it matches one of the configured CORS_ALLOW_ORIGINS.
    This prevents storing an untrusted origin that could be used for open redirects.
    """
    referer = request.headers.get("referer")
    if not referer:
        return None

    parsed = urlparse(referer)
    if not parsed.scheme or not parsed.netloc:
        return None

    origin = f"{parsed.scheme}://{parsed.netloc}"

    settings = get_settings()
    if origin in settings.cors_allow_origins:
        return origin

    logger.debug("Referer origin not in CORS allowed origins", origin=origin)
    return None


def _revalidate_origin(origin: str | None) -> str | None:
    """Re-validate a stored origin against the current CORS allowed origins.

    The origin is initially validated during the authorize step, but CORS
    configuration may change before the callback completes. This ensures
    the origin is still trusted before using it for redirection.
    """
    if not origin:
        return None

    settings = get_settings()
    if origin in settings.cors_allow_origins:
        return origin

    logger.warning("Stored OIDC origin no longer in CORS allowed origins, discarding", origin=origin)
    return None


def _get_frontend_base_url(origin: str | None = None) -> str:
    """Return the trusted frontend base URL.

    Fallback chain:
    1. Stored origin from authorize step (captured from Referer, validated against CORS origins)
    2. jwt_issuer (server origin — last resort)
    """
    if origin:
        return origin

    return get_settings().jwt_issuer


def _safe_redirect_url(url: str | None, *, origin: str | None = None) -> str:
    """Validate a redirect URL to prevent open-redirect attacks.

    Only allows:
    - Relative paths — resolved against the trusted frontend origin
    - Absolute URLs whose origin is in CORS_ALLOW_ORIGINS

    Falls back to the frontend base URL if the input is unsafe or missing.
    """
    base_url = _get_frontend_base_url(origin)

    if not url:
        return base_url

    parsed = urlparse(url)

    # Allow relative paths (no scheme/host) — resolve against frontend origin
    if not parsed.scheme and not parsed.netloc:
        # Reject protocol-relative URLs like "//evil.com"
        if url.startswith("//"):
            logger.warning("Rejected protocol-relative redirect URL", url=url)
            return base_url
        return f"{base_url}{url}"

    # Allow absolute URLs whose origin is in CORS_ALLOW_ORIGINS
    candidate_origin = f"{parsed.scheme}://{parsed.netloc}"
    allowed_origins = get_settings().cors_allow_origins
    if "*" in allowed_origins:
        logger.warning("Wildcard in CORS_ALLOW_ORIGINS, rejecting absolute redirect for safety", url=url)
        return base_url
    if candidate_origin in allowed_origins:
        return url

    logger.warning("Rejected redirect URL not in CORS origins", url=url, candidate_origin=candidate_origin)
    return base_url


async def _process_oidc_callback(
    *,
    state: str,
    db: AsyncSession,
    code: str | None,
    error: str | None,
    error_description: str | None,
) -> tuple[User | None, IdentityProvider, dict[str, str], UserIdentity | None, dict[str, Any], str, bool]:
    """Process the OIDC callback flow.

    Returns:
        Tuple of (user, provider, state_data, identity, raw_merged_claims, id_token_raw, is_first_login) on success.
        user is None for test_signin flow. identity is None for link/test_signin flows.

    """
    if error:
        logger.warning("OIDC provider returned error", error=error, description=error_description)
        raise _OIDCCallbackError(_OIDC_ERR_AUTH_FAILED)

    if not code:
        logger.warning("OIDC callback missing authorization code")
        raise _OIDCCallbackError(_OIDC_ERR_MISSING_CODE)

    async with OIDCService() as oidc_service:
        state_data = await oidc_service.retrieve_oidc_state(state)
        if state_data is None:
            logger.warning("OIDC callback with invalid or expired state")
            raise _OIDCCallbackError(_OIDC_ERR_STATE_EXPIRED)

        # Origin captured from the Referer during /oidc/authorize — used for redirect fallback.
        # Re-validate against current CORS settings (AAP-71277).
        origin = _revalidate_origin(state_data.get("origin"))

        try:
            provider = await _load_enabled_provider(db, state_data["provider_id"])
        except OIDCError as e:
            raise _OIDCCallbackError(_OIDC_ERR_PROVIDER_UNAVAILABLE, origin=origin) from e

        config = await _load_provider_config(db, provider)

        try:
            discovery = await _get_oidc_endpoints(oidc_service, config)
        except OIDCError as e:
            logger.exception("OIDC endpoint resolution failed during callback")
            raise _OIDCCallbackError(_OIDC_ERR_DISCOVERY_FAILED, origin=origin) from e

        redirect_uri = config.redirect_uri

        try:
            user_claims, raw_merged_claims, id_token_raw = await _exchange_and_validate_tokens(
                oidc_service,
                discovery,
                config,
                redirect_uri,
                code,
                state_data["code_verifier"],
                state_data["nonce"],
            )
        except OIDCError as e:
            logger.warning("OIDC token exchange/validation failed", error=str(e), provider=provider.name)
            raise _OIDCCallbackError(_OIDC_ERR_AUTH_FAILED, origin=origin) from e
        except Exception as e:
            logger.exception("Unexpected error during OIDC token exchange", provider=provider.name)
            raise _OIDCCallbackError(_OIDC_ERR_AUTH_FAILED, origin=origin) from e

    # Handle test-signin flow — return raw claims to frontend, no session created
    if state_data.get("flow_type") == "test_signin":
        return None, provider, state_data, None, raw_merged_claims, id_token_raw, False

    # Handle self-service link flow — create identity for authenticated user
    if state_data.get("flow_type") == "link":
        user = await _process_link_callback(db, state_data, user_claims, provider, origin)
        return user, provider, state_data, None, raw_merged_claims, id_token_raw, False

    user, identity, is_first_login = await _resolve_and_login_user(db, user_claims, raw_merged_claims, provider, origin)
    return user, provider, state_data, identity, raw_merged_claims, id_token_raw, is_first_login


async def _resolve_and_login_user(
    db: AsyncSession,
    user_claims: dict[str, str | None],
    raw_merged_claims: dict[str, Any],
    provider: IdentityProvider,
    origin: str | None,
) -> tuple[User, UserIdentity, bool]:
    """Resolve or create a user from OIDC claims, sync groups, and update last login.

    Returns:
        Tuple of (User, UserIdentity, is_first_login) for session tracking

    """
    try:
        user, identity = await _resolve_oidc_user(db, user_claims, provider)
    except OIDCError as e:
        logger.warning("OIDC user resolution failed", error=str(e), provider=provider.name)
        raise _OIDCCallbackError(_OIDC_ERR_USER_FAILED, origin=origin) from e
    except Exception as e:
        logger.exception("Unexpected error during OIDC user resolution", provider=provider.name)
        raise _OIDCCallbackError(_OIDC_ERR_USER_FAILED, origin=origin) from e

    # Sync IdP group memberships before committing
    if isinstance(provider.configuration, OIDCConfiguration):
        groups_matched = await sync_idp_groups(db, user, identity, raw_merged_claims, provider.configuration)

        if not groups_matched:
            # Flush so the sync changes are visible to the membership check below
            await db.flush()
            # No groups resolved from this provider (no mappings matched,
            # auto-create disabled/empty, or extraction failed) — check if the
            # user has any group memberships from other sources (manual or other IdPs).
            other_groups = await db.execute(
                select(user_groups.c.group_id).where(user_groups.c.user_id == user.id).limit(1)
            )
            if other_groups.first() is None:
                logger.error(
                    "Login denied: no group mappings matched and user has no other groups",
                    user_id=str(user.id),
                    provider=provider.name,
                )
                await db.rollback()
                raise _OIDCCallbackError(_OIDC_ERR_NO_GROUP_MATCH, origin=origin)

    is_first_login = user.last_login is None
    user.update_last_login()
    db.add(user)
    return (user, identity, is_first_login)


async def _process_link_callback(
    db: AsyncSession,
    state_data: dict[str, str],
    user_claims: dict[str, str | None],
    provider: IdentityProvider,
    origin: str | None,
) -> User:
    """Process the OIDC callback for identity linking. Wraps _handle_link_flow with error handling."""
    link_redirect = state_data.get("redirect_to")
    try:
        return await _handle_link_flow(db, state_data, user_claims, provider)
    except OIDCError as e:
        logger.warning("OIDC link flow failed", error=str(e), provider=provider.name)
        raise _OIDCCallbackError(str(e), origin=origin, redirect_to=link_redirect) from e
    except Exception as e:
        logger.exception("Unexpected error during OIDC link flow", provider=provider.name)
        msg = "Failed to link identity. Please try again."
        raise _OIDCCallbackError(msg, origin=origin, redirect_to=link_redirect) from e


async def _verify_link_session(session_jti: str | None, user_id_str: str) -> None:
    """Re-verify the session that initiated the link flow is still active and owned by the user."""
    if not session_jti:
        return
    async with SessionStore() as store:
        session = await store.get(session_jti)
        if session is None:
            msg = "Session expired. Please log in again."
            raise OIDCError(msg)
        if session.user_id != user_id_str:
            logger.warning(
                "Link flow session user mismatch",
                session_user_id=session.user_id,
                state_user_id=user_id_str,
            )
            msg = "Session does not match. Please log in again."
            raise OIDCError(msg)


async def _handle_link_flow(
    db: AsyncSession,
    state_data: dict[str, str],
    user_claims: dict[str, str | None],
    provider: IdentityProvider,
) -> User:
    """Handle self-service identity linking for an authenticated user."""
    user_id_str = state_data.get("user_id")
    if not user_id_str:
        msg = "Invalid link flow state"
        raise OIDCError(msg)

    user_id = UUID(user_id_str)

    await _verify_link_session(state_data.get("session_jti"), user_id_str)

    user = await _load_active_user(db, user_id)

    sub = user_claims.get("sub")
    if not sub:
        msg = "Identity provider did not return a subject identifier"
        raise OIDCError(msg)

    issuer = provider.configuration.issuer_url
    identity_service = UserIdentityService(db)

    # Check if this (issuer, sub) is already linked to any user
    existing = await identity_service.find_by_issuer_and_subject(issuer, sub)
    if existing:
        # If linked to a deleted user, clean up the stale identity and proceed
        linked_user = await _find_non_deleted_user(db, existing.user_id)
        if linked_user is None:
            logger.info(
                "Removing stale identity for deleted user during link flow",
                identity_id=str(existing.id),
                deleted_user_id=str(existing.user_id),
            )
            await identity_service.delete_identity(existing.id, force=True)
        elif linked_user.id == user_id:
            msg = "This identity is already linked to your account"
            raise OIDCError(msg)
        else:
            msg = "This identity is already linked to another account"
            raise OIDCError(msg)

    try:
        identity = await identity_service.create_identity(
            user_id=user.id,
            identity_provider_id=provider.id,
            issuer=issuer,
            subject=sub,
        )
        identity.last_used_at = datetime.now(UTC)
        db.add(identity)
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        # Race: another request linked this identity between our check and insert
        existing = await identity_service.find_by_issuer_and_subject(issuer, sub)
        if existing and existing.user_id == user.id:
            # Same user won the race — treat as success
            return await _load_active_user(db, user.id)
        msg = "This identity is already linked to another account"
        raise OIDCError(msg) from e

    await db.refresh(user)
    return user


def _build_test_signin_response(
    raw_merged_claims: dict[str, Any],
    origin: str | None,
) -> RedirectResponse:
    """Redirect the popup to the frontend origin with claims in a URL fragment.

    The callback lands on the backend origin (redirect_uri), so we can't use
    localStorage or BroadcastChannel (different origin from the frontend).
    Instead, redirect to the frontend origin with base64-encoded claims in the
    hash fragment.  The frontend reads the hash, writes to localStorage on its
    own origin, and closes the popup.
    """
    claims_json = json.dumps(raw_merged_claims, default=str)
    claims_b64 = base64.urlsafe_b64encode(claims_json.encode()).decode()
    base_url = _get_frontend_base_url(origin)
    redirect_url = f"{base_url}/auth/test-signin-callback#{claims_b64}"
    return RedirectResponse(url=redirect_url, status_code=302)
