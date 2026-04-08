"""Shared fixtures for settings integration tests."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
import pytest_asyncio
import sqlalchemy

if TYPE_CHECKING:
    from collections.abc import Callable

    from sqlalchemy.ext.asyncio import AsyncEngine
    from sqlmodel.ext.asyncio.session import AsyncSession


@pytest_asyncio.fixture(autouse=True)
async def _clean_test_settings(test_db_engine: AsyncEngine) -> None:
    """Remove test-prefixed runtime_settings rows before each test."""
    async with test_db_engine.begin() as conn:
        await conn.execute(sqlalchemy.text("DELETE FROM runtime_settings WHERE key LIKE 'test.%'"))


@pytest.fixture
def test_session_factory(test_db_session: AsyncSession) -> Callable[[], object]:
    """Session factory that yields the shared test DB session.

    Wraps test_db_session in an async context manager compatible with
    SettingsCache's session_factory interface.
    """

    class _Ctx:
        async def __aenter__(self) -> AsyncSession:
            return test_db_session

        async def __aexit__(self, *_: object) -> None:
            pass

    def factory() -> _Ctx:
        return _Ctx()

    return factory
