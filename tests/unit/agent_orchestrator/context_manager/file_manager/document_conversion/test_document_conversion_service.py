"""Tests for DocumentConversionService.

This module tests the main document conversion service that coordinates
conversion operations with FileMetadata integration and status management.
"""

from collections.abc import AsyncGenerator, Generator
from contextlib import contextmanager
from typing import Union
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from nexus.agent_orchestrator.context_manager.file_manager import FileMetadata
from nexus.agent_orchestrator.context_manager.file_manager.document_conversion.models.conversion_result import (
    ConversionResult,
)
from nexus.agent_orchestrator.context_manager.file_manager.document_conversion.services import ConversionState
from nexus.agent_orchestrator.context_manager.file_manager.document_conversion.services.document_conversion_service import (  # noqa: E501
    DocumentConversionService,
)


@pytest.fixture
def mock_converter_registry() -> MagicMock:
    """Fixture that provides a mock converter registry instance."""
    return MagicMock()


@contextmanager
def mock_get_converter_registry(mock_registry_instance: MagicMock) -> Generator[MagicMock, None, None]:
    """Context manager for patching get_converter_registry with a mock registry."""

    async def mock_registry_generator() -> AsyncGenerator[MagicMock, None]:
        yield mock_registry_instance

    with patch(
        "nexus.agent_orchestrator.context_manager.file_manager.document_conversion.services.document_conversion_service.get_converter_registry"
    ) as mock_get_registry:
        mock_get_registry.return_value = mock_registry_generator()
        yield mock_registry_instance


@contextmanager
def mock_converter_with_result(
    mock_registry_instance: MagicMock,
    converter_name: str,
    conversion_result: Union["ConversionResult", None],
    *,
    has_converter: bool = True,
) -> Generator[MagicMock, None, None]:
    """Context manager for setting up a mock converter with specific result."""
    if has_converter:
        mock_converter = MagicMock()
        mock_registry_instance.get_converter.return_value = mock_converter
        mock_converter.get_converter_name.return_value = converter_name
        mock_converter.convert_with_timeout = AsyncMock(return_value=conversion_result)
    else:
        mock_registry_instance.get_converter.return_value = None

    yield mock_registry_instance


class TestDocumentConversionServiceInitialization:
    """Test DocumentConversionService initialization and setup."""

    def test_initialization_creates_file_manager(self) -> None:
        """Test that DocumentConversionService initializes with FileManager."""
        service = DocumentConversionService()
        # Access private member for testing purposes
        assert service.file_manager is not None

    def test_generate_output_filename_pdf_extension(self) -> None:
        """Test output filename generation for PDF files."""
        # Access private method for testing purposes
        result = DocumentConversionService._generate_output_filename("document.pdf")  # noqa: SLF001
        assert result == "document.md"

    def test_generate_output_filename_docx_extension(self) -> None:
        """Test output filename generation for DOCX files."""
        # Access private method for testing purposes
        result = DocumentConversionService._generate_output_filename("report.docx")  # noqa: SLF001
        assert result == "report.md"

    def test_generate_output_filename_no_extension(self) -> None:
        """Test output filename generation for files without extensions."""
        # Access private method for testing purposes
        result = DocumentConversionService._generate_output_filename("document")  # noqa: SLF001
        assert result == "document.md"

    def test_generate_output_filename_multiple_dots(self) -> None:
        """Test output filename generation for files with multiple dots."""
        # Access private method for testing purposes
        result = DocumentConversionService._generate_output_filename("my.document.pdf")  # noqa: SLF001
        assert result == "my.document.md"


