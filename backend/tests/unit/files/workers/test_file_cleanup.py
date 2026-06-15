"""Unit tests for the periodic file cleanup worker."""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from nexus.core.workers.periodic import PeriodicWorker
from nexus.files.audit.file_cleaned_up import FileCleanedUpEvent
from nexus.files.models.file_metadata import FileMetadata, StorageBackend
from nexus.files.retrievers.s3 import S3FileRetriever
from nexus.files.workers.file_cleanup import cleanup_expired_files, get_file_cleanup_worker

if TYPE_CHECKING:
    from collections.abc import Callable
    from contextlib import AbstractContextManager


def _make_metadata(
    storage_backend: str = "local",
    converted_content_path: str | None = None,
) -> FileMetadata:
    """Build a FileMetadata instance for testing."""
    file_id = uuid4()
    return FileMetadata(
        id=file_id,
        filename="test.pdf",
        mime_type="application/pdf",
        size_bytes=1024,
        file_path=f"/tmp/nexus-{file_id}-test.pdf",  # noqa: S108
        storage_backend=StorageBackend(storage_backend),
        converted_content_path=converted_content_path,
    )


class _MockSessionCtx:
    """Async context manager that yields a fresh AsyncMock session."""

    def __init__(self, session: AsyncMock) -> None:
        self.session = session

    async def __aenter__(self) -> AsyncMock:
        return self.session

    async def __aexit__(self, *_args: object) -> None:
        pass


def _session_factory_from_calls(
    calls: list[AsyncMock],
) -> MagicMock:
    """Build a mock session_factory where each invocation returns the next pre-configured session."""
    idx = 0

    def _next() -> _MockSessionCtx:
        nonlocal idx
        ctx = _MockSessionCtx(calls[idx] if idx < len(calls) else AsyncMock())
        idx += 1
        return ctx

    return MagicMock(side_effect=_next)


def _select_session(rows: list[FileMetadata]) -> AsyncMock:
    """Build a mock session whose exec() returns the given rows."""
    session = AsyncMock()
    result = MagicMock()
    result.all.return_value = rows
    session.exec = AsyncMock(return_value=result)
    return session


def _delete_session() -> AsyncMock:
    """Build a mock session that supports get/delete/commit."""
    session = AsyncMock()
    session.get = AsyncMock(return_value=MagicMock())
    session.delete = AsyncMock()
    session.commit = AsyncMock()
    return session


class TestCleanupExpiredFiles:
    """Tests for the cleanup_expired_files callback."""

    @pytest.mark.asyncio
    async def test_deletes_expired_files(
        self,
        override_settings: Callable[..., AbstractContextManager[object]],
    ) -> None:
        metadata = _make_metadata()
        sel = _select_session([metadata])
        delete = _delete_session()
        factory = _session_factory_from_calls([sel, delete])

        mock_retriever = AsyncMock()
        mock_retriever.delete_file = AsyncMock(return_value=True)
        mock_fm = MagicMock()
        mock_fm.retrievers = {StorageBackend.LOCAL: mock_retriever}

        with (
            override_settings(file_cleanup_batch_size=1000, file_multipart_cleanup_threshold_hours=24),
            patch("nexus.files.workers.file_cleanup.get_file_manager", return_value=mock_fm),
            patch("nexus.files.workers.file_cleanup.AuditEventDispatcher") as mock_dispatcher,
        ):
            await cleanup_expired_files(factory)

        mock_retriever.delete_file.assert_called_once_with(metadata.file_path)
        delete.get.assert_called_once()
        delete.delete.assert_called_once()
        delete.commit.assert_called_once()
        mock_dispatcher.dispatch.assert_called_once()
        event = mock_dispatcher.dispatch.call_args[0][0]
        assert isinstance(event, FileCleanedUpEvent)

    @pytest.mark.asyncio
    async def test_no_expired_files(
        self,
        override_settings: Callable[..., AbstractContextManager[object]],
    ) -> None:
        factory = _session_factory_from_calls([_select_session([])])
        mock_fm = MagicMock()
        mock_fm.retrievers = {}

        with (
            override_settings(file_cleanup_batch_size=1000, file_multipart_cleanup_threshold_hours=24),
            patch("nexus.files.workers.file_cleanup.get_file_manager", return_value=mock_fm),
            patch("nexus.files.workers.file_cleanup.AuditEventDispatcher") as mock_dispatcher,
        ):
            await cleanup_expired_files(factory)

        mock_dispatcher.dispatch.assert_not_called()

    @pytest.mark.asyncio
    async def test_skips_files_where_storage_delete_fails(
        self,
        override_settings: Callable[..., AbstractContextManager[object]],
    ) -> None:
        good_meta = _make_metadata()
        bad_meta = _make_metadata()
        sel = _select_session([bad_meta, good_meta])
        delete = _delete_session()
        factory = _session_factory_from_calls([sel, delete])

        mock_retriever = AsyncMock()
        mock_retriever.delete_file = AsyncMock(side_effect=[OSError("disk error"), True])
        mock_fm = MagicMock()
        mock_fm.retrievers = {StorageBackend.LOCAL: mock_retriever}

        with (
            override_settings(file_cleanup_batch_size=1000, file_multipart_cleanup_threshold_hours=24),
            patch("nexus.files.workers.file_cleanup.get_file_manager", return_value=mock_fm),
            patch("nexus.files.workers.file_cleanup.AuditEventDispatcher"),
        ):
            await cleanup_expired_files(factory)

        delete.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_s3_multipart_cleanup_runs_when_configured(
        self,
        override_settings: Callable[..., AbstractContextManager[object]],
    ) -> None:
        factory = _session_factory_from_calls([_select_session([])])

        mock_s3_retriever = AsyncMock(spec=S3FileRetriever)
        mock_s3_retriever.cleanup_stale_multipart_uploads = AsyncMock(return_value=3)
        mock_fm = MagicMock()
        mock_fm.retrievers = {StorageBackend.S3: mock_s3_retriever}

        with (
            override_settings(file_cleanup_batch_size=1000, file_multipart_cleanup_threshold_hours=48),
            patch("nexus.files.workers.file_cleanup.get_file_manager", return_value=mock_fm),
            patch("nexus.files.workers.file_cleanup.AuditEventDispatcher") as mock_dispatcher,
        ):
            await cleanup_expired_files(factory)

        mock_s3_retriever.cleanup_stale_multipart_uploads.assert_called_once_with(threshold_hours=48)
        mock_dispatcher.dispatch.assert_called_once()


class TestGetFileCleanupWorker:
    """Tests for the get_file_cleanup_worker factory."""

    def test_creates_worker_with_correct_config(
        self,
        override_settings: Callable[..., AbstractContextManager[object]],
    ) -> None:
        with (
            override_settings(file_cleanup_interval_seconds=7200.0),
            patch("nexus.files.workers.file_cleanup.AsyncSessionLocal", new_callable=MagicMock),
        ):
            get_file_cleanup_worker.cache_clear()
            worker = get_file_cleanup_worker()

        assert isinstance(worker, PeriodicWorker)
        assert worker._name == "file-lifecycle-cleanup"
        assert worker._interval_seconds == 7200.0
        assert worker._coordinate is True

    def test_returns_cached_singleton(self) -> None:
        with patch("nexus.files.workers.file_cleanup.AsyncSessionLocal", new_callable=MagicMock):
            get_file_cleanup_worker.cache_clear()
            w1 = get_file_cleanup_worker()
            w2 = get_file_cleanup_worker()
        assert w1 is w2
