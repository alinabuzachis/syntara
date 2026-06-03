"""Unit tests for the periodic audit purge worker."""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from nexus.audit.retention.purge import get_audit_purge_worker, purge_expired_audit_events
from nexus.core.workers.periodic import PeriodicWorker

if TYPE_CHECKING:
    from collections.abc import Callable
    from contextlib import AbstractContextManager


def _mock_session_factory(rowcount: int) -> tuple[MagicMock, AsyncMock]:
    """Return (factory, session) with execute() returning the given rowcount."""
    session = AsyncMock()
    result = MagicMock()
    result.rowcount = rowcount
    session.execute = AsyncMock(return_value=result)
    session.commit = AsyncMock()

    factory = MagicMock()
    factory.return_value.__aenter__ = AsyncMock(return_value=session)
    factory.return_value.__aexit__ = AsyncMock(return_value=None)
    return factory, session


class TestPurgeExpiredAuditEvents:
    """Tests for the purge_expired_audit_events callback."""

    @pytest.mark.asyncio
    async def test_noop_when_retention_disabled(
        self, override_settings: Callable[..., AbstractContextManager[object]]
    ) -> None:
        factory, session = _mock_session_factory(0)
        with override_settings(audit_retention_days=0):
            await purge_expired_audit_events(factory)
        session.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_deletes_and_commits(self, override_settings: Callable[..., AbstractContextManager[object]]) -> None:
        factory, session = _mock_session_factory(500)
        with override_settings(audit_retention_days=30):
            await purge_expired_audit_events(factory)
        assert session.execute.call_count == 1
        assert session.commit.call_count == 1

    @pytest.mark.asyncio
    async def test_no_commit_when_nothing_deleted(
        self, override_settings: Callable[..., AbstractContextManager[object]]
    ) -> None:
        factory, session = _mock_session_factory(0)
        with override_settings(audit_retention_days=30):
            await purge_expired_audit_events(factory)
        session.commit.assert_not_called()


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
