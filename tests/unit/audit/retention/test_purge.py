"""Unit tests for the periodic audit purge worker."""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from nexus.audit.export.models import AuditExportRead, ExportStatus
from nexus.audit.retention.purge import get_audit_purge_worker, purge_expired_audit_events
from nexus.core.workers.periodic import PeriodicWorker

if TYPE_CHECKING:
    from collections.abc import Callable
    from contextlib import AbstractContextManager


def _mock_audit_session_factory(rowcount: int) -> tuple[MagicMock, AsyncMock]:
    """Return (audit_session_factory, session) with execute() returning the given rowcount."""
    session = AsyncMock()
    result = MagicMock()
    result.rowcount = rowcount
    session.execute = AsyncMock(return_value=result)
    session.commit = AsyncMock()

    audit_session_factory = MagicMock()
    audit_session_factory.return_value.__aenter__ = AsyncMock(return_value=session)
    audit_session_factory.return_value.__aexit__ = AsyncMock(return_value=None)
    return audit_session_factory, session


def _mock_main_db_session(system_user: MagicMock | None = None) -> MagicMock:
    """Return a mock AsyncSessionLocal context manager with a system user."""
    if system_user is None:
        system_user = MagicMock()
        system_user.id = uuid4()

    session = AsyncMock()
    session.get = AsyncMock(return_value=system_user)

    ctx = MagicMock()
    ctx.__aenter__ = AsyncMock(return_value=session)
    ctx.__aexit__ = AsyncMock(return_value=None)
    return ctx


