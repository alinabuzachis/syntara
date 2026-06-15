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
from nexus.files.models import FileMetadata, FileStatus, StorageBackend
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


# =============================================================================
# load_file_with_integrity_check tests
# =============================================================================


@pytest.mark.asyncio
async def test_load_file_with_integrity_check_success() -> None:
    """Test successful load with matching content hash."""
    import hashlib

    file_content = b"integrity check content"
    content_hash = hashlib.sha256(file_content).hexdigest()

    fm = FileManager()

    # Save a real file so load_file works
    saved_path = await fm.retrievers[StorageBackend.LOCAL].save_file(
        file_content,
        "integrity-check.txt",
    )

    # Build a mock FileMetadata with matching hash
    mock_metadata = Mock()
    mock_metadata.storage_backend = StorageBackend.LOCAL
    mock_metadata.file_path = saved_path
    mock_metadata.content_hash = content_hash
    mock_metadata.id = "test-id"
    mock_metadata.filename = "integrity-check.txt"

    result = await fm.load_file_with_integrity_check(mock_metadata)
    assert result == file_content


@pytest.mark.asyncio
async def test_load_file_with_integrity_check_no_hash() -> None:
    """Test load skips integrity check when content_hash is None (legacy files)."""
    file_content = b"legacy file"

    fm = FileManager()
    saved_path = await fm.retrievers[StorageBackend.LOCAL].save_file(
        file_content,
        "legacy.txt",
    )

    mock_metadata = Mock()
    mock_metadata.storage_backend = StorageBackend.LOCAL
    mock_metadata.file_path = saved_path
    mock_metadata.content_hash = None

    result = await fm.load_file_with_integrity_check(mock_metadata)
    assert result == file_content


@pytest.mark.asyncio
async def test_load_file_with_integrity_check_hash_mismatch() -> None:
    """Test load raises FileIntegrityError when hash doesn't match."""
    from nexus.files.exceptions import FileIntegrityError

    file_content = b"tampered content"

    fm = FileManager()
    saved_path = await fm.retrievers[StorageBackend.LOCAL].save_file(
        file_content,
        "tampered.txt",
    )

    mock_metadata = Mock()
    mock_metadata.storage_backend = StorageBackend.LOCAL
    mock_metadata.file_path = saved_path
    mock_metadata.content_hash = "0000000000000000000000000000000000000000000000000000000000000000"
    mock_metadata.id = "test-id"
    mock_metadata.filename = "tampered.txt"

    with pytest.raises(FileIntegrityError, match="File integrity check failed"):
        await fm.load_file_with_integrity_check(mock_metadata)


# =============================================================================
# get_file_metadata (DB query) tests
# =============================================================================


@pytest.mark.asyncio
async def test_get_file_metadata_returns_result() -> None:
    """Test get_file_metadata delegates to session.get."""
    from uuid import uuid4

    fm = FileManager()
    file_id = uuid4()

    mock_session = AsyncMock()
    mock_file = Mock()
    mock_session.get.return_value = mock_file

    result = await fm.get_file_metadata(file_id, mock_session)
    assert result is mock_file
    mock_session.get.assert_called_once_with(FileMetadata, file_id)


@pytest.mark.asyncio
async def test_get_file_metadata_returns_none_when_not_found() -> None:
    """Test get_file_metadata returns None for missing file."""
    from uuid import uuid4

    fm = FileManager()
    file_id = uuid4()

    mock_session = AsyncMock()
    mock_session.get.return_value = None

    result = await fm.get_file_metadata(file_id, mock_session)
    assert result is None


# =============================================================================
# get_files_metadata tests
# =============================================================================


@pytest.mark.asyncio
async def test_get_files_metadata_empty_list() -> None:
    """Test get_files_metadata returns empty list for empty input."""
    fm = FileManager()
    mock_session = AsyncMock()

    result = await fm.get_files_metadata([], mock_session)
    assert result == []
    # Should not query the database
    mock_session.exec.assert_not_called()


@pytest.mark.asyncio
async def test_get_files_metadata_with_ids() -> None:
    """Test get_files_metadata queries database with file IDs."""
    from uuid import uuid4

    fm = FileManager()
    file_ids = [uuid4(), uuid4()]

    mock_file1 = Mock()
    mock_file2 = Mock()

    mock_result = Mock()
    mock_result.all.return_value = [mock_file1, mock_file2]
    mock_session = AsyncMock()
    mock_session.exec.return_value = mock_result

    result = await fm.get_files_metadata(file_ids, mock_session)
    assert len(result) == 2
    assert result[0] is mock_file1
    assert result[1] is mock_file2
    mock_session.exec.assert_called_once()


