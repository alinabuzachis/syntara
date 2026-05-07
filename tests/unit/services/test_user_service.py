"""Unit tests for UsersService.

Tests cover:
- CRUD operations (create, read, update)
- Duplicate username/email handling
- Admin self-disable restriction
- Error conditions and edge cases
"""

from uuid import uuid4

import pytest
from sqlalchemy import insert
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.auth.exceptions import (
    AdminDeleteError,
    AdminDisableNoOtherAdminsError,
    AdminModifyError,
    UserNotFoundError,
    UserUsernameConflictError,
)
from nexus.auth.passwords import hash_password, verify_password
from nexus.core.models import User
from nexus.core.models.group import Group, user_groups
from nexus.core.models.user_schemas import UserRead
from nexus.users.services.user_service import UsersService


async def _get_or_create_admins_group(session: AsyncSession) -> Group:
    """Return the seeded 'admins' group or create one if absent."""
    result = await session.exec(select(Group).where(Group.name == "admins", Group.deleted_at.is_(None)))  # type: ignore[union-attr]
    group = result.first()
    if group is not None:
        return group
    group = Group(id=uuid4(), name="admins", is_builtin=True, labels={})
    session.add(group)
    await session.flush()
    return group


async def _get_or_create_builtin_admin(session: AsyncSession) -> User:
    """Return the seeded builtin admin user or create one if absent."""
    result = await session.exec(select(User).where(User.is_builtin == True, User.deleted_at.is_(None)))  # type: ignore[union-attr]  # noqa: E712
    user = result.first()
    if user is not None:
        return user
    user = User(
        id=uuid4(),
        username="admin",
        email="admin@example.com",
        full_name="Admin",
        password_hash=hash_password("adminpassword"),
        is_builtin=True,
    )
    session.add(user)
    await session.flush()
    return user


TEST_PASSWORD = "securepassword123"  # noqa: S105


@pytest.mark.asyncio
async def test_create_user_success(test_db_session: AsyncSession, test_user: User) -> None:
    """Test successful user creation."""
    service = UsersService(test_db_session, test_user)

    user = await service.create_user(
        username="newuser",
        email="newuser@example.com",
        full_name="New User",
        password=TEST_PASSWORD,
    )

    assert user.username == "newuser"
    assert user.email == "newuser@example.com"
    assert user.full_name == "New User"
    assert user.is_enabled is True
    assert user.id is not None
    assert user.password_hash is not None
    assert verify_password(TEST_PASSWORD, user.password_hash)


@pytest.mark.asyncio
async def test_create_user_inactive(test_db_session: AsyncSession, test_user: User) -> None:
    """Test user creation with is_enabled=False."""
    service = UsersService(test_db_session, test_user)

    user = await service.create_user(
        username="inactiveuser",
        email="inactive@example.com",
        full_name="Inactive User",
        password=TEST_PASSWORD,
        is_enabled=False,
    )

    assert user.is_enabled is False


@pytest.mark.asyncio
async def test_create_user_duplicate_username(test_db_session: AsyncSession, test_user: User) -> None:
    """Test UserUsernameConflictError on duplicate username."""
    service = UsersService(test_db_session, test_user)

    await service.create_user(
        username="dupuser",
        email="dup1@example.com",
        full_name="Dup User 1",
        password=TEST_PASSWORD,
    )

    with pytest.raises(UserUsernameConflictError):
        await service.create_user(
            username="dupuser",
            email="dup2@example.com",
            full_name="Dup User 2",
            password=TEST_PASSWORD,
        )


@pytest.mark.asyncio
async def test_create_user_duplicate_email_allowed(test_db_session: AsyncSession, test_user: User) -> None:
    """Test that duplicate emails are allowed for federated identity support."""
    service = UsersService(test_db_session, test_user)

    await service.create_user(
        username="emailuser1",
        email="same@example.com",
        full_name="Email User 1",
        password=TEST_PASSWORD,
    )

    user2 = await service.create_user(
        username="emailuser2",
        email="same@example.com",
        full_name="Email User 2",
        password=TEST_PASSWORD,
    )
    assert user2.email == "same@example.com"
    assert user2.username == "emailuser2"


@pytest.mark.asyncio
async def test_get_user_by_id_success(test_db_session: AsyncSession, test_user: User) -> None:
    """Test successful user retrieval by ID."""
    service = UsersService(test_db_session, test_user)

    created = await service.create_user(
        username="getuser",
        email="getuser@example.com",
        full_name="Get User",
        password=TEST_PASSWORD,
    )

    fetched = await service.get_user_by_id(created.id)

    assert fetched.id == created.id
    assert fetched.username == "getuser"
    assert fetched.email == "getuser@example.com"


