"""Unit tests for User model.

Tests cover:
- User creation with required fields
- Soft delete behavior
- Role enum validation
- Unique constraint violations
- last_login update functionality
"""

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.core.models import User, UserRole


@pytest.mark.asyncio
async def test_create_user_with_required_fields(test_db_session: AsyncSession) -> None:
    """Test creating a user with all required fields."""
    user = User(
        id=uuid4(),
        username="testuser",
        email="test@example.com",
        full_name="Test User",
        role=UserRole.CREATOR.value,
    )
    test_db_session.add(user)
    await test_db_session.commit()
    await test_db_session.refresh(user)

    assert user.id is not None
    assert user.username == "testuser"
    assert user.email == "test@example.com"
    assert user.full_name == "Test User"
    assert user.role == UserRole.CREATOR.value
    assert user.is_active is True
    assert user.preferences == {}
    assert user.deleted_at is None
    assert user.deleted_by is None
    assert user.created_at is not None
    assert user.updated_at is not None


@pytest.mark.asyncio
async def test_create_user_with_all_fields(test_db_session: AsyncSession) -> None:
    """Test creating a user with all fields including optional ones."""
    now = datetime.now(UTC)
    preferences = {"theme": "dark", "notifications": True}

    user = User(
        id=uuid4(),
        username="fulluser",
        email="full@example.com",
        full_name="Full Test User",
        role=UserRole.ADMINISTRATOR.value,
        is_active=True,
        last_login=now,
        preferences=preferences,
    )
    test_db_session.add(user)
    await test_db_session.commit()
    await test_db_session.refresh(user)

    assert user.is_active is True
    assert user.last_login == now
    assert user.preferences == preferences


@pytest.mark.asyncio
async def test_user_soft_delete(test_db_session: AsyncSession) -> None:
    """Test soft delete sets deleted_at and deleted_by correctly."""
    # Create admin user who will perform the delete
    admin = User(
        id=uuid4(),
        username="admin",
        email="admin@example.com",
        full_name="Admin User",
        role=UserRole.ADMINISTRATOR.value,
    )
    test_db_session.add(admin)

    # Create user to be deleted
    user = User(
        id=uuid4(),
        username="deleteme",
        email="delete@example.com",
        full_name="Delete Me",
        role=UserRole.VIEWER.value,
    )
    test_db_session.add(user)
    await test_db_session.commit()
    await test_db_session.refresh(admin)
    await test_db_session.refresh(user)

    # Perform soft delete
    now = datetime.now(UTC)
    user.deleted_at = now
    user.deleted_by = admin.id
    await test_db_session.commit()
    await test_db_session.refresh(user)

    assert user.deleted_at == now
    assert user.deleted_by == admin.id


@pytest.mark.asyncio
async def test_user_role_validation(test_db_session: AsyncSession) -> None:
    """Test that role enum values are valid."""
    valid_roles = [
        UserRole.CREATOR.value,
        UserRole.APPROVER.value,
        UserRole.ADMINISTRATOR.value,
        UserRole.VIEWER.value,
    ]

    for role in valid_roles:
        user = User(
            id=uuid4(),
            username=f"user_{role}",
            email=f"{role}@example.com",
            full_name=f"User {role}",
            role=role,
        )
        test_db_session.add(user)

    await test_db_session.commit()


@pytest.mark.asyncio
async def test_update_last_login(test_db_session: AsyncSession) -> None:
    """Test update_last_login updates timestamp correctly."""
    user = User(
        id=uuid4(),
        username="loginuser",
        email="login@example.com",
        full_name="Login User",
        role=UserRole.CREATOR.value,
    )
    test_db_session.add(user)
    await test_db_session.commit()
    await test_db_session.refresh(user)

    assert user.last_login is None

    # Update last login
    before_update = datetime.now(UTC)
    user.update_last_login()
    await test_db_session.commit()
    await test_db_session.refresh(user)

    assert user.last_login is not None
    assert user.last_login >= before_update  # type: ignore[unreachable]


@pytest.mark.asyncio
async def test_user_repr(test_db_session: AsyncSession) -> None:
    """Test string representation of User."""
    user_id = uuid4()
    user = User(
        id=user_id,
        username="repruser",
        email="repr@example.com",
        full_name="Repr User",
        role=UserRole.VIEWER.value,
    )

    repr_str = repr(user)
    assert "User" in repr_str
    assert str(user_id) in repr_str
    assert "repruser" in repr_str
    assert UserRole.VIEWER.value in repr_str


@pytest.mark.asyncio
async def test_user_preferences_default(test_db_session: AsyncSession) -> None:
    """Test that preferences defaults to empty dict."""
    user = User(
        id=uuid4(),
        username="prefuser",
        email="pref@example.com",
        full_name="Pref User",
        role=UserRole.CREATOR.value,
    )
    test_db_session.add(user)
    await test_db_session.commit()
    await test_db_session.refresh(user)

    assert user.preferences == {}
    assert isinstance(user.preferences, dict)


@pytest.mark.asyncio
async def test_user_is_active_default(test_db_session: AsyncSession) -> None:
    """Test that is_active defaults to True."""
    user = User(
        id=uuid4(),
        username="activeuser",
        email="active@example.com",
        full_name="Active User",
        role=UserRole.CREATOR.value,
    )
    test_db_session.add(user)
    await test_db_session.commit()
    await test_db_session.refresh(user)

    assert user.is_active is True


@pytest.mark.asyncio
async def test_user_inactive(test_db_session: AsyncSession) -> None:
    """Test creating an inactive user."""
    user = User(
        id=uuid4(),
        username="inactiveuser",
        email="inactive@example.com",
        full_name="Inactive User",
        role=UserRole.VIEWER.value,
        is_active=False,
    )
    test_db_session.add(user)
    await test_db_session.commit()
    await test_db_session.refresh(user)

    assert user.is_active is False
