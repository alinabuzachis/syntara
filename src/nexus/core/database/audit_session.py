"""Audit database session management with async support.

Provides a dedicated engine and session factory for the audit event database,
isolated from the main application database.
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.core.config.base import get_settings
from nexus.core.database.ssl import build_ssl_connect_args

settings = get_settings()

_ssl_connect_args = build_ssl_connect_args(
    ssl_mode=settings.audit_db_ssl_mode,
    ssl_root_cert=settings.audit_db_ssl_root_cert,
    ssl_cert=settings.audit_db_ssl_cert,
    ssl_key=settings.audit_db_ssl_key,
)

# Create async engine for audit database with connection pooling
audit_engine = create_async_engine(
    settings.audit_database_url,
    echo=False,
    pool_size=settings.audit_db_pool_size,
    max_overflow=settings.audit_db_max_overflow,
    pool_timeout=settings.audit_db_pool_timeout_seconds,
    pool_pre_ping=True,
    pool_recycle=3600,
    connect_args=_ssl_connect_args,
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
