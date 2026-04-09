"""Group service layer for business logic.

This service encapsulates group-related business logic, separating it from
HTTP/API concerns in the FastAPI endpoints.
"""

from collections.abc import Iterable
from datetime import UTC, datetime
from uuid import UUID, uuid4

import structlog
from sqlalchemy import delete, insert
from sqlalchemy.exc import IntegrityError
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.auth.exceptions import (
    GroupNameConflictError,
    GroupNotFoundError,
    UserAlreadyInGroupError,
    UserNotInGroupError,
)
from nexus.core.exceptions import SafeValueError
from nexus.core.models import User
from nexus.core.models.group import (
    Group,
    GroupListResponse,
    GroupRead,
    user_groups,
)
from nexus.core.models.user_schemas import UserListResponse, UserRead
from nexus.core.queries.user_queries import get_user_by_id
from nexus.core.services import BaseService
from nexus.core.services.extensions import ConvertResourceMixin


class GroupConvertResourceMixin(ConvertResourceMixin):
    """Group-specific resource conversion to GroupRead format."""

    def convert_resource(self, resource: Group) -> GroupRead:  # type: ignore[override]
        """Convert Group to GroupRead format."""
        return GroupRead.model_validate(resource)


logger = structlog.stdlib.get_logger(__name__)


