"""FileManager for file upload handling.

This module provides the main FileManager class for handling file uploads,
including validation, storage, and metadata generation.
"""

import logging
from uuid import uuid4

from fastapi import UploadFile

from nexus.core.config import get_settings
from nexus.files import storage, utils, validators
from nexus.files.models import FileMetadata, FileStatus
from nexus.files.retrievers.base import BaseRetriever
from nexus.files.retrievers.local import LocalFileRetriever

logger = logging.getLogger(__name__)


class FileManager:
    """Manager for file upload operations.

    This class handles file validation, storage, and metadata generation
    for file uploads in invocations. The FileManager supports multiple storage
    backends and selects the appropriate retriever based on runtime context
    (file size, type, user preferences, etc.).

    Attributes:
        settings: Application settings for validation limits
        retrievers: Dictionary of available retrievers keyed by name

    """

    def __init__(self) -> None:
        """Initialize FileManager with application settings."""
        self.settings = get_settings()
        # Initialize all configured retrievers
        # Each retriever is available for selection based on runtime context
        self.retrievers: dict[str, BaseRetriever] = {
            "local": LocalFileRetriever(storage_dir=self.settings.file_upload_storage_dir),
            # Future: Add S3FileRetriever, GCSFileRetriever, etc.
        }

    def get_retriever_for_file(
        self,
        _file_size_bytes: int,
        _mime_type: str,
    ) -> BaseRetriever:
        """Select appropriate retriever based on file context.

        This method implements the business logic for selecting which storage
        backend to use for a given file. Selection can be based on:
        - File size (e.g., large files to S3, small files to local)
        - File type/MIME type (e.g., images to CDN, documents to local)
        - User preferences or invocation context
        - Cost optimization rules

        Args:
            _file_size_bytes: Size of the file in bytes (unused for now)
            _mime_type: Detected MIME type of the file (unused for now)

        Returns:
            The selected retriever to use for this file

        """
        # For now, always use local storage
        # Future: Add selection logic based on file_size_bytes, mime_type, etc.
        return self.retrievers["local"]

    async def validate_and_save_files(
        self,
        files: list[UploadFile],
    ) -> list[FileMetadata]:
        """Validate and save uploaded files with transactional cleanup.

        This method performs the following operations:
        1. Validate file count, size, and MIME types (reads each file once)
        2. Generate unique file_id (UUID) for each file
        3. Save files to storage using the configured retriever
        4. Generate FileMetadata for each file
        5. Cleanup saved files if any step fails

        Note: Database persistence is handled by the caller. This method
        returns in-memory FileMetadata objects that should be added to
        a database session and committed.

        Args:
            files: List of uploaded files

        Returns:
            List of FileMetadata objects with file information (not yet persisted)

        Raises:
            ValidationError: If file validation fails (count, size, or MIME type)
            OSError: If storage operation fails (disk full, permission denied)
            PermissionError: If insufficient permissions to write
            IOError: If I/O operation fails

        """
        logger.info(
            "Starting file upload processing (file_count=%d)",
            len(files),
        )

        # Step 1: Validate all files (single read per file)
        try:
            validated_files = await validators.validate_files(files, self.settings)
        except validators.ValidationError:
            logger.warning("File validation failed")
            raise

        # Step 2: Save files and collect metadata
        # Track saved files for cleanup on failure
        file_metadata_list: list[FileMetadata] = []
        saved_file_paths: list[str] = []

        try:
            for (file_content, mime_type), file in zip(validated_files, files, strict=True):
                filename = file.filename or "unknown"
                file_size_bytes = len(file_content)

                # Generate unique file_id first (used for storage path)
                file_id = uuid4()

                # Select appropriate retriever based on file context
                retriever = self.get_retriever_for_file(
                    _file_size_bytes=file_size_bytes,
                    _mime_type=mime_type,
                )

                # Save file to storage using file_id for path naming
                file_path = await storage.save_file(
                    file_content,
                    filename,
                    str(file_id),
                    retriever,
                )

                # Track saved path for potential cleanup
                saved_file_paths.append(file_path)

                # Create metadata with the generated file_id as primary key
                metadata = FileMetadata(
                    id=file_id,  # Use as primary key (inherited from BaseResource)
                    filename=filename,
                    size_bytes=file_size_bytes,
                    mime_type=mime_type,
                    file_path=file_path,
                    status=FileStatus.PENDING_CONVERSION,
                )
                file_metadata_list.append(metadata)

                logger.info(
                    "File processed successfully (filename=%s, file_id=%s)",
                    filename,
                    file_id,
                )

        except (OSError, PermissionError):
            # Storage failure - cleanup already saved files
            logger.exception(
                "Storage failure during file processing, cleaning up %d saved files",
                len(saved_file_paths),
            )

            # Attempt to delete saved files
            await utils.cleanup_files(saved_file_paths, context="after storage failure")

            # Re-raise original exception
            raise

        logger.info(
            "All files processed successfully (file_count=%d)",
            len(file_metadata_list),
        )

        return file_metadata_list


# ===================================================
# Factory function for dependency injection
# ---------------------------------------------------
_file_manager: FileManager = FileManager()


def get_file_manager() -> FileManager:
    """Create a FileManager instance with fresh dependencies.

    Returns:
        FileManager: Fresh FileManager instance

    Example:
        file_manager = get_file_manager()
        retriever = file_manager.get_retriever_for_file(...)

    """
    return _file_manager


# ===================================================


__all__ = [
    "FileManager",
    "get_file_manager",
]
