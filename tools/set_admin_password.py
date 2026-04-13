#!/usr/bin/env python3
"""Set or reset the bootstrap admin user password.

Creates the admin user if it does not exist, or updates the password_hash
if it does.

Usage:
    # Interactive prompt (stdin is a TTY)
    uv run python tools/set_admin_password.py

    # Pipe from a file or command
    cat .secrets/admin-password | uv run python tools/set_admin_password.py
"""

import asyncio
import getpass
import sys
from pathlib import Path
from uuid import uuid4

import structlog
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from nexus.auth.passwords import hash_password
from nexus.core.config.base import get_settings
from nexus.core.models.user import User, UserRole

logger = structlog.stdlib.get_logger(__name__)


async def set_admin_password(password: str) -> None:
    """Create or update the admin user with the given plaintext password."""
    settings = get_settings()
    engine = create_async_engine(settings.database_url, echo=False)

    try:
        async with AsyncSession(engine) as session:
            result = await session.exec(
                select(User).filter(User.username == "admin", User.deleted_at.is_(None))  # type: ignore[arg-type]
            )
            admin = result.first()

            hashed = hash_password(password)

            if admin:
                admin.password_hash = hashed
                logger.info("Updated admin password", user_id=str(admin.id))
            else:
                admin = User(
                    id=uuid4(),
                    username="admin",
                    email="admin@nexus.local",
                    full_name="Administrator",
                    password_hash=hashed,
                    role=UserRole.ADMINISTRATOR,
                    is_active=True,
                )
                session.add(admin)
                logger.info("Created admin user", user_id=str(admin.id))

            await session.commit()
    finally:
        await engine.dispose()


def read_password() -> str:
    """Read password from stdin (prompt if TTY, otherwise read piped input)."""
    if sys.stdin.isatty():
        password = getpass.getpass("Admin password: ")
        confirm = getpass.getpass("Confirm password: ")
        if password != confirm:
            print("Error: passwords do not match", file=sys.stderr)
            sys.exit(1)
        return password
    return sys.stdin.read().strip()


def main() -> int:
    """CLI entry point."""
    password = read_password()
    if not password:
        print("Error: password cannot be empty", file=sys.stderr)
        return 1

    asyncio.run(set_admin_password(password))
    return 0


if __name__ == "__main__":
    sys.exit(main())
