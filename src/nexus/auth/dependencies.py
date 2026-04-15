"""Authentication dependencies for FastAPI endpoints.

This module provides dependency injection functions for authenticating
requests and extracting user information from JWT tokens.

``get_current_user`` trusts the validated access token claims and constructs
a ``User`` object without a database round-trip.  Permission changes
therefore propagate within one access-token lifetime.

Usage:
    from nexus.auth.dependencies import get_current_user

    @app.get("/protected")
    async def protected_route(user: User = Depends(get_current_user)):
        return {"user": user.username}
"""

import threading
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from nexus.auth.cookies import get_refresh_token_from_cookie
from nexus.auth.exceptions import (
    AuthenticationRequiredError,
    InvalidTokenError,
)
from nexus.auth.services.token_service import TokenPayload, TokenService
from nexus.core.models import User

# Optional bearer scheme - doesn't auto-raise 403
bearer_scheme = HTTPBearer(
    auto_error=False,
    scheme_name="bearerAuth",
    bearerFormat="JWT",
    description="JWT token authentication",
)


_token_service_instance: TokenService | None = None
_token_service_lock = threading.Lock()


def _get_token_service() -> TokenService:
    """Get cached token service instance.

    The ``TokenService`` (and its ``KeyManager``) are cached for the
    lifetime of the process.  Call ``clear_token_service_cache`` to
    force a reload (e.g. during emergency key rotation or in tests).

    Thread-safe: uses a lock to prevent concurrent initialization.
    """
    global _token_service_instance  # noqa: PLW0603
    with _token_service_lock:
        if _token_service_instance is None:
            _token_service_instance = TokenService()
        return _token_service_instance


def clear_token_service_cache() -> None:
    """Clear the cached TokenService, forcing a reload on next access.

    Also clears the underlying KeyManager cache so new keys are loaded.
    Use this for emergency key rotation or to prevent cross-test contamination.
    """
    global _token_service_instance  # noqa: PLW0603
    with _token_service_lock:
        _token_service_instance = None


def _user_from_payload(payload: TokenPayload) -> User:
    """Construct a ``User`` instance from validated JWT claims.

    The returned object is **not** attached to any database session.

    Args:
        payload: Decoded and validated access-token payload.

    Returns:
        User populated from token claims.

    Raises:
        InvalidTokenError: If required claims are missing or malformed.

    """
    try:
        user_id = UUID(payload.sub)
    except ValueError as e:
        raise InvalidTokenError from e

    username = payload.preferred_username or payload.sub
    email = payload.email or f"{username}@unknown"
    full_name = payload.name or username

    return User(
        id=user_id,
        username=username,
        email=email,
        full_name=full_name,
        is_active=True,
    )


def get_current_user(
    request: Request,  # noqa: ARG001
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)] = None,
) -> User:
    """Get the current authenticated user from JWT token claims.

    The ``User`` object is constructed entirely from the validated access-token
    claims -- no database round-trip is performed.  Permission or role changes
    therefore take up to one access-token lifetime to propagate to existing
    sessions.

    Args:
        request: FastAPI request object
        credentials: HTTP Bearer credentials

    Returns:
        Authenticated User instance

    Raises:
        AuthenticationRequiredError: If no valid credentials provided
        InvalidTokenError: If token is invalid

    """
    if not credentials:
        raise AuthenticationRequiredError

    # Validate token
    token_service = _get_token_service()
    payload: TokenPayload = token_service.decode_token(
        credentials.credentials,
        token_type="access",  # noqa: S106
    )

    return _user_from_payload(payload)


def get_token_payload(
    request: Request,  # noqa: ARG001
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)] = None,
) -> TokenPayload:
    """Get the validated access token payload.

    Args:
        request: FastAPI request object
        credentials: HTTP Bearer credentials

    Returns:
        Validated token payload with all claims

    Raises:
        AuthenticationRequiredError: If no valid credentials provided
        InvalidTokenError: If token is invalid

    """
    if not credentials:
        raise AuthenticationRequiredError

    token_service = _get_token_service()
    return token_service.decode_token(
        credentials.credentials,
        token_type="access",  # noqa: S106
    )


def get_refresh_token(request: Request) -> str:
    """Extract and validate the refresh token from the request cookie.

    Args:
        request: FastAPI request object

    Returns:
        The raw JWT refresh token string

    Raises:
        AuthenticationRequiredError: If the refresh token cookie is missing

    """
    raw_token = get_refresh_token_from_cookie(request)
    if not raw_token:
        raise AuthenticationRequiredError
    return raw_token