@pytest.mark.asyncio
async def test_get_user_by_id_not_found(test_db_session: AsyncSession, test_user: User) -> None:
    """Test UserNotFoundError for non-existent user."""
    service = UsersService(test_db_session, test_user)

    with pytest.raises(UserNotFoundError):
        await service.get_user_by_id(uuid4())


@pytest.mark.asyncio
async def test_update_user_full_name(test_db_session: AsyncSession, test_user: User) -> None:
    """Test successful full_name update."""
    service = UsersService(test_db_session, test_user)

    user = await service.create_user(
        username="updatename",
        email="updatename@example.com",
        full_name="Original Name",
        password=TEST_PASSWORD,
    )

    updated = await service.update_user(user.id, full_name="Updated Name")

    assert updated.full_name == "Updated Name"
    assert updated.email == "updatename@example.com"


@pytest.mark.asyncio
async def test_update_user_email(test_db_session: AsyncSession, test_user: User) -> None:
    """Test successful email update."""
    service = UsersService(test_db_session, test_user)

    user = await service.create_user(
        username="updateemail",
        email="old@example.com",
        full_name="Update Email User",
        password=TEST_PASSWORD,
    )

    updated = await service.update_user(user.id, email="new@example.com")

    assert updated.email == "new@example.com"


@pytest.mark.asyncio
async def test_update_user_email_normalizes_case(test_db_session: AsyncSession, test_user: User) -> None:
    """Test that email is normalized to lowercase on update."""
    service = UsersService(test_db_session, test_user)

    user = await service.create_user(
        username="emailcase",
        email="original@example.com",
        full_name="Email Case User",
        password=TEST_PASSWORD,
    )

    updated = await service.update_user(user.id, email="New@Example.COM")

    assert updated.email == "new@example.com"


@pytest.mark.asyncio
async def test_update_user_is_enabled(test_db_session: AsyncSession, test_user: User) -> None:
    """Test disabling a user."""
    service = UsersService(test_db_session, test_user)

    # Seed an admins group with a member so the guard allows disabling other users
    admins_group = await _get_or_create_admins_group(test_db_session)
    await test_db_session.execute(insert(user_groups).values(user_id=test_user.id, group_id=admins_group.id))
    await test_db_session.flush()

    user = await service.create_user(
        username="disableuser",
        email="disable@example.com",
        full_name="Disable User",
        password=TEST_PASSWORD,
    )

    updated = await service.update_user(user.id, is_enabled=False)

    assert updated.is_enabled is False


@pytest.mark.asyncio
async def test_update_user_duplicate_email_allowed(test_db_session: AsyncSession, test_user: User) -> None:
    """Test that updating to a duplicate email is allowed."""
    service = UsersService(test_db_session, test_user)

    await service.create_user(
        username="emailconflict1",
        email="taken@example.com",
        full_name="Conflict User 1",
        password=TEST_PASSWORD,
    )

    user = await service.create_user(
        username="emailconflict2",
        email="original@example.com",
        full_name="Conflict User 2",
        password=TEST_PASSWORD,
    )

    updated = await service.update_user(user.id, email="taken@example.com")
    assert updated.email == "taken@example.com"


@pytest.mark.asyncio
async def test_update_user_not_found(test_db_session: AsyncSession, test_user: User) -> None:
    """Test UserNotFoundError when updating non-existent user."""
    service = UsersService(test_db_session, test_user)

    with pytest.raises(UserNotFoundError):
        await service.update_user(uuid4(), full_name="New Name")


@pytest.mark.asyncio
async def test_update_user_updates_timestamp(test_db_session: AsyncSession, test_user: User) -> None:
    """Test that updated_at changes after update."""
    service = UsersService(test_db_session, test_user)

    user = await service.create_user(
        username="tsuser",
        email="tsuser@example.com",
        full_name="TS User",
        password=TEST_PASSWORD,
    )
    original_ts = user.updated_at

    updated = await service.update_user(user.id, full_name="TS Updated")

    assert updated.updated_at > original_ts


@pytest.mark.asyncio
async def test_admin_self_disable_allowed(test_db_session: AsyncSession) -> None:
    """Test builtin admin can disable itself when other admins exist."""
    admin = await _get_or_create_builtin_admin(test_db_session)

    # Create another admin user so the guard allows disabling
    other_admin = User(
        id=uuid4(),
        username="otheradmin",
        email="other@example.com",
        full_name="Other Admin",
        password_hash=hash_password("otherpassword"),
    )
    test_db_session.add(other_admin)

    # Seed admins group with both members (clear any pre-seeded memberships first)
    admins_group = await _get_or_create_admins_group(test_db_session)
    await test_db_session.execute(user_groups.delete().where(user_groups.c.group_id == admins_group.id))
    await test_db_session.flush()
    await test_db_session.execute(insert(user_groups).values(user_id=admin.id, group_id=admins_group.id))
    await test_db_session.execute(insert(user_groups).values(user_id=other_admin.id, group_id=admins_group.id))
    await test_db_session.commit()

    # Service running as admin
    service = UsersService(test_db_session, admin)

    updated = await service.update_user(admin.id, is_enabled=False)

    assert updated.is_enabled is False


