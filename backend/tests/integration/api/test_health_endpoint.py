"""Integration tests for the /health endpoint."""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, PropertyMock, patch

import pytest

if TYPE_CHECKING:
    from httpx import AsyncClient


class TestHealthEndpointFileStorage:
    """Verify that /health includes file_storage in its response."""

    @pytest.mark.asyncio
    async def test_includes_file_storage_field_when_unconfigured(
        self,
        base_client: AsyncClient,
    ) -> None:
        """Regression guard: /health must return checks.file_storage.

        The frontend's useFileStorageStatus hook gates the upload UI on this
        field — if absent it fails open and shows upload as available even
        when S3 is not configured.
        """
        mock_fm = MagicMock()
        type(mock_fm).s3_configured = PropertyMock(return_value=False)

        with patch("nexus.files.health.get_file_manager", return_value=mock_fm):
            resp = await base_client.get("/health")

        assert resp.status_code == 200
        body = resp.json()
        assert "file_storage" in body["checks"], "/health response is missing 'file_storage' in checks"
        assert body["checks"]["file_storage"] == "unconfigured"

    @pytest.mark.asyncio
    async def test_includes_file_storage_field_when_configured(
        self,
        base_client: AsyncClient,
    ) -> None:
        mock_fm = MagicMock()
        type(mock_fm).s3_configured = PropertyMock(return_value=True)
        mock_retriever = MagicMock()
        mock_retriever.health_check = AsyncMock(return_value=True)
        mock_fm.get_retriever.return_value = mock_retriever

        with patch("nexus.files.health.get_file_manager", return_value=mock_fm):
            resp = await base_client.get("/health")

        assert resp.status_code == 200
        assert resp.json()["checks"]["file_storage"] == "ok"
