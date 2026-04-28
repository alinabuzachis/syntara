"""Authentication and authorization exceptions.

This module defines exception classes for authentication, group management,
and user management errors, following the existing pattern using
@fastapi_exception decorator for automatic registration with FastAPI's
exception handlers.

All exceptions use RFC 9457 Problem Details format for consistent error responses.
"""

from uuid import UUID

from nexus.core.exception_registry import fastapi_exception
from nexus.core.exceptions import NexusError


class AuthError(NexusError):
    """Base exception for all authentication errors."""


@fastapi_exception(handler="nexus.auth.error_handlers.session_store_unavailable_handler")
class SessionStoreUnavailableError(AuthError):
    """Raised when the session store (Redis) is unreachable (503 Service Unavailable)."""

    def __init__(self, message: str = "Session service is temporarily unavailable") -> None:
        """Initialize the exception.

        Args:
            message: Human-readable error message

        """
        self.message = message
        super().__init__(message)


@fastapi_exception(handler="nexus.auth.error_handlers.authentication_required_handler")
class AuthenticationRequiredError(AuthError):
    """Raised when no valid credentials are provided (401 Unauthorized).

    This exception is raised when:
    - No Authorization header is provided
    - The Authorization header is malformed
    - The token is invalid or cannot be decoded
    """

    def __init__(self, message: str = "Authentication required") -> None:
        """Initialize the exception.

        Args:
            message: Human-readable error message

        """
        self.message = message
        super().__init__(message)


@fastapi_exception(handler="nexus.auth.error_handlers.token_expired_handler")
class TokenExpiredError(AuthError):
    """Raised when an access or refresh token has expired (401 Unauthorized).

    This exception is raised when:
    - Access token exp claim is in the past
    - Refresh token exp claim is in the past
    """

    def __init__(self, message: str = "Token has expired") -> None:
        """Initialize the exception.

        Args:
            message: Human-readable error message

        """
        self.message = message
        super().__init__(message)


@fastapi_exception(handler="nexus.auth.error_handlers.invalid_token_handler")
class InvalidTokenError(AuthError):
    """Raised when token validation fails for reasons other than expiration.

    This exception is raised when:
    - Token signature is invalid
    - Token issuer doesn't match
    - Token type claim doesn't match expected type
    - Required claims are missing
    """

    def __init__(self, message: str = "Invalid token") -> None:
        """Initialize the exception.

        Args:
            message: Human-readable error message

        """
        self.message = message
        super().__init__(message)


@fastapi_exception(handler="nexus.auth.error_handlers.refresh_token_revoked_handler")
class RefreshTokenRevokedError(AuthError):
    """Raised when a refresh token has been revoked.

    This exception is raised when:
    - Refresh token JTI is not found in Redis (already revoked or expired)
    - Rotated refresh token is used after grace period
    """

    def __init__(self, message: str = "Refresh token has been revoked") -> None:
        """Initialize the exception.

        Args:
            message: Human-readable error message

        """
        self.message = message
        super().__init__(message)


# ============================================================================
# Group management exceptions
# ============================================================================


class GroupError(AuthError):
    """Base exception for all group errors."""


@fastapi_exception(handler="nexus.auth.error_handlers.group_not_found_handler")
class GroupNotFoundError(GroupError):
    """Raised when a group is not found."""

    def __init__(self, group_id: UUID) -> None:
        """Initialize exception with group ID.

        Args:
            group_id: UUID of the group that was not found

        """
        self.group_id = group_id
        super().__init__(f"Group {group_id} not found")


@fastapi_exception(handler="nexus.auth.error_handlers.group_name_conflict_handler")
class GroupNameConflictError(GroupError):
    """Raised when a group name already exists."""

    def __init__(self, name: str) -> None:
        """Initialize exception with group name.

        Args:
            name: The conflicting group name

        """
        self.name = name
        super().__init__(f"Group with name '{name}' already exists")


# ============================================================================
# User management exceptions
# ============================================================================


class UserError(AuthError):
    """Base exception for all user errors."""


@fastapi_exception(handler="nexus.auth.error_handlers.user_identity_not_found_handler")
class UserIdentityNotFoundError(UserError):
    """Raised when a user identity is not found."""

    def __init__(self, identity_id: UUID) -> None:
        """Initialize exception with identity ID.

        Args:
            identity_id: UUID of the identity that was not found

        """
        self.identity_id = identity_id
        super().__init__(f"User identity {identity_id} not found")


