"""Periodic purge of expired audit events based on retention policy."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import TYPE_CHECKING, Any, cast

import structlog
from sqlalchemy import CursorResult, delete

from nexus.audit.export.models import AuditExportCreate, ExportStatus
from nexus.audit.models.audit_event_record import AuditEventRecord
from nexus.audit.services.audit_event_service import AuditEventService
from nexus.core.config.base import get_settings
from nexus.core.database.audit_session import AuditSessionLocal
from nexus.core.database.session import AsyncSessionLocal
from nexus.core.models import User
from nexus.core.workers.periodic import PeriodicWorker

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from sqlmodel.ext.asyncio.session import AsyncSession

logger = structlog.stdlib.get_logger(__name__)

_BACKUP_POLL_INTERVAL_SECONDS = 30.0
_BACKUP_MAX_WAIT_SECONDS = 1800.0


async def _run_backup_export(cutoff: datetime) -> bool:
    """Start an audit export via AuditEventService and poll until completion.

    Returns True on success, False on failure.
    """
    settings = get_settings()

    async with AsyncSessionLocal() as session:
        system_user = await session.get(User, settings.system_user_id)
        if system_user is None:
            logger.error(
                "audit_purge_backup_failed",
                reason=f"System user {settings.system_user_id} not found",
            )
            return False

        service = AuditEventService(session, system_user)
        export = await service.start_export(AuditExportCreate(created_at_lte=cutoff))

        logger.info("audit_purge_backup_started", export_id=str(export.id))

        elapsed = 0.0
        while elapsed < _BACKUP_MAX_WAIT_SECONDS:
            await asyncio.sleep(_BACKUP_POLL_INTERVAL_SECONDS)
            elapsed += _BACKUP_POLL_INTERVAL_SECONDS

            status = await service.get_export_status(export.id)

            if status.status == ExportStatus.COMPLETED:
                logger.info(
                    "audit_purge_backup_completed",
                    export_id=str(export.id),
                    row_count=status.row_count,
                    file_name=status.file_name,
                )
                return True

            if status.status == ExportStatus.FAILED:
                logger.error(
                    "audit_purge_backup_failed",
                    export_id=str(export.id),
                    error=status.error,
                )
                return False

        logger.error(
            "audit_purge_backup_failed",
            export_id=str(export.id),
            reason="Timed out waiting for export to complete",
        )
        return False


async def purge_expired_audit_events(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Delete audit events older than the configured retention period."""
    settings = get_settings()
    if settings.audit_retention_days == 0:
        return

    retention_days = settings.audit_retention_days
    cutoff = datetime.now(UTC) - timedelta(days=retention_days)

    if settings.audit_purge_backup_enabled:
        try:
            success = await _run_backup_export(cutoff)
        except Exception:
            logger.exception("audit_purge_backup_failed")
            return
        if not success:
            return

    total_deleted = 0

    created_at_col = AuditEventRecord.__table__.c.created_at  # type: ignore[attr-defined]

    async with session_factory() as session:
        stmt = delete(AuditEventRecord).where(created_at_col < cutoff)
        delete_result = await session.execute(stmt)
        deleted = cast("CursorResult[Any]", delete_result).rowcount
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
