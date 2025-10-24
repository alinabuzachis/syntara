"""Authentication dependencies for FastAPI endpoints."""

from typing import Annotated
from uuid import uuid4

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from nexus.api.db import get_db
from nexus.core.models import User


async def get_current_user(db: Annotated[AsyncSession, Depends(get_db)]) -> User:
    """Get or create a default user for development.

    This is a temporary solution. Real authentication will be implemented
    in a future ticket.

    Args:
        db: Database session

    Returns:
        User instance

    """
    result = await db.execute(select(User).filter(User.username == "dev-user"))  # type: ignore[arg-type]
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            id=uuid4(),
            username="dev-user",
            email="dev@example.com",
            full_name="Development User",
            role="creator",
            is_active=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    return user
