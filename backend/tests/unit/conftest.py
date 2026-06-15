"""Unit test configuration.

Eagerly initialises the resource-actions registry so that unit tests calling
``validate_statements`` (e.g. via ``PolicyService.create_policy``) work
without booting the full app lifespan.  Integration tests get the registry
via the ``session_app`` fixture's lifespan startup instead.
"""

from collections.abc import Generator
from uuid import uuid4

import pytest
from fastapi import FastAPI
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.authz.engine import clear_opa_cache, init_opa_cache
from nexus.authz.resource_actions import _registry, build_resource_actions
from nexus.core.models import User

if _registry is None:
    from nexus.core.router_discovery import discover_and_register_routers

    _init_app = FastAPI()
    discover_and_register_routers(app=_init_app, prefix="", enable_validation=False)
    build_resource_actions(_init_app)
    del _init_app


TEST_ENCRYPTION_KEY = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"


@pytest.fixture(autouse=True)
def _set_encryption_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """Provide a valid encryption key for all unit tests via env var."""
    from nexus.core.config.base import get_settings

    monkeypatch.setenv("APP_SECRET_ENCRYPTION_KEY", TEST_ENCRYPTION_KEY)
    get_settings.cache_clear()


@pytest.fixture(autouse=True)
def _reset_opa_cache() -> Generator[None, None, None]:
    """Disable OPA cache between unit tests to prevent cross-test pollution."""
    init_opa_cache(enabled=False)
    yield
    clear_opa_cache()
    init_opa_cache(enabled=False)


@pytest.fixture
async def users(test_db_session: AsyncSession) -> dict[str, User]:
    """Create test users for authorization tests.

    Returns a dict of users keyed by user_1, user_2, etc.
    """
    from nexus.auth.passwords import hash_password

    test_users = {
        "user_1": User(
            id=uuid4(),
            username="user_1",
            email="user1@example.com",
            first_name="User One",
            password_hash=hash_password("password123"),
            is_enabled=True,
        ),
        "user_2": User(
            id=uuid4(),
            username="user_2",
            email="user2@example.com",
            first_name="User Two",
            password_hash=hash_password("password123"),
            is_enabled=True,
        ),
    }

    for user in test_users.values():
        test_db_session.add(user)

    await test_db_session.commit()

    for user in test_users.values():
        await test_db_session.refresh(user)

    return test_users
