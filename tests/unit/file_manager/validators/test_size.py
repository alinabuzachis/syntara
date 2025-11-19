"""Unit tests for FileManager file size validation.

These tests validate:
- FileManager raises ValidationError when any file exceeds size limit (10MB default per file)
- Error message includes actual and max size
"""

from typing import TYPE_CHECKING, cast
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

import pytest

if TYPE_CHECKING:
    from fastapi import UploadFile

from nexus.agent_orchestrator.context_manager.file_manager import FileManager
from nexus.agent_orchestrator.context_manager.file_manager.validators import ValidationError
from nexus.core.config import Settings


@pytest.mark.asyncio
async def test_rejects_file_exceeding_size_limit() -> None:
    """Test that FileManager raises ValidationError for oversized files.

    Validates:
    - Raises ValidationError when file size > max_size_mb
    - Default limit is 10MB per file
    """
    # Arrange - 11MB file (exceeds default 10MB limit)
    invocation_id = str(uuid4())
    large_content = b"0" * (11 * 1024 * 1024)  # 11MB
    mock_file = Mock()
    mock_file.filename = "large.pdf"
    mock_file.size = len(large_content)
    mock_file.content_type = "application/pdf"
    mock_file.read = AsyncMock(return_value=large_content)
    mock_file.seek = AsyncMock()

    file_manager = FileManager()

    # Act & Assert
    with pytest.raises(ValidationError) as exc_info:
        await file_manager.validate_and_save_files([mock_file], invocation_id)

    # Error message should mention file is too large
    error_message = str(exc_info.value)
    assert "too large" in error_message


@pytest.mark.asyncio
async def test_error_message_includes_actual_and_max_size() -> None:
    """Test that error message includes actual size and max size.

    Validates:
    - Error message is actionable
    - Shows file size in bytes and limit
    """
    # Arrange - 15MB file
    invocation_id = str(uuid4())
    size_bytes = 15 * 1024 * 1024  # 15MB
    large_content = b"0" * size_bytes
    mock_file = Mock()
    mock_file.filename = "oversized.pdf"
    mock_file.size = size_bytes
    mock_file.content_type = "application/pdf"
    mock_file.read = AsyncMock(return_value=large_content)
    mock_file.seek = AsyncMock()

    file_manager = FileManager()

    # Act & Assert
    with pytest.raises(ValidationError) as exc_info:
        await file_manager.validate_and_save_files([mock_file], invocation_id)

    error_message = str(exc_info.value)
    # Should mention actual and max size in MB
    assert "too large" in error_message
    assert "10MB" in error_message  # Max size
    assert "15" in error_message  # Actual size (15.00MB)


@pytest.mark.asyncio
async def test_accepts_file_at_exact_size_limit() -> None:
    """Test that file at exact size limit is accepted.

    Validates:
    - 10MB file (at limit) succeeds
    - Boundary condition handled correctly
    """
    # Arrange - Exactly 10MB
    invocation_id = str(uuid4())
    size_bytes = 10 * 1024 * 1024  # Exactly 10MB
    content = b"0" * size_bytes
    mock_file = Mock()
    mock_file.filename = "exact_limit.pdf"
    mock_file.size = size_bytes
    mock_file.content_type = "application/pdf"
    mock_file.read = AsyncMock(return_value=content)
    mock_file.seek = AsyncMock()

    with patch("magic.from_buffer") as mock_magic:
        mock_magic.return_value = "application/pdf"

        file_manager = FileManager()

        # Act
        result = await file_manager.validate_and_save_files([mock_file], invocation_id)

        # Assert
        assert len(result) == 1
        assert result[0].size_bytes == len(content)


@pytest.mark.asyncio
async def test_accepts_file_below_size_limit() -> None:
    """Test that file below size limit is accepted.

    Validates:
    - Smaller files pass validation
    - No error for valid sizes
    """
    # Arrange - 5MB file (below limit)
    invocation_id = str(uuid4())
    size_bytes = 5 * 1024 * 1024  # 5MB
    content = b"0" * size_bytes
    mock_file = Mock()
    mock_file.filename = "small.pdf"
    mock_file.size = size_bytes
    mock_file.content_type = "application/pdf"
    mock_file.read = AsyncMock(return_value=content)
    mock_file.seek = AsyncMock()

    with patch("magic.from_buffer") as mock_magic:
        mock_magic.return_value = "application/pdf"

        file_manager = FileManager()

        # Act
        result = await file_manager.validate_and_save_files([mock_file], invocation_id)

        # Assert
        assert len(result) == 1
        assert result[0].size_bytes == len(content)


