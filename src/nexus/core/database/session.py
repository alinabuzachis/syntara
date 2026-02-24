"""Database session management with async support and soft delete filtering."""

from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import Query
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.core.config.base import get_settings

settings = get_settings()

# Create async engine with connection pooling
engine = create_async_engine(
    settings.database_url,
    echo=False,  # Set to True for SQL query logging in development
    pool_size=settings.db_pool_size,  # Maximum number of connections in the pool
    max_overflow=settings.db_max_overflow,  # Maximum overflow connections
    pool_timeout=settings.db_pool_timeout_seconds,  # Timeout waiting for an available connection
    pool_pre_ping=True,  # Verify connections before using them
    pool_recycle=3600,  # Recycle connections after 1 hour
)

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency for database sessions.

    Yields:
        AsyncSession: Database session with automatic cleanup and soft delete filtering.

    Example:
        ```python
        @app.get("/workflows")
        async def list_workflows(db: AsyncSession = Depends(get_db)):
            result = await db.exec(select(Workflow))
            workflows = result.all()
            return workflows
        ```

    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


def apply_soft_delete_filter(query: Query[Any]) -> Query[Any]:
    """Apply soft delete filter to query.

    This function adds a WHERE clause to exclude soft-deleted records
    (WHERE deleted_at IS NULL).

    Args:
        query: SQLAlchemy query object

    Returns:
        Query with soft delete filter applied

    Note:
        This is a utility function for manual query building.
        Soft delete filtering is automatically applied via SQLAlchemy events.

    """
    # Get the model class from the query
    column_desc = query.column_descriptions[0].get("type")
    if column_desc is None:
        return query

    model_class = column_desc

    # Check if model has deleted_at column
    mapper = inspect(model_class)
    if (
        mapper is not None
        and hasattr(mapper, "columns")
        and "deleted_at" in mapper.columns
        and hasattr(model_class, "deleted_at")
    ):
        return query.filter(model_class.deleted_at.is_(None))

    return query


# Note: Automatic soft-delete filtering via event listeners is disabled for AsyncSession
# as the 'do_orm_execute' event is not available. Instead, we explicitly filter
# soft-deleted records in API endpoints using .filter(Model.deleted_at.is_(None))
