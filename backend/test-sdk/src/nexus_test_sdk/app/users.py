"""User-related fixtures for integration tests."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING, Any
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.authz.resolver import AUTHENTICATED_GROUP_NAME
from nexus.core.models import User

if TYPE_CHECKING:
    from httpx import AsyncClient


@pytest.fixture
def default_user_data() -> dict[str, Any]:
    """Provide default user attributes."""
    from nexus.auth.passwords import hash_password

    return {
        "username": "testuser",
        "email": "testuser@example.com",
        "first_name": "Test",
        "last_name": "User",
        "password_hash": hash_password("password123"),
    }


@pytest_asyncio.fixture
async def user_factory(
    test_db_session: AsyncSession, default_user_data: dict[str, Any]
) -> Callable[..., Awaitable[User]]:
    """Factory fixture for creating a custom user."""

    async def _create_user(**overrides: object) -> User:
        group_names: list[str] | None = overrides.pop("group_names", None)  # type: ignore[assignment]
        if "username" not in overrides and "email" not in overrides:
            unique_suffix = str(uuid4())[:8]
            user_data = {
                **default_user_data,
                "username": f"testuser-{unique_suffix}",
                "email": f"testuser-{unique_suffix}@example.com",
                **overrides,
            }
        else:
            user_data = {**default_user_data, **overrides}
        user = User(**user_data)
        test_db_session.add(user)
        await test_db_session.flush()

        from sqlalchemy import insert

        from nexus.core.models.group import Group, user_groups

        if group_names:
            for name in group_names:
                group = (await test_db_session.exec(select(Group).where(Group.name == name))).one()
                await test_db_session.exec(insert(user_groups).values(user_id=user.id, group_id=group.id))

        if not group_names or AUTHENTICATED_GROUP_NAME not in group_names:
            auth_group = (
                await test_db_session.exec(select(Group).where(Group.name == AUTHENTICATED_GROUP_NAME))
            ).first()
            if auth_group:
                await test_db_session.exec(insert(user_groups).values(user_id=user.id, group_id=auth_group.id))

        await test_db_session.commit()
        return user

    return _create_user


@pytest_asyncio.fixture
async def test_user(user_factory: Callable[..., Awaitable[User]]) -> User:
    """Create test user with default attributes."""
    return await user_factory(username="testuser", email="testuser@example.com")


@pytest_asyncio.fixture
async def system_user(test_db_session: AsyncSession, user_factory: Callable[..., Awaitable[User]]) -> User:
    """Get or create the service principal user for tests."""
    from nexus.core.models.principal import service_principal_id

    svc_id = service_principal_id("backend.ao.svc")

    async with test_db_session:
        svc_user = await test_db_session.get(User, svc_id)
        if svc_user is None:
            svc_user = await user_factory(
                username="backend.ao.svc",
                email="system@example.com",
                id=svc_id,
            )
    return svc_user


@pytest_asyncio.fixture
async def non_local_user(test_db_session: AsyncSession) -> User:
    """Create a non-local (federated) user without a password hash."""
    from nexus.core.models.user import AuthType

    user = User(
        id=uuid4(),
        username="federateduser",
        email="federated@example.com",
        first_name="Federated",
        last_name="User",
        auth_type=AuthType.FEDERATED,
    )
    test_db_session.add(user)
    await test_db_session.commit()
    return user


@pytest_asyncio.fixture
async def admin_user(test_db_session: AsyncSession, user_factory: Callable[..., Awaitable[User]]) -> User:
    """Get or create admin user with username 'admin'."""
    async with test_db_session:
        query = select(User).filter(User.username == "admin")  # type: ignore[arg-type]
        result = await test_db_session.exec(query)
        admin = result.one_or_none()
        if admin is None:
            admin = await user_factory(
                username="admin",
                first_name="Admin",
                last_name="User",
            )
        return admin


@pytest_asyncio.fixture
async def auth_client_as_admin(base_client: "AsyncClient", admin_user: User) -> "AsyncClient":
    """Create an authenticated test client with admin user."""
    from nexus.api.main import app
    from nexus.auth.dependencies import get_current_user

    async def override_get_current_user() -> User:
        return admin_user

    app.dependency_overrides[get_current_user] = override_get_current_user
    return base_client


@pytest_asyncio.fixture
async def multiple_local_users(test_db_session: AsyncSession, test_user: User) -> list[User]:
    """Create multiple test users for pagination, filtering, and sorting tests."""
    from nexus.auth.passwords import hash_password

    users = [
        User(
            id=uuid4(),
            username="alice",
            email="alice@example.com",
            first_name="Alice",
            last_name="Anderson",
            password_hash=hash_password("password123"),
            is_enabled=True,
        ),
        User(
            id=uuid4(),
            username="bob",
            email="bob@example.com",
            first_name="Bob",
            last_name="Brown",
            password_hash=hash_password("password123"),
            is_enabled=True,
        ),
        User(
            id=uuid4(),
            username="charlie",
            email="charlie@example.com",
            first_name="Charlie",
            last_name="Clark",
            password_hash=hash_password("password123"),
            is_enabled=False,
        ),
        User(
            id=uuid4(),
            username="diana",
            email="diana@example.com",
            first_name="Diana",
            last_name="Davis",
            password_hash=hash_password("password123"),
            is_enabled=True,
        ),
        User(
            id=uuid4(),
            username="edward",
            email="edward@example.com",
            first_name="Edward",
            last_name="Evans",
            password_hash=hash_password("password123"),
            is_enabled=True,
        ),
        User(
            id=uuid4(),
            username="fiona",
            email="fiona@example.com",
            first_name="Fiona",
            last_name="Foster",
            password_hash=hash_password("password123"),
            is_enabled=True,
        ),
    ]

    for user in users:
        test_db_session.add(user)

    await test_db_session.commit()

    for user in users:
        await test_db_session.refresh(user)

    return users