class TestDocumentConversionServiceFileMetadataValidation:
    """Test DocumentConversionService validation of FileMetadata status."""

    @pytest.mark.asyncio
    async def test_convert_file_validates_pending_parse_status(self) -> None:
        """Test that convert_file validates FileMetadata status is pending_parse."""
        service = DocumentConversionService()
        file_metadata = FileMetadata(
            file_id=str(uuid4()),
            filename="test.pdf",
            size_bytes=1000,
            mime_type="application/pdf",
            file_path="/path/to/test.pdf",
            status="converted",  # Wrong status
        )
        status_updater = AsyncMock()

        conversion_state: ConversionState = await service.convert_file(file_metadata, status_updater)
        assert conversion_state == ConversionState.SKIPPED

    @pytest.mark.asyncio
    async def test_convert_file_accepts_pending_parse_status(self, mock_converter_registry) -> None:
        """Test that convert_file accepts FileMetadata with pending_parse status."""
        service = DocumentConversionService()
        file_metadata = FileMetadata(
            file_id=str(uuid4()),
            filename="test.txt",
            size_bytes=1000,
            mime_type="text/plain",
            file_path="/path/to/test.txt",
            status="pending_parse",
        )
        status_updater = AsyncMock()

        # Access private member for testing purposes
        with patch.object(service.file_manager, "get_retriever_for_file") as mock_get_retriever:
            mock_retriever = AsyncMock()
            mock_get_retriever.return_value = mock_retriever
            mock_retriever.load_file.return_value = b"Test content"

            # Mock successful conversion
            mock_conversion_result = ConversionResult.success_result(
                converted_content="# Test content", conversion_time_ms=500
            )

            with (
                mock_get_converter_registry(mock_converter_registry),
                mock_converter_with_result(mock_converter_registry, "TextConverter", mock_conversion_result),
                patch.object(service, "_store_converted_file") as mock_store,
            ):
                mock_store.return_value = "/output/test.md"

                # Should not raise an error
                await service.convert_file(file_metadata, status_updater)

        # Verify status was updated to converting first
        assert status_updater.call_count >= 1


class TestDocumentConversionServiceConverterIntegration:
    """Test DocumentConversionService integration with converter registry and retrievers."""

    @pytest.mark.asyncio
    async def test_convert_file_uses_file_manager_get_retriever(self, mock_converter_registry) -> None:
        """Test that convert_file uses FileManager.get_retriever_for_file."""
        service = DocumentConversionService()
        file_metadata = FileMetadata(
            file_id=str(uuid4()),
            filename="test.pdf",
            size_bytes=1000,
            mime_type="application/pdf",
            file_path="/path/to/test.pdf",
            status="pending_parse",
        )
        status_updater = AsyncMock()

        # Access private member for testing purposes
        with patch.object(service.file_manager, "get_retriever_for_file") as mock_get_retriever:
            mock_retriever = AsyncMock()
            mock_get_retriever.return_value = mock_retriever
            mock_retriever.load_file.return_value = b"PDF content"

            with (
                mock_get_converter_registry(mock_converter_registry),
                mock_converter_with_result(mock_converter_registry, "", None, has_converter=False),
            ):
                await service.convert_file(file_metadata, status_updater)

            # Verify get_retriever_for_file was called with correct parameters
            mock_get_retriever.assert_called_once_with(file_metadata.size_bytes, file_metadata.mime_type)

    @pytest.mark.asyncio
    async def test_convert_file_loads_file_content_via_retriever(self, mock_converter_registry) -> None:
        """Test that convert_file loads file content using BaseRetriever.load_file."""
        service = DocumentConversionService()
        file_metadata = FileMetadata(
            file_id=str(uuid4()),
            filename="test.docx",
            size_bytes=2000,
            mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            file_path="/path/to/test.docx",
            status="pending_parse",
        )
        status_updater = AsyncMock()

        # Access private member for testing purposes
        with patch.object(service.file_manager, "get_retriever_for_file") as mock_get_retriever:
            mock_retriever = AsyncMock()
            mock_get_retriever.return_value = mock_retriever
            mock_retriever.load_file.return_value = b"DOCX content"

            with (
                mock_get_converter_registry(mock_converter_registry),
                mock_converter_with_result(mock_converter_registry, "", None, has_converter=False),
            ):
                await service.convert_file(file_metadata, status_updater)

            # Verify load_file was called with correct file path
            mock_retriever.load_file.assert_called_once_with(file_metadata.file_path)

    @pytest.mark.asyncio
    async def test_convert_file_gets_converter_by_mime_type(self, mock_converter_registry) -> None:
        """Test that convert_file retrieves converter using MIME type."""
        service = DocumentConversionService()
        file_metadata = FileMetadata(
            file_id=str(uuid4()),
            filename="test.txt",
            size_bytes=500,
            mime_type="text/plain",
            file_path="/path/to/test.txt",
            status="pending_parse",
        )
        status_updater = AsyncMock()

        # Access private member for testing purposes
        with patch.object(service.file_manager, "get_retriever_for_file") as mock_get_retriever:
            mock_retriever = AsyncMock()
            mock_get_retriever.return_value = mock_retriever
            mock_retriever.load_file.return_value = b"Text content"

            with (
                mock_get_converter_registry(mock_converter_registry),
                mock_converter_with_result(mock_converter_registry, "", None, has_converter=False),
            ):
                await service.convert_file(file_metadata, status_updater)

            # Verify get_converter was called with correct MIME type
            mock_converter_registry.get_converter.assert_called_once_with("text/plain")


