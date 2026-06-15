"""Tests for file storage health check and S3 startup fail-fast.

Health endpoint tests call the health_check function directly (not via HTTP client)
to isolate the file storage logic from the full ASGI stack. Integration-level endpoint
tests belong in tests/integration/api/test_app_lifecycle.py.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from nexus.files.health import check_file_storage_health, validate_file_storage_at_startup
from nexus.files.models.file_metadata import StorageBackend

if TYPE_CHECKING:
    from collections.abc import Callable
    from contextlib import AbstractContextManager


# ---------------------------------------------------------------------------
# check_file_storage_health
# ---------------------------------------------------------------------------


class TestCheckFileStorageHealth:
    """Verify check_file_storage_health returns the correct status string."""

    @pytest.mark.asyncio
    async def test_returns_ok_when_healthy(self) -> None:
        mock_retriever = AsyncMock()
        mock_retriever.health_check = AsyncMock(return_value=True)

        mock_fm = MagicMock()
        mock_fm.active_backend = StorageBackend.LOCAL
        mock_fm.retrievers = {StorageBackend.LOCAL: mock_retriever}

        with patch("nexus.files.health.get_file_manager", return_value=mock_fm):
            result = await check_file_storage_health()

        assert result == "ok"

    @pytest.mark.asyncio
    async def test_returns_degraded_when_unhealthy(self) -> None:
        """Retriever health_check returns False — status is degraded, not an error."""
        mock_retriever = AsyncMock()
        mock_retriever.health_check = AsyncMock(return_value=False)

        mock_fm = MagicMock()
        mock_fm.active_backend = StorageBackend.LOCAL
        mock_fm.retrievers = {StorageBackend.LOCAL: mock_retriever}

        with patch("nexus.files.health.get_file_manager", return_value=mock_fm):
            result = await check_file_storage_health()

        assert result == "degraded"

    @pytest.mark.asyncio
    async def test_returns_unavailable_when_no_retriever(self) -> None:
        mock_fm = MagicMock()
        mock_fm.active_backend = StorageBackend.S3
        mock_fm.retrievers = {}

        with patch("nexus.files.health.get_file_manager", return_value=mock_fm):
            result = await check_file_storage_health()

        assert result == "unavailable"

    @pytest.mark.asyncio
    async def test_returns_error_on_exception(self) -> None:
        with patch("nexus.files.health.get_file_manager", side_effect=RuntimeError("boom")):
            result = await check_file_storage_health()

        assert result == "error"

    @pytest.mark.asyncio
    async def test_returns_degraded_on_timeout(self) -> None:
        mock_retriever = AsyncMock()
        mock_retriever.health_check = AsyncMock(side_effect=TimeoutError)

        mock_fm = MagicMock()
        mock_fm.active_backend = StorageBackend.LOCAL
        mock_fm.retrievers = {StorageBackend.LOCAL: mock_retriever}

        with (
            patch("nexus.files.health.get_file_manager", return_value=mock_fm),
            patch("nexus.files.health.HEALTH_CHECK_TIMEOUT_SECONDS", 0.001),
        ):
            result = await check_file_storage_health()

        assert result == "degraded"


# ---------------------------------------------------------------------------
# validate_file_storage_at_startup
# ---------------------------------------------------------------------------


class TestStartupS3FailFast:
    """Verify validate_file_storage_at_startup raises when S3 is unreachable."""

    @pytest.mark.asyncio
    async def test_raises_when_s3_unreachable(
        self,
        override_settings: Callable[..., AbstractContextManager[object]],
    ) -> None:
        mock_s3_retriever = AsyncMock()
        mock_s3_retriever.health_check = AsyncMock(return_value=False)

        mock_fm = MagicMock()
        mock_fm.retrievers = {StorageBackend.S3: mock_s3_retriever}

        with (
            override_settings(file_storage_backend=StorageBackend.S3),
            patch("nexus.files.health.get_file_manager", return_value=mock_fm),
            pytest.raises(RuntimeError, match="S3 file storage not reachable"),
        ):
            from nexus.core.config.base import get_settings

            await validate_file_storage_at_startup(get_settings())

    @pytest.mark.asyncio
    async def test_continues_when_s3_healthy(
        self,
        override_settings: Callable[..., AbstractContextManager[object]],
    ) -> None:
        mock_s3_retriever = AsyncMock()
        mock_s3_retriever.health_check = AsyncMock(return_value=True)

        mock_fm = MagicMock()
        mock_fm.retrievers = {StorageBackend.S3: mock_s3_retriever}

        with (
            override_settings(file_storage_backend=StorageBackend.S3),
            patch("nexus.files.health.get_file_manager", return_value=mock_fm),
        ):
            from nexus.core.config.base import get_settings

            await validate_file_storage_at_startup(get_settings())

    @pytest.mark.asyncio
    async def test_skips_check_for_local_backend(
        self,
        override_settings: Callable[..., AbstractContextManager[object]],
    ) -> None:
        mock_local = AsyncMock()
        mock_fm = MagicMock()
        mock_fm.retrievers = {StorageBackend.LOCAL: mock_local}

        with (
            override_settings(file_storage_backend=StorageBackend.LOCAL),
            patch("nexus.files.health.get_file_manager", return_value=mock_fm),
        ):
            from nexus.core.config.base import get_settings

            await validate_file_storage_at_startup(get_settings())
            mock_local.health_check.assert_not_called()
