"""Authentication utilities.

This module provides JWT token services, session management, authentication
dependencies, and infrastructure for the Nexus platform.

Submodules:
    - services: Token creation, validation, and key management
    - session: Redis-based refresh token storage
    - exceptions: Authentication-specific exceptions
    - dependencies: FastAPI dependency injection functions
"""

from nexus.auth.dependencies import get_current_user
from nexus.auth.exceptions import (
    AuthenticationRequiredError,
    InvalidTokenError,
    RefreshTokenRevokedError,
    TokenExpiredError,
)
from nexus.auth.services.token_service import TokenService
from nexus.auth.session.session_store import SessionStore


def create_service_token() -> str:
    """Mint a short-lived JWT for internal service-to-service calls.

    Uses the system user identity from settings. The token has the same
    lifetime as regular access tokens and is validated through the
    standard ``get_current_user`` dependency — no auth bypass needed.

    Returns:
        Encoded JWT string.

    """
    from nexus.core.config.base import get_settings  # noqa: PLC0415

    settings = get_settings()
    token_service = TokenService()
    return token_service.create_access_token(
        user_id=settings.system_user_id,
        username="system",
        email="system@nexus.local",
        role="administrator",
        amr=["service"],
        idp="internal",
    )


__all__ = [
    "AuthenticationRequiredError",
    "InvalidTokenError",
    "RefreshTokenRevokedError",
    "SessionStore",
    "TokenExpiredError",
    "TokenService",
    "create_service_token",
    "get_current_user",
]
