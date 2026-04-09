"""Groups CRUD API endpoints.

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
from nexus.core.database.session import get_db
from nexus.core.models import User
from nexus.core.models.base.query_params import BaseListParams
from nexus.core.models.group import (
    Group,
    GroupCreate,
    GroupListParams,
    GroupListResponse,
    GroupMemberAdd,
    GroupMemberAddResponse,
    GroupRead,
    GroupUpdate,
)
from nexus.core.models.user_schemas import UserListResponse
from nexus.core.queries.user_queries import get_user_by_id as get_user
from nexus.users.services.group_service import GroupsService

router = APIRouter(prefix="/groups", tags=["Groups"])


# ============================================================================
# Dependency Injection Providers
# ============================================================================


def get_group_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> GroupsService:
    """Dependency provider for GroupsService.

    Args:
        db: Database session
        current_user: Current authenticated user

    Returns:
        GroupsService configured with database session and user

    """
    return GroupsService(db, current_user)


# ============================================================================
# Group endpoints
# ============================================================================


@router.post("", response_model=GroupRead, status_code=status.HTTP_201_CREATED)
async def create_group(  # TODO(ANSTRAT-1900): add authorization guard  # noqa: TD003
    request: GroupCreate,
    service: Annotated[GroupsService, Depends(get_group_service)],
) -> Group:
    """Create a new group.

    Args:
        request: Group creation request
        service: Group service

    Returns:
        Created group

    Raises:
        HTTPException: 409 if group name already exists

    """
    return await service.create_group(
        name=request.name,
        description=request.description,
    )


@router.get("")
async def list_groups(  # TODO(ANSTRAT-1900): add authorization guard  # noqa: TD003
    request: Request,
    service: Annotated[GroupsService, Depends(get_group_service)],
    params: Annotated[GroupListParams, Query()],
) -> GroupListResponse:
    """List groups with filtering, sorting, and pagination.

    Uses cursor-based pagination for scalability and consistency.

    Args:
        request: FastAPI request object containing query parameters
        service: Group service
        params: Query parameters for pagination and filtering

    Returns:
        GroupListResponse with groups, pagination metadata, and optional total

    """
    return await service.list_groups_cursor(
        limit=params.limit,
        cursor=params.cursor,
        sort=params.sort,
        query_params_items=request.query_params.items(),
        include_total=params.include_total,
    )


@router.get("/{group_id}")
async def get_group(  # TODO(ANSTRAT-1900): add authorization guard  # noqa: TD003
    group_id: UUID,
    service: Annotated[GroupsService, Depends(get_group_service)],
) -> GroupRead:
    """Get a group by ID.

    Args:
        group_id: Group UUID
        service: Group service

    Returns:
        Group data

    Raises:
        HTTPException: 404 if group not found or deleted

    """
    group = await service.get_group_by_id(group_id)
    return GroupRead.model_validate(group)


@router.patch("/{group_id}")
async def update_group(  # TODO(ANSTRAT-1900): add authorization guard  # noqa: TD003
    group_id: UUID,
    request: GroupUpdate,
    service: Annotated[GroupsService, Depends(get_group_service)],
) -> GroupRead:
    """Update a group.

    Supports partial updates - only provided fields are updated.

    Args:
        group_id: Group UUID
        request: Update request with optional fields
        service: Group service

    Returns:
        Updated group

    Raises:
        HTTPException: 404 if group not found, 409 for name conflict

    """
    group = await service.update_group(
        group_id=group_id,
        name=request.name,
        description=request.description,
    )
    return GroupRead.model_validate(group)


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(  # TODO(ANSTRAT-1900): add authorization guard  # noqa: TD003
    group_id: UUID,
    service: Annotated[GroupsService, Depends(get_group_service)],
) -> None:
    """Soft delete a group.

    Args:
        group_id: Group UUID
        service: Group service

    Raises:
        HTTPException: 404 if group not found

    """
    await service.delete_group(group_id)


# ============================================================================
# Membership endpoints
# ============================================================================


def _ensure_local_user(user: User) -> None:
    """Verify that a user is a local user (has a password hash).

    Args:
        user: User instance to check

    Raises:
        UserNotLocalError: If the user is not a local user

    """
    if user.password_hash is None:
        raise UserNotLocalError(user.id)


@router.post("/{group_id}/members", status_code=status.HTTP_201_CREATED)
async def add_member(  # TODO(ANSTRAT-1900): add authorization guard  # noqa: TD003
    group_id: UUID,
    request: GroupMemberAdd,
    service: Annotated[GroupsService, Depends(get_group_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> GroupMemberAddResponse:
    """Add a user to a group.

    Args:
        group_id: Group UUID
        request: Membership request with user_id
        service: Group service
        db: Database session

    Returns:
        Confirmation message

    Raises:
        HTTPException: 404 if group/user not found, 403 if non-local user, 409 if already a member

    """
    user = await get_user(db, request.user_id)
    _ensure_local_user(user)
    await service.add_member(group_id, request.user_id)
    return GroupMemberAddResponse()


@router.delete("/{group_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(  # TODO(ANSTRAT-1900): add authorization guard  # noqa: TD003
    group_id: UUID,
    user_id: UUID,
    service: Annotated[GroupsService, Depends(get_group_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Remove a user from a group.

    Args:
        group_id: Group UUID
        user_id: User UUID
        service: Group service
        db: Database session

    Raises:
        HTTPException: 404 if group not found or user is not a member, 403 if non-local user

    """
    user = await get_user(db, user_id)
    _ensure_local_user(user)
    await service.remove_member(group_id, user_id)


@router.get("/{group_id}/members")
async def list_members(  # TODO(ANSTRAT-1900): add authorization guard  # noqa: TD003
    group_id: UUID,
    service: Annotated[GroupsService, Depends(get_group_service)],
    params: Annotated[BaseListParams, Query()],
) -> UserListResponse:
    """List members of a group.

    Args:
        group_id: Group UUID
        service: Group service
        params: Query parameters for pagination

    Returns:
        UserListResponse with group members

    Raises:
        HTTPException: 404 if group not found

    """
    return await service.list_members(
        group_id,
        limit=params.limit,
        cursor=params.cursor,
    )