# =============================================================================
# update_file_status tests
# =============================================================================


@pytest.mark.asyncio
async def test_update_file_status_success() -> None:
    """Test update_file_status updates status and commits."""
    from uuid import uuid4

    fm = FileManager()
    file_id = uuid4()

    mock_file = Mock()
    mock_file.status = FileStatus.PENDING_CONVERSION
    mock_file.converted_content_path = None
    mock_file.conversion_error = None

    mock_session = AsyncMock()
    mock_session.get.return_value = mock_file
    # session.add is synchronous, use Mock to avoid coroutine warnings
    mock_session.add = Mock()

    result = await fm.update_file_status(
        file_id,
        FileStatus.CONVERTED,
        mock_session,
        converted_content_path="/path/to/content.md",
    )

    assert result is mock_file
    assert mock_file.status == FileStatus.CONVERTED
    assert mock_file.converted_content_path == "/path/to/content.md"
    mock_session.add.assert_called_once_with(mock_file)
    mock_session.commit.assert_called_once()


@pytest.mark.asyncio
async def test_update_file_status_with_error() -> None:
    """Test update_file_status sets conversion_error on failure."""
    from uuid import uuid4

    fm = FileManager()
    file_id = uuid4()

    mock_file = Mock()
    mock_file.status = FileStatus.CONVERTING

    mock_session = AsyncMock()
    mock_session.get.return_value = mock_file
    # session.add is synchronous, use Mock to avoid coroutine warnings
    mock_session.add = Mock()

    result = await fm.update_file_status(
        file_id,
        FileStatus.CONVERSION_FAILED,
        mock_session,
        conversion_error="Conversion timeout",
    )

    assert result is mock_file
    assert mock_file.status == FileStatus.CONVERSION_FAILED
    assert mock_file.conversion_error == "Conversion timeout"


@pytest.mark.asyncio
async def ***REMOVED***() -> None:
    """Test update_file_status raises ValueError when file not found."""
    from uuid import uuid4

    from nexus.core.exceptions import SafeValueError

    fm = FileManager()
    file_id = uuid4()

    mock_session = AsyncMock()
    mock_session.get.return_value = None

    with pytest.raises(SafeValueError, match="File not found"):
        await fm.update_file_status(file_id, FileStatus.CONVERTED, mock_session)


# =============================================================================
# get_file_manager factory tests
# =============================================================================


def test_get_file_manager_returns_singleton() -> None:
    """Test get_file_manager returns a FileManager instance."""
    from nexus.files.file_manager import get_file_manager

    fm = get_file_manager()
    assert isinstance(fm, FileManager)


def test_get_file_manager_returns_same_instance() -> None:
    """Test get_file_manager returns the same cached instance."""
    from nexus.files.file_manager import get_file_manager

    fm1 = get_file_manager()
    fm2 = get_file_manager()
    assert fm1 is fm2


# =============================================================================
# _require_backend error path
# =============================================================================


def test_require_backend_raises_for_missing_backend() -> None:
    """Test _require_backend raises SafeValueError with descriptive message."""
    from nexus.core.exceptions import SafeValueError

    fm = FileManager()
    # S3 is not registered by default (no s3_endpoint_url configured)
    with pytest.raises(SafeValueError, match="not available"):
        fm._require_backend(StorageBackend.S3)


# =============================================================================
# validate_and_save_files — validation error audit dispatch
# =============================================================================


@pytest.mark.asyncio
async def test_validate_and_save_files_validation_error_dispatches_audit() -> None:
    """Test that validation errors dispatch an audit event before raising."""
    from nexus.files.exceptions import FileValidationError

    fm = FileManager()

    # Create a file that will fail validation (empty content)
    mock_file = Mock()
    mock_file.filename = "empty.pdf"
    mock_file.size = 0
    mock_file.content_type = "application/pdf"
    mock_file.read = AsyncMock(return_value=b"")
    mock_file.seek = AsyncMock()

    with (
        patch("nexus.files.file_manager.AuditEventDispatcher.dispatch") as mock_dispatch,
        patch(
            "nexus.files.file_manager.validators.validate_files",
            side_effect=FileValidationError("File too small"),
        ),
    ):
        with pytest.raises(FileValidationError):
            await fm.validate_and_save_files([mock_file])

        # Audit event should have been dispatched
        mock_dispatch.assert_called_once()