@pytest.mark.asyncio
async def test_non_admin_cannot_disable_admin(test_db_session: AsyncSession, test_user: User) -> None:
    """Test non-admin user cannot modify the built-in admin."""
    admin = await _get_or_create_builtin_admin(test_db_session)

    # Service running as non-admin test_user
    service = UsersService(test_db_session, test_user)

    with pytest.raises(AdminModifyError):
        await service.update_user(admin.id, is_enabled=False)


@pytest.mark.asyncio
async def test_non_admin_cannot_modify_admin_fields(test_db_session: AsyncSession, test_user: User) -> None:
    """Test non-admin cannot modify the built-in admin's fields."""
    admin = await _get_or_create_builtin_admin(test_db_session)

    service = UsersService(test_db_session, test_user)

    with pytest.raises(AdminModifyError):
        await service.update_user(admin.id, full_name="Updated Admin")


@pytest.mark.asyncio
async def test_list_users_cursor(test_db_session: AsyncSession, test_user: User) -> None:
    """Test listing users with cursor-based pagination."""
    service = UsersService(test_db_session, test_user)

    for i in range(5):
        await service.create_user(
            username=f"listuser{i}",
            email=f"listuser{i}@example.com",
            full_name=f"List User {i}",
            password=TEST_PASSWORD,
        )

    result = await service.list_users_cursor(limit=3)

    assert len(result.resources) == 3
    assert result.next is not None


@pytest.mark.asyncio
async def test_create_user_normalizes_case(test_db_session: AsyncSession, test_user: User) -> None:
    """Test that username and email are normalized to lowercase on creation."""
    service = UsersService(test_db_session, test_user)

    user = await service.create_user(
        username="BobSmith",
        email="Bob@Example.COM",
        full_name="Bob Smith",
        password=TEST_PASSWORD,
    )

    assert user.username == "bobsmith"
    assert user.email == "bob@example.com"


@pytest.mark.asyncio
async def test_is_duplicate_username_error(test_db_session: AsyncSession, test_user: User) -> None:
    """Test _is_duplicate_username_error detects username constraint violations."""
    from sqlalchemy.exc import IntegrityError

    service = UsersService(test_db_session, test_user)

    # Should detect constraint name
    e1 = IntegrityError("ix_users_username_unique violated", None, BaseException())
    assert service._is_duplicate_username_error(e1) is True

    # Should detect Key (username) pattern from DETAIL
    e2 = IntegrityError("DETAIL: Key (username)=(test) already exists.", None, BaseException())
    assert service._is_duplicate_username_error(e2) is True

    # Should not match unrelated errors
    e3 = IntegrityError("foreign key constraint violated on user_id", None, BaseException())
    assert service._is_duplicate_username_error(e3) is False

    # Should not match email constraint
    e4 = IntegrityError("ix_users_email_unique violated", None, BaseException())
    assert service._is_duplicate_username_error(e4) is False


@pytest.mark.asyncio
async def test_update_user_rejects_password_on_federated_user(test_db_session: AsyncSession, test_user: User) -> None:
    """Test that setting a password on a federated user raises PasswordOnFederatedUserError."""
    from nexus.auth.exceptions import PasswordOnFederatedUserError
    from nexus.core.models.user import AuthType

    service = UsersService(test_db_session, test_user)

    federated_user = User(
        id=uuid4(),
        username="feduser",
        email="fed@example.com",
        full_name="Federated User",
        password_hash=None,
        auth_type=AuthType.FEDERATED,
    )
    test_db_session.add(federated_user)
    await test_db_session.commit()
    await test_db_session.refresh(federated_user)

    with pytest.raises(PasswordOnFederatedUserError):
        await service.update_user(federated_user.id, password="shouldfail123")  # noqa: S106


@pytest.mark.asyncio
async def test_to_read_sets_auth_type_local(test_db_session: AsyncSession, test_user: User) -> None:
    """Test to_read sets auth_type='local' for users with a password hash."""
    service = UsersService(test_db_session, test_user)

    user = await service.create_user(
        username="withpass",
        email="withpass@example.com",
        full_name="With Password",
        password=TEST_PASSWORD,
    )

    result = service.to_read(user)

    assert isinstance(result, UserRead)
    assert result.auth_type == "local"
    assert result.username == "withpass"


