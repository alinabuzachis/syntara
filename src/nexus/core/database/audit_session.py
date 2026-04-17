"""Audit database session management with async support.

Provides a dedicated engine and session factory for the audit event database,
isolated from the main application database.
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.core.config.base import get_settings

settings = get_settings()

# Create async engine for audit database with connection pooling
audit_engine = create_async_engine(
    settings.audit_database_url,
    echo=False,
    pool_size=settings.audit_db_pool_size,
    max_overflow=settings.audit_db_max_overflow,
    pool_timeout=settings.audit_db_pool_timeout_seconds,
    pool_pre_ping=True,
    pool_recycle=3600,
)

# Create async session factory for audit database
AuditSessionLocal = async_sessionmaker(
    audit_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
)


async def get_audit_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency for audit database sessions.

    Yields:
        AsyncSession: Audit database session with automatic cleanup.

    """
    async with AuditSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
