"""Unit tests for GroupsService membership operations.

Tests cover:
- Adding members to groups
- Removing members from groups
- Listing group members
- Listing user groups
- Declarative set_user_groups
- Error conditions (not found, duplicate)
"""

from uuid import uuid4

import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.auth.exceptions import (
    GroupNotFoundError,
    UserAlreadyInGroupError,
    UserNotFoundError,
    UserNotInGroupError,
)
from nexus.auth.passwords import hash_password
from nexus.core.models import User
from nexus.core.models.group import Group
from nexus.users.services.group_service import GroupsService

TEST_PASSWORD = "securepassword123"  # noqa: S105


async def _create_test_user(session: AsyncSession, username: str, email: str) -> User:
    """Create a test user directly in the database."""
    user = User(
        id=uuid4(),
        username=username,
        email=email,
        full_name=f"Test {username}",
        password_hash=hash_password(TEST_PASSWORD),
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def _create_test_group(session: AsyncSession, name: str, created_by: User) -> Group:
    """Create a test group directly in the database."""
    group = Group(
        id=uuid4(),
        name=name,
        description=f"Test group {name}",
        created_by=created_by.id,
    )
    session.add(group)
    await session.commit()
    await session.refresh(group)
    return group


@pytest.mark.asyncio
async def test_add_member_success(test_db_session: AsyncSession, test_user: User) -> None:
    """Test successfully adding a user to a group."""
    service = GroupsService(test_db_session, test_user)
    group = await _create_test_group(test_db_session, "membership-group", test_user)
    member = await _create_test_user(test_db_session, "member1", "member1@example.com")

    await service.add_member(group.id, member.id)

    # Verify membership via list_members
    result = await service.list_members(group.id)
    assert len(result.resources) == 1
    assert result.resources[0].id == member.id


@pytest.mark.asyncio
async def test_add_member_already_exists(test_db_session: AsyncSession, test_user: User) -> None:
    """Test UserAlreadyInGroupError on duplicate membership."""
    service = GroupsService(test_db_session, test_user)
    group = await _create_test_group(test_db_session, "dup-group", test_user)
    member = await _create_test_user(test_db_session, "dupmember", "dupmember@example.com")

    await service.add_member(group.id, member.id)

    with pytest.raises(UserAlreadyInGroupError):
        await service.add_member(group.id, member.id)


@pytest.mark.asyncio
async def test_add_member_group_not_found(test_db_session: AsyncSession, test_user: User) -> None:
    """Test GroupNotFoundError when group does not exist."""
    service = GroupsService(test_db_session, test_user)

    with pytest.raises(GroupNotFoundError):
        await service.add_member(uuid4(), test_user.id)


@pytest.mark.asyncio
async def test_add_member_user_not_found(test_db_session: AsyncSession, test_user: User) -> None:
    """Test UserNotFoundError when user does not exist."""
    service = GroupsService(test_db_session, test_user)
    group = await _create_test_group(test_db_session, "nouser-group", test_user)

    with pytest.raises(UserNotFoundError):
        await service.add_member(group.id, uuid4())


@pytest.mark.asyncio
async def test_remove_member_success(test_db_session: AsyncSession, test_user: User) -> None:
    """Test successfully removing a member from a group."""
    service = GroupsService(test_db_session, test_user)
    group = await _create_test_group(test_db_session, "remove-group", test_user)
    member = await _create_test_user(test_db_session, "removemember", "remove@example.com")

    await service.add_member(group.id, member.id)
    await service.remove_member(group.id, member.id)

    # Verify membership removed
    result = await service.list_members(group.id)
    assert len(result.resources) == 0


@pytest.mark.asyncio
async def test_remove_member_not_a_member(test_db_session: AsyncSession, test_user: User) -> None:
    """Test UserNotInGroupError when user is not a member."""
    service = GroupsService(test_db_session, test_user)
    group = await _create_test_group(test_db_session, "notmember-group", test_user)

    with pytest.raises(UserNotInGroupError):
        await service.remove_member(group.id, test_user.id)


@pytest.mark.asyncio
async def test_remove_member_group_not_found(test_db_session: AsyncSession, test_user: User) -> None:
    """Test GroupNotFoundError when group does not exist."""
    service = GroupsService(test_db_session, test_user)

    with pytest.raises(GroupNotFoundError):
        await service.remove_member(uuid4(), test_user.id)


@pytest.mark.asyncio
async def test_list_members_empty(test_db_session: AsyncSession, test_user: User) -> None:
    """Test listing members of a group with no members."""
    service = GroupsService(test_db_session, test_user)
    group = await _create_test_group(test_db_session, "empty-group", test_user)

    result = await service.list_members(group.id)

    assert len(result.resources) == 0
    assert result.next is None


@pytest.mark.asyncio
async def test_list_members_with_results(test_db_session: AsyncSession, test_user: User) -> None:
    """Test listing members returns correct users."""
    service = GroupsService(test_db_session, test_user)
    group = await _create_test_group(test_db_session, "populated-group", test_user)

    members = []
    for i in range(3):
        member = await _create_test_user(test_db_session, f"listmember{i}", f"listmember{i}@example.com")
        await service.add_member(group.id, member.id)
        members.append(member)

    result = await service.list_members(group.id)

    assert len(result.resources) == 3
    result_ids = {r.id for r in result.resources}
    for m in members:
        assert m.id in result_ids


@pytest.mark.asyncio
async def test_list_members_pagination(test_db_session: AsyncSession, test_user: User) -> None:
    """Test pagination of group members."""
    service = GroupsService(test_db_session, test_user)
    group = await _create_test_group(test_db_session, "paginate-group", test_user)

    for i in range(5):
        member = await _create_test_user(test_db_session, f"pagemember{i}", f"pagemember{i}@example.com")
        await service.add_member(group.id, member.id)

    # Get first page
    result1 = await service.list_members(group.id, limit=2)
    assert len(result1.resources) == 2
    assert result1.next is not None

    # Get second page using cursor
    result2 = await service.list_members(group.id, limit=2, cursor=result1.next)
    assert len(result2.resources) == 2
    assert result2.next is not None

    # Verify no overlap
    page1_ids = {r.id for r in result1.resources}
    page2_ids = {r.id for r in result2.resources}
    assert page1_ids.isdisjoint(page2_ids)


@pytest.mark.asyncio
async def test_list_members_sorted_by_username(test_db_session: AsyncSession, test_user: User) -> None:
    """Test members are sorted by username."""
    service = GroupsService(test_db_session, test_user)
    group = await _create_test_group(test_db_session, "sort-group", test_user)

    # Create users with specific usernames to verify sorting
    for name in ["charlie_sort", "alice_sort", "bob_sort"]:
        member = await _create_test_user(test_db_session, name, f"{name}@example.com")
        await service.add_member(group.id, member.id)

    result = await service.list_members(group.id)
    usernames = [r.username for r in result.resources]
    assert usernames == sorted(usernames)


@pytest.mark.asyncio
async def test_list_members_group_not_found(test_db_session: AsyncSession, test_user: User) -> None:
    """Test GroupNotFoundError when listing members of non-existent group."""
    service = GroupsService(test_db_session, test_user)

    with pytest.raises(GroupNotFoundError):
        await service.list_members(uuid4())


@pytest.mark.asyncio
async def test_list_user_groups_empty(test_db_session: AsyncSession, test_user: User) -> None:
    """Test listing groups for a user with no memberships."""
    service = GroupsService(test_db_session, test_user)

    result = await service.list_user_groups(test_user.id)

    assert len(result.resources) == 0
    assert result.next is None


@pytest.mark.asyncio
async def test_list_user_groups_with_results(test_db_session: AsyncSession, test_user: User) -> None:
    """Test listing groups for a user with memberships."""
    service = GroupsService(test_db_session, test_user)
    member = await _create_test_user(test_db_session, "groupsuser", "groupsuser@example.com")

    groups = []
    for i in range(3):
        group = await _create_test_group(test_db_session, f"usergroup{i}", test_user)
        await service.add_member(group.id, member.id)
        groups.append(group)

    result = await service.list_user_groups(member.id)

    assert len(result.resources) == 3
    result_ids = {r.id for r in result.resources}
    for g in groups:
        assert g.id in result_ids


@pytest.mark.asyncio
async def test_list_user_groups_pagination(test_db_session: AsyncSession, test_user: User) -> None:
    """Test pagination of user groups."""
    service = GroupsService(test_db_session, test_user)
    member = await _create_test_user(test_db_session, "pageuser", "pageuser@example.com")

    for i in range(5):
        group = await _create_test_group(test_db_session, f"pagegroup{i}", test_user)
        await service.add_member(group.id, member.id)

    # Get first page
    result1 = await service.list_user_groups(member.id, limit=2)
    assert len(result1.resources) == 2
    assert result1.next is not None

    # Get second page using cursor
    result2 = await service.list_user_groups(member.id, limit=2, cursor=result1.next)
    assert len(result2.resources) == 2
    assert result2.next is not None

    # Verify no overlap
    page1_ids = {r.id for r in result1.resources}
    page2_ids = {r.id for r in result2.resources}
    assert page1_ids.isdisjoint(page2_ids)


@pytest.mark.asyncio
async def test_list_user_groups_user_not_found(test_db_session: AsyncSession, test_user: User) -> None:
    """Test UserNotFoundError when listing groups for non-existent user."""
    service = GroupsService(test_db_session, test_user)

    with pytest.raises(UserNotFoundError):
        await service.list_user_groups(uuid4())


@pytest.mark.asyncio
async def test_list_user_groups_sorted_by_name(test_db_session: AsyncSession, test_user: User) -> None:
    """Test user groups are sorted by group name."""
    service = GroupsService(test_db_session, test_user)
    member = await _create_test_user(test_db_session, "sortgroupuser", "sortgroupuser@example.com")

    for name in ["Gamma Group", "Alpha Group", "Beta Group"]:
        group = await _create_test_group(test_db_session, name, test_user)
        await service.add_member(group.id, member.id)

    result = await service.list_user_groups(member.id)
    names = [r.name for r in result.resources]
    assert names == sorted(names)


# ============================================================================
# set_user_groups tests
# ============================================================================


@pytest.mark.asyncio
async def test_set_user_groups_success(test_db_session: AsyncSession, test_user: User) -> None:
    """Test declaratively setting user groups adds new and removes old memberships."""
    service = GroupsService(test_db_session, test_user)
    member = await _create_test_user(test_db_session, "setuser", "setuser@example.com")

    group_a = await _create_test_group(test_db_session, "set-group-a", test_user)
    group_b = await _create_test_group(test_db_session, "set-group-b", test_user)
    group_c = await _create_test_group(test_db_session, "set-group-c", test_user)

    # Start with group_a membership
    await service.add_member(group_a.id, member.id)

    # Set to group_b and group_c (should add b, c and remove a)
    result = await service.set_user_groups(member.id, [group_b.id, group_c.id])

    result_ids = {r.id for r in result.resources}
    assert group_b.id in result_ids
    assert group_c.id in result_ids
    assert group_a.id not in result_ids


@pytest.mark.asyncio
async def test_set_user_groups_empty_clears_all(test_db_session: AsyncSession, test_user: User) -> None:
    """Test that setting empty list removes all memberships."""
    service = GroupsService(test_db_session, test_user)
    member = await _create_test_user(test_db_session, "clearuser", "clearuser@example.com")

    group = await _create_test_group(test_db_session, "clear-group", test_user)
    await service.add_member(group.id, member.id)

    result = await service.set_user_groups(member.id, [])

    assert len(result.resources) == 0


@pytest.mark.asyncio
async def test_set_user_groups_user_not_found(test_db_session: AsyncSession, test_user: User) -> None:
    """Test UserNotFoundError when user does not exist."""
    service = GroupsService(test_db_session, test_user)
    group = await _create_test_group(test_db_session, "orphan-group", test_user)

    with pytest.raises(UserNotFoundError):
        await service.set_user_groups(uuid4(), [group.id])


@pytest.mark.asyncio
async def test_set_user_groups_group_not_found(test_db_session: AsyncSession, test_user: User) -> None:
    """Test GroupNotFoundError when a group ID does not exist."""
    service = GroupsService(test_db_session, test_user)

    with pytest.raises(GroupNotFoundError):
        await service.set_user_groups(test_user.id, [uuid4()])


@pytest.mark.asyncio
async def test_set_user_groups_idempotent(test_db_session: AsyncSession, test_user: User) -> None:
    """Test that setting the same groups twice is a no-op."""
    service = GroupsService(test_db_session, test_user)
    member = await _create_test_user(test_db_session, "idempotentuser", "idempotent@example.com")

    group_a = await _create_test_group(test_db_session, "idem-group-a", test_user)
    group_b = await _create_test_group(test_db_session, "idem-group-b", test_user)

    desired = [group_a.id, group_b.id]

    result1 = await service.set_user_groups(member.id, desired)
    result2 = await service.set_user_groups(member.id, desired)

    ids1 = {r.id for r in result1.resources}
    ids2 = {r.id for r in result2.resources}
    assert ids1 == ids2
