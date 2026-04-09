"""Unit tests for GroupsService.

Tests cover:
- CRUD operations (create, read, update, delete)
- Duplicate name handling
- Soft delete behavior
- Error conditions and edge cases
"""

from uuid import uuid4

import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.auth.exceptions import GroupNameConflictError, GroupNotFoundError
from nexus.core.exceptions import SafeValueError
from nexus.core.models import User
from nexus.users.services.group_service import GroupsService


@pytest.mark.asyncio
async def test_create_group_success(test_db_session: AsyncSession, test_user: User) -> None:
    """Test successful group creation."""
    service = GroupsService(test_db_session, test_user)

    group = await service.create_group(name="engineering", description="Engineering team")

    assert group.name == "engineering"
    assert group.description == "Engineering team"
    assert group.created_by == test_user.id
    assert group.id is not None
    assert group.created_at is not None
    assert group.updated_at is not None
    assert group.deleted_at is None


@pytest.mark.asyncio
async def test_create_group_without_description(test_db_session: AsyncSession, test_user: User) -> None:
    """Test group creation without optional description."""
    service = GroupsService(test_db_session, test_user)

    group = await service.create_group(name="admins", description=None)

    assert group.name == "admins"
    assert group.description is None


@pytest.mark.asyncio
async def test_create_group_duplicate_name(test_db_session: AsyncSession, test_user: User) -> None:
    """Test group creation with duplicate name raises GroupNameConflictError."""
    service = GroupsService(test_db_session, test_user)

    await service.create_group(name="duplicate", description=None)

    with pytest.raises(GroupNameConflictError):
        await service.create_group(name="duplicate", description=None)


@pytest.mark.asyncio
async def test_get_group_by_id_success(test_db_session: AsyncSession, test_user: User) -> None:
    """Test successful group retrieval by ID."""
    service = GroupsService(test_db_session, test_user)

    created = await service.create_group(name="get-test", description="Test group")
    fetched = await service.get_group_by_id(created.id)

    assert fetched.id == created.id
    assert fetched.name == "get-test"
    assert fetched.description == "Test group"


@pytest.mark.asyncio
async def test_get_group_by_id_not_found(test_db_session: AsyncSession, test_user: User) -> None:
    """Test GroupNotFoundError for non-existent group."""
    service = GroupsService(test_db_session, test_user)

    with pytest.raises(GroupNotFoundError):
        await service.get_group_by_id(uuid4())


@pytest.mark.asyncio
async def test_get_group_by_id_deleted(test_db_session: AsyncSession, test_user: User) -> None:
    """Test GroupNotFoundError for soft-deleted group."""
    service = GroupsService(test_db_session, test_user)

    group = await service.create_group(name="to-delete", description=None)
    await service.delete_group(group.id)

    with pytest.raises(GroupNotFoundError):
        await service.get_group_by_id(group.id)


@pytest.mark.asyncio
async def test_update_group_name(test_db_session: AsyncSession, test_user: User) -> None:
    """Test successful group name update."""
    service = GroupsService(test_db_session, test_user)

    group = await service.create_group(name="old-name", description="desc")
    updated = await service.update_group(group.id, name="new-name")

    assert updated.name == "new-name"
    assert updated.description == "desc"


@pytest.mark.asyncio
async def test_update_group_description(test_db_session: AsyncSession, test_user: User) -> None:
    """Test successful group description update."""
    service = GroupsService(test_db_session, test_user)

    group = await service.create_group(name="desc-test", description="old desc")
    updated = await service.update_group(group.id, description="new desc")

    assert updated.name == "desc-test"
    assert updated.description == "new desc"


@pytest.mark.asyncio
async def test_update_group_empty_name_raises(test_db_session: AsyncSession, test_user: User) -> None:
    """Test SafeValueError for empty name update."""
    service = GroupsService(test_db_session, test_user)

    group = await service.create_group(name="empty-test", description=None)

    with pytest.raises(SafeValueError, match="Group name cannot be empty"):
        await service.update_group(group.id, name="")


@pytest.mark.asyncio
async def test_update_group_name_conflict(test_db_session: AsyncSession, test_user: User) -> None:
    """Test GroupNameConflictError when updating to existing name."""
    service = GroupsService(test_db_session, test_user)

    await service.create_group(name="taken-name", description=None)
    group = await service.create_group(name="original-name", description=None)

    with pytest.raises(GroupNameConflictError):
        await service.update_group(group.id, name="taken-name")


