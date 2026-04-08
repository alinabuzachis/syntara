#!/usr/bin/env python3
"""Seed runtime settings catalog into the database.

Upserts all entries from SETTINGS_CATALOG into the runtime_settings table.
Run after ``alembic upgrade head`` to populate new settings or update
metadata for existing ones. User-set values and versions are preserved.

Usage:
    uv run python tools/seed_settings.py
"""

import asyncio
import sys
from pathlib import Path

import structlog

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from nexus.core.database.session import AsyncSessionLocal  # type: ignore[import-untyped]
from nexus.settings.seeder import seed_settings  # type: ignore[import-untyped]

logger = structlog.stdlib.get_logger(__name__)


async def main() -> None:
    """Run the settings seeder."""
    await seed_settings(AsyncSessionLocal)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception:
        logger.exception("Failed to seed settings")
        sys.exit(1)
