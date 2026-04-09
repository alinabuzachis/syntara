"""Unit tests for UsersService.

Tests cover:
- CRUD operations (create, read, update)
- Duplicate username/email handling
- Admin self-disable restriction
- Error conditions and edge cases
"""

from uuid import uuid4

import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.auth.exceptions import (
    AdminDisableByNonAdminError,
    UserEmailConflictError,
    UserNotFoundError,
    UserUsernameConflictError,
)
from nexus.auth.passwords import verify_password
from nexus.core.models import User, UserRole
from nexus.users.services.user_service import UsersService

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
        role=UserRole.CREATOR,
    )

    assert user.username == "newuser"
    assert user.email == "newuser@example.com"
    assert user.full_name == "New User"
    assert user.role == UserRole.CREATOR
    assert user.is_active is True
    assert user.id is not None
    assert user.password_hash is not None
    assert verify_password(TEST_PASSWORD, user.password_hash)


@pytest.mark.asyncio
async def test_create_user_inactive(test_db_session: AsyncSession, test_user: User) -> None:
    """Test user creation with is_active=False."""
    service = UsersService(test_db_session, test_user)

    user = await service.create_user(
        username="inactiveuser",
        email="inactive@example.com",
        full_name="Inactive User",
        password=TEST_PASSWORD,
        role=UserRole.VIEWER,
        is_active=False,
    )

    assert user.is_active is False


@pytest.mark.asyncio
async def test_create_user_duplicate_username(test_db_session: AsyncSession, test_user: User) -> None:
    """Test UserUsernameConflictError on duplicate username."""
    service = UsersService(test_db_session, test_user)

    await service.create_user(
        username="dupuser",
        email="dup1@example.com",
        full_name="Dup User 1",
        password=TEST_PASSWORD,
        role=UserRole.VIEWER,
    )

    with pytest.raises(UserUsernameConflictError):
        await service.create_user(
            username="dupuser",
            email="dup2@example.com",
            full_name="Dup User 2",
            password=TEST_PASSWORD,
            role=UserRole.VIEWER,
        )


@pytest.mark.asyncio
async def test_create_user_duplicate_email(test_db_session: AsyncSession, test_user: User) -> None:
    """Test UserEmailConflictError on duplicate email."""
    service = UsersService(test_db_session, test_user)

    await service.create_user(
        username="emailuser1",
        email="same@example.com",
        full_name="Email User 1",
        password=TEST_PASSWORD,
        role=UserRole.VIEWER,
    )

    with pytest.raises(UserEmailConflictError):
        await service.create_user(
            username="emailuser2",
            email="same@example.com",
            full_name="Email User 2",
            password=TEST_PASSWORD,
            role=UserRole.VIEWER,
        )


@pytest.mark.asyncio
async def test_get_user_by_id_success(test_db_session: AsyncSession, test_user: User) -> None:
    """Test successful user retrieval by ID."""
    service = UsersService(test_db_session, test_user)

    created = await service.create_user(
        username="getuser",
        email="getuser@example.com",
        full_name="Get User",
        password=TEST_PASSWORD,
        role=UserRole.CREATOR,
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
        role=UserRole.VIEWER,
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
        role=UserRole.VIEWER,
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
        role=UserRole.VIEWER,
    )

    updated = await service.update_user(user.id, email="New@Example.COM")

    assert updated.email == "new@example.com"


@pytest.mark.asyncio
async def test_update_user_role(test_db_session: AsyncSession, test_user: User) -> None:
    """Test successful role update."""
    service = UsersService(test_db_session, test_user)

    user = await service.create_user(
        username="updaterole",
        email="updaterole@example.com",
        full_name="Update Role User",
        password=TEST_PASSWORD,
        role=UserRole.VIEWER,
    )

    updated = await service.update_user(user.id, role=UserRole.ADMINISTRATOR)

    assert updated.role == UserRole.ADMINISTRATOR


@pytest.mark.asyncio
async def test_update_user_is_active(test_db_session: AsyncSession, test_user: User) -> None:
    """Test disabling a user."""
    service = UsersService(test_db_session, test_user)

    user = await service.create_user(
        username="disableuser",
        email="disable@example.com",
        full_name="Disable User",
        password=TEST_PASSWORD,
        role=UserRole.VIEWER,
    )

    updated = await service.update_user(user.id, is_active=False)

    assert updated.is_active is False