class TestPurgeExpiredAuditEvents:
    """Tests for the purge_expired_audit_events callback."""

    @pytest.mark.asyncio
    async def test_noop_when_retention_disabled(
        self, override_settings: Callable[..., AbstractContextManager[object]]
    ) -> None:
        audit_session_factory, session = _mock_audit_session_factory(0)
        with override_settings(audit_retention_days=0):
            await purge_expired_audit_events(audit_session_factory)
        session.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_deletes_and_commits(self, override_settings: Callable[..., AbstractContextManager[object]]) -> None:
        audit_session_factory, session = _mock_audit_session_factory(500)
        with override_settings(audit_retention_days=30, audit_purge_backup_enabled=False):
            await purge_expired_audit_events(audit_session_factory)
        assert session.execute.call_count == 1
        assert session.commit.call_count == 1

    @pytest.mark.asyncio
    async def test_no_commit_when_nothing_deleted(
        self, override_settings: Callable[..., AbstractContextManager[object]]
    ) -> None:
        audit_session_factory, session = _mock_audit_session_factory(0)
        with override_settings(audit_retention_days=30, audit_purge_backup_enabled=False):
            await purge_expired_audit_events(audit_session_factory)
        session.commit.assert_not_called()

    @pytest.mark.asyncio
    async def ***REMOVED***(
        self, override_settings: Callable[..., AbstractContextManager[object]]
    ) -> None:
        audit_session_factory, session = _mock_audit_session_factory(500)
        export_id = uuid4()
        mock_service = AsyncMock()
        mock_service.start_export = AsyncMock(
            return_value=AuditExportRead(id=export_id, status=ExportStatus.PENDING),
        )
        mock_service.get_export_status = AsyncMock(
            return_value=AuditExportRead(
                id=export_id, status=ExportStatus.COMPLETED, row_count=5, file_name="test.csv"
            ),
        )

        with (
            override_settings(audit_retention_days=30, audit_purge_backup_enabled=True),
            patch("nexus.audit.retention.purge.AsyncSessionLocal", return_value=_mock_main_db_session()),
            patch("nexus.audit.retention.purge.AuditEventService", return_value=mock_service),
            patch("nexus.audit.retention.purge.asyncio.sleep", new_callable=AsyncMock),
        ):
            await purge_expired_audit_events(audit_session_factory)

        mock_service.start_export.assert_called_once()
        mock_service.get_export_status.assert_called_once_with(export_id)
        assert session.execute.call_count == 1

    @pytest.mark.asyncio
    async def test_delete_skipped_when_backup_fails(
        self, override_settings: Callable[..., AbstractContextManager[object]]
    ) -> None:
        audit_session_factory, session = _mock_audit_session_factory(500)
        export_id = uuid4()
        mock_service = AsyncMock()
        mock_service.start_export = AsyncMock(
            return_value=AuditExportRead(id=export_id, status=ExportStatus.PENDING),
        )
        mock_service.get_export_status = AsyncMock(
            return_value=AuditExportRead(id=export_id, status=ExportStatus.FAILED, error="Export workflow failed"),
        )

        with (
            override_settings(audit_retention_days=30, audit_purge_backup_enabled=True),
            patch("nexus.audit.retention.purge.AsyncSessionLocal", return_value=_mock_main_db_session()),
            patch("nexus.audit.retention.purge.AuditEventService", return_value=mock_service),
            patch("nexus.audit.retention.purge.asyncio.sleep", new_callable=AsyncMock),
        ):
            await purge_expired_audit_events(audit_session_factory)

        session.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_delete_skipped_when_system_user_missing(
        self, override_settings: Callable[..., AbstractContextManager[object]]
    ) -> None:
        audit_session_factory, session = _mock_audit_session_factory(500)

        main_session = AsyncMock()
        main_session.get = AsyncMock(return_value=None)
        ctx = MagicMock()
        ctx.__aenter__ = AsyncMock(return_value=main_session)
        ctx.__aexit__ = AsyncMock(return_value=None)

        with (
            override_settings(audit_retention_days=30, audit_purge_backup_enabled=True),
            patch("nexus.audit.retention.purge.AsyncSessionLocal", return_value=ctx),
        ):
            await purge_expired_audit_events(audit_session_factory)

        session.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_no_backup_when_disabled(
        self, override_settings: Callable[..., AbstractContextManager[object]]
    ) -> None:
        audit_session_factory, session = _mock_audit_session_factory(500)

        with (
            override_settings(audit_retention_days=30, audit_purge_backup_enabled=False),
            patch("nexus.audit.retention.purge.AsyncSessionLocal") as mock_main_db,
        ):
            await purge_expired_audit_events(audit_session_factory)

        mock_main_db.assert_not_called()
        assert session.execute.call_count == 1

    @pytest.mark.asyncio
    async def test_backup_export_input_uses_cutoff(
        self, override_settings: Callable[..., AbstractContextManager[object]]
    ) -> None:
        audit_session_factory, _session = _mock_audit_session_factory(500)
        export_id = uuid4()
        mock_service = AsyncMock()
        mock_service.start_export = AsyncMock(
            return_value=AuditExportRead(id=export_id, status=ExportStatus.PENDING),
        )
        mock_service.get_export_status = AsyncMock(
            return_value=AuditExportRead(
                id=export_id, status=ExportStatus.COMPLETED, row_count=0, file_name="test.csv"
            ),
        )

        with (
            override_settings(audit_retention_days=30, audit_purge_backup_enabled=True),
            patch("nexus.audit.retention.purge.AsyncSessionLocal", return_value=_mock_main_db_session()),
            patch("nexus.audit.retention.purge.AuditEventService", return_value=mock_service),
            patch("nexus.audit.retention.purge.asyncio.sleep", new_callable=AsyncMock),
        ):
            await purge_expired_audit_events(audit_session_factory)

        call_args = mock_service.start_export.call_args
        export_create = call_args.args[0]
        assert export_create.created_at_lte is not None


class TestGetAuditPurgeWorker:
    """Tests for the get_audit_purge_worker factory."""

    def test_worker_configuration(self, override_settings: Callable[..., AbstractContextManager[object]]) -> None:
        with (
            override_settings(audit_purge_interval_seconds=7200.0),
            patch("nexus.audit.retention.purge.AuditSessionLocal", new_callable=MagicMock),
        ):
            get_audit_purge_worker.cache_clear()
            worker = get_audit_purge_worker()

        assert isinstance(worker, PeriodicWorker)
        assert worker._interval_seconds == 7200.0
        assert worker._coordinate is True
        get_audit_purge_worker.cache_clear()
