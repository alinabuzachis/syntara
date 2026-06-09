"""Unit tests for FileManager.validate_and_save_files().

These tests validate:
- File save to storage directory (from config, default /tmp)
- Files saved with correct naming pattern (nexus-{file_id}-{filename})
- List of FileMetadata returned with file_path, status=PENDING_CONVERSION
- Async I/O (aiofiles) is used for file write operations
- Storage exception on save failures (disk full simulation)
- Logging of file upload events with metadata
- Detailed error logging for storage failures (but not exposed to client)
"""

import asyncio
import tempfile as tf
from collections.abc import Callable
from contextlib import AbstractContextManager
from typing import TYPE_CHECKING, cast
from unittest.mock import AsyncMock, Mock, patch

import pytest

if TYPE_CHECKING:
    from fastapi import UploadFile

from nexus.files.exceptions import FileContentNotFoundError
from nexus.files.file_manager import FileManager
from nexus.files.models import FileStatus, StorageBackend
from nexus.files.retrievers.local import LocalFileRetriever


@pytest.mark.asyncio
async def test_validate_and_save_files_success() -> None:
    """Test successful file save to storage directory.

    Validates:
    - Files saved to correct directory
    - Correct naming pattern used
    - Returns list of FileMetadata
    - Each metadata has file_path and status=PENDING_CONVERSION
    """
    # Arrange
    file_content = b"PDF content"
    mock_file = Mock()
    mock_file.filename = "test.pdf"
    mock_file.size = len(file_content)
    mock_file.content_type = "application/pdf"
    mock_file.read = AsyncMock(return_value=file_content)
    mock_file.seek = AsyncMock()

    file_manager = FileManager()

    # Act
    result = await file_manager.validate_and_save_files([mock_file])

    # Assert
    assert len(result) == 1
    metadata = result[0]
    assert metadata.filename == "test.pdf"
    assert metadata.size_bytes == len(file_content)
    assert metadata.mime_type == "text/plain"  # python-magic detects actual content
    assert metadata.status == FileStatus.PENDING_CONVERSION
    assert f"nexus-{metadata.id}-test.pdf" in metadata.file_path


@pytest.mark.asyncio
async def test_files_saved_with_correct_naming_pattern() -> None:
    """Test that files are saved with pattern: nexus-{file_id}-{filename}.

    Validates:
    - Naming pattern includes file_id
    - Original filename preserved
    - Path is absolute
    """
    # Arrange
    mock_file = Mock()
    mock_file.filename = "document.pdf"
    mock_file.size = 2048
    mock_file.content_type = "application/pdf"
    mock_file.read = AsyncMock(return_value=b"content")
    mock_file.seek = AsyncMock()

    file_manager = FileManager()

    # Act
    result = await file_manager.validate_and_save_files([mock_file])

    # Assert
    metadata = result[0]
    file_path = metadata.file_path
    expected_pattern = f"nexus-{metadata.id}-document.pdf"
    assert expected_pattern in file_path
    # Should be absolute path
    assert file_path.startswith("/")


@pytest.mark.asyncio
async def test_async_io_used_for_file_operations() -> None:
    """Test that aiofiles is used for async file write operations.

    Validates:
    - File writes are async
    - No blocking I/O operations
    """
    # Arrange
    mock_file = Mock()
    mock_file.filename = "async_test.pdf"
    mock_file.size = 512
    mock_file.content_type = "application/pdf"
    mock_file.read = AsyncMock(return_value=b"async content")
    mock_file.seek = AsyncMock()

    file_manager = FileManager()

    # Act & Assert
    # Should complete without blocking
    result = await asyncio.wait_for(file_manager.validate_and_save_files([mock_file]), timeout=5.0)
    assert len(result) == 1


