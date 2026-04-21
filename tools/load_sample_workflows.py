#!/usr/bin/env python3
"""Standalone script to load sample workflows via direct database access.

.. deprecated::
    Use ``uv run python -m nexus.seed --only sample_workflows`` instead.
    This script is kept for backward compatibility.

Usage:
    python tools/load_sample_workflows.py [samples_directory]
    python tools/load_sample_workflows.py samples
"""

import asyncio
import sys
import warnings
from pathlib import Path

import structlog

from nexus.core.database.session import AsyncSessionLocal  # type: ignore[import-untyped]
from nexus.workflows.seed import seed_sample_workflows  # type: ignore[import-untyped]

logger = structlog.stdlib.get_logger(__name__)


async def load_sample_workflows(
    samples_dir: Path | str = "samples",
) -> None:
    """Load sample workflows from the samples directory.

    Delegates to :func:`nexus.workflows.seed.seed_sample_workflows`.
    """
    warnings.warn(
        "tools/load_sample_workflows.py is deprecated. "
        "Use 'uv run python -m nexus.seed --only sample_workflows' instead.",
        DeprecationWarning,
        stacklevel=1,
    )
    async with AsyncSessionLocal() as session:
        await seed_sample_workflows(session, samples_dir)


def main() -> None:
    """Run the sample workflow loading process."""
    samples_arg_index = 1
    samples_dir = sys.argv[samples_arg_index] if len(sys.argv) > samples_arg_index else "samples"

    logger.info("Starting workflow loading process...")
    logger.info("Samples directory", directory=samples_dir)

    try:
        asyncio.run(load_sample_workflows(samples_dir))
        logger.info("Successfully completed workflow loading")
    except Exception:
        logger.exception("Failed to load workflows")
        sys.exit(1)


if __name__ == "__main__":
    main()
