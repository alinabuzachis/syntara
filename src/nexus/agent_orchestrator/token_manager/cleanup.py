"""Background cleanup job for old token usage records.

This module provides functionality to clean up token usage records that are
beyond the retention period, preventing unbounded database growth.
"""

from datetime import UTC, datetime, timedelta

import structlog
from sqlalchemy import delete
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.agent_orchestrator.token_manager.models import TokenUsageRecord

logger = structlog.stdlib.get_logger(__name__)


async def cleanup_old_usage_records(
    session: AsyncSession,
    retention_days: int = 90,
) -> int:
    """Delete token usage records older than the retention period.

    This function removes TokenUsageRecord entries that are beyond the
    specified retention period. This prevents the database from growing
    unbounded over time.

    Args:
        session: Async database session
        retention_days: Number of days to retain records (default: 90)

    Returns:
        Number of records deleted

    Example:
        async with AsyncSession(engine) as session:
            deleted_count = await cleanup_old_usage_records(session, retention_days=90)
            await session.commit()
            logger.info("Deleted old usage records", deleted_count=deleted_count)

    """
    if retention_days <= 0:
        msg = f"retention_days must be positive, got {retention_days}"
        raise ValueError(msg)

    # Calculate cutoff timestamp
    cutoff_timestamp = datetime.now(UTC) - timedelta(days=retention_days)

    # Delete records older than cutoff
    stmt = delete(TokenUsageRecord).where(TokenUsageRecord.request_timestamp < cutoff_timestamp)  # type: ignore[arg-type]

    result = await session.exec(stmt)
    deleted_count = result.rowcount or 0

    logger.info(
        "Token usage cleanup completed",
        deleted_count=deleted_count,
        retention_days=retention_days,
        cutoff_timestamp=cutoff_timestamp.isoformat(),
    )

    return deleted_count