@fastapi_exception(handler="nexus.auth.error_handlers.last_sign_in_method_handler")
class LastSignInMethodError(UserError):
    """Raised when attempting to remove the only sign-in method for a user."""

    def __init__(self) -> None:
        """Initialize exception."""
        super().__init__("Cannot remove the only sign-in method. Add a password or another identity first.")


@fastapi_exception(handler="nexus.auth.error_handlers.user_not_found_handler")
class UserNotFoundError(UserError):
    """Raised when a user is not found."""

    def __init__(self, user_id: UUID) -> None:
        """Initialize exception with user ID.

        Args:
            user_id: UUID of the user that was not found

        """
        self.user_id = user_id
        super().__init__(f"User {user_id} not found")


@fastapi_exception(handler="nexus.auth.error_handlers.user_username_conflict_handler")
class UserUsernameConflictError(UserError):
    """Raised when a username already exists."""

    def __init__(self, username: str) -> None:
        """Initialize exception with username.

        Args:
            username: The conflicting username

        """
        self.username = username
        super().__init__(f"User with username '{username}' already exists")


@fastapi_exception(handler="nexus.auth.error_handlers.admin_modify_handler")
class AdminModifyError(UserError):
    """Raised when attempting to modify protected properties of the built-in admin."""

    def __init__(self) -> None:
        """Initialize exception."""
        super().__init__("The built-in admin account properties cannot be modified")


@fastapi_exception(handler="nexus.auth.error_handlers.admin_delete_handler")
class AdminDeleteError(UserError):
    """Raised when attempting to delete the built-in admin."""

    def __init__(self) -> None:
        """Initialize exception."""
        super().__init__("The built-in admin account cannot be deleted")


@fastapi_exception(handler="nexus.auth.error_handlers.admin_disable_no_other_admins_handler")
class AdminDisableNoOtherAdminsError(UserError):
    """Raised when disabling a user would leave no enabled members in the admins group."""

    def __init__(self) -> None:
        """Initialize exception."""
        super().__init__("Cannot disable the last enabled user in the admins group")


# ============================================================================
# Group membership exceptions
# ============================================================================


@fastapi_exception(handler="nexus.auth.error_handlers.last_admin_removal_handler")
class LastAdminRemovalError(UserError):
    """Raised when removing the last enabled admin from the admins group."""

    def __init__(self) -> None:
        """Initialize exception."""
        super().__init__("Cannot remove the last enabled admin user from the admins group")


@fastapi_exception(handler="nexus.auth.error_handlers.builtin_group_delete_handler")
class BuiltinGroupDeleteError(UserError):
    """Raised when attempting to delete a builtin system group."""

    def __init__(self, group_name: str) -> None:
        """Initialize exception."""
        super().__init__(f"The built-in '{group_name}' group cannot be deleted")


class MembershipError(NexusError):
    """Base exception for all membership errors."""


@fastapi_exception(handler="nexus.auth.error_handlers.user_already_in_group_handler")
class UserAlreadyInGroupError(MembershipError):
    """Raised when a user is already a member of the group."""

    def __init__(self, user_id: UUID, group_id: UUID) -> None:
        """Initialize exception with user and group IDs.

        Args:
            user_id: UUID of the user
            group_id: UUID of the group

        """
        self.user_id = user_id
        self.group_id = group_id
        super().__init__(f"User {user_id} is already a member of group {group_id}")


@fastapi_exception(handler="nexus.auth.error_handlers.user_not_in_group_handler")
class UserNotInGroupError(MembershipError):
    """Raised when a user is not a member of the group."""

    def __init__(self, user_id: UUID, group_id: UUID) -> None:
        """Initialize exception with user and group IDs.

        Args:
            user_id: UUID of the user
            group_id: UUID of the group

        """
        self.user_id = user_id
        self.group_id = group_id
        super().__init__(f"User {user_id} is not a member of group {group_id}")


@fastapi_exception(handler="nexus.auth.error_handlers.user_not_local_handler")
class UserNotLocalError(MembershipError):
    """Raised when a non-local user is used in a group membership operation."""

    def __init__(self, user_id: UUID) -> None:
        """Initialize exception with user ID.

        Args:
            user_id: UUID of the non-local user

        """
        self.user_id = user_id
        super().__init__(f"User {user_id} is not a local user")
