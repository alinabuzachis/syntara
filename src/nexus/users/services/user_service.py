"""User service layer for business logic.

This service encapsulates user-related business logic, separating it from
HTTP/API concerns in the FastAPI endpoints.
"""

from collections.abc import Iterable
from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy.exc import IntegrityError
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.auth.exceptions import (
    AdminDisableByNonAdminError,
    UserEmailConflictError,
    UserUsernameConflictError,
)
from nexus.auth.passwords import hash_password
from nexus.core.models import User
from nexus.core.models.user import UserRole
from nexus.core.models.user_schemas import (
    UserListResponse,
    UserRead,
)
from nexus.core.queries.user_queries import get_user_by_id
from nexus.core.services import BaseService
from nexus.core.services.extensions import ConvertResourceMixin


class UserConvertResourceMixin(ConvertResourceMixin):
    """User-specific resource conversion to UserRead format."""

    def convert_resource(self, resource: User) -> UserRead:  # type: ignore[override]
        """Convert User to UserRead format."""
        return UserRead.model_validate(resource)


class UsersService(BaseService):
    """Service for user business logic.

    This service encapsulates all user-related business operations,
    including CRUD operations and duplicate handling.
    """

    ADMIN_USERNAME = "admin"

    def __init__(self, session: AsyncSession, user: User) -> None:
        """Initialize UsersService with database session and user context."""
        super().__init__(session, user, convert_resource_mixin=UserConvertResourceMixin())

    def _is_duplicate_username_error(self, e: IntegrityError) -> bool:
        """Check if IntegrityError is due to duplicate username.

        Args:
            e: The IntegrityError to check

        Returns:
            True if error is due to duplicate username constraint

        """
        error_str = str(e)
        return "ix_users_username_unique" in error_str or "Key (username)" in error_str

    def _is_duplicate_email_error(self, e: IntegrityError) -> bool:
        """Check if IntegrityError is due to duplicate email.

        Args:
            e: The IntegrityError to check

        Returns:
            True if error is due to duplicate email constraint

        """
        error_str = str(e)
        return "ix_users_email_unique" in error_str or "Key (email)" in error_str

    async def _commit_with_duplicate_check(self, username: str, email: str) -> None:
        """Commit database transaction with duplicate error handling.

        Args:
            username: Username of user being created/updated
            email: Email of user being created/updated

        Raises:
            UserUsernameConflictError: If duplicate username constraint violated
            UserEmailConflictError: If duplicate email constraint violated
            IntegrityError: For other integrity constraint violations

        """
        try:
            await self.session.commit()
        except IntegrityError as e:
            await self.session.rollback()
            if self._is_duplicate_username_error(e):
                raise UserUsernameConflictError(username) from e
            if self._is_duplicate_email_error(e):
                raise UserEmailConflictError(email) from e
            raise

    async def create_user(
        self,
        username: str,
        email: str,
        full_name: str,
        password: str,
        role: UserRole,
        *,
        is_active: bool = True,
    ) -> User:
        """Create a new local user.

        Args:
            username: Unique username
            email: Unique email address
            full_name: User's display name
            password: Plaintext password (will be hashed)
            role: User role
            is_active: Account activation status

        Returns:
            Created user

        Raises:
            UserUsernameConflictError: If username already exists
            UserEmailConflictError: If email already exists

        """
        username = username.lower()
        email = email.lower()

        user = User(
            id=uuid4(),
            username=username,
            email=email,
            full_name=full_name,
            password_hash=hash_password(password),
            role=role,
            is_active=is_active,
        )

        self.session.add(user)
        await self._commit_with_duplicate_check(username, email)
        await self.session.refresh(user)

        return user

    async def list_users_cursor(
        self,
        limit: int = 20,
        cursor: str | None = None,
        sort: str | None = None,
        query_params_items: Iterable[tuple[str, str]] | None = None,
        *,
        include_total: bool = False,
    ) -> UserListResponse:
        """List users with filtering, sorting, and pagination.

        Args:
            limit: Maximum number of users to return (default 20)
            cursor: Cursor token for pagination
            sort: Sort parameter (e.g., "username", "-created_at")
            query_params_items: Raw query parameter items from request (for filtering)
            include_total: Whether to include total count in response

        Returns:
            UserListResponse with users, pagination metadata, and optional total

        """
        return await self.list_resources(
            model=User,
            response_type=UserListResponse,
            limit=limit,
            cursor=cursor,
            sort=sort or "-created_at",
            query_params_items=query_params_items,
            include_total=include_total,
        )

    async def get_user_by_id(self, user_id: UUID) -> User:
        """Get a user by ID.

        Args:
            user_id: User UUID

        Returns:
            User instance

        Raises:
            UserNotFoundError: If user not found or deleted

        """
        return await get_user_by_id(self.session, user_id)

    async def update_user(
        self,
        user_id: UUID,
        full_name: str | None = None,
        email: str | None = None,
        password: str | None = None,
        role: UserRole | None = None,
        *,
        is_active: bool | None = None,
    ) -> User:
        """Update user fields.

        Args:
            user_id: UUID of user to update
            full_name: New display name (optional)
            email: New email (optional)
            password: New plaintext password (optional, will be hashed)
            role: New role (optional)
            is_active: New activation status (optional)

        Returns:
            Updated user

        Raises:
            UserNotFoundError: If user not found
            UserEmailConflictError: If new email conflicts
            AdminDisableByNonAdminError: If non-admin tries to disable built-in admin

        """
        target_user = await self.get_user_by_id(user_id)

        # Check admin self-disable restriction
        if (
            is_active is False
            and target_user.username == self.ADMIN_USERNAME
            and self.user.username != self.ADMIN_USERNAME
        ):
            raise AdminDisableByNonAdminError

        has_changes = False

        if full_name is not None:
            target_user.full_name = full_name
            has_changes = True

        if email is not None:
            target_user.email = email.lower()
            has_changes = True

        if password is not None:
            target_user.password_hash = hash_password(password)
            has_changes = True

        if role is not None:
            target_user.role = role
            has_changes = True

        if is_active is not None:
            target_user.is_active = is_active
            has_changes = True

        if has_changes:
            target_user.updated_at = datetime.now(UTC)

        await self._commit_with_duplicate_check(target_user.username, target_user.email)
        await self.session.refresh(target_user)

        return target_user

    async def delete_user(self, user_id: UUID) -> None:
        """Soft delete a user.

        Args:
            user_id: UUID of user to delete

        Raises:
            UserNotFoundError: If user not found

        """
        user = await self.get_user_by_id(user_id)
        user.soft_delete(self.user.id)
        await self.session.commit()
