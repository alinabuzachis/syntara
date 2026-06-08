"""Periodic purge of expired audit events based on retention policy."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import TYPE_CHECKING, Any, cast

import structlog
from sqlalchemy import CursorResult, delete

from nexus.audit.models.audit_event_record import AuditEventRecord
from nexus.core.config.base import get_settings
from nexus.core.database.audit_session import AuditSessionLocal
from nexus.core.workers.periodic import PeriodicWorker

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from sqlmodel.ext.asyncio.session import AsyncSession

logger = structlog.stdlib.get_logger(__name__)


async def purge_expired_audit_events(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Delete audit events older than the configured retention period."""
    settings = get_settings()
    if settings.audit_retention_days == 0:
        return

    retention_days = settings.audit_retention_days
    cutoff = datetime.now(UTC) - timedelta(days=retention_days)
    total_deleted = 0

    created_at_col = AuditEventRecord.__table__.c.created_at  # type: ignore[attr-defined]

    async with session_factory() as session:
        stmt = delete(AuditEventRecord).where(created_at_col < cutoff)
        result = await session.execute(stmt)
        deleted = cast("CursorResult[Any]", result).rowcount
        if deleted:
            await session.commit()
            total_deleted += deleted

    if total_deleted:
        logger.info(
            "audit_purge_completed",
            events_deleted=total_deleted,
            retention_days=retention_days,
        )


@lru_cache(maxsize=1)
def get_audit_purge_worker() -> PeriodicWorker:
    """Return the application-wide audit purge PeriodicWorker."""
    settings = get_settings()
    return PeriodicWorker(
        name="audit-purge",
        interval_seconds=settings.audit_purge_interval_seconds,
        session_factory=AuditSessionLocal,
        callback=purge_expired_audit_events,
        coordinate=True,
    )
