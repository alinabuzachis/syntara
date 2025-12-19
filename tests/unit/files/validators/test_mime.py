"""Unit tests for FileManager MIME type validation.

These tests validate:
- FileManager MIME type detection using python-magic for each file
- FileManager raises ValidationError for unsupported formats (e.g., image/png)
- Error message lists supported formats
"""

from typing import TYPE_CHECKING, cast
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

import pytest

if TYPE_CHECKING:
    from fastapi import UploadFile

from nexus.core.config import Settings
from nexus.files import FileManager
from nexus.files.validators import ValidationError


@pytest.mark.asyncio
async def test_validates_mime_type_using_python_magic() -> None:
    """Test that MIME type detection uses python-magic.

    Validates:
    - python-magic is used for MIME detection
    - Content-based detection (not just file extension)
    """
    # Arrange
    invocation_id = str(uuid4())
    mock_file = Mock()
    mock_file.filename = "document.pdf"
    mock_file.size = 1024
    mock_file.content_type = "application/pdf"
    mock_file.read = AsyncMock(return_value=b"PDF content")
    mock_file.seek = AsyncMock()

    with patch("magic.from_buffer") as mock_magic:
        mock_magic.return_value = "application/pdf"

        custom_settings = Settings()
        custom_settings.file_upload_allowed_mime_types = ["application/pdf", "text/plain"]

        with patch("nexus.files.file_manager.get_settings", return_value=custom_settings):
            file_manager = FileManager()

            # Act
            result = await file_manager.validate_and_save_files([mock_file], invocation_id)

            # Assert
            # python-magic should have been called
            mock_magic.assert_called()
            assert len(result) == 1


@pytest.mark.asyncio
async def test_rejects_unsupported_mime_types() -> None:
    """Test that unsupported MIME types are rejected.

    Validates:
    - image/png is rejected
    - ValidationError raised for unsupported formats
    """
    # Arrange - PNG image (unsupported)
    invocation_id = str(uuid4())
    mock_file = Mock()
    mock_file.filename = "image.png"
    mock_file.size = 1024
    mock_file.content_type = "image/png"
    mock_file.read = AsyncMock(return_value=b"PNG image data")
    mock_file.seek = AsyncMock()

    with patch("magic.from_buffer") as mock_magic:
        mock_magic.return_value = "image/png"

        custom_settings = Settings()
        custom_settings.file_upload_allowed_mime_types = [
            "application/pdf",
            "text/plain",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ]

        with patch("nexus.files.file_manager.get_settings", return_value=custom_settings):
            file_manager = FileManager()

            # Act & Assert
            with pytest.raises(ValidationError) as exc_info:
                await file_manager.validate_and_save_files([mock_file], invocation_id)

            # Error should mention unsupported format and detected MIME type
            error_message = str(exc_info.value)
            assert "Unsupported file format" in error_message
            assert "image/png" in error_message
            assert "Supported formats:" in error_message


@pytest.mark.asyncio
async def test_error_message_lists_supported_formats() -> None:
    """Test that error message lists supported formats.

    Validates:
    - Error message is actionable
    - Shows which formats are supported
    """
    # Arrange - Unsupported format
    invocation_id = str(uuid4())
    mock_file = Mock()
    mock_file.filename = "video.mp4"
    mock_file.size = 1024
    mock_file.content_type = "video/mp4"
    mock_file.read = AsyncMock(return_value=b"video data")
    mock_file.seek = AsyncMock()

    with patch("magic.from_buffer") as mock_magic:
        mock_magic.return_value = "video/mp4"

        custom_settings = Settings()
        custom_settings.file_upload_allowed_mime_types = ["application/pdf", "text/plain"]

        with patch("nexus.files.file_manager.get_settings", return_value=custom_settings):
            file_manager = FileManager()

            # Act & Assert
            with pytest.raises(ValidationError) as exc_info:
                await file_manager.validate_and_save_files([mock_file], invocation_id)

            error_message = str(exc_info.value)
            # Should list the supported MIME types
            assert "Unsupported file format" in error_message
            assert "video/mp4" in error_message
            assert "application/pdf" in error_message
            assert "text/plain" in error_message


@pytest.mark.asyncio
async def test_accepts_pdf_mime_type() -> None:
    """Test that application/pdf is accepted.

    Validates:
    - PDF is in allowed MIME types
    - PDF files pass validation
    """
    # Arrange
    invocation_id = str(uuid4())
    mock_file = Mock()
    mock_file.filename = "document.pdf"
    mock_file.size = 1024
    mock_file.content_type = "application/pdf"
    mock_file.read = AsyncMock(return_value=b"PDF content")
    mock_file.seek = AsyncMock()

    with patch("magic.from_buffer") as mock_magic:
        mock_magic.return_value = "application/pdf"

        custom_settings = Settings()
        custom_settings.file_upload_allowed_mime_types = ["application/pdf"]

        with patch("nexus.files.file_manager.get_settings", return_value=custom_settings):
            file_manager = FileManager()

            # Act
            result = await file_manager.validate_and_save_files([mock_file], invocation_id)

            # Assert
            assert len(result) == 1
            assert result[0].mime_type == "application/pdf"


