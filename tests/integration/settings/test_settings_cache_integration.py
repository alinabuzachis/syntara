"""Integration tests for SettingsCache against a real PostgreSQL database.

Verifies the full round-trip: session factory → SettingsStore query →
value vs default_value resolution, exercising the real database path
that unit tests cover only with mocks.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import uuid4

import pytest

from nexus.settings.cache.settings_cache import SettingsCache
from nexus.settings.exceptions import SettingTypeError
from nexus.settings.models.runtime_setting import RuntimeSetting, SettingCategory, SettingValueType

if TYPE_CHECKING:
    from collections.abc import Callable

    from sqlmodel.ext.asyncio.session import AsyncSession


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _seed_setting(
    session: AsyncSession,
    *,
    key: str,
    value: object = None,
    default_value: object = None,
    value_type: SettingValueType = SettingValueType.STRING,
    category: SettingCategory = SettingCategory.AI_LLM,
) -> RuntimeSetting:
    """Insert a RuntimeSetting row and return the refreshed instance."""
    setting = RuntimeSetting(
        id=uuid4(),
        name=f"Test {key}",
        key=key,
        category=category,
        value_type=value_type,
        value=value,
        default_value=default_value,
    )
    session.add(setting)
    await session.commit()
    await session.refresh(setting)
    return setting


# ---------------------------------------------------------------------------
# get() — value resolution against real DB
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_returns_default_value_when_value_is_none(
    test_db_session: AsyncSession,
    test_session_factory: Callable[[], object],
) -> None:
    """get() returns default_value from a real DB row when value is NULL."""
    await _seed_setting(
        test_db_session,
        key="test.cache.default_only",
        default_value="the-default",
    )
    cache = SettingsCache(session_factory=test_session_factory)

    result = await cache.get("test.cache.default_only")

    assert result == "the-default"


@pytest.mark.asyncio
async def test_get_returns_value_when_set(
    test_db_session: AsyncSession,
    test_session_factory: Callable[[], object],
) -> None:
    """get() returns value (not default_value) when both are present."""
    await _seed_setting(
        test_db_session,
        key="test.cache.with_value",
        value="operator-override",
        default_value="the-default",
    )
    cache = SettingsCache(session_factory=test_session_factory)

    result = await cache.get("test.cache.with_value")

    assert result == "operator-override"


@pytest.mark.asyncio
async def test_get_returns_none_for_unknown_key(
    test_session_factory: Callable[[], object],
) -> None:
    """get() returns None when the key does not exist in the database."""
    cache = SettingsCache(session_factory=test_session_factory)

    result = await cache.get("test.cache.nonexistent")

    assert result is None


@pytest.mark.asyncio
async def test_get_returns_none_when_both_value_and_default_are_none(
    test_db_session: AsyncSession,
    test_session_factory: Callable[[], object],
) -> None:
    """get() returns None when a row exists but both value and default_value are NULL."""
    await _seed_setting(
        test_db_session,
        key="test.cache.both_none",
        value=None,
        default_value=None,
    )
    cache = SettingsCache(session_factory=test_session_factory)

    result = await cache.get("test.cache.both_none")

    assert result is None


# ---------------------------------------------------------------------------
# Typed accessors — real DB round-trip
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_int_with_real_db(
    test_db_session: AsyncSession,
    test_session_factory: Callable[[], object],
) -> None:
    """get_int() returns an integer value from a real DB row."""
    await _seed_setting(
        test_db_session,
        key="test.cache.max_tokens",
        default_value=4096,
        value_type=SettingValueType.INTEGER,
    )
    cache = SettingsCache(session_factory=test_session_factory)

    result = await cache.get_int("test.cache.max_tokens")

    assert result == 4096
    assert isinstance(result, int)


@pytest.mark.asyncio
async def test_get_float_with_real_db(
    test_db_session: AsyncSession,
    test_session_factory: Callable[[], object],
) -> None:
    """get_float() returns a float value from a real DB row."""
    await _seed_setting(
        test_db_session,
        key="test.cache.temperature",
        value=0.9,
        default_value=0.7,
        value_type=SettingValueType.FLOAT,
    )
    cache = SettingsCache(session_factory=test_session_factory)

    result = await cache.get_float("test.cache.temperature")

    assert result == 0.9
    assert isinstance(result, float)


@pytest.mark.asyncio
async def test_get_str_with_real_db(
    test_db_session: AsyncSession,
    test_session_factory: Callable[[], object],
) -> None:
    """get_str() returns a string value from a real DB row."""
    await _seed_setting(
        test_db_session,
        key="test.cache.model_name",
        default_value="claude-3.5-sonnet",
        value_type=SettingValueType.STRING,
    )
    cache = SettingsCache(session_factory=test_session_factory)

    result = await cache.get_str("test.cache.model_name")

    assert result == "claude-3.5-sonnet"


@pytest.mark.asyncio
async def test_get_bool_with_real_db(
    test_db_session: AsyncSession,
    test_session_factory: Callable[[], object],
) -> None:
    """get_bool() returns a boolean value from a real DB row."""
    await _seed_setting(
        test_db_session,
        key="test.cache.feature_flag",
        default_value=True,
        value_type=SettingValueType.BOOLEAN,
    )
    cache = SettingsCache(session_factory=test_session_factory)

    result = await cache.get_bool("test.cache.feature_flag")

    assert result is True


@pytest.mark.asyncio
async def test_get_int_with_default_fallback(
    test_session_factory: Callable[[], object],
) -> None:
    """get_int() returns the caller-supplied default when the key is missing."""
    cache = SettingsCache(session_factory=test_session_factory)

    result = await cache.get_int("test.cache.missing_int", default=42)

    assert result == 42


@pytest.mark.asyncio
async def test_get_int_raises_type_error_for_wrong_type(
    test_db_session: AsyncSession,
    test_session_factory: Callable[[], object],
) -> None:
    """get_int() raises SettingTypeError when the stored value is a string."""
    await _seed_setting(
        test_db_session,
        key="test.cache.wrong_type",
        default_value="not-an-int",
        value_type=SettingValueType.STRING,
    )
    cache = SettingsCache(session_factory=test_session_factory)

    with pytest.raises(SettingTypeError):
        await cache.get_int("test.cache.wrong_type")
