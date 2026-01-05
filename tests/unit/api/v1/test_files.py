"""Unit tests for Files API endpoint (POST /api/v1/files).

These tests validate the standalone file upload API that creates FileMetadata
records in the database for later use in agent invocations.

Tests cover:
- Single and multiple file uploads
- File validation (size, type, count)
- FileMetadata creation in database
- Response schema validation
"""

import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.files.models import FileMetadata, FileStatus


class TestFilesAPIUpload:
    """Test POST /api/v1/files endpoint."""

    @pytest.mark.asyncio
    async def test_upload_single_file_returns_file_id(
        self,
        auth_client: AsyncClient,
    ) -> None:
        """Test uploading a single file returns file_id in response."""
        # Arrange - Use plain text file since MIME type is detected from content
        files = [("files", ("document.txt", b"Sample text content here", "text/plain"))]

        # Act
        response = await auth_client.post(
            "/api/v1/files",
            files=files,
        )

        # Assert
        assert response.status_code == 200
        response_data = response.json()
        assert "file_ids" in response_data
        assert len(response_data["file_ids"]) == 1
        assert "files" in response_data
        assert len(response_data["files"]) == 1

        file_info = response_data["files"][0]
        assert file_info["file_id"] == response_data["file_ids"][0]
        assert file_info["filename"] == "document.txt"
        assert file_info["mime_type"] == "text/plain"
        assert file_info["status"] == "pending_conversion"
        # SECURITY: file_path should not be exposed
        assert "file_path" not in file_info

    @pytest.mark.asyncio
    async def test_upload_multiple_files_returns_file_ids(
        self,
        auth_client: AsyncClient,
    ) -> None:
        """Test uploading multiple files returns all file_ids."""
        # Arrange
        files = [
            ("files", ("doc1.pdf", b"First PDF content", "application/pdf")),
            ("files", ("doc2.txt", b"Text content", "text/plain")),
            ("files", ("doc3.md", b"# Markdown", "text/markdown")),
        ]

        # Act
        response = await auth_client.post(
            "/api/v1/files",
            files=files,
        )

        # Assert
        assert response.status_code == 200
        response_data = response.json()
        assert len(response_data["file_ids"]) == 3
        assert len(response_data["files"]) == 3

        filenames = {f["filename"] for f in response_data["files"]}
        assert filenames == {"doc1.pdf", "doc2.txt", "doc3.md"}

    @pytest.mark.asyncio
    async def test_upload_rejects_file_too_large(
        self,
        auth_client: AsyncClient,
    ) -> None:
        """Test that files exceeding size limit are rejected."""
        # Arrange - Create file larger than 10MB limit
        large_content = b"x" * (11 * 1024 * 1024)  # 11 MB
        files = [("files", ("large.pdf", large_content, "application/pdf"))]

        # Act
        response = await auth_client.post(
            "/api/v1/files",
            files=files,
        )

        # Assert
        assert response.status_code == 400
        error_data = response.json()
        assert "detail" in error_data

    @pytest.mark.asyncio
    async def test_upload_rejects_invalid_mime_type(
        self,
        auth_client: AsyncClient,
    ) -> None:
        """Test that files with unsupported MIME types are rejected."""
        # Arrange - PNG magic bytes (0x89 PNG signature) that will be detected as image/png
        png_signature = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        files = [("files", ("image.png", png_signature, "image/png"))]

        # Act
        response = await auth_client.post(
            "/api/v1/files",
            files=files,
        )

        # Assert
        assert response.status_code == 400
        error_data = response.json()
        assert "detail" in error_data

    @pytest.mark.asyncio
    async def test_upload_rejects_too_many_files(
        self,
        auth_client: AsyncClient,
    ) -> None:
        """Test that exceeding file count limit is rejected."""
        # Arrange - Create 11 files (limit is 10)
        files = [("files", (f"file{i}.pdf", b"PDF content", "application/pdf")) for i in range(11)]

        # Act
        response = await auth_client.post(
            "/api/v1/files",
            files=files,
        )

        # Assert
        assert response.status_code == 400
        error_data = response.json()
        assert "detail" in error_data

    @pytest.mark.asyncio
    async def test_upload_creates_file_metadata_record(
        self,
        auth_client: AsyncClient,
        test_db_session: AsyncSession,
    ) -> None:
        """Test that uploading a file creates FileMetadata record in database."""
        # Arrange
        files = [("files", ("database_test.txt", b"Test content", "text/plain"))]

        # Act
        response = await auth_client.post(
            "/api/v1/files",
            files=files,
        )

        # Assert - Response is successful
        assert response.status_code == 200
        response_data = response.json()
        file_id = response_data["file_ids"][0]

        # Assert - FileMetadata record exists in database
        from sqlmodel import select

        result = await test_db_session.exec(select(FileMetadata).where(FileMetadata.id == file_id))
        file_record = result.one_or_none()

        assert file_record is not None
        assert file_record.filename == "database_test.txt"
        assert file_record.mime_type == "text/plain"
        assert file_record.status == FileStatus.PENDING_CONVERSION

    @pytest.mark.asyncio
    async def test_upload_returns_correct_response_schema(
        self,
        auth_client: AsyncClient,
    ) -> None:
        """Test that response matches the expected FileUploadResponse schema."""
        # Arrange
        files = [("files", ("schema_test.pdf", b"PDF content", "application/pdf"))]

        # Act
        response = await auth_client.post(
            "/api/v1/files",
            files=files,
        )

        # Assert
        assert response.status_code == 200
        response_data = response.json()

        # Required top-level fields
        assert "file_ids" in response_data
        assert "files" in response_data
        assert isinstance(response_data["file_ids"], list)
        assert isinstance(response_data["files"], list)

        # Each file metadata has required fields
        for file_info in response_data["files"]:
            assert "file_id" in file_info
            assert "filename" in file_info
            assert "size_bytes" in file_info
            assert "mime_type" in file_info
            assert "status" in file_info
            # SECURITY: file_path must not be exposed
            assert "file_path" not in file_info

    @pytest.mark.asyncio
    async def test_upload_empty_files_list_rejected(
        self,
        auth_client: AsyncClient,
    ) -> None:
        """Test that request with no files is rejected."""
        # Act - No files provided
        response = await auth_client.post(
            "/api/v1/files",
            files=[],
        )

        # Assert - FastAPI returns 422 for missing required file parameter
        assert response.status_code == 422
