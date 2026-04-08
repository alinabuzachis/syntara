"""Shared fixtures for settings unit tests."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import uuid4

import pytest
import pytest_asyncio
import sqlalchemy

from nexus.settings.models.runtime_setting import RuntimeSetting, SettingCategory, SettingValueType

if TYPE_CHECKING:
    from collections.abc import Callable

    from sqlalchemy.ext.asyncio import AsyncEngine
    from sqlmodel.ext.asyncio.session import AsyncSession


@pytest_asyncio.fixture(autouse=True)
async def _clean_test_settings(test_db_engine: AsyncEngine) -> None:
    """Remove test-prefixed runtime_settings rows before each settings test.

    Uses the engine directly (not test_db_session) to avoid session
    conflicts with the test's own session.
    """
    async with test_db_engine.begin() as conn:
        await conn.execute(sqlalchemy.text("DELETE FROM runtime_settings WHERE key LIKE 'test.%'"))


@pytest_asyncio.fixture
async def test_runtime_setting(test_db_session: AsyncSession) -> RuntimeSetting:
    """A minimal RuntimeSetting row committed to the test DB."""
    setting = RuntimeSetting(
        id=uuid4(),
        name="AI Model Name",
        key="test.ai.model_name",
        category=SettingCategory.AI_LLM,
        value_type=SettingValueType.STRING,
        default_value="anthropic/claude-3.5-sonnet",
    )
    test_db_session.add(setting)
    await test_db_session.commit()
    await test_db_session.refresh(setting)
    return setting


@pytest_asyncio.fixture
async def test_runtime_setting_with_value(test_db_session: AsyncSession) -> RuntimeSetting:
    """A RuntimeSetting with an operator-set value."""
    setting = RuntimeSetting(
        id=uuid4(),
        name="Sampling Temperature",
        key="test.ai.sampling_temperature",
        category=SettingCategory.AI_LLM,
        value_type=SettingValueType.FLOAT,
        default_value=0.7,
        value=0.9,
    )
    test_db_session.add(setting)
    await test_db_session.commit()
    await test_db_session.refresh(setting)
    return setting


@pytest.fixture
def test_session_factory(test_db_session: AsyncSession) -> Callable[[], object]:
    """A session factory that always yields the shared test DB session.

    Used to pass a session_factory-compatible callable to functions like
    seed_settings() that open their own sessions via async context manager.
    """

    class _Ctx:
        async def __aenter__(self) -> AsyncSession:
            return test_db_session

        async def __aexit__(self, *_: object) -> None:
            pass

    def factory() -> _Ctx:
        return _Ctx()

    return factory