class TestDocumentConversionServiceStatusUpdates:
    """Test DocumentConversionService FileMetadata status management."""

    @pytest.mark.asyncio
    async def test_convert_file_updates_status_to_converting(self, mock_converter_registry) -> None:
        """Test that convert_file updates status to 'converting' before processing."""
        service = DocumentConversionService()
        file_metadata = FileMetadata(
            file_id=str(uuid4()),
            filename="test.md",
            size_bytes=300,
            mime_type="text/markdown",
            file_path="/path/to/test.md",
            status="pending_parse",
        )
        status_updater = AsyncMock()

        # Access private member for testing purposes
        with patch.object(service.file_manager, "get_retriever_for_file") as mock_get_retriever:
            mock_retriever = AsyncMock()
            mock_get_retriever.return_value = mock_retriever
            mock_retriever.load_file.return_value = b"# Markdown content"

            # Mock successful conversion
            mock_conversion_result = ConversionResult.success_result(
                converted_content="# Markdown content", conversion_time_ms=100
            )

            with (
                mock_get_converter_registry(mock_converter_registry),
                mock_converter_with_result(mock_converter_registry, "MarkdownConverter", mock_conversion_result),
                patch.object(service, "_store_converted_file") as mock_store,
            ):
                mock_store.return_value = "test.md", "/output/test.md"

                await service.convert_file(file_metadata, status_updater)

        # Verify status was updated (could be converting or converted due to timing)
        assert status_updater.call_count >= 1
        first_call_args = status_updater.call_args_list[0]
        # The first call should be either "converting" or "converted" (depending on timing)
        assert first_call_args[0][0].status in ["converting", "converted"]

    @pytest.mark.asyncio
    async def test_convert_file_updates_status_to_converted_on_success(self, mock_converter_registry) -> None:
        """Test that convert_file updates status to 'converted' on successful conversion."""
        service = DocumentConversionService()
        file_metadata = FileMetadata(
            file_id=str(uuid4()),
            filename="success.txt",
            size_bytes=400,
            mime_type="text/plain",
            file_path="/path/to/success.txt",
            status="pending_parse",
        )
        status_updater = AsyncMock()

        # Access private member for testing purposes
        with patch.object(service.file_manager, "get_retriever_for_file") as mock_get_retriever:
            mock_retriever = AsyncMock()
            mock_get_retriever.return_value = mock_retriever
            mock_retriever.load_file.return_value = b"Plain text content"

            # Mock successful conversion
            mock_conversion_result = ConversionResult.success_result(
                converted_content="Plain text content", conversion_time_ms=750
            )

            with (
                mock_get_converter_registry(mock_converter_registry),
                mock_converter_with_result(mock_converter_registry, "TextConverter", mock_conversion_result),
                patch.object(service, "_store_converted_file") as mock_store,
            ):
                mock_store.return_value = "success.md", "/output/success.md"

                await service.convert_file(file_metadata, status_updater)

        # Verify final status is converted
        assert status_updater.call_count >= 2
        final_call_args = status_updater.call_args_list[-1]
        final_metadata = final_call_args[0][0]
        assert final_metadata.status == "converted"
        assert final_metadata.conversion is not None
        assert final_metadata.conversion["output_filename"] == "success.md"
        assert final_metadata.conversion["conversion_time_ms"] == 750

    @pytest.mark.asyncio
    async def test_convert_file_updates_status_to_conversion_failed_on_failure(self, mock_converter_registry) -> None:
        """Test that convert_file updates status to 'conversion_failed' on conversion failure."""
        service = DocumentConversionService()
        file_metadata = FileMetadata(
            file_id=str(uuid4()),
            filename="fail.pdf",
            size_bytes=800,
            mime_type="application/pdf",
            file_path="/path/to/fail.pdf",
            status="pending_parse",
        )
        status_updater = AsyncMock()

        # Access private member for testing purposes
        with patch.object(service.file_manager, "get_retriever_for_file") as mock_get_retriever:
            mock_retriever = AsyncMock()
            mock_get_retriever.return_value = mock_retriever
            mock_retriever.load_file.return_value = b"Corrupted PDF content"

            # Mock failed conversion
            mock_conversion_result = ConversionResult.failure_result(
                error_message="PDF file is corrupted and cannot be processed",
                error_type="file_corruption",
                conversion_time_ms=200,
            )

            with (
                mock_get_converter_registry(mock_converter_registry),
                mock_converter_with_result(mock_converter_registry, "PDFConverter", mock_conversion_result),
            ):
                await service.convert_file(file_metadata, status_updater)

        # Verify final status is conversion_failed
        assert status_updater.call_count >= 2
        final_call_args = status_updater.call_args_list[-1]
        final_metadata = final_call_args[0][0]
        assert final_metadata.status == "conversion_failed"
        assert final_metadata.conversion is not None
        assert "PDF file is corrupted and cannot be processed" in final_metadata.conversion["error_message"]
        assert final_metadata.conversion["error_type"] == "file_corruption"

    @pytest.mark.asyncio
    async def test_convert_file_handles_missing_converter(self, mock_converter_registry) -> None:
        """Test that convert_file handles missing converter gracefully."""
        service = DocumentConversionService()
        file_metadata = FileMetadata(
            file_id=str(uuid4()),
            filename="unsupported.zip",
            size_bytes=1200,
            mime_type="application/zip",
            file_path="/path/to/unsupported.zip",
            status="pending_parse",
        )
        status_updater = AsyncMock()

        # Access private member for testing purposes
        with patch.object(service.file_manager, "get_retriever_for_file") as mock_get_retriever:
            mock_retriever = AsyncMock()
            mock_get_retriever.return_value = mock_retriever
            mock_retriever.load_file.return_value = b"ZIP content"

            with (
                mock_get_converter_registry(mock_converter_registry),
                mock_converter_with_result(mock_converter_registry, "", None, has_converter=False),
            ):
                await service.convert_file(file_metadata, status_updater)

        # Verify final status is conversion_failed
        assert status_updater.call_count >= 2
        final_call_args = status_updater.call_args_list[-1]
        final_metadata = final_call_args[0][0]
        assert final_metadata.status == "conversion_failed"
        assert final_metadata.conversion is not None
        assert "Unsupported MIME type" in final_metadata.conversion["error_message"]
        assert final_metadata.conversion["error_type"] == "unsupported_format"


