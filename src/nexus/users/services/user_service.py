"""User service layer for business logic.

This service encapsulates user-related business logic, separating it from
HTTP/API concerns in the FastAPI endpoints.
"""

from collections.abc import Iterable
from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import func
from sqlalchemy import insert as sa_insert
from sqlalchemy.exc import IntegrityError
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.auth.exceptions import (
    AdminDeleteError,
    AdminDisableNoOtherAdminsError,
    AdminModifyError,
    GroupNamesNotFoundError,
    PasswordOnFederatedUserError,
    UserEmailConflictError,
    UserUsernameConflictError,
)
from nexus.auth.passwords import hash_password
from nexus.core.models import User
from nexus.core.models.group import Group, user_groups
from nexus.core.models.user import AuthType
from nexus.core.models.user_identity import UserIdentity
from nexus.core.models.user_schemas import (
    UserListResponse,
    UserRead,
)
from nexus.core.queries.user_queries import get_user_by_id
from nexus.core.services import BaseService
from nexus.core.services.extensions import ConvertResourceMixin
from nexus.identity_providers.models.identity_provider import IdentityProvider


class UserConvertResourceMixin(ConvertResourceMixin):
    """User-specific resource conversion to UserRead format."""

    def convert_resource(self, resource: User) -> UserRead:  # type: ignore[override]
        """Convert User to UserRead format."""
        read = UserRead.model_validate(resource)
        read.auth_type = resource.auth_type
        if resource.auth_type == AuthType.LOCAL:
            read.auth_sources = ["Local"]
        return read