@pytest.mark.asyncio
async def test_update_group_not_found(test_db_session: AsyncSession, test_user: User) -> None:
    """Test GroupNotFoundError when updating non-existent group."""
    service = GroupsService(test_db_session, test_user)

    with pytest.raises(GroupNotFoundError):
        await service.update_group(uuid4(), name="new-name")


@pytest.mark.asyncio
async def test_update_group_updates_timestamp(test_db_session: AsyncSession, test_user: User) -> None:
    """Test that updated_at changes after update."""
    service = GroupsService(test_db_session, test_user)

    group = await service.create_group(name="ts-test", description=None)
    original_ts = group.updated_at

    updated = await service.update_group(group.id, name="ts-test-updated")

    assert updated.updated_at > original_ts


@pytest.mark.asyncio
async def test_update_group_no_changes_preserves_timestamp(test_db_session: AsyncSession, test_user: User) -> None:
    """Test that updated_at is unchanged when no fields are provided."""
    service = GroupsService(test_db_session, test_user)

    group = await service.create_group(name="noop-test", description=None)
    original_ts = group.updated_at

    updated = await service.update_group(group.id)

    assert updated.updated_at == original_ts


@pytest.mark.asyncio
async def test_delete_group_success(test_db_session: AsyncSession, test_user: User) -> None:
    """Test successful soft delete sets deleted_at."""
    service = GroupsService(test_db_session, test_user)

    group = await service.create_group(name="delete-me", description=None)
    await service.delete_group(group.id)

    # Verify the group is no longer findable via service
    with pytest.raises(GroupNotFoundError):
        await service.get_group_by_id(group.id)


@pytest.mark.asyncio
async def test_delete_group_not_found(test_db_session: AsyncSession, test_user: User) -> None:
    """Test GroupNotFoundError when deleting non-existent group."""
    service = GroupsService(test_db_session, test_user)

    with pytest.raises(GroupNotFoundError):
        await service.delete_group(uuid4())


@pytest.mark.asyncio
async def test_delete_group_allows_name_reuse(test_db_session: AsyncSession, test_user: User) -> None:
    """Test that deleting a group frees its name for reuse."""
    service = GroupsService(test_db_session, test_user)

    group = await service.create_group(name="reusable-name", description=None)
    await service.delete_group(group.id)

    # Should succeed: partial unique index excludes deleted rows
    new_group = await service.create_group(name="reusable-name", description=None)
    assert new_group.name == "reusable-name"
    assert new_group.id != group.id


@pytest.mark.asyncio
async def test_list_groups_cursor(test_db_session: AsyncSession, test_user: User) -> None:
    """Test listing groups with cursor-based pagination."""
    service = GroupsService(test_db_session, test_user)

    for i in range(5):
        await service.create_group(name=f"list-group-{i}", description=None)

    result = await service.list_groups_cursor(limit=3)

    assert len(result.resources) == 3
    assert result.next is not None


@pytest.mark.asyncio
async def test_list_groups_excludes_deleted(test_db_session: AsyncSession, test_user: User) -> None:
    """Test that deleted groups are excluded from listing."""
    service = GroupsService(test_db_session, test_user)

    group = await service.create_group(name="will-be-deleted", description=None)
    await service.create_group(name="stays-visible", description=None)
    await service.delete_group(group.id)

    result = await service.list_groups_cursor()

    names = [g.name for g in result.resources]
    assert "will-be-deleted" not in names
    assert "stays-visible" in names


@pytest.mark.asyncio
async def test_is_duplicate_name_error(test_db_session: AsyncSession, test_user: User) -> None:
    """Test _is_duplicate_name_error detects duplicate name constraint violations."""
    from sqlalchemy.exc import IntegrityError

    service = GroupsService(test_db_session, test_user)

    # Should detect constraint name
    e1 = IntegrityError("ix_groups_name_unique violated", None, BaseException())
    assert service._is_duplicate_name_error(e1) is True

    # Should detect column reference
    e2 = IntegrityError("duplicate key on groups.name", None, BaseException())
    assert service._is_duplicate_name_error(e2) is True

    # Should detect general duplicate key
    e3 = IntegrityError("Duplicate key value violates constraint", None, BaseException())
    assert service._is_duplicate_name_error(e3) is True

    # Should not match unrelated errors
    e4 = IntegrityError("foreign key constraint violated on user_id", None, BaseException())
    assert service._is_duplicate_name_error(e4) is False