@pytest.mark.asyncio
async def test_to_read_sets_auth_type_federated(test_db_session: AsyncSession, test_user: User) -> None:
    """Test to_read sets auth_type='federated' for users without a password hash."""
    from nexus.core.models.user import AuthType

    service = UsersService(test_db_session, test_user)

    user = User(
        id=uuid4(),
        username="oidcuser",
        email="oidc@example.com",
        full_name="OIDC User",
        password_hash=None,
        auth_type=AuthType.FEDERATED,
    )
    test_db_session.add(user)
    await test_db_session.commit()
    await test_db_session.refresh(user)

    result = service.to_read(user)

    assert isinstance(result, UserRead)
    assert result.auth_type == "federated"


@pytest.mark.asyncio
async def test_delete_user_success(test_db_session: AsyncSession, test_user: User) -> None:
    """Test successful soft deletion of a user."""
    service = UsersService(test_db_session, test_user)

    user = await service.create_user(
        username="todelete",
        email="todelete@example.com",
        full_name="To Delete",
        password=TEST_PASSWORD,
    )

    # Need an admins group with the test_user so _ensure_other_admins_exist passes
    admins_group = await _get_or_create_admins_group(test_db_session)
    await test_db_session.execute(insert(user_groups).values(user_id=test_user.id, group_id=admins_group.id))
    await test_db_session.flush()

    await service.delete_user(user.id)

    await test_db_session.refresh(user)
    assert user.deleted_at is not None


@pytest.mark.asyncio
async def test_delete_builtin_user_raises_admin_delete_error(test_db_session: AsyncSession, test_user: User) -> None:
    """Test deleting the built-in admin raises AdminDeleteError."""
    admin = await _get_or_create_builtin_admin(test_db_session)

    service = UsersService(test_db_session, test_user)

    with pytest.raises(AdminDeleteError):
        await service.delete_user(admin.id)


@pytest.mark.asyncio
async def test_list_users_with_id_restriction(test_db_session: AsyncSession, test_user: User) -> None:
    """Test listing users with id_restriction returns only matching users."""
    service = UsersService(test_db_session, test_user)

    user1 = await service.create_user(
        username="restricted1",
        email="r1@example.com",
        full_name="R1",
        password=TEST_PASSWORD,
    )
    await service.create_user(
        username="restricted2",
        email="r2@example.com",
        full_name="R2",
        password=TEST_PASSWORD,
    )

    result = await service.list_users_cursor(id_restriction=[user1.id])
    assert len(result.resources) == 1
    assert result.resources[0].id == user1.id


@pytest.mark.asyncio
async def test_list_users_with_empty_id_restriction(test_db_session: AsyncSession, test_user: User) -> None:
    """Test listing users with empty id_restriction returns no users."""
    service = UsersService(test_db_session, test_user)

    await service.create_user(
        username="noaccess",
        email="no@example.com",
        full_name="No",
        password=TEST_PASSWORD,
    )

    result = await service.list_users_cursor(id_restriction=[])
    assert len(result.resources) == 0


@pytest.mark.asyncio
async def test_list_users_with_none_id_restriction(test_db_session: AsyncSession, test_user: User) -> None:
    """Test listing users with id_restriction=None returns all users."""
    service = UsersService(test_db_session, test_user)

    for i in range(3):
        await service.create_user(
            username=f"allaccess{i}",
            email=f"all{i}@example.com",
            full_name=f"All {i}",
            password=TEST_PASSWORD,
        )

    result = await service.list_users_cursor(id_restriction=None)
    assert len(result.resources) >= 3


@pytest.mark.asyncio
async def test_delete_last_admin_raises_error(test_db_session: AsyncSession) -> None:
    """Test deleting the last admin raises AdminDisableNoOtherAdminsError."""
    sole_admin = User(
        id=uuid4(),
        username="soleadmin",
        email="sole@example.com",
        full_name="Sole Admin",
        password_hash=hash_password("adminpassword"),
    )
    test_db_session.add(sole_admin)

    admins_group = await _get_or_create_admins_group(test_db_session)
    await test_db_session.execute(user_groups.delete().where(user_groups.c.group_id == admins_group.id))
    await test_db_session.execute(insert(user_groups).values(user_id=sole_admin.id, group_id=admins_group.id))
    await test_db_session.commit()

    service = UsersService(test_db_session, sole_admin)

    with pytest.raises(AdminDisableNoOtherAdminsError):
        await service.delete_user(sole_admin.id)
