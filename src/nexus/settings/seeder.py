"""Post-migration seeder for setting categories and runtime settings.

Upserts all entries from :data:`~nexus.settings.catalog.CATEGORY_CATALOG`
and :data:`~nexus.settings.catalog.SETTINGS_CATALOG` into their respective
tables.

Design:
    - Idempotent — safe to run repeatedly.
    - Categories are seeded before settings (FK target must exist first).
    - Uses ``INSERT ... ON CONFLICT DO UPDATE`` to refresh metadata
      fields without ever overwriting user-mutable data (``value``,
      ``version``).
    - Safe under concurrent execution: the upsert is atomic per row at
      the database level.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any
from uuid import uuid4

import structlog
from sqlalchemy.dialects.postgresql import insert

from nexus.settings.catalog import CATEGORY_CATALOG, SETTINGS_CATALOG
from nexus.settings.models.runtime_setting import RuntimeSetting
from nexus.settings.models.setting_category import SettingCategoryModel
from nexus.settings.validators import check_schema_compatibility, validate_setting_value

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

logger = structlog.stdlib.get_logger(__name__)

_UPSERT_UPDATE_FIELDS = (
    "name",
    "description",
    "default_value",
    "value_type",
    "category",
    "group",
    "requires_restart",
    "cache_ttl_seconds",
    "validation_schema",
    "updated_at",
)


_CATEGORY_UPSERT_FIELDS = ("name", "description", "display_order", "updated_at")


# ---------------------------------------------------------------------------
# Core upsert helpers (session-based)
# ---------------------------------------------------------------------------


async def _upsert_categories(session: AsyncSession) -> int:
    """Upsert category catalog entries. Returns row count."""
    if not CATEGORY_CATALOG:
        return 0

    now = datetime.now(UTC)
    rows: list[dict[str, object]] = [
        {
            "id": uuid4(),
            "slug": cat.slug,
            "name": cat.name,
            "description": cat.description,
            "display_order": cat.display_order,
            "labels": {},
            "created_at": now,
            "updated_at": now,
        }
        for cat in CATEGORY_CATALOG
    ]

    stmt = insert(SettingCategoryModel).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=["slug"],
        set_={col: stmt.excluded[col] for col in _CATEGORY_UPSERT_FIELDS},
    )
    await session.execute(stmt)
    return len(rows)


def _validate_catalog() -> None:
    """Validate SETTINGS_CATALOG entries against categories and schemas."""
    valid_category_slugs = {cat.slug for cat in CATEGORY_CATALOG}
    for defn in SETTINGS_CATALOG:
        cat_slug = defn.category.value if hasattr(defn.category, "value") else str(defn.category)
        if cat_slug not in valid_category_slugs:
            msg = f"Setting '{defn.key}' references undefined category '{cat_slug}'"
            raise ValueError(msg)
        if defn.validation_schema:
            check_schema_compatibility(defn.key, defn.value_type, defn.validation_schema)
        validate_setting_value(
            key=defn.key,
            value=defn.default_value,
            value_type=defn.value_type,
            validation_schema=defn.validation_schema,
        )


async def _upsert_settings(session: AsyncSession) -> int:
    """Upsert settings catalog entries. Returns row count."""
    if not SETTINGS_CATALOG:
        return 0

    _validate_catalog()

    now = datetime.now(UTC)
    rows = [
        {
            "id": uuid4(),
            "name": defn.name,
            "description": defn.description,
            "key": defn.key,
            "category": defn.category,
            "value_type": defn.value_type,
            "default_value": defn.default_value,
            "value": None,
            "group": defn.group,
            "requires_restart": defn.requires_restart,
            "cache_ttl_seconds": defn.cache_ttl_seconds,
            "validation_schema": defn.validation_schema,
            "version": 1,
            "labels": {},
            "created_at": now,
            "updated_at": now,
        }
        for defn in SETTINGS_CATALOG
    ]

    stmt = insert(RuntimeSetting).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=["key"],
        set_={col: stmt.excluded[col] for col in _UPSERT_UPDATE_FIELDS},
    )
    await session.execute(stmt)
    return len(rows)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def seed_settings_with_session(session: AsyncSession) -> None:
    """Seed categories and settings using an externally-provided session.

    Conforms to the unified ``SeederFunc(session)`` interface used by
    :func:`nexus.core.seed.run_seeders`.
    """
    cat_count = await _upsert_categories(session)
    if cat_count:
        logger.info("settings.categories.seeded", count=cat_count)

    settings_count = await _upsert_settings(session)
    if settings_count:
        logger.info("settings.seeder.complete", count=settings_count)
    else:
        logger.info("settings.seeder.empty_catalog")

    await session.commit()


async def seed_settings(session_factory: Any) -> None:  # noqa: ANN401
    """Upsert categories and settings into their respective tables.

    Seeds categories first (FK target), then settings. Both operations
    are idempotent — safe to run repeatedly.

    Args:
        session_factory: Async session factory (``async_sessionmaker`` or
            compatible callable returning an async context manager that
            yields an :class:`~sqlmodel.ext.asyncio.session.AsyncSession`).

    """
    async with session_factory() as session:
        await seed_settings_with_session(session)
