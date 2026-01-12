"""Document retriever for uploaded files via FileManager integration.

This module provides the UploadedFileRetriever implementation that retrieves
documents from uploaded files using the existing FileManager infrastructure.
"""

import asyncio
import contextlib
import logging
from collections.abc import AsyncGenerator, AsyncIterator, Callable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.agent_orchestrator.context_manager.retriever_service.exceptions import DocumentRetrievalError
from nexus.agent_orchestrator.context_manager.retriever_service.interfaces.document_retriever import DocumentRetriever
from nexus.agent_orchestrator.context_manager.retriever_service.models.relevant_document import RelevantDocument
from nexus.api.db.session import get_db
from nexus.core.constants import CONTEXT_KEY_FILE_IDS
from nexus.files import FileManager, FileMetadata, get_file_manager
from nexus.files.models import FileStatus

logger = logging.getLogger(__name__)
MAX_CONCURRENT_FILE_LOADS = 20


class UploadedFileRetriever(DocumentRetriever):
    """Document retriever for uploaded files via FileManager and database queries.

    This implementation retrieves documents from files that have been uploaded
    to the system by querying the FileMetadata table using file IDs from the
    invocation context. It uses FileManager for all file operations following
    the encapsulation principle.

    The retriever:
    - Extracts file_ids from invocation context (list of UUID strings)
    - Fetches FileMetadata records from database via FileManager.get_files_metadata()
    - Validates all files exist and are CONVERTED (fail-fast)
    - Processes files in parallel using async tasks
    - Uses FileManager to get appropriate retriever for each file
    - Loads converted document content from storage
    - Yields RelevantDocument objects as they're processed
    - Raises DocumentRetrievalError for missing/unconverted files
    - Raises DocumentRetrievalError for invalid input (wrong type, invalid UUID format)

    Architecture:
    - FileMetadata table is single source of truth
    - All FileMetadata access through FileManager methods (encapsulation)
    - Invocation.context_data contains only file_ids, not hydrated metadata
    - FileManager remains encapsulated within this retriever implementation
    - No direct FileManager dependency in RetrieverService

    Error Handling:
    - ValueError: Invalid file_ids type or UUID format
    - DocumentRetrievalError: Files not found or not CONVERTED
    - Database errors propagate unchanged (OperationalError, etc.)

    Example Usage:
        ```python
        retriever = UploadedFileRetriever()

        invocation_context = {
            "file_ids": [
                "550e8400-e29b-41d4-a716-446655440000",
                "660e8400-e29b-41d4-a716-446655440001"
            ]
        }

        async for document in retriever.retrieve_documents(invocation_context):
            # Process each document as it's retrieved
            print(f"Retrieved: {document.file_metadata.filename}")
        ```
    """

    def __init__(
        self,
        file_manager_factory: Callable[[], FileManager] = get_file_manager,
        session_factory: Callable[[], AsyncGenerator[AsyncSession, None]] = get_db,
    ) -> None:
        """Initialize UploadedFileRetriever with FileManager and session factory.

        Args:
            file_manager_factory: Factory function for creating FileManager
            session_factory: Factory function for creating database sessions

        """
        self.file_manager = file_manager_factory()
        self.session_context = contextlib.asynccontextmanager(session_factory)
        logger.debug("Initialized UploadedFileRetriever with FileManager and session factory")

    def retrieve_documents(self, invocation_context: dict[str, Any]) -> AsyncIterator[RelevantDocument]:
        """Stream documents from uploaded files in the invocation context.

        This method extracts file_ids from the invocation context, fetches FileMetadata
        records via FileManager, and loads the content of converted files. Files are
        validated and processed in parallel.

        Args:
            invocation_context: Context data from the invocation containing file_ids
                              (list of UUID strings) under the key CONTEXT_KEY_FILE_IDS

        Returns:
            AsyncIterator that yields RelevantDocument objects retrieved from uploaded files.
            Yields nothing if no file_ids are found in the context.

        Raises:
            DocumentRetrievalError: If validation fails (invalid types, missing files,
                                   unconverted files) or retrieval fails due to database
                                   or storage backend issues

        Implementation Steps:
            1. Extract and validate file_ids from context (via _validate_and_parse_file_ids)
            2. Fetch and validate FileMetadata from database (via _fetch_and_validate_metadata)
            3. Create semaphore to limit concurrent file operations (MAX_CONCURRENT_FILE_LOADS)
            4. Create concurrent tasks for parallel file processing with semaphore
            5. Process files using asyncio.as_completed and yield documents as ready
            6. Log errors for individual files (continue processing others)

        """
        return self._retrieve_documents_impl(invocation_context)

    def _validate_and_parse_file_ids(
        self,
        file_ids_raw: Any,  # noqa: ANN401 - Runtime validation of unknown type from context
    ) -> list[UUID]:
        """Validate and parse file_ids from context data.

        Performs comprehensive validation:
        - Type checking (must be list)
        - UUID parsing (validates format and item types)
        - Deduplication (preserving order)

        Args:
            file_ids_raw: Raw file_ids value from invocation context

        Returns:
            List of unique UUID objects (deduplicated, order preserved)

        Raises:
            DocumentRetrievalError: If validation fails (wrong type, invalid UUID format)

        """
        # Validate type before processing (type safety)
        if not isinstance(file_ids_raw, list):
            error_msg = f"Invalid context: '{CONTEXT_KEY_FILE_IDS}' must be a list, got {type(file_ids_raw).__name__}"
            logger.error(error_msg)
            raise DocumentRetrievalError(error_msg)

        if not file_ids_raw:
            return []

        # Convert string UUIDs to UUID objects (validates format and type)
        # UUID() will raise TypeError or AttributeError for non-strings and ValueError for invalid formats
        try:
            file_ids = [UUID(fid) for fid in file_ids_raw]
        except (TypeError, ValueError, AttributeError) as e:
            error_msg = f"Invalid UUID in '{CONTEXT_KEY_FILE_IDS}': {e}"
            logger.exception(error_msg)
            raise DocumentRetrievalError(error_msg) from e

        # Remove duplicate file_ids while preserving order
        unique_file_ids = list(dict.fromkeys(file_ids))
        if len(unique_file_ids) < len(file_ids):
            logger.debug(
                "Removed %d duplicate file_ids from request (original: %d, unique: %d)",
                len(file_ids) - len(unique_file_ids),
                len(file_ids),
                len(unique_file_ids),
            )

        return unique_file_ids

    async def _fetch_and_validate_metadata(self, file_ids: list[UUID], session: AsyncSession) -> list[FileMetadata]:
        """Fetch FileMetadata records and validate they are ready for retrieval.

        Performs fail-fast validation:
        - Fetches metadata from database via FileManager
        - Validates all file_ids exist
        - Validates all files have CONVERTED status
        - Validates all CONVERTED files have converted_content_path

        Args:
            file_ids: List of file UUIDs to fetch
            session: Database session for query

        Returns:
            List of CONVERTED FileMetadata objects with valid converted_content_path

        Raises:
            DocumentRetrievalError: If any files are missing, not CONVERTED, or missing converted_content_path

        """
        file_metadata_list = await self.file_manager.get_files_metadata(file_ids, session)

        # Validate all files were found
        if len(file_metadata_list) != len(file_ids):
            found_ids = {fm.id for fm in file_metadata_list}
            missing_ids = set(file_ids) - found_ids
            error_msg = f"Files not found in database: {missing_ids}"
            logger.error(error_msg)
            raise DocumentRetrievalError(error_msg)

        # Validate all files are CONVERTED
        unconverted = [(fm.id, fm.status) for fm in file_metadata_list if fm.status != FileStatus.CONVERTED]
        if unconverted:
            error_msg = f"Cannot retrieve files with non-CONVERTED status: {unconverted}"
            logger.error(error_msg)
            raise DocumentRetrievalError(error_msg)

        # Validate all CONVERTED files have converted_content_path
        missing_paths = [fm.id for fm in file_metadata_list if not fm.converted_content_path]
        if missing_paths:
            error_msg = f"Files marked CONVERTED but missing converted_content_path: {missing_paths}"
            logger.error(error_msg)
            raise DocumentRetrievalError(error_msg)

        return file_metadata_list

    async def _retrieve_documents_impl(self, invocation_context: dict[str, Any]) -> AsyncIterator[RelevantDocument]:
        """Implement streaming document retrieval from database-backed files.

        This method orchestrates the document retrieval process:
        1. Validates and parses file_ids from context
        2. Fetches and validates FileMetadata from database
        3. Processes files in parallel with concurrency limiting
        4. Yields documents as they become available

        Args:
            invocation_context: Context data containing file_ids

        Yields:
            RelevantDocument objects for successfully processed files

        """
        logger.debug("Starting streaming document retrieval from uploaded files")

        file_ids_raw = invocation_context.get(CONTEXT_KEY_FILE_IDS, [])
        file_ids = self._validate_and_parse_file_ids(file_ids_raw)

        if not file_ids:
            logger.info("No file_ids found in invocation context")
            return

        logger.info("Found %d file_ids in invocation context, fetching metadata", len(file_ids))

        async with self.session_context() as session:
            file_metadata_list = await self._fetch_and_validate_metadata(file_ids, session)

        logger.info("All %d files validated successfully, processing in parallel", len(file_metadata_list))

        semaphore = asyncio.Semaphore(MAX_CONCURRENT_FILE_LOADS)
        tasks = [
            asyncio.create_task(self._process_single_file(file_metadata, semaphore))
            for file_metadata in file_metadata_list
        ]

        processed_count = 0
        skipped_count = 0
        error_count = 0

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

    async def _process_single_file(
        self, file_metadata: FileMetadata, semaphore: asyncio.Semaphore
    ) -> tuple[RelevantDocument | None, str]:
        """Process a single file and return document and status.

        Args:
            file_metadata: FileMetadata object from database (not a dict)
            semaphore: Semaphore to limit concurrent file loading operations

        Returns:
            Tuple of (document_or_none, status) where status is 'processed', 'skipped', or 'error'

        """
        async with semaphore:
            try:
                # Defensive check: _fetch_and_validate_metadata should ensure this is never None
                if not file_metadata.converted_content_path:
                    logger.error(
                        "File %s misses converted_content_path.",
                        file_metadata.id,
                    )
                    return None, "error"

                document = await self._load_document_content(
                    file_metadata,
                    file_metadata.converted_content_path,
                )
                if document:
                    logger.debug(
                        "Successfully retrieved document: %s (size: %d chars)",
                        file_metadata.filename,
                        len(document.content),
                    )
                    return document, "processed"
                return None, "skipped"

            except Exception:
                logger.exception("Failed to load file content for %s", file_metadata.filename)
                return None, "error"

    async def _load_document_content(
        self, file_metadata: FileMetadata, converted_file_path: str
    ) -> RelevantDocument | None:
        """Load document content using FileManager and create RelevantDocument.

        Args:
            file_metadata: File metadata from invocation context
            converted_file_path: Path to converted document file

        Returns:
            RelevantDocument with loaded content and metadata, or None if loading fails

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
            "converted_content_path": file_metadata.converted_content_path,
            "retriever_backend": type(retriever).__name__,
        }

        return RelevantDocument(
            content=content_str,
            relevancy_score=1.0,  # Neutral score before relevancy checking
            file_metadata=file_metadata,
            source_type="uploaded_file",
            retrieval_metadata=retrieval_metadata,
        )
