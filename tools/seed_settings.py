#!/usr/bin/env python3
"""Seed runtime settings catalog into the database.

.. deprecated::
    Use ``uv run python -m nexus.seed --only settings`` instead.
    This script is kept for backward compatibility.

Usage:
    uv run python tools/seed_settings.py
"""

import asyncio
import sys
import warnings
from pathlib import Path

import structlog

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from nexus.core.database.session import AsyncSessionLocal  # type: ignore[import-untyped]
from nexus.settings.seeder import seed_settings  # type: ignore[import-untyped]

logger = structlog.stdlib.get_logger(__name__)


async def main() -> None:
    """Run the settings seeder."""
    warnings.warn(
        "tools/seed_settings.py is deprecated. Use 'uv run python -m nexus.seed --only settings' instead.",
        DeprecationWarning,
        stacklevel=1,
    )
    await seed_settings(AsyncSessionLocal)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception:
        logger.exception("Failed to seed settings")
        sys.exit(1)
