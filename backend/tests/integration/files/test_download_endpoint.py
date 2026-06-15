"""Integration tests for GET /files/{file_id}/download endpoint.

Tests the full upload -> download flow with a real database,
verifying content integrity, headers, and error responses.
"""

from __future__ import annotations

import hashlib
from typing import TYPE_CHECKING, Any
from uuid import uuid4

import aiofiles
import pytest

if TYPE_CHECKING:
    from pathlib import Path

    from httpx import AsyncClient


@pytest.mark.asyncio
class TestDownloadEndpoint:
    """Tests for the file download endpoint."""

    async def _upload_file(
        self,
        client: AsyncClient,
        file_path: Path,
        filename: str,
        mime_type: str,
    ) -> dict[str, Any]:
        """Upload a file via POST /api/v1/files and return the response JSON.

        Args:
            client: Authenticated HTTP client.
            file_path: Path to the file on disk.
            filename: Name to use in the upload.
            mime_type: MIME type for the upload.

        Returns:
            Parsed JSON response from the upload endpoint.

        """
        async with aiofiles.open(file_path, "rb") as f:
            content = await f.read()

        response = await client.post(
            "/api/v1/files",
            files=[("files", (filename, content, mime_type))],
        )
        assert response.status_code == 201, f"Upload failed: {response.text}"
        return response.json()  # type: ignore[no-any-return]

    async def test_upload_then_download_pdf(
        self,
        auth_client_with_mocked_llm: AsyncClient,
        test_user: object,
        sample_pdf_path: Path,
    ) -> None:
        """Upload a PDF, download it, and verify status, headers, and content."""
        # Upload
        upload_data = await self._upload_file(
            auth_client_with_mocked_llm,
            sample_pdf_path,
            "sample.pdf",
            "application/pdf",
        )
        file_id = upload_data["file_ids"][0]

        # Read original bytes for comparison
        async with aiofiles.open(sample_pdf_path, "rb") as f:
            original_content = await f.read()

        # Download
        response = await auth_client_with_mocked_llm.get(
            f"/api/v1/files/{file_id}/download",
        )

        # Assert status
        assert response.status_code == 200

        # Assert headers
        assert response.headers["content-type"] == "application/pdf"
        assert 'filename="sample.pdf"' in response.headers["content-disposition"]
        assert response.headers["x-content-type-options"] == "nosniff"

        # Assert content matches original
        assert response.content == original_content

    async def test_upload_then_download_text(
        self,
        auth_client_with_mocked_llm: AsyncClient,
        test_user: object,
        sample_txt_path: Path,
    ) -> None:
        """Upload a text file, download it, and verify status, headers, and content."""
        # Upload
        upload_data = await self._upload_file(
            auth_client_with_mocked_llm,
            sample_txt_path,
            "sample.txt",
            "text/plain",
        )
        file_id = upload_data["file_ids"][0]

        # Read original bytes for comparison
        async with aiofiles.open(sample_txt_path, "rb") as f:
            original_content = await f.read()

        # Download
        response = await auth_client_with_mocked_llm.get(
            f"/api/v1/files/{file_id}/download",
        )

        # Assert status
        assert response.status_code == 200

        # Assert headers — text/plain may include charset
        content_type = response.headers["content-type"]
        assert content_type.startswith("text/plain")
        assert 'filename="sample.txt"' in response.headers["content-disposition"]
        assert response.headers["x-content-type-options"] == "nosniff"

        # Assert content matches original
        assert response.content == original_content

    async def test_download_nonexistent_file(
        self,
        auth_client_with_mocked_llm: AsyncClient,
        test_user: object,
    ) -> None:
        """Downloading a file that does not exist returns 404."""
        random_id = str(uuid4())
        response = await auth_client_with_mocked_llm.get(
            f"/api/v1/files/{random_id}/download",
        )

        assert response.status_code == 404
        assert "detail" in response.json()

    async def test_download_invalid_uuid(
        self,
        auth_client_with_mocked_llm: AsyncClient,
        test_user: object,
    ) -> None:
        """Downloading with an invalid UUID returns 422."""
        response = await auth_client_with_mocked_llm.get(
            "/api/v1/files/not-a-uuid/download",
        )

        assert response.status_code == 422

    async def test_download_content_integrity(
        self,
        auth_client_with_mocked_llm: AsyncClient,
        test_user: object,
        sample_pdf_path: Path,
    ) -> None:
        """Verify SHA-256 of downloaded content matches the original file."""
        # Upload
        upload_data = await self._upload_file(
            auth_client_with_mocked_llm,
            sample_pdf_path,
            "integrity-check.pdf",
            "application/pdf",
        )
        file_id = upload_data["file_ids"][0]

        # Read original and compute hash
        async with aiofiles.open(sample_pdf_path, "rb") as f:
            original_content = await f.read()
        original_sha256 = hashlib.sha256(original_content).hexdigest()

        # Download and compute hash
        response = await auth_client_with_mocked_llm.get(
            f"/api/v1/files/{file_id}/download",
        )
        assert response.status_code == 200

        downloaded_sha256 = hashlib.sha256(response.content).hexdigest()
        assert downloaded_sha256 == original_sha256, (
            f"SHA-256 mismatch: original={original_sha256}, downloaded={downloaded_sha256}"
        )