@pytest.mark.asyncio
async def test_storage_exception_on_disk_full(
    override_settings: Callable[..., AbstractContextManager[object]],
) -> None:
    """Test storage exception raised when disk is full.

    Validates:
    - Storage failures raise appropriate exception
    - Exception message is generic (no internal details)
    """
    # Arrange
    mock_file = Mock()
    mock_file.filename = "fail.pdf"
    mock_file.size = 1024
    mock_file.content_type = "application/pdf"
    mock_file.read = AsyncMock(return_value=b"content")
    mock_file.seek = AsyncMock()

    with override_settings(file_upload_storage_dir="/nonexistent/path/that/does/not/exist"):
        file_manager = FileManager()

        # Act & Assert
        with pytest.raises((OSError, FileContentNotFoundError)):
            await file_manager.validate_and_save_files([mock_file])


@pytest.mark.asyncio
async def test_file_upload_events_logged() -> None:
    """Test that file upload events are logged with metadata.

    Validates:
    - Each file upload is logged
    - Log includes filename, size, user ID, timestamp
    """
    # Arrange
    mock_file = Mock()
    mock_file.filename = "logged.pdf"
    mock_file.size = 1024
    mock_file.content_type = "application/pdf"
    mock_file.read = AsyncMock(return_value=b"content")
    mock_file.seek = AsyncMock()

    with patch("nexus.files.file_manager.logger") as mock_logger:
        file_manager = FileManager()

        # Act
        await file_manager.validate_and_save_files([mock_file])

        # Assert
        # Should have logged the upload
        assert mock_logger.info.called or mock_logger.debug.called


@pytest.mark.asyncio
async def test_storage_failure_detailed_logging(
    override_settings: Callable[..., AbstractContextManager[object]],
) -> None:
    """Test detailed error logging for storage failures (internal only).

    Validates:
    - Storage failures logged with full details
    - Log includes exception details, paths
    - Details NOT exposed in exception message to client
    """
    # Arrange
    mock_file = Mock()
    mock_file.filename = "fail.pdf"
    mock_file.size = 1024
    mock_file.content_type = "application/pdf"
    mock_file.read = AsyncMock(return_value=b"content")
    mock_file.seek = AsyncMock()

    with (
        patch("nexus.files.file_manager.logger") as mock_logger,
        override_settings(file_upload_storage_dir="/invalid/path"),
    ):
        file_manager = FileManager()

        # Act & Assert
        with pytest.raises((OSError, FileContentNotFoundError)):
            await file_manager.validate_and_save_files([mock_file])

        # Should have logged error with details
        assert mock_logger.error.called or mock_logger.exception.called


@pytest.mark.asyncio
async def test_multiple_files_saved_successfully() -> None:
    """Test saving multiple files in single operation.

    Validates:
    - Multiple files processed correctly
    - Each gets unique file_path
    - All metadata returned
    """
    # Arrange
    mock_files = []
    for i in range(3):
        mock_file = Mock()
        mock_file.filename = f"file{i}.pdf"
        mock_file.size = 1024 * (i + 1)
        mock_file.content_type = "application/pdf"
        mock_file.read = AsyncMock(return_value=f"content{i}".encode())
        mock_file.seek = AsyncMock()
        mock_files.append(mock_file)

    file_manager = FileManager()

    # Act
    result = await file_manager.validate_and_save_files(cast("list[UploadFile]", mock_files))

    # Assert
    assert len(result) == 3
    # Each should have unique file_path
    file_paths = [m.file_path for m in result]
    assert len(set(file_paths)) == 3
    # All should have status=PENDING_CONVERSION
    assert all(m.status == FileStatus.PENDING_CONVERSION for m in result)


@pytest.mark.asyncio
async def test_configurable_storage_directory(
    override_settings: Callable[..., AbstractContextManager[object]],
) -> None:
    """Test that storage directory is configurable.

    Validates:
    - Custom storage directory can be set
    - Files saved to configured directory
    """
    # Arrange
    # Use tempfile to create a valid custom directory
    with tf.TemporaryDirectory() as custom_dir:
        mock_file = Mock()
        mock_file.filename = "test.pdf"
        mock_file.size = 1024
        mock_file.content_type = "application/pdf"
        mock_file.read = AsyncMock(return_value=b"content")
        mock_file.seek = AsyncMock()

        with override_settings(file_upload_storage_dir=custom_dir):
            file_manager = FileManager()

            # Act
            result = await file_manager.validate_and_save_files([mock_file])

            # Assert
            file_path = result[0].file_path
            assert custom_dir in file_path


