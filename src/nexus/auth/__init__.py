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

__all__ = [
    "AuthenticationRequiredError",
    "InvalidTokenError",
    "RefreshTokenRevokedError",
    "SessionStore",
    "TokenExpiredError",
    "TokenService",
    "get_current_user",
]
