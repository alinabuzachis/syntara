#!/usr/bin/env python3
"""Create system user in the database for workflow-initiated operations.

This script creates a system user with a well-known UUID that can be used
for automated operations like workflow-initiated agent invocations.

This script and possibly SYSTEM_USER_ID may be able to be removed after
handling of users has been properly implemented.

The system user ID is defined in nexus.api.constants.SYSTEM_USER_ID and
defaults to: 00000000-0000-0000-0000-000000000001

Usage:
    uv run python tools/create_system_user.py

Environment Variables:
    APP_DB_USER: Database username (default: admin)
    APP_DB_PASSWORD: Database password (default: admin)
    APP_DB_HOST: Database host (default: localhost)
    APP_DB_PORT: Database port (default: 5432)
    APP_DB_NAME: Database name (default: nexus_api)
    APP_SYSTEM_USER_ID: System user UUID (default: 00000000-0000-0000-0000-000000000001)
"""

import asyncio
import sys
from pathlib import Path

import structlog
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from nexus.core.config.base import get_settings
from nexus.core.models.user import User

# Configure logging
logger = structlog.stdlib.get_logger(__name__)


async def create_system_user() -> None:
    """Create system user in the database.

    Raises:
        RuntimeError: If database connection fails or user creation fails

    """
    settings = get_settings()
    system_user_id = settings.system_user_id

    logger.info("Connecting to database", host=settings.db_host, port=settings.db_port, name=settings.db_name)

    # Create async engine
    engine = create_async_engine(
        settings.database_url,
        echo=False,
    )

    try:
        async with AsyncSession(engine) as session:
            # Check if system user already exists
            existing_user = await session.get(User, system_user_id)

            if existing_user:
                logger.info("System user already exists", user_id=system_user_id)
                return

            # Create system user
            system_user = User(
                id=system_user_id,
                username="system",
                email="system@nexus.internal",
                full_name="System User",
                is_active=True,
            )

            # Add and commit
            session.add(system_user)
            await session.commit()

            logger.info("System user created successfully!", user_id=system_user_id)

    except OSError as e:
        msg = f"Database connection error: {e}"
        logger.exception("❌ Database connection error", error=str(e))
        raise RuntimeError(msg) from e

    except Exception as e:
        msg = f"Error creating system user: {e}"
        logger.exception("❌ Error creating system user", error=str(e))
        raise RuntimeError(msg) from e

    finally:
        await engine.dispose()


def run() -> None:
    """Run the system user creation process."""
    logger.info("=" * 60)
    logger.info("Creating System User")
    logger.info("=" * 60)
    logger.info("")

    try:
        asyncio.run(create_system_user())
        logger.info("")
        logger.info("=" * 60)
        logger.info("✅ Success")
        logger.info("=" * 60)

    except RuntimeError:
        logger.info("")
        logger.info("=" * 60)
        logger.info("❌ Failed")
        logger.info("=" * 60)
        logger.exception("Error occurred")
        sys.exit(1)


if __name__ == "__main__":
    run()
