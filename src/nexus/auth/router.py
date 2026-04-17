"""Authentication API endpoints.

This module provides endpoints for JWT token management, including:
- Login (username/password authentication)
- Token refresh (refresh token read from HttpOnly cookie)
- Logout (session revocation, clears refresh cookie)
- Current user information
- Auth providers listing (public, for login page)
- OIDC authorization code flow (authorize + callback)
"""

from typing import Annotated, Any
from urllib.parse import quote, urlparse
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import RedirectResponse
from redis.exceptions import ConnectionError as RedisConnectionError
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.auth.cookies import (
    clear_refresh_cookie,
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
from nexus.auth.services.oidc_service import OIDCError, OIDCService
from nexus.auth.services.token_service import TokenPayload
from nexus.auth.session.session_store import SessionStore
from nexus.authz.resolver import AUTHENTICATED_GROUP_NAME
from nexus.core.config.base import get_settings
from nexus.core.database.session import get_db
from nexus.core.models import User
from nexus.core.models.group import Group, user_groups
from nexus.core.utils.crypto import decrypt_secret
from nexus.identity_providers.models.identity_provider import IdentityProvider
from nexus.identity_providers.models.identity_provider_configuration import IdentityProviderConfigurationTypes

logger = structlog.stdlib.get_logger(__name__)

# Authentication method reference constants (RFC 8176)
AMR_PASSWORD = "pwd"  # noqa: S105
AMR_FEDERATED = "fed"


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

    # Look up user by username (case-insensitive)
    username = body.username.lower()
    result = await db.exec(
        select(User).filter(
            User.username == username,  # type: ignore[arg-type]
            User.deleted_at.is_(None),  # type: ignore[union-attr]
        )
    )
    user = result.one_or_none()

    if not user or not user.password_hash:
        raise AuthenticationRequiredError

    if not verify_password(body.password, user.password_hash):
        raise AuthenticationRequiredError

    if not user.is_active:
        raise AuthenticationRequiredError

    # Resolve group names for JWT claims (before modifying session state)
    user_group_names = await _get_user_group_names(db, user.id)

    # Fetch current groups version from Redis
    async with SessionStore() as store:
        token_version = await store.get_token_version(user.id)

    # Update last login (commit deferred until after Redis session is created
    # to avoid updating last_login when the session store is unreachable).
    user.update_last_login()
    db.add(user)

    # Create access token
    token_service = _get_token_service()
    access_token = token_service.create_access_token(
        user_id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        amr=[AMR_PASSWORD],
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
                device=request.headers.get("User-Agent"),
                ip_address=request.client.host if request.client else None,
                amr=[AMR_PASSWORD],
                idp="local",
            )
    except (OSError, RedisConnectionError, RuntimeError) as exc:
        # Redis connection or session store errors — roll back last_login
        # so user state stays consistent (they didn't get a session).
        logger.exception("Redis connection failed during login", error=str(exc))
        await db.rollback()
        raise SessionStoreUnavailableError from exc

    # Commit last_login only after Redis session is successfully created
    await db.commit()

    # Set refresh cookie
    cookie_max_age = settings.jwt_refresh_token_lifetime_hours * 3600
    set_refresh_cookie(response, refresh_token_str, max_age=cookie_max_age)

    logger.info("User logged in", user_id=str(user.id), username=user.username)

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

            if not user.is_active:
                logger.warning("Inactive user attempted token refresh", user_id=payload.sub)
                raise AuthenticationRequiredError

            # Create new access token with fresh claims from the database
            username = payload.preferred_username or user.username

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


@router.post(
    "/logout",
    operation_id="logout",
    summary="Terminate session",
    description="""
    Terminate the current session by revoking the refresh token.

    The refresh token is read from the ``ao_refresh_token`` HttpOnly cookie
    and revoked in the session store.  The cookie is cleared in the response.
    The associated access token remains valid until it expires (up to 15
    minutes) since access tokens are stateless JWTs validated without a
    server round-trip.
    """,
    response_description="Successfully logged out",
    responses={
        401: {"description": "Invalid or expired refresh token"},
    },
)
async def logout(
    raw_refresh_token: Annotated[str, Depends(get_refresh_token)],
    response: Response,
) -> dict[str, str]:
    """Logout by revoking the refresh token session.

    The refresh token is revoked in Redis and the cookie is cleared.

    Args:
        raw_refresh_token: The refresh token extracted from the cookie
        response: FastAPI response object (cookie cleared here)

    Returns:
        Success message

    Raises:
        AuthenticationRequiredError: If refresh token cookie is missing or invalid

    """
    token_service = _get_token_service()

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

    # Revoke the session in Redis
    try:
        async with SessionStore() as store:
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
        logger.exception("Redis connection failed during logout", error=str(exc))
        raise SessionStoreUnavailableError from exc

    # Clear the refresh cookie
    clear_refresh_cookie(response)

    return {"detail": "Successfully logged out"}


@router.get(
    "/me",
    operation_id="get_current_user",
    summary="Get current user",
    description="""
    Returns information about the currently authenticated user
    from the access token claims. No database round-trip is performed.
    """,
    response_description="Current user information",
    responses={
        401: {"description": "Invalid or missing authentication"},
    },
)
async def get_me(
    payload: Annotated[TokenPayload, Depends(get_token_payload)],
) -> UserInfo:
    """Get current authenticated user information from token claims.

    Args:
        payload: Validated access token payload

    Returns:
        Current user information

    """
    return UserInfo(
        id=payload.sub,
        username=payload.preferred_username or "",
        email=payload.email or "",
        groups=payload.groups or [],
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
            )
            for p in providers
        ]
    )


