"""Integration tests for audit event purge against a real PostgreSQL database."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker
from sqlmodel import delete, func, select
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

    @pytest_asyncio.fixture(autouse=True)
    async def _clean_audit_events(self, test_db_engine: AsyncEngine) -> None:
        """Truncate audit_events before each test for isolation."""
        audit_session_factory = async_sessionmaker(test_db_engine, class_=AsyncSession, expire_on_commit=False)
        async with audit_session_factory() as session:
            await session.execute(delete(AuditEventRecord))
            await session.commit()

    async def test_purges_old_events_keeps_recent(
        self,
        test_db_engine: AsyncEngine,
        override_settings: Callable[..., AbstractContextManager[object]],
    ) -> None:
        audit_session_factory = async_sessionmaker(test_db_engine, class_=AsyncSession, expire_on_commit=False)
        now = datetime.now(UTC)

        async with audit_session_factory() as session:
            session.add(_make_record(created_at=now - timedelta(days=120)))
            session.add(_make_record(created_at=now - timedelta(days=100)))
            session.add(_make_record(created_at=now - timedelta(days=10)))
            await session.commit()

        with override_settings(audit_retention_days=90, audit_purge_backup_enabled=False):
            await purge_expired_audit_events(audit_session_factory)

        async with audit_session_factory() as session:
            result = await session.exec(select(func.count()).select_from(AuditEventRecord))
            assert result.one() == 1

    async def test_purge_proceeds_after_successful_backup(
        self,
        test_db_engine: AsyncEngine,
        override_settings: Callable[..., AbstractContextManager[object]],
    ) -> None:
        audit_session_factory = async_sessionmaker(test_db_engine, class_=AsyncSession, expire_on_commit=False)
        now = datetime.now(UTC)

        async with audit_session_factory() as session:
            session.add(_make_record(created_at=now - timedelta(days=120)))
            session.add(_make_record(created_at=now - timedelta(days=100)))
            session.add(_make_record(created_at=now - timedelta(days=10)))
            await session.commit()

        with (
            override_settings(audit_retention_days=90, audit_purge_backup_enabled=True),
            patch(
                "nexus.audit.retention.purge._run_backup_export",
                new_callable=AsyncMock,
                return_value=True,
            ) as mock_backup,
        ):
            await purge_expired_audit_events(audit_session_factory)

        mock_backup.assert_called_once()

        async with audit_session_factory() as session:
            result = await session.exec(select(func.count()).select_from(AuditEventRecord))
            assert result.one() == 1

    async def test_purge_blocked_when_backup_fails(
        self,
        test_db_engine: AsyncEngine,
        override_settings: Callable[..., AbstractContextManager[object]],
    ) -> None:
        audit_session_factory = async_sessionmaker(test_db_engine, class_=AsyncSession, expire_on_commit=False)
        now = datetime.now(UTC)

        async with audit_session_factory() as session:
            session.add(_make_record(created_at=now - timedelta(days=120)))
            session.add(_make_record(created_at=now - timedelta(days=100)))
            session.add(_make_record(created_at=now - timedelta(days=10)))
            await session.commit()

        with (
            override_settings(audit_retention_days=90, audit_purge_backup_enabled=True),
            patch(
                "nexus.audit.retention.purge._run_backup_export",
                new_callable=AsyncMock,
                return_value=False,
            ),
        ):
            await purge_expired_audit_events(audit_session_factory)

        async with audit_session_factory() as session:
            result = await session.exec(select(func.count()).select_from(AuditEventRecord))
            assert result.one() == 3