@pytest.mark.asyncio
async def test_validates_each_file_size_independently() -> None:
    """Test that each file is validated independently for size.

    Validates:
    - Multiple files each checked against limit
    - One oversized file fails entire batch
    """
    # Arrange - 2 small files + 1 large file
    invocation_id = str(uuid4())
    mock_files = []

    # Small file 1
    mock_file1 = Mock()
    mock_file1.filename = "small1.pdf"
    mock_file1.size = 1 * 1024 * 1024  # 1MB
    mock_file1.content_type = "application/pdf"
    mock_file1.read = AsyncMock(return_value=b"0" * mock_file1.size)
    mock_file1.seek = AsyncMock()
    mock_files.append(mock_file1)

    # Small file 2
    mock_file2 = Mock()
    mock_file2.filename = "small2.pdf"
    mock_file2.size = 2 * 1024 * 1024  # 2MB
    mock_file2.content_type = "application/pdf"
    mock_file2.read = AsyncMock(return_value=b"0" * mock_file2.size)
    mock_file2.seek = AsyncMock()
    mock_files.append(mock_file2)

    # Large file (exceeds limit)
    mock_file3 = Mock()
    mock_file3.filename = "large.pdf"
    mock_file3.size = 11 * 1024 * 1024  # 11MB
    mock_file3.content_type = "application/pdf"
    mock_file3.read = AsyncMock(return_value=b"0" * mock_file3.size)
    mock_file3.seek = AsyncMock()
    mock_files.append(mock_file3)

    file_manager = FileManager()

    # Act & Assert
    with pytest.raises(ValidationError) as exc_info:
        await file_manager.validate_and_save_files(cast("list[UploadFile]", mock_files), invocation_id)

    # Should fail due to large.pdf being too large
    error_message = str(exc_info.value)
    assert "too large" in error_message
    assert "large.pdf" in error_message


@pytest.mark.asyncio
async def test_configurable_max_size_limit() -> None:
    """Test that max_size_mb limit is configurable.

    Validates:
    - Custom size limit can be set
    - Validation uses configured limit
    """
    # Arrange - 6MB file with custom limit of 5MB
    invocation_id = str(uuid4())
    size_bytes = 6 * 1024 * 1024  # 6MB
    content = b"0" * size_bytes
    mock_file = Mock()
    mock_file.filename = "custom_limit_test.pdf"
    mock_file.size = size_bytes
    mock_file.content_type = "application/pdf"
    mock_file.read = AsyncMock(return_value=content)
    mock_file.seek = AsyncMock()

    custom_settings = Settings()
    custom_settings.file_upload_max_size_mb = 5

    with patch("nexus.agent_orchestrator.context_manager.file_manager.get_settings", return_value=custom_settings):
        file_manager = FileManager()

        # Act & Assert
        with pytest.raises(ValidationError) as exc_info:
            await file_manager.validate_and_save_files([mock_file], invocation_id)

        # Should validate against custom limit (5MB)
        error_message = str(exc_info.value)
        assert "5" in error_message
        assert "6" in error_message


@pytest.mark.asyncio
async def test_very_small_file_accepted() -> None:
    """Test that very small files are accepted.

    Validates:
    - Minimum file sizes work (1KB)
    """
    # Arrange - 1KB file
    invocation_id = str(uuid4())
    size_bytes = 1024  # 1KB
    content = b"0" * size_bytes
    mock_file = Mock()
    mock_file.filename = "tiny.txt"
    mock_file.size = size_bytes
    mock_file.content_type = "text/plain"
    mock_file.read = AsyncMock(return_value=content)
    mock_file.seek = AsyncMock()

    file_manager = FileManager()

    # Act
    result = await file_manager.validate_and_save_files([mock_file], invocation_id)

    # Assert
    assert len(result) == 1
    assert result[0].size_bytes == len(content)
