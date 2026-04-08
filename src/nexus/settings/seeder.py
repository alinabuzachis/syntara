"""Post-migration seeder for runtime settings.

Upserts all entries from :data:`~nexus.settings.catalog.SETTINGS_CATALOG`
into the ``runtime_settings`` table. Run as a post-migration step via
``uv run python tools/seed_settings.py`` after ``alembic upgrade head``.

Design:
    - Idempotent — safe to run repeatedly.
    - Uses ``INSERT ... ON CONFLICT (key) DO UPDATE`` to refresh metadata
      fields (name, description, default_value, etc.) without ever
      overwriting ``value`` or ``version`` — preserving user changes and
      the optimistic lock counter.
    - Safe under concurrent execution: the upsert is atomic per row at
      the database level.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import structlog
from sqlalchemy.dialects.postgresql import insert

from nexus.settings.catalog import SETTINGS_CATALOG
from nexus.settings.models.runtime_setting import RuntimeSetting
from nexus.settings.validators import check_schema_compatibility, validate_setting_value

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


async def seed_settings(session_factory: Any) -> None:  # noqa: ANN401
    """Upsert all catalog entries into the ``runtime_settings`` table.

    Inserts any setting that does not yet exist. For settings that already
    exist, updates metadata columns (name, description, default_value, etc.)
    but leaves ``value`` and ``version`` untouched so user overrides and
    the optimistic lock counter are preserved.

    Args:
        session_factory: Async session factory (``async_sessionmaker`` or
            compatible callable returning an async context manager that
            yields an :class:`~sqlmodel.ext.asyncio.session.AsyncSession`).

    """
    if not SETTINGS_CATALOG:
        logger.info("settings.seeder.empty_catalog")
        return

    for defn in SETTINGS_CATALOG:
        if defn.validation_schema:
            check_schema_compatibility(defn.key, defn.value_type, defn.validation_schema)
        validate_setting_value(
            key=defn.key,
            value=defn.default_value,
            value_type=defn.value_type,
            validation_schema=defn.validation_schema,
        )

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

    async with session_factory() as session:
        await session.execute(stmt)
        await session.commit()

    logger.info("settings.seeder.complete", count=len(rows))
