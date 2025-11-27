"""Document conversion service for managing conversion operations.

This module provides the main service for coordinating document conversion
operations with file manager integration and status management.
"""

import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING
from uuid import uuid4

from nexus.agent_orchestrator.context_manager.file_manager import FileManager, FileMetadata
from nexus.agent_orchestrator.context_manager.file_manager.document_conversion.registry import (
    ConverterRegistry,
    get_converter_registry,
)
from nexus.agent_orchestrator.context_manager.file_manager.document_conversion.services.types import ConversionState

if TYPE_CHECKING:
    from nexus.agent_orchestrator.context_manager.file_manager.document_conversion.models import ConversionResult

logger = logging.getLogger(__name__)


class DocumentConversionService:
    """Main service for document conversion operations with FileMetadata integration.

    Coordinates conversion operations by:
    - Loading file content via retrievers
    - Finding appropriate converters by MIME type
    - Managing conversion status and metadata updates
    - Storing converted content back via retrievers
    """

    def __init__(self, file_manager: FileManager) -> None:
        """Initialize the document conversion service.

        Args:
            file_manager: FileManager instance for handling file operations

        """
        self.file_manager = file_manager

    @staticmethod
    def _generate_output_filename(original_filename: str) -> str:
        """Generate output filename for converted markdown file.

        Args:
            original_filename: Original source filename

        Returns:
            Output filename with .md extension

        Example:
            assert DocumentConversionService._generate_output_filename("doc.pdf") == "doc.md"
            assert DocumentConversionService._generate_output_filename("file.docx") == "file.md"

        """
        # Extract base name without extension and add .md
        base_name = Path(original_filename).stem
        return f"{base_name}.md"

    async def _store_converted_file(
        self, file_metadata: "FileMetadata", conversion_result: "ConversionResult"
    ) -> tuple[str, str]:
        output_filename = DocumentConversionService._generate_output_filename(file_metadata.filename)

        if conversion_result.converted_content is None:
            msg = "Cannot store file: conversion result has no content"
            raise ValueError(msg)

        # Get retriever for saving converted file
        output_retriever = self.file_manager.get_retriever_for_file(
            len(conversion_result.converted_content.encode("utf-8")), "text/markdown"
        )

        # Store converted content via retriever
        output_path: str = await output_retriever.save_file(
            conversion_result.converted_content.encode("utf-8"), output_filename
        )
        return output_filename, output_path

    @staticmethod
    async def _successful_conversion(
        file_metadata: "FileMetadata",
        conversion_result: "ConversionResult",
        status_updater: Callable[[FileMetadata], Awaitable[None]],
        *,
        operation_id: str,
        output_path: str,
        output_filename: str,
        converter_name: str,
    ) -> None:
        logger.info(
            "Document conversion succeeded (operation_id=%s, filename=%s, duration_ms=%d)",
            operation_id,
            file_metadata.filename,
            conversion_result.conversion_time_ms,
        )

        # Update status to converted with metadata
        conversion_metadata = {
            "output_filename": output_filename,
            "output_path": output_path,
            "converted_at": datetime.now(UTC).isoformat(),
            "conversion_time_ms": conversion_result.conversion_time_ms,
            "converter": converter_name,
            "operation_id": operation_id,
        }

        # Include additional metadata from conversion result
        if conversion_result.metadata:
            conversion_metadata.update(conversion_result.metadata)

        file_metadata.status = "converted"
        file_metadata.conversion = conversion_metadata

        # Update Invocation record
        await status_updater(file_metadata)

    @staticmethod
    async def _fail_conversion(
        file_metadata: "FileMetadata",
        conversion_result: "ConversionResult",
        status_updater: Callable[[FileMetadata], Awaitable[None]],
        *,
        operation_id: str,
        converter_name: str,
    ) -> None:
        logger.error(
            "Document conversion failed (operation_id=%s, filename=%s, error=%s)",
            operation_id,
            file_metadata.filename,
            conversion_result.error_message,
        )

        # Update status to conversion_failed
        file_metadata.status = "conversion_failed"
        file_metadata.conversion = {
            "error_message": conversion_result.error_message,
            "error_type": conversion_result.error_type,
            "failed_at": datetime.now(UTC).isoformat(),
            "conversion_time_ms": conversion_result.conversion_time_ms,
            "converter": converter_name,
            "operation_id": operation_id,
        }

        # Include additional metadata from conversion result
        if conversion_result.metadata:
            file_metadata.conversion.update(conversion_result.metadata)

        await status_updater(file_metadata)

    @staticmethod
    async def _fail_conversion_exception(
        file_metadata: "FileMetadata",
        status_updater: Callable[[FileMetadata], Awaitable[None]],
        operation_id: str,
        e: Exception,
    ) -> None:
        logger.exception(
            "Unexpected error during document conversion (operation_id=%s, filename=%s)",
            operation_id,
            file_metadata.filename,
        )

        # Update status to conversion_failed with error details
        file_metadata.status = "conversion_failed"
        file_metadata.conversion = {
            "error_message": f"Unexpected error during conversion: {e!s}",
            "error_type": "unexpected_error",
            "failed_at": datetime.now(UTC).isoformat(),
            "operation_id": operation_id,
            "exception_type": type(e).__name__,
        }

        await status_updater(file_metadata)

    @staticmethod
    async def _fail_conversion_missing_converter(
        file_metadata: "FileMetadata", operation_id: str, status_updater: Callable[[FileMetadata], Awaitable[None]]
    ) -> None:
        logger.warning(
            "No converter available for MIME type (operation_id=%s, mime_type=%s)",
            operation_id,
            file_metadata.mime_type,
        )

        # Update status to conversion_failed
        file_metadata.status = "conversion_failed"
        file_metadata.conversion = {
            "error_message": f"Unsupported MIME type: {file_metadata.mime_type}",
            "error_type": "unsupported_format",
            "failed_at": datetime.now(UTC).isoformat(),
        }

        # Update Invocation record
        await status_updater(file_metadata)

    async def convert_file(
        self, file_metadata: "FileMetadata", status_updater: Callable[[FileMetadata], Awaitable[None]]
    ) -> ConversionState:
        """Convert a single FileMetadata object and return updated metadata.

        Args:
            file_metadata: FileMetadata object with status='pending_parse'
            status_updater: Callback to update Invocation FileMetadata

        Returns:
            ConversionState enum with conversion state

        Example:
            service = DocumentConversionService(registry, config, file_manager)
            conversion_state = await service.convert_file(file_metadata, status_updater)
            assert conversion_state == ConversionState.SUCCESS

        """
        # Validate input status
        if file_metadata.status != "pending_parse":
            logger.info(
                "Skipping file not pending conversion (filename=%s, status=%s)",
                file_metadata.filename,
                file_metadata.status,
            )
            return ConversionState.SKIPPED

        # Generate operation ID for logging and tracking
        operation_id = f"conv-{uuid4().hex[:8]}"

        logger.info(
            "Starting document conversion (operation_id=%s, filename=%s, mime_type=%s)",
            operation_id,
            file_metadata.filename,
            file_metadata.mime_type,
        )

        # Update status to 'converting'
        file_metadata.status = "converting"
        await status_updater(file_metadata)

        # Get appropriate retriever for loading source file
        retriever = self.file_manager.get_retriever_for_file(file_metadata.size_bytes, file_metadata.mime_type)

        try:
            # Load file content via retriever
            file_content = await retriever.load_file(file_metadata.file_path)
            registry: ConverterRegistry = await anext(get_converter_registry())

            # Get converter for MIME type
            converter = registry.get_converter(file_metadata.mime_type)
            if converter is None:
                await DocumentConversionService._fail_conversion_missing_converter(
                    file_metadata, operation_id, status_updater
                )
                return ConversionState.FAILED

            # Perform conversion with timeout
            logger.debug(
                "Using converter %s for file %s (operation_id=%s)",
                converter.get_converter_name(),
                file_metadata.filename,
                operation_id,
            )
            conversion_result = await converter.convert_with_timeout(file_content, file_metadata)

            # Manage conversion result
            if conversion_result.success:
                output_filename, output_path = await self._store_converted_file(file_metadata, conversion_result)
                await DocumentConversionService._successful_conversion(
                    file_metadata,
                    conversion_result,
                    status_updater,
                    operation_id=operation_id,
                    output_filename=output_filename,
                    output_path=output_path,
                    converter_name=converter.get_converter_name(),
                )
                return ConversionState.SUCCESS

            await DocumentConversionService._fail_conversion(
                file_metadata,
                conversion_result,
                status_updater,
                operation_id=operation_id,
                converter_name=converter.get_converter_name(),
            )
            return ConversionState.FAILED

        except (OSError, ValueError, RuntimeError) as e:
            await DocumentConversionService._fail_conversion_exception(file_metadata, status_updater, operation_id, e)

        return ConversionState.FAILED
