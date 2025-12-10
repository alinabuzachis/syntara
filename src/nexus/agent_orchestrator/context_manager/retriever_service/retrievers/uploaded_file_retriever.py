"""Document retriever for uploaded files via FileManager integration.

This module provides the UploadedFileRetriever implementation that retrieves
documents from uploaded files using the existing FileManager infrastructure.
"""

import asyncio
import logging
from collections.abc import AsyncIterator, Callable
from datetime import UTC, datetime
from typing import Any

from nexus.agent_orchestrator.context_manager.file_manager import FileManager, FileMetadata, get_file_manager
from nexus.agent_orchestrator.context_manager.retriever_service.interfaces.document_retriever import DocumentRetriever
from nexus.agent_orchestrator.context_manager.retriever_service.models.relevant_document import RelevantDocument

logger = logging.getLogger(__name__)


class UploadedFileRetriever(DocumentRetriever):
    """Document retriever for uploaded files via FileManager.

    This implementation retrieves documents from files that have been uploaded
    to the system and are referenced in the invocation context. It uses the
    existing FileManager infrastructure for file access and loading.

    The retriever:
    - Extracts file_metadata from invocation context
    - Processes files in parallel using async tasks
    - Uses FileManager to get appropriate retriever for each file
    - Loads converted document content from storage
    - Yields RelevantDocument objects as they're processed
    - Handles errors gracefully and logs appropriate messages

    Integration with FileManager:
    - Uses FileManager.get_retriever_for_file() for storage backend selection
    - Uses BaseRetriever.load_file() for file content loading
    - FileManager remains encapsulated within this retriever implementation
    - No direct FileManager dependency in RetrieverService

    Example Usage:
        ```python
        retriever = UploadedFileRetriever()

        invocation_context = {
            "file_metadata": [
                {
                    "file_id": "uuid-123",
                    "filename": "document.pdf",
                    "status": "converted",
                    "conversion": {"file_path": "/path/to/converted/file.txt"}
                }
            ]
        }

        async for document in retriever.retrieve_documents(invocation_context):
            # Process each document as it's retrieved
            print(f"Retrieved: {document.file_metadata.filename}")
        ```
    """

    def __init__(self, file_manager_factory: Callable[[], FileManager] = get_file_manager) -> None:
        """Initialize UploadedFileRetriever with FileManager dependency.

        Args:
            file_manager_factory: Factory function for creating FileManager

        """
        self.file_manager = file_manager_factory()
        logger.debug("Initialized UploadedFileRetriever with FileManager")

    def retrieve_documents(self, invocation_context: dict[str, Any]) -> AsyncIterator[RelevantDocument]:
        """Stream documents from uploaded files in the invocation context.

        This method extracts file metadata from the invocation context and loads
        the content of converted files using the FileManager infrastructure.
        Files are processed in parallel and yielded as soon as they're ready.

        Args:
            invocation_context: Context data from the invocation containing file_metadata
                              and other relevant information

        Returns:
            AsyncIterator that yields RelevantDocument objects retrieved from uploaded files.
            Yields nothing if no converted files are found or accessible.

        Raises:
            DocumentRetrievalError: If retrieval fails due to storage backend issues

        Implementation Steps:
            1. Extract file_metadata list from invocation context
            2. Create concurrent tasks for each file
            3. Process files in parallel using asyncio.as_completed
            4. Yield documents as they become available
            5. Handle errors gracefully (log and continue with other files)

        """
        return self._retrieve_documents_impl(invocation_context)

    async def _retrieve_documents_impl(self, invocation_context: dict[str, Any]) -> AsyncIterator[RelevantDocument]:
        """Implement streaming document retrieval."""
        logger.debug("Starting streaming document retrieval from uploaded files")

        # Extract file metadata from context
        file_metadata_list = invocation_context.get("file_metadata", [])
        if not file_metadata_list:
            logger.info("No file metadata found in invocation context")
            return

        logger.info("Found %d files in invocation context, processing in parallel", len(file_metadata_list))

        # Create tasks for parallel processing
        tasks = [
            asyncio.create_task(self._process_single_file(file_metadata_dict))
            for file_metadata_dict in file_metadata_list
        ]

        processed_count = 0
        skipped_count = 0
        error_count = 0

        # Process files as they complete
        for completed_task in asyncio.as_completed(tasks):
            try:
                document, status = await completed_task
                if document:
                    processed_count += 1
                    yield document
                elif status == "skipped":
                    skipped_count += 1
                elif status == "error":
                    error_count += 1
            except Exception:
                logger.exception("Unexpected error in file processing task")
                error_count += 1

        logger.info(
            "Streaming document retrieval completed: %d processed, %d skipped, %d errors",
            processed_count,
            skipped_count,
            error_count,
        )

    async def _process_single_file(self, file_metadata_dict: dict[str, Any]) -> tuple[RelevantDocument | None, str]:
        """Process a single file and return document and status.

        Args:
            file_metadata_dict: File metadata dictionary from invocation context

        Returns:
            Tuple of (document_or_none, status) where status is 'processed', 'skipped', or 'error'

        """
        try:
            # Parse FileMetadata from context dictionary
            file_metadata = FileMetadata(**file_metadata_dict)
        except Exception:
            logger.exception("Error parsing file metadata")
            return None, "error"

        # Validate file metadata and get conversion path (doesn't raise exceptions)
        converted_file_path = self._validate_and_get_conversion_path(file_metadata)
        if not converted_file_path:
            return None, "skipped"

        # Retrieve document content using FileManager
        try:
            document = await self._load_document_content(file_metadata, converted_file_path)
            if document:
                logger.debug(
                    "Successfully retrieved document: %s (size: %d chars)",
                    file_metadata.filename,
                    len(document.content),
                )
                return document, "processed"
            return None, "skipped"

        except OSError:
            logger.exception("Failed to load file content for %s", file_metadata.filename)
            return None, "error"

        except Exception:
            logger.exception("Unexpected error loading file %s", file_metadata.filename)
            return None, "error"

    def _validate_and_get_conversion_path(self, file_metadata: FileMetadata) -> str | None:
        """Validate file metadata and return conversion path if valid.

        Args:
            file_metadata: File metadata to validate

        Returns:
            Converted file path if valid, None otherwise

        """
        # Only process converted documents
        if file_metadata.status != "converted":
            logger.debug("Skipping file with status '%s': %s", file_metadata.status, file_metadata.filename)
            return None

        # Check for conversion metadata
        if not file_metadata.conversion:
            logger.warning("File marked as converted but missing conversion metadata: %s", file_metadata.filename)
            return None

        converted_file_path: str | None = file_metadata.conversion.get("output_path")
        if not converted_file_path:
            logger.warning("Converted file missing file_path in conversion metadata: %s", file_metadata.filename)
            return None

        return converted_file_path

    async def _load_document_content(
        self, file_metadata: FileMetadata, converted_file_path: str
    ) -> RelevantDocument | None:
        """Load document content using FileManager and create RelevantDocument.

        Args:
            file_metadata: File metadata from invocation context
            converted_file_path: Path to converted document file

        Returns:
            RelevantDocument with loaded content and metadata, or None if loading fails

        Raises:
            OSError: If file cannot be read due to I/O errors (includes FileNotFoundError and PermissionError)

        """
        # Get appropriate retriever for this file from FileManager
        retriever = self.file_manager.get_retriever_for_file(
            _file_size_bytes=file_metadata.size_bytes, _mime_type=file_metadata.mime_type
        )

        # Load converted document content
        content_bytes = await retriever.load_file(converted_file_path)

        # Convert bytes to string (assuming UTF-8 encoding for converted content)
        try:
            content_str = content_bytes.decode("utf-8")
        except UnicodeDecodeError:
            logger.warning("Failed to decode file as UTF-8: %s", file_metadata.filename)
            return None

        # Validate content is not empty
        if not content_str or not content_str.strip():
            logger.warning("Converted file is empty or contains only whitespace: %s", file_metadata.filename)
            return None

        # Create RelevantDocument with metadata
        retrieval_metadata = {
            "file_path": converted_file_path,
            "retrieved_at": datetime.now(UTC).isoformat(),
            "original_file_path": file_metadata.file_path,
            "conversion_metadata": file_metadata.conversion,
            "retriever_backend": type(retriever).__name__,
        }

        return RelevantDocument(
            content=content_str,
            relevancy_score=1.0,  # Neutral score before relevancy checking
            file_metadata=file_metadata,
            source_type="uploaded_file",
            retrieval_metadata=retrieval_metadata,
        )