class GroupsService(BaseService):
    """Service for group business logic.

    This service encapsulates all group-related business operations,
    including CRUD operations and duplicate name handling.
    """

    def __init__(self, session: AsyncSession, user: User) -> None:
        """Initialize GroupsService with database session and user context."""
        super().__init__(session, user, convert_resource_mixin=GroupConvertResourceMixin())

    def _is_duplicate_name_error(self, e: IntegrityError) -> bool:
        """Check if IntegrityError is due to duplicate group name.

        Args:
            e: The IntegrityError to check

        Returns:
            True if error is due to duplicate group name constraint

        """
        error_str = str(e)
        return (
            "ix_groups_name_unique" in error_str or "groups.name" in error_str or "duplicate key" in error_str.lower()
        )

    async def _commit_with_duplicate_check(self, group_name: str) -> None:
        """Commit database transaction with duplicate name error handling.

        Args:
            group_name: Name of group being created/updated

        Raises:
            GroupNameConflictError: If duplicate name constraint violated
            IntegrityError: For other integrity constraint violations

        """
        try:
            await self.session.commit()
        except IntegrityError as e:
            await self.session.rollback()
            if self._is_duplicate_name_error(e):
                raise GroupNameConflictError(group_name) from e
            raise

    async def create_group(
        self,
        name: str,
        description: str | None,
    ) -> Group:
        """Create a new group.

        Args:
            name: Group name (must be unique among non-deleted groups)
            description: Optional group description

        Returns:
            Created group

        Raises:
            GroupNameConflictError: If group name already exists

        """
        group = Group(
            id=uuid4(),
            name=name,
            description=description,
            created_by=self.user.id,
        )

        self.session.add(group)
        await self._commit_with_duplicate_check(name)
        await self.session.refresh(group)

        return group

    async def list_groups_cursor(
        self,
        limit: int = 20,
        cursor: str | None = None,
        sort: str | None = None,
        query_params_items: Iterable[tuple[str, str]] | None = None,
        *,
        include_total: bool = False,
    ) -> GroupListResponse:
        """List groups with filtering, sorting, and pagination.

        Args:
            limit: Maximum number of groups to return (default 20)
            cursor: Cursor token for pagination
            sort: Sort parameter (e.g., "name", "-created_at")
            query_params_items: Raw query parameter items from request (for filtering)
            include_total: Whether to include total count in response

        Returns:
            GroupListResponse with groups, pagination metadata, and optional total

        """
        return await self.list_resources(
            model=Group,
            response_type=GroupListResponse,
            limit=limit,
            cursor=cursor,
            sort=sort or "-created_at",
            query_params_items=query_params_items,
            include_total=include_total,
        )

    async def get_group_by_id(self, group_id: UUID) -> Group:
        """Get a group by ID.

        Args:
            group_id: Group UUID

        Returns:
            Group instance

        Raises:
            GroupNotFoundError: If group not found or deleted

        """
        result = await self.session.exec(
            select(Group).filter(
                Group.id == group_id,  # type: ignore[arg-type]
                Group.deleted_at.is_(None),  # type: ignore[union-attr]
            )
        )
        group = result.one_or_none()

        if not group:
            raise GroupNotFoundError(group_id)

        return group

    async def update_group(
        self,
        group_id: UUID,
        name: str | None = None,
        description: str | None = None,
    ) -> Group:
        """Update group fields.

        Args:
            group_id: UUID of group to update
            name: New name (optional)
            description: New description (optional)

        Returns:
            Updated group

        Raises:
            GroupNotFoundError: If group not found
            GroupNameConflictError: If new name conflicts
            SafeValueError: If name is empty

        """
        group = await self.get_group_by_id(group_id)

        has_changes = False

        if name is not None:
            if not name:
                msg = "Group name cannot be empty"
                raise SafeValueError(msg)
            group.name = name
            has_changes = True

        if description is not None:
            group.description = description
            has_changes = True

        if has_changes:
            group.updated_at = datetime.now(UTC)

        await self._commit_with_duplicate_check(group.name)
        await self.session.refresh(group)

        return group

    async def delete_group(self, group_id: UUID) -> None:
        """Soft delete a group.

        Args:
            group_id: UUID of group to delete

        Raises:
            GroupNotFoundError: If group not found

        """
        group = await self.get_group_by_id(group_id)
        group.soft_delete(self.user.id)
        await self.session.commit()

    # ========================================================================
    # Membership operations
    # ========================================================================

    async def add_member(self, group_id: UUID, user_id: UUID) -> None:
        """Add a user to a group.

        Args:
            group_id: UUID of the group
            user_id: UUID of the user to add

        Raises:
            GroupNotFoundError: If group not found
            UserNotFoundError: If user not found
            UserAlreadyInGroupError: If user is already a member

        """
        # Validate group and user exist
        await self.get_group_by_id(group_id)
        await get_user_by_id(self.session, user_id)

        # Check if membership already exists
        # Race condition note (TOCTOU): a concurrent request could insert the
        # same membership between this SELECT and the INSERT below.  The
        # composite primary key constraint on user_groups(user_id, group_id)
        # will raise IntegrityError in that case, which we catch and convert
        # to the appropriate user-facing error.
        result = await self.session.exec(
            select(user_groups.c.user_id).where(
                user_groups.c.user_id == user_id,
                user_groups.c.group_id == group_id,
            )
        )
        if result.one_or_none() is not None:
            raise UserAlreadyInGroupError(user_id, group_id)

        # Insert membership
        try:
            await self.session.exec(insert(user_groups).values(user_id=user_id, group_id=group_id))
            await self.session.commit()
        except IntegrityError as e:
            await self.session.rollback()
            raise UserAlreadyInGroupError(user_id, group_id) from e

    async def remove_member(self, group_id: UUID, user_id: UUID) -> None:
        """Remove a user from a group.

        Args:
            group_id: UUID of the group
            user_id: UUID of the user to remove

        Raises:
            GroupNotFoundError: If group not found
            UserNotFoundError: If user not found
            UserNotInGroupError: If user is not a member

        """
        # Validate group and user exist
        await self.get_group_by_id(group_id)
        await get_user_by_id(self.session, user_id)

        # Check membership exists
        result = await self.session.exec(
            select(user_groups.c.user_id).where(
                user_groups.c.user_id == user_id,
                user_groups.c.group_id == group_id,
            )
        )
        if result.one_or_none() is None:
            raise UserNotInGroupError(user_id, group_id)

        # Delete membership
        await self.session.exec(
            delete(user_groups).where(
                user_groups.c.user_id == user_id,
                user_groups.c.group_id == group_id,
            )
        )
        await self.session.commit()

    async def list_members(
        self,
        group_id: UUID,
        limit: int = 20,
        cursor: str | None = None,
    ) -> UserListResponse:
        """List members of a group with cursor-based pagination.

        Args:
            group_id: UUID of the group
            limit: Maximum number of members to return
            cursor: Pagination cursor (user ID to start after)

        Returns:
            UserListResponse with group members

        Raises:
            GroupNotFoundError: If group not found

        """
        # Validate group exists
        await self.get_group_by_id(group_id)

        # Build query for group members
        query = (
            select(User)
            .join(user_groups, User.id == user_groups.c.user_id)  # type: ignore[arg-type]
            .where(
                user_groups.c.group_id == group_id,
                User.deleted_at.is_(None),  # type: ignore[union-attr]
            )
            .order_by(col(User.username))
        )

        # Apply cursor if provided
        if cursor:
            query = query.where(col(User.username) > cursor)

        # Fetch N+1 to detect next page
        result = await self.session.exec(query.limit(limit + 1))
        users = list(result.all())

        has_next = len(users) > limit
        if has_next:
            users = users[:limit]

        next_cursor = users[-1].username if has_next and users else None

        return UserListResponse(
            resources=[UserRead.model_validate(u) for u in users],
            next=next_cursor,
        )

    async def list_user_groups(
        self,
        user_id: UUID,
        limit: int = 20,
        cursor: str | None = None,
    ) -> GroupListResponse:
        """List groups that a user belongs to with cursor-based pagination.

        Args:
            user_id: UUID of the user
            limit: Maximum number of groups to return
            cursor: Pagination cursor (group name to start after)

        Returns:
            GroupListResponse with user's groups

        Raises:
            UserNotFoundError: If user not found

        """
        # Validate user exists
        await get_user_by_id(self.session, user_id)

        # Build query for user's groups
        query = (
            select(Group)
            .join(user_groups, Group.id == user_groups.c.group_id)  # type: ignore[arg-type]
            .where(
                user_groups.c.user_id == user_id,
                Group.deleted_at.is_(None),  # type: ignore[union-attr]
            )
            .order_by(col(Group.name))
        )

        # Apply cursor if provided
        if cursor:
            query = query.where(col(Group.name) > cursor)

        # Fetch N+1 to detect next page
        result = await self.session.exec(query.limit(limit + 1))
        groups = list(result.all())

        has_next = len(groups) > limit
        if has_next:
            groups = groups[:limit]

        next_cursor = groups[-1].name if has_next and groups else None

        return GroupListResponse(
            resources=[GroupRead.model_validate(g) for g in groups],
            next=next_cursor,
        )

    async def set_user_groups(self, user_id: UUID, group_ids: list[UUID]) -> GroupListResponse:
        """Set a user's group memberships declaratively.

        Replace all current memberships with the provided list of group IDs.
        An empty list removes the user from all groups.

        Args:
            user_id: UUID of the user
            group_ids: Complete list of group IDs the user should belong to

        Returns:
            GroupListResponse with the user's updated groups

        Raises:
            UserNotFoundError: If user not found
            GroupNotFoundError: If any group ID does not exist

        """
        # Validate user exists
        await get_user_by_id(self.session, user_id)

        # Validate all desired groups exist (deduplicate first)
        desired = set(group_ids)
        if desired:
            result = await self.session.exec(
                select(Group.id).filter(
                    col(Group.id).in_(desired),
                    Group.deleted_at.is_(None),  # type: ignore[union-attr]
                )
            )
            found = set(result.all())
            missing = desired - found
            if missing:
                raise GroupNotFoundError(next(iter(missing)))

        # Get current memberships
        # Race condition note (TOCTOU): concurrent set_user_groups calls for
        # the same user could interleave between this SELECT and the
        # DELETE/INSERT below.  The composite PK on user_groups prevents
        # duplicate rows, and we catch IntegrityError to handle the rare
        # collision gracefully.  A SELECT ... FOR UPDATE on the membership
        # rows would serialise concurrent calls but adds lock contention;
        # the current approach is acceptable given the low frequency of
        # admin-initiated group changes.
        result = await self.session.exec(select(user_groups.c.group_id).where(user_groups.c.user_id == user_id))
        current = set(result.all())

        # Compute diff
        to_add = desired - current
        to_remove = current - desired

        # Remove old memberships
        if to_remove:
            await self.session.exec(
                delete(user_groups).where(
                    user_groups.c.user_id == user_id,
                    user_groups.c.group_id.in_(to_remove),
                )
            )

        # Add new memberships
        if to_add:
            try:
                await self.session.exec(
                    insert(user_groups),
                    params=[{"user_id": user_id, "group_id": gid} for gid in to_add],
                )
            except IntegrityError:
                await self.session.rollback()
                # Rollback undoes both the DELETE and INSERT.  A concurrent
                # request modified memberships, so re-read the actual state
                # and return it rather than committing an empty transaction.
                logger.info(
                    "Concurrent group membership change, returning current state",
                    user_id=str(user_id),
                )
                return await self.list_user_groups(user_id)

        await self.session.commit()

        # Return updated group list
        return await self.list_user_groups(user_id)
