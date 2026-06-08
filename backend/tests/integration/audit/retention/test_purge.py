"""Integration tests for audit event purge against a real PostgreSQL database."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker
from sqlmodel import func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.audit.models.audit_event import EventCategory, EventSeverity
from nexus.audit.models.audit_event_record import AuditEventRecord
from nexus.audit.models.structured_data import AuditContextData
from nexus.audit.retention.purge import purge_expired_audit_events

if TYPE_CHECKING:
    from collections.abc import Callable
    from contextlib import AbstractContextManager


def _make_record(created_at: datetime) -> AuditEventRecord:
    """Create a minimal AuditEventRecord with the given timestamp."""
    return AuditEventRecord(
        event_category=EventCategory.SYSTEM_OPERATION,
        event_severity=EventSeverity.INFO,
        event_action="test.purge",
        source_component="test",
        event_message="test event",
        structured_data=AuditContextData(data_type="test"),
        created_at=created_at,
    )


@pytest.mark.asyncio
class TestPurgeIntegration:
    """Purge callback against a real PostgreSQL instance."""

    async def test_purges_old_events_keeps_recent(
        self,
        test_db_engine: AsyncEngine,
        override_settings: Callable[..., AbstractContextManager[object]],
    ) -> None:
        factory = async_sessionmaker(test_db_engine, class_=AsyncSession, expire_on_commit=False)
        now = datetime.now(UTC)

        async with factory() as session:
            session.add(_make_record(created_at=now - timedelta(days=120)))
            session.add(_make_record(created_at=now - timedelta(days=100)))
            session.add(_make_record(created_at=now - timedelta(days=10)))
            await session.commit()

        with override_settings(audit_retention_days=90):
            await purge_expired_audit_events(factory)

        async with factory() as session:
            result = await session.exec(select(func.count()).select_from(AuditEventRecord))
            assert result.one() == 1
