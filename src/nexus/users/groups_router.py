"""Groups CRUD API endpoints."""

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
from nexus.core.nexus_router import NexusRouter
from nexus.core.queries.user_queries import get_user_by_id as get_user
from nexus.users.services.group_service import GroupsService

router = NexusRouter(prefix="/groups", tags=["Groups"])

_group_create = PermissionChecker("group", "create", roles=["admin"])
_group_read = PermissionChecker("group", "read", roles=["admin", "auditor", "user", "default"])
_group_update = PermissionChecker("group", "update", roles=["admin"])
_group_delete = PermissionChecker("group", "delete", roles=["admin"])
_group_member_manage = PermissionChecker("group", "manage-members", roles=["admin"])


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


@router.post(
    "",
    response_model=GroupRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_group_create)],
    operation_id="create_group",
    response_description="Group created",
)
async def create_group(
    request: GroupCreate,
    service: Annotated[GroupsService, Depends(get_group_service)],
) -> Group:
    """Create a new group for organizing users."""
    return await service.create_group(
        name=request.name,
        description=request.description,
    )


@router.get("", dependencies=[Depends(_group_read)], operation_id="list_groups", response_description="List of groups")
async def list_groups(
    request: Request,
    service: Annotated[GroupsService, Depends(get_group_service)],
    params: Annotated[GroupListParams, Query()],
) -> GroupListResponse:
    """Retrieve list of groups with filtering and pagination."""
    return await service.list_groups_cursor(
        limit=params.limit,
        cursor=params.cursor,
        sort=params.sort,
        query_params_items=request.query_params.items(),
        include_total=params.include_total,
    )


@router.get(
    "/{group_id}", dependencies=[Depends(_group_read)], operation_id="get_group", response_description="Group details"
)
async def get_group(
    group_id: UUID,
    service: Annotated[GroupsService, Depends(get_group_service)],
) -> GroupRead:
    """Retrieve a group by its UUID."""
    group = await service.get_group_by_id(group_id)
    count = await service.get_member_count(group)
    return service.enrich_group_read(group, count)


@router.patch(
    "/{group_id}",
    dependencies=[Depends(_group_update)],
    operation_id="update_group",
    response_description="Updated group",
)
async def update_group(
    group_id: UUID,
    request: GroupUpdate,
    service: Annotated[GroupsService, Depends(get_group_service)],
) -> GroupRead:
    """Update a group partially; only provided fields are changed."""
    group = await service.update_group(
        group_id=group_id,
        name=request.name,
        description=request.description,
    )
    count = await service.get_member_count(group)
    return service.enrich_group_read(group, count)


@router.delete(
    "/{group_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(_group_delete)],
    operation_id="delete_group",
    response_description="Group deleted",
)
async def delete_group(
    group_id: UUID,
    service: Annotated[GroupsService, Depends(get_group_service)],
) -> None:
    """Soft delete a group."""
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


@router.post(
    "/{group_id}/members",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_group_member_manage)],
    operation_id="add_member",
    response_description="Member added",
)
async def add_member(
    group_id: UUID,
    request: GroupMemberAdd,
    service: Annotated[GroupsService, Depends(get_group_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> GroupMemberAddResponse:
    """Add a local user to a group."""
    user = await get_user(db, request.user_id)
    _ensure_local_user(user)
    await service.add_member(group_id, request.user_id)
    async with SessionStore() as store:
        await store.increment_token_version(request.user_id)
    return GroupMemberAddResponse()


@router.delete(
    "/{group_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(_group_member_manage)],
    operation_id="remove_member",
    response_description="Member removed",
)
async def remove_member(
    group_id: UUID,
    user_id: UUID,
    service: Annotated[GroupsService, Depends(get_group_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Remove a user from a group."""
    user = await get_user(db, user_id)
    _ensure_local_user(user)
    await service.remove_member(group_id, user_id)
    async with SessionStore() as store:
        await store.increment_token_version(user_id)


@router.get(
    "/{group_id}/members",
    dependencies=[Depends(_group_read)],
    operation_id="list_members",
    response_description="List of group members",
)
async def list_members(
    group_id: UUID,
    service: Annotated[GroupsService, Depends(get_group_service)],
    params: Annotated[BaseListParams, Query()],
) -> UserListResponse:
    """List members of a group with pagination."""
    return await service.list_members(
        group_id,
        limit=params.limit,
        cursor=params.cursor,
    )