@pytest.mark.asyncio
async def test_accepts_docx_mime_type() -> None:
    """Test that DOCX MIME type is accepted.

    Validates:
    - application/vnd.openxmlformats-officedocument.wordprocessingml.document accepted
    """
    # Arrange
    invocation_id = str(uuid4())
    mock_file = Mock()
    mock_file.filename = "document.docx"
    mock_file.size = 2048
    mock_file.content_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    mock_file.read = AsyncMock(return_value=b"DOCX content")
    mock_file.seek = AsyncMock()

    with patch("magic.from_buffer") as mock_magic:
        mock_magic.return_value = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

        custom_settings = Settings()
        custom_settings.file_upload_allowed_mime_types = [
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ]

        with patch("nexus.files.file_manager.get_settings", return_value=custom_settings):
            file_manager = FileManager()

            # Act
            result = await file_manager.validate_and_save_files([mock_file], invocation_id)

            # Assert
            assert len(result) == 1
            assert "wordprocessing" in result[0].mime_type


@pytest.mark.asyncio
async def test_accepts_text_plain_mime_type() -> None:
    """Test that text/plain is accepted.

    Validates:
    - Plain text files accepted
    - TXT and MD files supported
    """
    # Arrange
    invocation_id = str(uuid4())
    mock_file = Mock()
    mock_file.filename = "readme.txt"
    mock_file.size = 512
    mock_file.content_type = "text/plain"
    mock_file.read = AsyncMock(return_value=b"Plain text content")
    mock_file.seek = AsyncMock()

    custom_settings = Settings()
    custom_settings.file_upload_allowed_mime_types = ["text/plain"]

    with patch("nexus.files.file_manager.get_settings", return_value=custom_settings):
        file_manager = FileManager()

        # Act
        result = await file_manager.validate_and_save_files([mock_file], invocation_id)

        # Assert
        assert len(result) == 1
        assert result[0].mime_type == "text/plain"


@pytest.mark.asyncio
async def test_validates_mime_type_for_each_file() -> None:
    """Test that MIME type is validated for each file independently.

    Validates:
    - Multiple files each validated
    - One unsupported file fails entire batch
    """
    # Arrange - 2 supported files + 1 unsupported
    invocation_id = str(uuid4())
    mock_files = []

    # Supported PDF
    mock_file1 = Mock()
    mock_file1.filename = "doc.pdf"
    mock_file1.size = 1024
    mock_file1.content_type = "application/pdf"
    mock_file1.read = AsyncMock(return_value=b"PDF")
    mock_file1.seek = AsyncMock()
    mock_files.append(mock_file1)

    # Supported TXT
    mock_file2 = Mock()
    mock_file2.filename = "notes.txt"
    mock_file2.size = 512
    mock_file2.content_type = "text/plain"
    mock_file2.read = AsyncMock(return_value=b"text")
    mock_file2.seek = AsyncMock()
    mock_files.append(mock_file2)

    # Unsupported PNG
    mock_file3 = Mock()
    mock_file3.filename = "image.png"
    mock_file3.size = 2048
    mock_file3.content_type = "image/png"
    mock_file3.read = AsyncMock(return_value=b"PNG")
    mock_file3.seek = AsyncMock()
    mock_files.append(mock_file3)

    with patch("magic.from_buffer") as mock_magic:
        # Return different MIME types for different files based on call order
        mock_magic.side_effect = ["text/plain", "text/plain", "image/png"]

        custom_settings = Settings()
        custom_settings.file_upload_allowed_mime_types = ["application/pdf", "text/plain"]

        with patch("nexus.files.file_manager.get_settings", return_value=custom_settings):
            file_manager = FileManager()

            # Act & Assert
            with pytest.raises(ValidationError) as exc_info:
                await file_manager.validate_and_save_files(cast("list[UploadFile]", mock_files), invocation_id)

            # Should fail due to image.png with specific error message
            error_message = str(exc_info.value)
            assert "Unsupported file format" in error_message
            assert "image/png" in error_message


@pytest.mark.asyncio
async def test_configurable_allowed_mime_types() -> None:
    """Test that allowed MIME types are configurable.

    Validates:
    - Custom MIME type list can be provided
    - Only configured types accepted
    """
    # Arrange - Only allow PDF
    invocation_id = str(uuid4())
    mock_file = Mock()
    mock_file.filename = "notes.txt"
    mock_file.size = 512
    mock_file.content_type = "text/plain"
    mock_file.read = AsyncMock(return_value=b"text content")
    mock_file.seek = AsyncMock()

    with patch("magic.from_buffer") as mock_magic:
        mock_magic.return_value = "text/plain"

        custom_settings = Settings()
        custom_settings.file_upload_allowed_mime_types = ["application/pdf"]  # TXT not allowed

        with patch("nexus.files.file_manager.get_settings", return_value=custom_settings):
            file_manager = FileManager()

            # Act & Assert
            with pytest.raises(ValidationError) as exc_info:
                await file_manager.validate_and_save_files([mock_file], invocation_id)

            # Should reject text/plain and show only PDF is supported
            error_message = str(exc_info.value)
            assert "Unsupported file format" in error_message
            assert "text/plain" in error_message
            assert "application/pdf" in error_message
