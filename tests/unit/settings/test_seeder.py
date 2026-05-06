"""Unit tests for the startup settings seeder.

Tests cover:
- All catalog entries are inserted on first run
- Seeder is idempotent: re-running does not change value or version
- Seeder updates metadata fields (name, description) on subsequent runs
- catalog keys are unique (guard against definition mistakes)
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from sqlmodel import select

from nexus.settings.catalog import SETTINGS_CATALOG, SettingDefinition
from nexus.settings.models.runtime_setting import RuntimeSetting
from nexus.settings.seeder import seed_settings

if TYPE_CHECKING:
    from collections.abc import Callable

    from sqlmodel.ext.asyncio.session import AsyncSession


def test_catalog_is_not_empty() -> None:
    """SETTINGS_CATALOG must define at least one setting."""
    assert len(SETTINGS_CATALOG) > 0


def test_catalog_keys_are_unique() -> None:
    """Every SettingDefinition in the catalog must have a unique key."""
    keys = [d.key for d in SETTINGS_CATALOG]
    assert len(keys) == len(set(keys)), "Duplicate keys found in SETTINGS_CATALOG"


def test_catalog_entries_are_setting_definitions() -> None:
    """Every entry in SETTINGS_CATALOG is a SettingDefinition instance."""
    for entry in SETTINGS_CATALOG:
        assert isinstance(entry, SettingDefinition)


def test_catalog_entries_have_helper_text() -> None:
    """Every SettingDefinition in the catalog must have a non-empty helper_text."""
    missing = [d.key for d in SETTINGS_CATALOG if not d.helper_text]
    assert missing == [], f"Settings missing helper_text: {missing}"


def test_catalog_contains_expected_keys() -> None:
    """The catalog includes expected context_manager seed settings."""
    keys = {d.key for d in SETTINGS_CATALOG}
    assert "context_manager.required_grounding_score" in keys
    assert "context_manager.max_total_tokens" in keys
    assert "context_manager.enable_hybrid_search" in keys
    assert "context_manager.compression_loop" in keys


@pytest.mark.asyncio
async def test_seed_inserts_all_catalog_entries(
    test_db_session: AsyncSession,
    test_session_factory: Callable[[], object],
) -> None:
    """seed_settings() inserts a row for every entry in SETTINGS_CATALOG."""
    await seed_settings(test_session_factory)

    result = await test_db_session.exec(select(RuntimeSetting))
    seeded_keys = {r.key for r in result.all()}

    for definition in SETTINGS_CATALOG:
        assert definition.key in seeded_keys, f"Missing seeded key: {definition.key}"


@pytest.mark.asyncio
async def test_seed_is_idempotent_value_unchanged(
    test_db_session: AsyncSession,
    test_session_factory: Callable[[], object],
) -> None:
    """Running seed_settings() twice does not overwrite the operator-set value."""
    await seed_settings(test_session_factory)

    result = await test_db_session.exec(
        select(RuntimeSetting).where(RuntimeSetting.key == "context_manager.max_total_tokens")
    )
    setting = result.one()
    setting.value = 8000
    setting.version = 5
    await test_db_session.commit()

    await seed_settings(test_session_factory)

    await test_db_session.refresh(setting)
    assert setting.value == 8000
    assert setting.version == 5


@pytest.mark.asyncio
async def test_seed_persists_helper_text(
    test_db_session: AsyncSession,
    test_session_factory: Callable[[], object],
) -> None:
    """seed_settings() persists helper_text from the catalog to the database."""
    await seed_settings(test_session_factory)

    first_definition = SETTINGS_CATALOG[0]
    result = await test_db_session.exec(select(RuntimeSetting).where(RuntimeSetting.key == first_definition.key))
    setting = result.one()
    assert setting.helper_text == first_definition.helper_text


@pytest.mark.asyncio
async def test_seed_updates_metadata_without_touching_value(
    test_db_session: AsyncSession,
    test_session_factory: Callable[[], object],
) -> None:
    """seed_settings() updates name/description/default_value but never value or version."""
    first_definition = SETTINGS_CATALOG[0]

    await seed_settings(test_session_factory)

    result = await test_db_session.exec(select(RuntimeSetting).where(RuntimeSetting.key == first_definition.key))
    existing = result.one()
    existing.name = "Old Name"
    existing.value = "operator-override"
    existing.version = 3
    await test_db_session.commit()

    await seed_settings(test_session_factory)

    await test_db_session.refresh(existing)
    assert existing.name == first_definition.name
    assert existing.value == "operator-override"
    assert existing.version == 3


@pytest.mark.asyncio
async def test_seed_repeated_calls_are_safe(
    test_db_session: AsyncSession,
    test_session_factory: Callable[[], object],
) -> None:
    """Calling seed_settings() repeatedly does not cause integrity errors.

    True concurrent safety (two separate processes racing at startup) is a
    database-level guarantee from ``INSERT ... ON CONFLICT DO UPDATE``.  That
    property cannot be exercised with a single shared session; this test
    instead verifies that sequential re-invocation leaves the catalog intact.
    """
    await seed_settings(test_session_factory)
    await seed_settings(test_session_factory)

    result = await test_db_session.exec(select(RuntimeSetting))
    seeded_keys = {r.key for r in result.all()}
    for definition in SETTINGS_CATALOG:
        assert definition.key in seeded_keys
