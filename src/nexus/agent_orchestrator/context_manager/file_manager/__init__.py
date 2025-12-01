"""FileManager for file upload handling.

This module provides the main FileManager class for handling file uploads,
including validation, storage, and metadata generation.
"""

import logging
from typing import Any, Literal
from uuid import uuid4

from fastapi import UploadFile
from pydantic import BaseModel, Field

from nexus.agent_orchestrator.context_manager.file_manager import storage, utils, validators
from nexus.agent_orchestrator.context_manager.file_manager.retrievers.base import BaseRetriever
from nexus.agent_orchestrator.context_manager.file_manager.retrievers.local import LocalFileRetriever
from nexus.core.config import get_settings

logger = logging.getLogger(__name__)


class FileMetadata(BaseModel):
    """Metadata for uploaded files.

    This is a pure data transfer object (not a database table) that is
    serialized to JSON and stored in Invocation.context_data JSONB field.

    Uses Pydantic BaseModel (not SQLModel) since:
    - Not a database table (no table=True)
    - Not a direct API request/response schema
    - Only used for serialization to JSONB

    Security Note:
        file_path contains internal filesystem paths and should NEVER be
        exposed in API responses. Use file_id for public references.
        When serializing for API responses, use: model_dump(exclude={'file_path'})

    Attributes:
        file_id: Unique identifier for the file (UUID, public)
        filename: Original filename
        size_bytes: File size in bytes
        mime_type: Detected MIME type
        file_path: Internal storage path (EXCLUDED from API responses)
        status: Processing status (always "pending_parse" for now)

    """

    file_id: str = Field(..., description="Unique file identifier (UUID)")
    filename: str = Field(..., description="Original filename")
    size_bytes: int = Field(..., description="File size in bytes", gt=0)
    mime_type: str = Field(..., description="Detected MIME type")
    file_path: str = Field(..., description="Internal storage path (not exposed in API)")
    status: Literal["pending_parse", "converting", "converted", "conversion_failed"] = Field(
        default="pending_parse",
        description="Processing status1",
    )
    conversion: dict[str, Any] | None = Field(
        default=None,
        description="Optional conversion metadata when status is 'converted' or 'conversion_failed'",
    )


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
        invocation_id: str,
    ) -> list[FileMetadata]:
        """Validate and save uploaded files with transactional cleanup.

        This method performs the following operations:
        1. Validate file count, size, and MIME types (reads each file once)
        2. Save files to storage using the configured retriever
        3. Generate FileMetadata for each file
        4. Cleanup saved files if any step fails

        Args:
            files: List of uploaded files
            invocation_id: Invocation ID for file naming and tracking

        Returns:
            List of FileMetadata objects with file information

        Raises:
            ValidationError: If file validation fails (count, size, or MIME type)
            OSError: If storage operation fails (disk full, permission denied)
            PermissionError: If insufficient permissions to write
            IOError: If I/O operation fails

        """
        logger.info(
            "Starting file upload processing (invocation_id=%s, file_count=%d)",
            invocation_id,
            len(files),
        )

        # Step 1: Validate all files (single read per file)
        try:
            validated_files = await validators.validate_files(files, self.settings)
        except validators.ValidationError:
            logger.warning(
                "File validation failed (invocation_id=%s)",
                invocation_id,
            )
            raise

        # Step 2: Save files and collect metadata
        # Track saved files for cleanup on failure
        file_metadata_list: list[FileMetadata] = []
        saved_file_paths: list[str] = []

        try:
            for (file_content, mime_type), file in zip(validated_files, files, strict=True):
                filename = file.filename or "unknown"
                file_size_bytes = len(file_content)

                # Select appropriate retriever based on file context
                retriever = self.get_retriever_for_file(
                    _file_size_bytes=file_size_bytes,
                    _mime_type=mime_type,
                )

                # Save file to storage using selected retriever
                file_path = await storage.save_file(
                    file_content,
                    filename,
                    invocation_id,
                    retriever,
                )

                # Track saved path for potential cleanup
                saved_file_paths.append(file_path)

                # Create metadata with unique file_id
                metadata = FileMetadata(
                    file_id=str(uuid4()),  # Generate unique identifier
                    filename=filename,
                    size_bytes=file_size_bytes,
                    mime_type=mime_type,
                    file_path=file_path,  # Internal only, excluded from API response
                    status="pending_parse",
                )
                file_metadata_list.append(metadata)

                logger.info(
                    "File processed successfully (filename=%s, invocation_id=%s)",
                    filename,
                    invocation_id,
                )

        except (OSError, PermissionError):
            # Storage failure - cleanup already saved files
            logger.exception(
                "Storage failure during file processing (invocation_id=%s), cleaning up %d saved files",
                invocation_id,
                len(saved_file_paths),
            )

            # Attempt to delete saved files
            await utils.cleanup_files(saved_file_paths, context="after storage failure")

            # Re-raise original exception
            raise

        logger.info(
            "All files processed successfully (invocation_id=%s, file_count=%d)",
            invocation_id,
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
    "FileMetadata",
    "get_file_manager",
]