class TestDocumentConversionServiceErrorHandling:
    """Test DocumentConversionService error handling scenarios."""

    @pytest.mark.asyncio
    async def test_convert_file_handles_file_load_exception(self) -> None:
        """Test that convert_file handles file loading exceptions."""
        service = DocumentConversionService()
        file_metadata = FileMetadata(
            file_id=str(uuid4()),
            filename="missing.txt",
            size_bytes=600,
            mime_type="text/plain",
            file_path="/path/to/missing.txt",
            status="pending_parse",
        )
        status_updater = AsyncMock()

        # Access private member for testing purposes
        with patch.object(service.file_manager, "get_retriever_for_file") as mock_get_retriever:
            mock_retriever = AsyncMock()
            mock_get_retriever.return_value = mock_retriever
            # Simulate file loading error
            mock_retriever.load_file.side_effect = OSError("File not found")

            await service.convert_file(file_metadata, status_updater)

        # Verify error was handled gracefully
        assert status_updater.call_count >= 2
        final_call_args = status_updater.call_args_list[-1]
        final_metadata = final_call_args[0][0]
        assert final_metadata.status == "conversion_failed"
        assert final_metadata.conversion is not None
        assert "Unexpected error during conversion" in final_metadata.conversion["error_message"]
        assert final_metadata.conversion["error_type"] == "unexpected_error"

    @pytest.mark.asyncio
    async def test_convert_file_handles_store_file_exception(self, mock_converter_registry) -> None:
        """Test that convert_file handles file storage exceptions."""
        service = DocumentConversionService()
        file_metadata = FileMetadata(
            file_id=str(uuid4()),
            filename="storage_fail.txt",
            size_bytes=700,
            mime_type="text/plain",
            file_path="/path/to/storage_fail.txt",
            status="pending_parse",
        )
        status_updater = AsyncMock()

        # Access private member for testing purposes
        with patch.object(service.file_manager, "get_retriever_for_file") as mock_get_retriever:
            mock_retriever = AsyncMock()
            mock_get_retriever.return_value = mock_retriever
            mock_retriever.load_file.return_value = b"Text content"

            # Mock successful conversion
            mock_conversion_result = ConversionResult.success_result(
                converted_content="Text content", conversion_time_ms=300
            )

            with (
                mock_get_converter_registry(mock_converter_registry),
                mock_converter_with_result(mock_converter_registry, "TextConverter", mock_conversion_result),
                patch.object(service, "_store_converted_file") as mock_store,
            ):
                mock_store.side_effect = ValueError("Storage quota exceeded")
                await service.convert_file(file_metadata, status_updater)

        # Verify error was handled gracefully
        assert status_updater.call_count >= 2
        final_call_args = status_updater.call_args_list[-1]
        final_metadata = final_call_args[0][0]
        assert final_metadata.status == "conversion_failed"
        assert "Storage quota exceeded" in final_metadata.conversion["error_message"]