@router.get(
    "/oidc/authorize",
    operation_id="oidc_authorize",
    summary="Initiate OIDC login",
    description="""
    Initiates the OIDC authorization code flow. Redirects the user's browser
    to the identity provider's authorization endpoint.

    This is a public endpoint (no authentication required). On any error it
    redirects to the frontend login page with an `auth_error` query parameter
    instead of returning a JSON error response.
    """,
    responses={
        302: {"description": "Redirect to identity provider or frontend on error"},
    },
)
async def oidc_authorize(
    provider_id: UUID,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    redirect_to: str | None = None,
) -> RedirectResponse:
    """Initiate OIDC login by redirecting to the provider's authorization endpoint."""
    origin = _extract_referer_origin(request)
    try:
        return await _build_oidc_authorize_redirect(provider_id, request, db, redirect_to)
    except (OIDCError, _OIDCCallbackError) as e:
        logger.warning("OIDC authorize failed, redirecting to login", provider_id=str(provider_id), error=str(e))
        base_url = _get_frontend_base_url(origin)
        return RedirectResponse(url=f"{base_url}?auth_error={quote(str(e))}", status_code=302)
    except Exception:
        # Safety net: this is a browser endpoint — never return JSON errors
        logger.exception("Unexpected error during OIDC authorize", provider_id=str(provider_id))
        base_url = _get_frontend_base_url(origin)
        return RedirectResponse(url=f"{base_url}?auth_error={quote(_OIDC_ERR_DISCOVERY_FAILED)}", status_code=302)


