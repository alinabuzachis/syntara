"""Unit tests for user CRUD endpoints in users_router."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from pydantic import SecretStr

from nexus.core.models import User
from nexus.core.models.user_schemas import UserCreate, UserRead, UserUpdate
from nexus.users.users_router import (
    create_user,
    delete_user,
    get_user,
    update_user,
)


def _make_user(**kwargs: object) -> User:
    defaults = {
        "id": uuid4(),
        "username": "testuser",
        "email": "test@example.com",
        "full_name": "Test User",
        "is_enabled": True,
        "password_hash": "hashed",
    }
    defaults.update(kwargs)
    return User(**defaults)


class TestCreateUserEndpoint:
    """Tests for the POST /users endpoint."""

    @pytest.mark.asyncio
    async def test_creates_user_and_returns_read(self) -> None:
        user = _make_user()
        service = AsyncMock()
        service.create_user = AsyncMock(return_value=user)
        service.to_read = MagicMock(
            return_value=UserRead(
                id=user.id,
                username=user.username,
                email=user.email,
                full_name=user.full_name,
                is_enabled=user.is_enabled,
                auth_type="local",
                created_at=user.created_at,
                updated_at=user.updated_at,
            )
        )

        request = UserCreate(
            username="newuser",
            email="new@example.com",
            full_name="New User",
            password=SecretStr("password123"),
        )

        result = await create_user(request, service)

        assert result.username == user.username
        service.create_user.assert_called_once()
        service.to_read.assert_called_once_with(user)


class TestGetUserEndpoint:
    """Tests for the GET /users/{user_id} endpoint."""

    @pytest.mark.asyncio
    async def test_returns_user_read(self) -> None:
        user = _make_user()
        service = AsyncMock()
        service.get_user_by_id = AsyncMock(return_value=user)
        service.to_read = MagicMock(
            return_value=UserRead(
                id=user.id,
                username=user.username,
                email=user.email,
                full_name=user.full_name,
                is_enabled=user.is_enabled,
                auth_type="local",
                created_at=user.created_at,
                updated_at=user.updated_at,
            )
        )

        result = await get_user(user.id, service)

        assert result.id == user.id
        service.get_user_by_id.assert_called_once_with(user.id)


class TestUpdateUserEndpoint:
    """Tests for the PATCH /users/{user_id} endpoint."""

    @pytest.mark.asyncio
    async def test_updates_user_and_returns_read(self) -> None:
        updated_user = _make_user(full_name="Updated")
        service = AsyncMock()
        service.update_user = AsyncMock(return_value=updated_user)
        db = AsyncMock()

        mock_store = AsyncMock()

        request = UserUpdate(full_name="Updated")
        with patch("nexus.users.users_router.create_session_store", return_value=mock_store):
            result = await update_user(updated_user.id, request, service, db)

        assert result.full_name == "Updated"
        service.update_user.assert_called_once()

    @pytest.mark.asyncio
    async def test_revokes_sessions_on_password_change(self) -> None:
        user = _make_user()
        service = AsyncMock()
        service.update_user = AsyncMock(return_value=user)
        db = AsyncMock()

        mock_store = AsyncMock()

        request = UserUpdate(password=SecretStr("newpassword"))

        with patch("nexus.users.users_router.create_session_store", return_value=mock_store):
            await update_user(user.id, request, service, db)

        mock_store.revoke_all_for_user.assert_called_once_with(user.id)


@pytest.mark.usefixtures("mock_session_store")
class TestDeleteUserEndpoint:
    """Tests for the DELETE /users/{user_id} endpoint."""

    @pytest.mark.asyncio
    async def test_calls_delete(self) -> None:
        user_id = uuid4()
        service = AsyncMock()
        db = AsyncMock()
        mock_store = AsyncMock()

        with patch("nexus.users.users_router.create_session_store", return_value=mock_store):
            await delete_user(user_id, service, db)

        service.delete_user.assert_called_once_with(user_id)