class UsersService(BaseService):
    """Service for user business logic.

    This service encapsulates all user-related business operations,
    including CRUD operations and duplicate handling.
    """

    ADMIN_USERNAME = "admin"

    def __init__(self, session: AsyncSession, user: User) -> None:
        """Initialize UsersService with database session and user context."""
        super().__init__(session, user, convert_resource_mixin=UserConvertResourceMixin())

    async def to_read(self, user: User) -> UserRead:
        """Convert a User model to UserRead response."""
        result: UserRead = self.convert_resource_mixin.convert_resource(user)
        if user.auth_type == AuthType.FEDERATED:
            identity_result = await self.session.execute(
                select(IdentityProvider.name)
                .join(UserIdentity, col(UserIdentity.identity_provider_id) == IdentityProvider.id)
                .where(
                    col(UserIdentity.user_id) == user.id,
                    IdentityProvider.deleted_at.is_(None),  # type: ignore[union-attr]
                )
            )
            result.auth_sources = sorted(identity_result.scalars().all())
        return result

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

    async def _commit_with_duplicate_check(self, username: str, email: str | None = None) -> None:
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
                raise UserEmailConflictError(email or "") from e
            raise

    async def create_user(
        self,
        username: str,
        full_name: str,
        password: str,
        *,
        email: str | None = None,
        is_enabled: bool = True,
        group_names: list[str] | None = None,
    ) -> User:
        """Create a new local user.

        Args:
            username: Unique username
            full_name: User's display name
            password: Plaintext password (will be hashed)
            email: Email address (optional)
            is_enabled: Account activation status
            group_names: Groups to assign. None = use setting default, [] = no groups.

        Returns:
            Created user

        Raises:
            UserUsernameConflictError: If username already exists

        """
        username = username.lower()

        user = User(
            id=uuid4(),
            username=username,
            email=email.lower() if email else None,
            full_name=full_name,
            password_hash=hash_password(password),
            is_enabled=is_enabled,
        )

        self.session.add(user)
        await self._commit_with_duplicate_check(username, email=user.email)
        await self.session.refresh(user)

        explicit = group_names is not None
        resolved_names = group_names if explicit else []
        if resolved_names:
            result = await self.session.execute(select(Group).where(col(Group.name).in_(resolved_names)))
            groups = list(result.scalars().all())
            if explicit:
                found_names = {g.name for g in groups}
                missing = [n for n in resolved_names if n not in found_names]
                if missing:
                    raise GroupNamesNotFoundError(missing)
            if groups:
                await self.session.execute(
                    sa_insert(user_groups).values([{"user_id": user.id, "group_id": g.id} for g in groups])
                )
                await self.session.commit()

        return user

    async def list_users_cursor(
        self,
        limit: int = 20,
        cursor: str | None = None,
        sort: str | None = None,
        query_params_items: Iterable[tuple[str, str]] | None = None,
        *,
        include_total: bool = False,
        id_restriction: list[UUID] | None = None,
    ) -> UserListResponse:
        """List users with filtering, sorting, and pagination.

        Args:
            limit: Maximum number of users to return (default 20)
            cursor: Cursor token for pagination
            sort: Sort parameter (e.g., "username", "-created_at")
            query_params_items: Raw query parameter items from request (for filtering)
            include_total: Whether to include total count in response
            id_restriction: Optional list of allowed user IDs to filter by

        Returns:
            UserListResponse with users, pagination metadata, and optional total

        """
        auth_source: str | None = None
        filtered_params: list[tuple[str, str]] = []
        if query_params_items:
            for key, value in query_params_items:
                if key == "auth_source":
                    auth_source = value
                else:
                    filtered_params.append((key, value))

        if auth_source:
            if auth_source == "Local":
                filtered_params.append(("auth_type", "local"))
            else:
                provider_user_ids = await self._get_user_ids_by_provider_name(auth_source)
                if id_restriction is not None:
                    allowed = set(provider_user_ids)
                    id_restriction = [uid for uid in id_restriction if uid in allowed]
                else:
                    id_restriction = provider_user_ids

        response = await self.list_resources(
            model=User,
            response_type=UserListResponse,
            limit=limit,
            cursor=cursor,
            sort=sort or "-created_at",
            query_params_items=filtered_params,
            include_total=include_total,
            id_restriction=id_restriction,
        )

        await self._populate_auth_sources(response)
        return response

    async def _get_user_ids_by_provider_name(self, provider_name: str) -> list[UUID]:
        """Get user IDs linked to a specific identity provider by name."""
        result = await self.session.execute(
            select(UserIdentity.user_id)
            .join(IdentityProvider, col(IdentityProvider.id) == UserIdentity.identity_provider_id)
            .where(
                col(IdentityProvider.name) == provider_name,
                IdentityProvider.deleted_at.is_(None),  # type: ignore[union-attr]
            )
        )
        return list(result.scalars().all())

    async def _populate_auth_sources(self, response: UserListResponse) -> None:
        """Batch-populate auth_sources for federated users in a list response."""
        federated_ids = [r.id for r in response.resources if r.auth_type == AuthType.FEDERATED]
        if not federated_ids:
            return

        result = await self.session.execute(
            select(UserIdentity.user_id, IdentityProvider.name)
            .join(IdentityProvider, col(IdentityProvider.id) == UserIdentity.identity_provider_id)
            .where(
                col(UserIdentity.user_id).in_(federated_ids),
                IdentityProvider.deleted_at.is_(None),  # type: ignore[union-attr]
            )
        )
        provider_map: dict[UUID, list[str]] = {}
        for user_id, provider_name in result.all():
            provider_map.setdefault(user_id, []).append(provider_name)

        for user_read in response.resources:
            if user_read.id in provider_map:
                user_read.auth_sources = sorted(provider_map[user_read.id])

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
        username: str | None = None,
        full_name: str | None = None,
        email: str | None = None,
        password: str | None = None,
        *,
        is_enabled: bool | None = None,
    ) -> User:
        """Update user fields.

        Args:
            user_id: UUID of user to update
            username: New username (optional)
            full_name: New display name (optional)
            email: New email (optional)
            password: New plaintext password (optional, will be hashed)
            is_enabled: New activation status (optional)

        Returns:
            Updated user

        Raises:
            UserNotFoundError: If user not found
            UserUsernameConflictError: If new username conflicts

        """
        target_user = await self.get_user_by_id(user_id)

        # Protect built-in users: only the builtin admin itself can modify its properties.
        # Other admins can only re-enable the account (is_enabled=True with no other changes).
        if target_user.is_builtin:
            self._guard_builtin_update(
                is_self=self.user.id == target_user.id,
                is_enabled=is_enabled,
                username=username,
                full_name=full_name,
                email=email,
                password=password,
            )

        # Prevent disabling a user if it would leave no enabled admins.
        # Note: _guard_builtin_update allows the builtin admin to set is_enabled=False
        # on itself, but this check catches it if no other admins remain.
        if is_enabled is False:
            await self._ensure_other_admins_exist(exclude_user_id=user_id)

        if password is not None and target_user.auth_type == AuthType.FEDERATED:
            raise PasswordOnFederatedUserError(user_id)

        has_changes = False

        if username is not None:
            target_user.username = username.lower()
            has_changes = True

        if full_name is not None:
            target_user.full_name = full_name
            has_changes = True

        if email is not None:
            target_user.email = email.lower()
            has_changes = True

        if password is not None:
            target_user.password_hash = hash_password(password)
            has_changes = True

        if is_enabled is not None:
            target_user.is_enabled = is_enabled
            has_changes = True

        if has_changes:
            target_user.updated_at = datetime.now(UTC)

        await self._commit_with_duplicate_check(target_user.username, email=target_user.email)
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
        if user.is_builtin:
            raise AdminDeleteError
        await self._ensure_other_admins_exist(exclude_user_id=user_id)
        user.soft_delete(self.user.id)
        await self.session.commit()

    @staticmethod
    def _guard_builtin_update(
        *,
        is_self: bool,
        is_enabled: bool | None,
        username: str | None,
        full_name: str | None,
        email: str | None,
        password: str | None,
    ) -> None:
        """Enforce modification rules for the built-in admin user."""
        if is_self:
            # Self can do anything except change protected fields
            if any(field is not None for field in (username, full_name, email)):
                raise AdminModifyError
            return
        # Non-self: only re-enabling is allowed (is_enabled=True, nothing else)
        if is_enabled is not True or any(field is not None for field in (username, full_name, email, password)):
            raise AdminModifyError

    async def _ensure_other_admins_exist(self, exclude_user_id: UUID | None = None) -> None:
        """Raise if disabling/deleting this user would leave no enabled admins.

        Skips the check if the user is not in the admins group.

        Args:
            exclude_user_id: User being disabled/deleted (excluded from count).
                             If None, checks total count without exclusion.

        """
        # Lock the admins group row to serialize concurrent disable/delete
        # operations, preventing a race where two requests both see enough
        # admins and then both disable, leaving zero.
        await self.session.execute(
            select(Group)
            .where(
                col(Group.name) == "admins",
                col(Group.is_builtin).is_(True),
            )
            .with_for_update()
        )

        query = (
            select(func.count())
            .select_from(user_groups)
            .join(Group, col(Group.id) == user_groups.c.group_id)
            .join(User, col(User.id) == user_groups.c.user_id)
            .where(
                col(Group.name) == "admins",
                col(Group.is_builtin).is_(True),
                User.deleted_at.is_(None),  # type: ignore[union-attr]
                col(User.is_enabled).is_(True),
            )
        )
        if exclude_user_id is not None:
            query = query.where(col(User.id) != exclude_user_id)

        result = await self.session.execute(query)
        if result.scalar_one() < 1:
            raise AdminDisableNoOtherAdminsError