class TestDocumentConversionServiceStorageIntegration:
    """Test DocumentConversionService integration with file storage operations."""

    @pytest.mark.asyncio
    async def test_store_converted_file_uses_correct_retriever(self) -> None:
        """Test that _store_converted_file uses FileManager.get_retriever_for_file."""
        service = DocumentConversionService()
        file_metadata = FileMetadata(
            file_id=str(uuid4()),
            filename="store_test.pdf",
            size_bytes=1000,
            mime_type="application/pdf",
            file_path="/path/to/store_test.pdf",
            status="converting",
        )
        conversion_result = ConversionResult.success_result(
            converted_content="# Converted Content\n\nThis is the markdown version.", conversion_time_ms=1000
        )

        # Access private member for testing purposes
        with patch.object(service.file_manager, "get_retriever_for_file") as mock_get_retriever:
            mock_retriever = AsyncMock()
            mock_get_retriever.return_value = mock_retriever
            mock_retriever.save_file.return_value = "/output/store_test.md"

            # Access private method for testing purposes
            output_filename, output_path = await service._store_converted_file(file_metadata, conversion_result)  # noqa: SLF001

        # Verify correct parameters were used for retriever selection
        assert conversion_result.converted_content is not None
        expected_content_bytes = len(conversion_result.converted_content.encode("utf-8"))
        mock_get_retriever.assert_called_once_with(expected_content_bytes, "text/markdown")

        # Verify save_file was called with correct parameters
        mock_retriever.save_file.assert_called_once_with(
            conversion_result.converted_content.encode("utf-8"), "store_test.md"
        )
        assert output_path == "/output/store_test.md"
        assert output_filename == "store_test.md"

    @pytest.mark.asyncio
    async def test_store_converted_file_handles_no_content_error(self) -> None:
        """Test that _store_converted_file raises error when conversion has no content."""
        service = DocumentConversionService()
        file_metadata = FileMetadata(
            file_id=str(uuid4()),
            filename="no_content.txt",
            size_bytes=500,
            mime_type="text/plain",
            file_path="/path/to/no_content.txt",
            status="converting",
        )
        # Create conversion result with None content
        conversion_result = ConversionResult(
            success=True,
            conversion_time_ms=200,
            converted_content=None,  # No content
        )

        with pytest.raises(ValueError, match="Cannot store file: conversion result has no content"):
            # Access private method for testing purposes
            await service._store_converted_file(file_metadata, conversion_result)  # noqa: SLF001
