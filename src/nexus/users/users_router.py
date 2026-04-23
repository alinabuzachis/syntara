"""Users CRUD API endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Query, Request, status
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.auth import get_current_user
from nexus.auth.exceptions import UserNotLocalError
from nexus.auth.session.session_store import SessionStore
from nexus.authz.dependencies import PermissionChecker
from nexus.core.database.session import get_db
from nexus.core.models import User
from nexus.core.models.base.query_params import BaseListParams
from nexus.core.models.group import GroupListResponse, UserGroupsSet
from nexus.core.models.user_schemas import (
    UserCreate,
    UserListParams,
    UserListResponse,
    UserRead,
    UserUpdate,
)
from nexus.core.nexus_router import NexusRouter
from nexus.core.queries.user_queries import get_user_by_id as fetch_user
from nexus.users.services.group_service import GroupsService
from nexus.users.services.user_service import UsersService

router = NexusRouter(prefix="/users", tags=["Users"])

_user_create = PermissionChecker("user", "create")
_user_read = PermissionChecker("user", "read")
_user_update = PermissionChecker("user", "update")
_user_delete = PermissionChecker("user", "delete")


# ============================================================================
# Dependency Injection Providers
# ============================================================================


def get_user_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> UsersService:
    """Dependency provider for UsersService."""
    return UsersService(db, current_user)


def get_group_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> GroupsService:
    """Dependency provider for GroupsService (used for user-groups listing)."""
    return GroupsService(db, current_user)


# ============================================================================
# User endpoints
# ============================================================================


@router.post(
    "",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_user_create)],
    operation_id="create_user",
    response_description="User created",
)
async def create_user(
    request: UserCreate,
    service: Annotated[UsersService, Depends(get_user_service)],
) -> User:
    """Create a new local user."""
    return await service.create_user(
        username=request.username,
        email=request.email,
        full_name=request.full_name,
        password=request.password.get_secret_value(),
        is_active=request.is_active,
    )


@router.get("", dependencies=[Depends(_user_read)], operation_id="list_users", response_description="List of users")
async def list_users(
    request: Request,
    service: Annotated[UsersService, Depends(get_user_service)],
    params: Annotated[UserListParams, Query()],
) -> UserListResponse:
    """List users with filtering, sorting, and pagination.

    Uses cursor-based pagination for scalability and consistency.
    """
    return await service.list_users_cursor(
        limit=params.limit,
        cursor=params.cursor,
        sort=params.sort,
        query_params_items=request.query_params.items(),
        include_total=params.include_total,
    )


@router.get(
    "/{user_id}", dependencies=[Depends(_user_read)], operation_id="get_user", response_description="User details"
)
async def get_user(
    user_id: UUID,
    service: Annotated[UsersService, Depends(get_user_service)],
) -> UserRead:
    """Get a user by ID."""
    user = await service.get_user_by_id(user_id)
    return UserRead.model_validate(user)


@router.patch(
    "/{user_id}", dependencies=[Depends(_user_update)], operation_id="update_user", response_description="Updated user"
)
async def update_user(
    user_id: UUID,
    request: UserUpdate,
    service: Annotated[UsersService, Depends(get_user_service)],
) -> UserRead:
    """Update a user.

    Supports partial updates - only provided fields are updated.
    """
    password = request.password.get_secret_value() if request.password else None

    user = await service.update_user(
        user_id,
        full_name=request.full_name,
        email=request.email,
        password=password,
        is_active=request.is_active,
    )

    # When a user's password is changed, revoke all their existing refresh
    # token sessions.  This is a hard requirement — if Redis is unavailable,
    # the request fails so that compromised sessions cannot persist.
    # Note: stateless access tokens remain valid until expiry (default 15
    # minutes) since they cannot be individually revoked.  A token blocklist
    # or generation counter would be needed to close this window completely.
    if password is not None:
        async with SessionStore() as store:
            await store.revoke_all_for_user(user_id)

    # Signal that the user's token claims are stale so the frontend
    # triggers a background refresh on the next API response.
    async with SessionStore() as store:
        await store.increment_token_version(user_id)

    return UserRead.model_validate(user)


@router.delete(
    "/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(_user_delete)],
    operation_id="delete_user",
    response_description="User deleted",
)
async def delete_user(
    user_id: UUID,
    service: Annotated[UsersService, Depends(get_user_service)],
) -> None:
    """Soft delete a user."""
    await service.delete_user(user_id)

    # Signal stale token so the deleted user's next request triggers a
    # refresh attempt, which will fail with 401 (user not found).
    async with SessionStore() as store:
        await store.increment_token_version(user_id)


@router.get(
    "/{user_id}/groups",
    dependencies=[Depends(_user_read)],
    operation_id="list_user_groups",
    response_description="List of groups the user belongs to",
)
async def list_user_groups(
    user_id: UUID,
    service: Annotated[GroupsService, Depends(get_group_service)],
    params: Annotated[BaseListParams, Query()],
) -> GroupListResponse:
    """List groups that a user belongs to."""
    return await service.list_user_groups(
        user_id,
        limit=params.limit,
        cursor=params.cursor,
    )


@router.put(
    "/{user_id}/groups",
    dependencies=[Depends(_user_update)],
    operation_id="set_user_groups",
    response_description="Updated group memberships",
)
async def set_user_groups(
    user_id: UUID,
    request: UserGroupsSet,
    service: Annotated[GroupsService, Depends(get_group_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> GroupListResponse:
    """Set a user's group memberships declaratively.

    Replace all current memberships with the provided list of group IDs.
    An empty list removes the user from all groups.
    """
    user = await fetch_user(db, user_id)
    if user.password_hash is None:
        raise UserNotLocalError(user_id)
    result = await service.set_user_groups(user_id, request.group_ids)
    async with SessionStore() as store:
        await store.increment_token_version(user_id)
    return result