@pytest.mark.asyncio
async def test_update_user_email_conflict(test_db_session: AsyncSession, test_user: User) -> None:
    """Test UserEmailConflictError on duplicate email update."""
    service = UsersService(test_db_session, test_user)

    await service.create_user(
        username="emailconflict1",
        email="taken@example.com",
        full_name="Conflict User 1",
        password=TEST_PASSWORD,
        role=UserRole.VIEWER,
    )

    user = await service.create_user(
        username="emailconflict2",
        email="original@example.com",
        full_name="Conflict User 2",
        password=TEST_PASSWORD,
        role=UserRole.VIEWER,
    )

    with pytest.raises(UserEmailConflictError):
        await service.update_user(user.id, email="taken@example.com")


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
        role=UserRole.VIEWER,
    )
    original_ts = user.updated_at

    updated = await service.update_user(user.id, full_name="TS Updated")

    assert updated.updated_at > original_ts


@pytest.mark.asyncio
async def test_admin_self_disable_allowed(test_db_session: AsyncSession) -> None:
    """Test admin can disable itself."""
    from nexus.auth.passwords import hash_password

    # Create admin user
    admin = User(
        id=uuid4(),
        username="admin",
        email="admin@example.com",
        full_name="Admin",
        role=UserRole.ADMINISTRATOR,
        password_hash=hash_password("adminpassword"),
    )
    test_db_session.add(admin)
    await test_db_session.commit()

    # Service running as admin
    service = UsersService(test_db_session, admin)

    updated = await service.update_user(admin.id, is_active=False)

    assert updated.is_active is False


@pytest.mark.asyncio
async def test_non_admin_cannot_disable_admin(test_db_session: AsyncSession, test_user: User) -> None:
    """Test non-admin user cannot disable the built-in admin."""
    from nexus.auth.passwords import hash_password

    # Create admin user
    admin = User(
        id=uuid4(),
        username="admin",
        email="admin@example.com",
        full_name="Admin",
        role=UserRole.ADMINISTRATOR,
        password_hash=hash_password("adminpassword"),
    )
    test_db_session.add(admin)
    await test_db_session.commit()

    # Service running as non-admin test_user
    service = UsersService(test_db_session, test_user)

    with pytest.raises(AdminDisableByNonAdminError):
        await service.update_user(admin.id, is_active=False)


@pytest.mark.asyncio
async def test_non_admin_can_update_admin_other_fields(test_db_session: AsyncSession, test_user: User) -> None:
    """Test non-admin can update admin's non-is_active fields."""
    from nexus.auth.passwords import hash_password

    admin = User(
        id=uuid4(),
        username="admin",
        email="admin@example.com",
        full_name="Admin",
        role=UserRole.ADMINISTRATOR,
        password_hash=hash_password("adminpassword"),
    )
    test_db_session.add(admin)
    await test_db_session.commit()

    service = UsersService(test_db_session, test_user)

    updated = await service.update_user(admin.id, full_name="Updated Admin")

    assert updated.full_name == "Updated Admin"


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
            role=UserRole.VIEWER,
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
        role=UserRole.VIEWER,
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
async def test_is_duplicate_email_error(test_db_session: AsyncSession, test_user: User) -> None:
    """Test _is_duplicate_email_error detects email constraint violations."""
    from sqlalchemy.exc import IntegrityError

    service = UsersService(test_db_session, test_user)

    # Should detect constraint name
    e1 = IntegrityError("ix_users_email_unique violated", None, BaseException())
    assert service._is_duplicate_email_error(e1) is True

    # Should detect Key (email) pattern from DETAIL
    e2 = IntegrityError("DETAIL: Key (email)=(test@example.com) already exists.", None, BaseException())
    assert service._is_duplicate_email_error(e2) is True

    # Should not match unrelated errors
    e3 = IntegrityError("foreign key constraint violated on user_id", None, BaseException())
    assert service._is_duplicate_email_error(e3) is False

    # Should not match username constraint
    e4 = IntegrityError("ix_users_username_unique violated", None, BaseException())
    assert service._is_duplicate_email_error(e4) is False