async def _build_oidc_authorize_redirect(
    provider_id: UUID,
    request: Request,
    db: AsyncSession,
    redirect_to: str | None,
) -> RedirectResponse:
    """Build the OIDC authorization redirect. Raises on any failure."""
    async with OIDCService() as oidc_service:
        provider = await _load_enabled_provider(db, provider_id)
        config = provider.configuration

        # Get OIDC endpoints (auto-discovery or manual)
        discovery = await _get_oidc_endpoints(oidc_service, config)

        # Generate state, nonce, and PKCE (recommended for all clients per OAuth 2.1)
        state, nonce = oidc_service.generate_state_and_nonce()
        code_verifier, code_challenge = oidc_service.generate_pkce()

        # Validate and store redirect_to (prevents storing malicious URLs in Redis)
        safe_redirect = _safe_redirect_url(redirect_to) if redirect_to else None

        # Capture the frontend origin from the Referer header (validated against CORS origins)
        # so the callback can redirect back to the correct frontend.
        origin = _extract_referer_origin(request)

        # Store state in Redis (including where to redirect after login)
        await oidc_service.store_oidc_state(
            state=state,
            provider_id=provider.id,
            nonce=nonce,
            code_verifier=code_verifier,
            redirect_to=safe_redirect,
            origin=origin,
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


async def _exchange_and_validate_tokens(
    oidc_service: OIDCService,
    discovery: dict[str, Any],
    config: IdentityProviderConfigurationTypes,
    redirect_uri: str,
    code: str,
    code_verifier: str,
    nonce: str,
) -> dict[str, str | None]:
    """Exchange code for tokens, validate ID token, return user claims.

    If the ID token is missing key user claims (email, name, preferred_username)
    and a userinfo endpoint is available, fetches additional claims from the
    userinfo endpoint per OIDC Core §5.3.  ID token claims take precedence.
    """
    token_response = await oidc_service.exchange_code_for_tokens(
        token_endpoint=discovery["token_endpoint"],
        code=code,
        redirect_uri=redirect_uri,
        client_id=config.client_id,
        client_secret=decrypt_secret(config.client_secret) if config.client_secret else "",
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

    user_claims = oidc_service.extract_user_claims(id_token_claims)

    # Supplement with userinfo if key claims are missing and endpoint is available
    userinfo_endpoint = discovery.get("userinfo_endpoint")
    access_token = token_response.get("access_token")
    missing_claims = not user_claims.get("email") or not user_claims.get("name")

    if missing_claims and userinfo_endpoint and access_token:
        try:
            userinfo = await oidc_service.fetch_userinfo(userinfo_endpoint, access_token)
            # Verify sub claim matches per OIDC Core §5.3.2
            if userinfo.get("sub") != id_token_claims.get("sub"):
                logger.warning("Userinfo sub mismatch, discarding userinfo")
            else:
                userinfo_claims = oidc_service.extract_user_claims(userinfo)
                # ID token claims take precedence per OIDC Core §5.3.2
                for key, value in userinfo_claims.items():
                    if not user_claims.get(key) and value:
                        user_claims[key] = value
                logger.debug("Supplemented user claims from userinfo endpoint")
        except OIDCError:
            logger.warning("Failed to fetch userinfo, proceeding with ID token claims only")

    return user_claims


async def _find_or_create_oidc_user(
    db: AsyncSession,
    user_claims: dict[str, str | None],
    provider_name: str,
) -> User:
    """Find existing user by email or auto-create from OIDC claims."""
    email = user_claims.get("email")
    if not email or "@" not in email:
        logger.warning("Missing or invalid email claim in ID token", email=email)
        msg = "Identity provider did not return a valid email address"
        raise OIDCError(msg)

    email = email.lower()

    user_result = await db.exec(
        select(User).filter(
            User.email == email,  # type: ignore[arg-type]  # SQLModel string comparison
            User.deleted_at.is_(None),  # type: ignore[union-attr]  # SQLModel optional column
        )
    )
    user = user_result.one_or_none()

    if user and not user.is_active:
        logger.warning("OIDC login for inactive user", email=email)
        msg = "User account is deactivated"
        raise OIDCError(msg)

    if not user:
        # TOCTOU note: a race condition exists between the SELECT above and
        # the INSERT in _auto_create_user — a concurrent request with the same
        # email could create a duplicate.  _auto_create_user handles this by
        # checking for username collisions before INSERT, and the database
        # unique constraint on email will raise IntegrityError if a duplicate
        # slips through.  The caller (_process_oidc_callback) catches
        # OIDCError and redirects to the login page with an appropriate
        # error message.
        user = await _auto_create_user(db, email, user_claims, provider_name)

    return user


async def _auto_create_user(
    db: AsyncSession,
    email: str,
    user_claims: dict[str, str | None],
    provider_name: str,
) -> User:
    """Auto-create a local user from OIDC claims."""
    preferred_username = user_claims.get("preferred_username") or email.split("@", maxsplit=1)[0]
    full_name = user_claims.get("name") or preferred_username

    username = preferred_username.lower()
    email = email.lower()
    existing = await db.exec(
        select(User).filter(
            User.username == username,  # type: ignore[arg-type]  # SQLModel string comparison
            User.deleted_at.is_(None),  # type: ignore[union-attr]  # SQLModel optional column
        )
    )
    if existing.one_or_none():
        logger.warning("OIDC username collision", username=username, email=email)
        msg = "Username already taken. Contact your administrator."
        raise OIDCError(msg)

    user = User(
        username=username,
        email=email,
        full_name=full_name,
        password_hash=None,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    logger.info("Auto-created user from OIDC", user_id=str(user.id), email=email, provider=provider_name)
    return user


class _OIDCCallbackError(Exception):
    """Internal exception for OIDC callback errors that should redirect to the login page."""

    def __init__(self, message: str, origin: str | None = None) -> None:
        super().__init__(message)
        self.origin = origin


# User-facing error messages for OIDC callback failures
_OIDC_ERR_MISSING_CODE = "Missing authorization code"
_OIDC_ERR_STATE_EXPIRED = "Login session expired. Please try again."
_OIDC_ERR_PROVIDER_UNAVAILABLE = "Identity provider not available"
_OIDC_ERR_DISCOVERY_FAILED = "Failed to connect to identity provider"
_OIDC_ERR_AUTH_FAILED = "Authentication failed. Please try again."
_OIDC_ERR_USER_FAILED = "Unable to sign in. Contact your administrator."


@router.get(
    "/oidc/callback",
    operation_id="oidc_callback",
    summary="OIDC callback",
    description="""
    Handles the OIDC callback after the user authenticates at the identity provider.
    Exchanges the authorization code for tokens, validates the ID token,
    creates or maps a local user, and establishes a session.
    """,
    responses={
        302: {"description": "Redirect to frontend after successful login"},
        401: {"description": "Authentication failed"},
    },
)
async def oidc_callback(
    state: str,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    code: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
) -> RedirectResponse:
    """Handle OIDC callback. Exchanges code for tokens, creates session."""
    try:
        user, provider, state_data = await _process_oidc_callback(
            state=state, db=db, code=code, error=error, error_description=error_description
        )
    except _OIDCCallbackError as e:
        base_url = _get_frontend_base_url(e.origin)
        return RedirectResponse(url=f"{base_url}?auth_error={quote(str(e))}", status_code=302)

    # Create refresh token and session (access token obtained via /refresh on frontend bootstrap)
    token_service = _get_token_service()
    refresh_token_str, jti, _exp = token_service.create_refresh_token(user.id)

    try:
        async with SessionStore() as store:
            await store.create(
                jti=jti,
                user_id=user.id,
                device=request.headers.get("User-Agent"),
                ip_address=request.client.host if request.client else None,
                amr=[AMR_FEDERATED],
                idp=provider.name,
            )
    except (OSError, RedisConnectionError) as exc:
        logger.exception("Redis connection failed during OIDC callback", error=str(exc))
        await db.rollback()
        raise SessionStoreUnavailableError from exc

    # Commit last_login only after Redis session is successfully created
    await db.commit()

    # Redirect to the page the user was on before login, or fall back to frontend URL
    # Re-validate stored origin against current CORS settings in case they changed
    # between the authorize and callback steps (AAP-71277)
    stored_origin = _revalidate_origin(state_data.get("origin"))
    redirect_to = _safe_redirect_url(state_data.get("redirect_to"), origin=stored_origin)
    response = RedirectResponse(url=redirect_to, status_code=302)
    settings = get_settings()
    cookie_max_age = settings.jwt_refresh_token_lifetime_hours * 3600
    set_refresh_cookie(response, refresh_token_str, max_age=cookie_max_age)

    logger.info("OIDC login successful", user_id=str(user.id), provider=provider.name)

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
    - Relative paths (e.g. "/dashboard")
    - URLs whose origin matches the configured frontend URL

    Falls back to the frontend base URL if the input is unsafe or missing.
    """
    base_url = _get_frontend_base_url(origin)

    if not url:
        return base_url

    parsed = urlparse(url)

    # Allow relative paths (no scheme/host)
    if not parsed.scheme and not parsed.netloc:
        # Reject protocol-relative URLs like "//evil.com"
        if url.startswith("//"):
            logger.warning("Rejected protocol-relative redirect URL", url=url)
            return base_url
        return url

    # Allow absolute URLs that match the frontend origin
    base_parsed = urlparse(base_url)
    if parsed.scheme == base_parsed.scheme and parsed.netloc == base_parsed.netloc:
        return url

    logger.warning("Rejected redirect URL with mismatched origin", url=url, expected_origin=base_parsed.netloc)
    return base_url


async def _process_oidc_callback(
    *,
    state: str,
    db: AsyncSession,
    code: str | None,
    error: str | None,
    error_description: str | None,
) -> tuple[User, IdentityProvider, dict[str, str]]:
    """Process the OIDC callback flow. Returns (user, provider, state_data) on success."""
    if error:
        logger.warning("OIDC provider returned error", error=error, description=error_description)
        raise _OIDCCallbackError(error_description or error)

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

        config = provider.configuration

        try:
            discovery = await _get_oidc_endpoints(oidc_service, config)
        except OIDCError as e:
            logger.exception("OIDC endpoint resolution failed during callback")
            raise _OIDCCallbackError(_OIDC_ERR_DISCOVERY_FAILED, origin=origin) from e

        redirect_uri = config.redirect_uri

        try:
            user_claims = await _exchange_and_validate_tokens(
                oidc_service,
                discovery,
                config,
                redirect_uri,
                code,
                state_data["code_verifier"],
                state_data["nonce"],
            )
        except OIDCError as e:
            raise _OIDCCallbackError(_OIDC_ERR_AUTH_FAILED, origin=origin) from e

    try:
        user = await _find_or_create_oidc_user(db, user_claims, provider.name)
    except OIDCError as e:
        raise _OIDCCallbackError(_OIDC_ERR_USER_FAILED, origin=origin) from e

    user.update_last_login()
    db.add(user)

    return user, provider, state_data
