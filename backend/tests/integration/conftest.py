"""Shared fixtures for all integration tests.

Provides OPA mocking so that integration tests outside ``tests/integration/api/``
(which has its own richer OPA mock using the CLI) can still run without an OPA
server.

Overrides ``test_db_session`` to use real commits (not rollback-based
isolation) because integration tests often create data that must be visible
across multiple database connections (e.g. API clients, concurrent sessions).
"""

from collections.abc import AsyncGenerator, Generator
from typing import Any
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
import pytest_asyncio
import sqlalchemy
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.authz.engine import clear_opa_cache, init_opa_cache
from nexus.authz.resolver import AUTHENTICATED_GROUP_NAME
from nexus.core.models.group import Group


async def _truncate_all_tables(engine: AsyncEngine) -> None:
    """Remove all data from user tables without touching migration state."""
    preparer = engine.dialect.identifier_preparer
    async with engine.begin() as conn:
        result = await conn.execute(
            sqlalchemy.text(
                """
                SELECT table_schema, table_name
                FROM information_schema.tables
                WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
                ORDER BY table_schema, table_name
                """
            )
        )
        tables = [
            f"{preparer.quote_schema(schema)}.{preparer.quote(table_name)}"
            if schema and schema != "public"
            else preparer.quote(table_name)
            for schema, table_name in result
            if table_name not in ("alembic_version", "installation", "runtime_settings", "setting_categories")
        ]

        if not tables:
            return

        truncate_stmt = sqlalchemy.text(f"TRUNCATE {', '.join(tables)} RESTART IDENTITY CASCADE")
        await conn.execute(truncate_stmt)


@pytest_asyncio.fixture
async def test_db_session_factory(test_db_engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """Create an async session factory from the test database engine."""
    return async_sessionmaker(test_db_engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture
async def test_db_session(
    test_db_engine: AsyncEngine, test_db_session_factory: async_sessionmaker[AsyncSession]
) -> AsyncGenerator[AsyncSession, None]:
    """Create an integration test database session with real commits.

    Integration tests need data visible across multiple connections (API
    clients, concurrent sessions).  Uses TRUNCATE before each test for
    isolation instead of the rollback approach used by unit tests.
    """
    await _truncate_all_tables(test_db_engine)

    session = test_db_session_factory()
    try:
        yield session
        if session.is_active:
            await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


@pytest_asyncio.fixture(autouse=True)
async def _seed_authenticated_group(test_db_session: AsyncSession) -> None:
    """Ensure the built-in authenticated group exists for every integration test."""
    result = await test_db_session.exec(
        select(Group).where(Group.name == AUTHENTICATED_GROUP_NAME, Group.deleted_at.is_(None))  # type: ignore[union-attr]
    )
    if not result.first():
        test_db_session.add(Group(id=uuid4(), name=AUTHENTICATED_GROUP_NAME, is_builtin=True, labels={}))
        await test_db_session.flush()


@pytest.fixture(autouse=True)
def _reset_opa_cache() -> Generator[None, None, None]:
    """Reset OPA cache between integration tests."""
    init_opa_cache(enabled=True, ttl_seconds=300)
    yield
    clear_opa_cache()


@pytest.fixture(autouse=True)
def _mock_opa_allow_all(monkeypatch: pytest.MonkeyPatch) -> None:
    """Replace OPA client with one that always allows requests.

    This is a lightweight fallback for integration tests that don't live
    under ``tests/integration/api/`` (those use the CLI-based mock).
    The ``api`` conftest's ``_mock_opa`` fixture overrides this one for
    tests in that directory because pytest uses the most-specific conftest.
    """
    mock_opa = AsyncMock()
    mock_opa.evaluate = AsyncMock(
        return_value={
            "allow": True,
            "deny": False,
            "matched_policy": "test-allow-all",
            "allowed_projects": ["*"],
        }
    )

    def _mock_getter(request: Any = None) -> AsyncMock:  # noqa: ANN401
        return mock_opa

    monkeypatch.setattr("nexus.authz.dependencies.get_opa_client", _mock_getter)
    monkeypatch.setattr("nexus.workflows.executions_router.get_opa_client", _mock_getter)
