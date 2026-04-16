"""RFC 9457 compliant error handlers for authentication exceptions.

This module provides error handlers for authentication and authorization
exceptions, returning responses in RFC 9457 Problem Details format.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import structlog
from fastapi import Request, status

from nexus.core.error_handlers import PROBLEM_TYPES, create_problem_details_response

if TYPE_CHECKING:
    from fastapi.responses import JSONResponse

    from nexus.auth.exceptions import (
        AdminDisableByNonAdminError,
        AuthenticationRequiredError,
        GroupNameConflictError,
        GroupNotFoundError,
        InvalidTokenError,
        RefreshTokenRevokedError,
        SessionStoreUnavailableError,
        TokenExpiredError,
        UserAlreadyInGroupError,
        UserEmailConflictError,
        UserNotFoundError,
        UserNotInGroupError,
        UserNotLocalError,
        UserUsernameConflictError,
    )

logger = structlog.stdlib.get_logger(__name__)


def session_store_unavailable_handler(
    request: Request,
    exc: SessionStoreUnavailableError,
) -> JSONResponse:
    """Handle SessionStoreUnavailableError with RFC 9457 format."""
    # Strip query string to avoid leaking sensitive params (e.g. OIDC code/state)
    safe_url = str(request.url).split("?", 1)[0]

    logger.error(
        "Session store unavailable",
        path=safe_url,
        method=request.method,
    )

    return create_problem_details_response(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        problem_type=PROBLEM_TYPES["service_unavailable"],
        title="Service Unavailable",
        detail=exc.message,
        code="SESSION_STORE_UNAVAILABLE",
        retryable=True,
        instance=safe_url,
    )


def authentication_required_handler(
    request: Request,
    exc: AuthenticationRequiredError,
) -> JSONResponse:
    """Handle AuthenticationRequiredError with RFC 9457 format.

    Args:
        request: FastAPI request object
        exc: The authentication required exception

    Returns:
        RFC 9457 compliant 401 error response

    """
    logger.warning(
        "Authentication required",
        path=str(request.url),
        method=request.method,
    )

    return create_problem_details_response(
        status_code=status.HTTP_401_UNAUTHORIZED,
        problem_type=PROBLEM_TYPES["unauthorized"],
        title="Unauthorized",
        detail=exc.message,
        code="AUTHENTICATION_REQUIRED",
        retryable=False,
        instance=str(request.url),
    )


def token_expired_handler(
    request: Request,
    exc: TokenExpiredError,
) -> JSONResponse:
    """Handle TokenExpiredError with RFC 9457 format.

    Args:
        request: FastAPI request object
        exc: The token expired exception

    Returns:
        RFC 9457 compliant 401 error response

    """
    logger.warning(
        "Token expired",
        path=str(request.url),
        method=request.method,
    )

    return create_problem_details_response(
        status_code=status.HTTP_401_UNAUTHORIZED,
        problem_type=PROBLEM_TYPES["token_expired"],
        title="Token Expired",
        detail=exc.message,
        code="TOKEN_EXPIRED",
        retryable=False,
        instance=str(request.url),
    )


def invalid_token_handler(
    request: Request,
    exc: InvalidTokenError,
) -> JSONResponse:
    """Handle InvalidTokenError with RFC 9457 format.

    Args:
        request: FastAPI request object
        exc: The invalid token exception

    Returns:
        RFC 9457 compliant 401 error response

    """
    logger.warning(
        "Invalid token",
        path=str(request.url),
        method=request.method,
    )

    return create_problem_details_response(
        status_code=status.HTTP_401_UNAUTHORIZED,
        problem_type=PROBLEM_TYPES["unauthorized"],
        title="Unauthorized",
        detail=exc.message,
        code="INVALID_TOKEN",
        retryable=False,
        instance=str(request.url),
    )


def refresh_token_revoked_handler(
    request: Request,
    exc: RefreshTokenRevokedError,
) -> JSONResponse:
    """Handle RefreshTokenRevokedError with RFC 9457 format.

    Args:
        request: FastAPI request object
        exc: The refresh token revoked exception

    Returns:
        RFC 9457 compliant 401 error response

    """
    logger.warning(
        "Refresh token revoked",
        path=str(request.url),
        method=request.method,
    )

    return create_problem_details_response(
        status_code=status.HTTP_401_UNAUTHORIZED,
        problem_type=PROBLEM_TYPES["unauthorized"],
        title="Unauthorized",
        detail=exc.message,
        code="REFRESH_TOKEN_REVOKED",
        retryable=False,
        instance=str(request.url),
    )


def group_not_found_handler(
    request: Request,
    exc: GroupNotFoundError,
) -> JSONResponse:
    """Handle GroupNotFoundError with RFC 9457 format.

    Args:
        request: FastAPI request object
        exc: The group not found exception

    Returns:
        RFC 9457 compliant 404 error response

    """
    logger.warning("Group not found", exc_info=exc)

    return create_problem_details_response(
        status_code=status.HTTP_404_NOT_FOUND,
        problem_type=PROBLEM_TYPES["resource_not_found"],
        title="Group Not Found",
        detail="The requested group was not found",
        code="GROUP_NOT_FOUND",
        retryable=False,
        instance=str(request.url),
    )


def group_name_conflict_handler(
    request: Request,
    exc: GroupNameConflictError,
) -> JSONResponse:
    """Handle GroupNameConflictError with RFC 9457 format.

    Args:
        request: FastAPI request object
        exc: The group name conflict exception

    Returns:
        RFC 9457 compliant 409 error response

    """
    logger.warning("Group name conflict", exc_info=exc)

    return create_problem_details_response(
        status_code=status.HTTP_409_CONFLICT,
        problem_type=PROBLEM_TYPES["name_conflict"],
        title="Group Name Conflict",
        detail="A group with this name already exists",
        code="GROUP_NAME_CONFLICT",
        retryable=False,
        instance=str(request.url),
    )


# ============================================================================
# User error handlers
# ============================================================================


def user_not_found_handler(
    request: Request,
    exc: UserNotFoundError,
) -> JSONResponse:
    """Handle UserNotFoundError with RFC 9457 format.

    Args:
        request: FastAPI request object
        exc: The user not found exception

    Returns:
        RFC 9457 compliant 404 error response

    """
    logger.warning("User not found", exc_info=exc)

    return create_problem_details_response(
        status_code=status.HTTP_404_NOT_FOUND,
        problem_type=PROBLEM_TYPES["resource_not_found"],
        title="User Not Found",
        detail="The requested user was not found",
        code="USER_NOT_FOUND",
        retryable=False,
        instance=str(request.url),
    )


def user_username_conflict_handler(
    request: Request,
    exc: UserUsernameConflictError,
) -> JSONResponse:
    """Handle UserUsernameConflictError with RFC 9457 format.

    Args:
        request: FastAPI request object
        exc: The username conflict exception

    Returns:
        RFC 9457 compliant 409 error response

    """
    logger.warning("Username conflict", exc_info=exc)

    return create_problem_details_response(
        status_code=status.HTTP_409_CONFLICT,
        problem_type=PROBLEM_TYPES["name_conflict"],
        title="Username Conflict",
        detail="A user with this username already exists",
        code="USER_USERNAME_CONFLICT",
        retryable=False,
        instance=str(request.url),
    )


def user_email_conflict_handler(
    request: Request,
    exc: UserEmailConflictError,
) -> JSONResponse:
    """Handle UserEmailConflictError with RFC 9457 format.

    Args:
        request: FastAPI request object
        exc: The email conflict exception

    Returns:
        RFC 9457 compliant 409 error response

    """
    logger.warning("Email conflict", exc_info=exc)

    return create_problem_details_response(
        status_code=status.HTTP_409_CONFLICT,
        problem_type=PROBLEM_TYPES["resource_conflict"],
        title="Email Conflict",
        detail="A user with this email already exists",
        code="USER_EMAIL_CONFLICT",
        retryable=False,
        instance=str(request.url),
    )


def admin_disable_by_non_admin_handler(
    request: Request,
    exc: AdminDisableByNonAdminError,
) -> JSONResponse:
    """Handle AdminDisableByNonAdminError with RFC 9457 format.

    Args:
        request: FastAPI request object
        exc: The admin self-disable exception

    Returns:
        RFC 9457 compliant 403 error response

    """
    logger.warning("Admin disable attempted by non-admin user", exc_info=exc)

    return create_problem_details_response(
        status_code=status.HTTP_403_FORBIDDEN,
        problem_type=PROBLEM_TYPES["forbidden"],
        title="Forbidden",
        detail="The built-in admin account can only be disabled by itself",
        code="ADMIN_SELF_DISABLE_REQUIRED",
        retryable=False,
        instance=str(request.url),
    )


# ============================================================================
# Membership error handlers
# ============================================================================


def user_already_in_group_handler(
    request: Request,
    exc: UserAlreadyInGroupError,
) -> JSONResponse:
    """Handle UserAlreadyInGroupError with RFC 9457 format.

    Args:
        request: FastAPI request object
        exc: The user already in group exception

    Returns:
        RFC 9457 compliant 409 error response

    """
    logger.warning("User already in group", exc_info=exc)

    return create_problem_details_response(
        status_code=status.HTTP_409_CONFLICT,
        problem_type=PROBLEM_TYPES["resource_conflict"],
        title="Membership Conflict",
        detail="The user is already a member of this group",
        code="USER_ALREADY_IN_GROUP",
        retryable=False,
        instance=str(request.url),
    )


def user_not_in_group_handler(
    request: Request,
    exc: UserNotInGroupError,
) -> JSONResponse:
    """Handle UserNotInGroupError with RFC 9457 format.

    Args:
        request: FastAPI request object
        exc: The user not in group exception

    Returns:
        RFC 9457 compliant 404 error response

    """
    logger.warning("User not in group", exc_info=exc)

    return create_problem_details_response(
        status_code=status.HTTP_404_NOT_FOUND,
        problem_type=PROBLEM_TYPES["resource_not_found"],
        title="Membership Not Found",
        detail="The user is not a member of this group",
        code="USER_NOT_IN_GROUP",
        retryable=False,
        instance=str(request.url),
    )


def user_not_local_handler(
    request: Request,
    exc: UserNotLocalError,
) -> JSONResponse:
    """Handle UserNotLocalError with RFC 9457 format.

    Args:
        request: FastAPI request object
        exc: The user not local exception

    Returns:
        RFC 9457 compliant 403 error response

    """
    logger.warning("Non-local user used in group membership operation", exc_info=exc)

    return create_problem_details_response(
        status_code=status.HTTP_403_FORBIDDEN,
        problem_type=PROBLEM_TYPES["forbidden"],
        title="Local User Required",
        detail="Only local users can be assigned group memberships",
        code="USER_NOT_LOCAL",
        retryable=False,
        instance=str(request.url),
    )
