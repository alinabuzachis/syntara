"""Authentication utilities.

This module provides JWT token services, session management, authentication
dependencies, and infrastructure for the Nexus platform.

Submodules:
    - services: Token creation, validation, and key management
    - session: PostgreSQL-based refresh token storage
    - exceptions: Authentication-specific exceptions
    - dependencies: FastAPI dependency injection functions
"""

from nexus.auth.dependencies import get_current_user


def create_service_token() -> str:
    """Mint a short-lived JWT for internal service-to-service calls.

    Uses the system user identity from settings. The token has the same
    lifetime as regular access tokens and is validated through the
    standard ``get_current_user`` dependency — no auth bypass needed.

    Returns:
        Encoded JWT string.

    """
    from nexus.auth.services.token_service import TokenService  # noqa: PLC0415
    from nexus.core.config.base import get_settings  # noqa: PLC0415

    settings = get_settings()
    token_service = TokenService()
    return token_service.create_access_token(
        user_id=settings.system_user_id,
        username="system",
        email="system@nexus.local",
        amr=["service"],
        idp="internal",
    )


__all__ = [
    "create_service_token",
    "get_current_user",
]