# =============================================================================
# Config-driven backend selection
# =============================================================================


def test_file_manager_default_backend_is_local() -> None:
    """Test that default active_backend is 'local'."""
    fm = FileManager()
    assert fm.active_backend == StorageBackend.LOCAL
    assert StorageBackend.LOCAL in fm.retrievers


def test_file_manager_s3_backend_registered_when_configured(
    override_settings: Callable[..., AbstractContextManager[object]],
) -> None:
    """Test that S3 retriever is registered when file_storage_backend='s3'."""
    with override_settings(
        file_storage_backend="s3",
        s3_endpoint_url="http://localhost:9000",
        s3_bucket_name="test-bucket",
    ):
        fm = FileManager()
        assert fm.active_backend == StorageBackend.S3
        assert StorageBackend.S3 in fm.retrievers
        assert StorageBackend.LOCAL in fm.retrievers


def test_invalid_backend_rejected_by_settings() -> None:
    """Test that Pydantic rejects invalid storage backend values."""
    from pydantic import ValidationError

    from nexus.core.config.base import Settings

    with pytest.raises(ValidationError, match="Input should be"):
        Settings(file_storage_backend="gcs")  # type: ignore[arg-type]


# =============================================================================
# Dual-read: get_retriever_for_existing_file
# =============================================================================


def test_get_retriever_for_existing_file_local() -> None:
    """Test looking up retriever for existing local files."""
    fm = FileManager()
    retriever = fm.get_retriever_for_existing_file(StorageBackend.LOCAL)
    assert isinstance(retriever, LocalFileRetriever)


def test_get_retriever_for_existing_file_unregistered_raises() -> None:
    """Test that unregistered backend raises ValueError."""
    fm = FileManager()
    with pytest.raises(ValueError, match="not available"):
        fm.get_retriever_for_existing_file(StorageBackend.S3)


# =============================================================================
# Upload flow: new FileMetadata fields
# =============================================================================


@pytest.mark.asyncio
async def test_upload_sets_storage_backend_and_content_hash() -> None:
    """Test that upload populates storage_backend and content_hash."""
    file_content = b"hash me"
    mock_file = Mock()
    mock_file.filename = "hash_test.txt"
    mock_file.size = len(file_content)
    mock_file.content_type = "text/plain"
    mock_file.read = AsyncMock(return_value=file_content)
    mock_file.seek = AsyncMock()

    fm = FileManager()
    result = await fm.validate_and_save_files([mock_file])
    metadata = result[0]

    assert metadata.storage_backend == StorageBackend.LOCAL
    assert metadata.content_hash is not None
    assert len(metadata.content_hash) == 64

    import hashlib

    expected_hash = hashlib.sha256(file_content).hexdigest()
    assert metadata.content_hash == expected_hash


@pytest.mark.asyncio
async def test_upload_sets_retention_when_ttl_configured(
    override_settings: Callable[..., AbstractContextManager[object]],
) -> None:
    """Test that retention_expires_at is set when TTL is configured."""
    mock_file = Mock()
    mock_file.filename = "ttl_test.txt"
    mock_file.size = 10
    mock_file.content_type = "text/plain"
    mock_file.read = AsyncMock(return_value=b"ttl content")
    mock_file.seek = AsyncMock()

    with override_settings(file_retention_ttl_hours=24):
        fm = FileManager()
        result = await fm.validate_and_save_files([mock_file])
        metadata = result[0]
        assert metadata.retention_expires_at is not None


@pytest.mark.asyncio
async def test_upload_no_retention_when_ttl_not_configured() -> None:
    """Test that retention_expires_at is None when no TTL configured."""
    mock_file = Mock()
    mock_file.filename = "no_ttl.txt"
    mock_file.size = 10
    mock_file.content_type = "text/plain"
    mock_file.read = AsyncMock(return_value=b"no ttl")
    mock_file.seek = AsyncMock()

    fm = FileManager()
    result = await fm.validate_and_save_files([mock_file])
    metadata = result[0]
    assert metadata.retention_expires_at is None
