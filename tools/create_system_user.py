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
    NEXUS_DB_USER: Database username (default: admin)
    NEXUS_DB_PASSWORD: Database password (default: admin)
    NEXUS_DB_HOST: Database host (default: localhost)
    NEXUS_DB_PORT: Database port (default: 5432)
    NEXUS_DB_NAME: Database name (default: nexus_api)
    NEXUS_SYSTEM_USER_ID: System user UUID (default: 00000000-0000-0000-0000-000000000001)
"""

import asyncio
import logging
import os
import sys
from pathlib import Path

from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from nexus.api.constants import SYSTEM_USER_ID
from nexus.core.models.user import User, UserRole

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
)
logger = logging.getLogger(__name__)


async def create_system_user() -> None:
    """Create system user in the database.

    Raises:
        RuntimeError: If database connection fails or user creation fails

    """
    # Build database URL from environment variables
    db_user = os.getenv("NEXUS_DB_USER", "admin")
    db_password = os.getenv("NEXUS_DB_PASSWORD", "admin")
    db_host = os.getenv("NEXUS_DB_HOST", "localhost")
    db_port = os.getenv("NEXUS_DB_PORT", "5432")
    db_name = os.getenv("NEXUS_DB_NAME", "nexus_api")

    database_url = os.getenv(
        "DATABASE_URL",
        f"postgresql+asyncpg://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}",
    )

    logger.info("Connecting to database: %s:%s/%s", db_host, db_port, db_name)

    # Create async engine
    engine = create_async_engine(
        database_url,
        echo=False,
    )

    try:
        async with AsyncSession(engine) as session:
            # Check if system user already exists
            existing_user = await session.get(User, SYSTEM_USER_ID)

            if existing_user:
                logger.info("✅ System user already exists: %s", SYSTEM_USER_ID)
                logger.info("   Username: %s", existing_user.username)
                logger.info("   Email: %s", existing_user.email)
                logger.info("   Role: %s", existing_user.role.value)
                return

            # Create system user
            system_user = User(
                id=SYSTEM_USER_ID,
                username="system",
                email="system@nexus.internal",
                full_name="System User",
                role=UserRole.ADMINISTRATOR,
                is_active=True,
            )

            # Add and commit
            session.add(system_user)
            await session.commit()

            logger.info("✅ System user created successfully!")
            logger.info("   ID: %s", SYSTEM_USER_ID)
            logger.info("   Username: system")
            logger.info("   Email: system@nexus.internal")
            logger.info("   Role: %s", UserRole.ADMINISTRATOR.value)

    except OSError as e:
        msg = f"Database connection error: {e}"
        logger.exception("❌ %s", msg)
        raise RuntimeError(msg) from e

    except Exception as e:
        msg = f"Error creating system user: {e}"
        logger.exception("❌ %s", msg)
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
