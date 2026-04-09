"""Users CRUD API endpoints.

.. todo:: ANSTRAT-1900
   All endpoints in this module require authentication but lack authorization
   guards (e.g. ``require_role(ADMINISTRATOR)``).  Role-based access control
   will be added as part of ANSTRAT-1900.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.auth import get_current_user
from nexus.auth.exceptions import UserNotLocalError
from nexus.auth.session.session_store import SessionStore
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
from nexus.core.queries.user_queries import get_user_by_id as fetch_user
from nexus.users.services.group_service import GroupsService
from nexus.users.services.user_service import UsersService

router = APIRouter(prefix="/users", tags=["Users"])


# ============================================================================
# Dependency Injection Providers
# ============================================================================


def get_user_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> UsersService:
    """Dependency provider for UsersService.

    Args:
        db: Database session
        current_user: Current authenticated user

    Returns:
        UsersService configured with database session and user

    """
    return UsersService(db, current_user)


def get_group_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> GroupsService:
    """Dependency provider for GroupsService (used for user-groups listing).

    Args:
        db: Database session
        current_user: Current authenticated user

    Returns:
        GroupsService configured with database session and user

    """
    return GroupsService(db, current_user)


# ============================================================================
# User endpoints
# ============================================================================


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(  # TODO(ANSTRAT-1900): add authorization guard  # noqa: TD003
    request: UserCreate,
    service: Annotated[UsersService, Depends(get_user_service)],
) -> User:
    """Create a new local user.

    Args:
        request: User creation request
        service: User service

    Returns:
        Created user

    Raises:
        HTTPException: 409 if username or email already exists

    """
    return await service.create_user(
        username=request.username,
        email=request.email,
        full_name=request.full_name,
        password=request.password.get_secret_value(),
        role=request.role,
        is_active=request.is_active,
    )


@router.get("")
async def list_users(  # TODO(ANSTRAT-1900): add authorization guard  # noqa: TD003
    request: Request,
    service: Annotated[UsersService, Depends(get_user_service)],
    params: Annotated[UserListParams, Query()],
) -> UserListResponse:
    """List users with filtering, sorting, and pagination.

    Uses cursor-based pagination for scalability and consistency.

    Args:
        request: FastAPI request object containing query parameters
        service: User service
        params: Query parameters for pagination and filtering

    Returns:
        UserListResponse with users, pagination metadata, and optional total

    """
    return await service.list_users_cursor(
        limit=params.limit,
        cursor=params.cursor,
        sort=params.sort,
        query_params_items=request.query_params.items(),
        include_total=params.include_total,
    )


@router.get("/{user_id}")
async def get_user(  # TODO(ANSTRAT-1900): add authorization guard  # noqa: TD003
    user_id: UUID,
    service: Annotated[UsersService, Depends(get_user_service)],
) -> UserRead:
    """Get a user by ID.

    Args:
        user_id: User UUID
        service: User service

    Returns:
        User data

    Raises:
        HTTPException: 404 if user not found or deleted

    """
    user = await service.get_user_by_id(user_id)
    return UserRead.model_validate(user)


@router.patch("/{user_id}")
async def update_user(  # TODO(ANSTRAT-1900): add authorization guard  # noqa: TD003
    user_id: UUID,
    request: UserUpdate,
    service: Annotated[UsersService, Depends(get_user_service)],
) -> UserRead:
    """Update a user.

    Supports partial updates - only provided fields are updated.

    Args:
        user_id: User UUID
        request: Update request with optional fields
        service: User service

    Returns:
        Updated user

    Raises:
        HTTPException: 404 if user not found, 409 for email conflict, 403 for admin disable

    """
    password = request.password.get_secret_value() if request.password else None

    user = await service.update_user(
        user_id,
        full_name=request.full_name,
        email=request.email,
        password=password,
        role=request.role,
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

    return UserRead.model_validate(user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(  # TODO(ANSTRAT-1900): add authorization guard  # noqa: TD003
    user_id: UUID,
    service: Annotated[UsersService, Depends(get_user_service)],
) -> None:
    """Soft delete a user.

    Args:
        user_id: User UUID
        service: User service

    Raises:
        HTTPException: 404 if user not found

    """
    await service.delete_user(user_id)


@router.get("/{user_id}/groups")
async def list_user_groups(  # TODO(ANSTRAT-1900): add authorization guard  # noqa: TD003
    user_id: UUID,
    service: Annotated[GroupsService, Depends(get_group_service)],
    params: Annotated[BaseListParams, Query()],
) -> GroupListResponse:
    """List groups that a user belongs to.

    Args:
        user_id: User UUID
        service: Group service
        params: Query parameters for pagination

    Returns:
        GroupListResponse with user's groups

    Raises:
        HTTPException: 404 if user not found

    """
    return await service.list_user_groups(
        user_id,
        limit=params.limit,
        cursor=params.cursor,
    )


@router.put("/{user_id}/groups")
async def set_user_groups(  # TODO(ANSTRAT-1900): add authorization guard  # noqa: TD003
    user_id: UUID,
    request: UserGroupsSet,
    service: Annotated[GroupsService, Depends(get_group_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> GroupListResponse:
    """Set a user's group memberships declaratively.

    Replace all current memberships with the provided list of group IDs.
    An empty list removes the user from all groups.

    Args:
        user_id: User UUID
        request: Request with the complete list of group IDs
        service: Group service
        db: Database session

    Returns:
        GroupListResponse with the user's updated groups

    Raises:
        HTTPException: 404 if user or any group not found, 403 if non-local user

    """
    user = await fetch_user(db, user_id)
    if user.password_hash is None:
        raise UserNotLocalError(user_id)
    return await service.set_user_groups(user_id, request.group_ids)
