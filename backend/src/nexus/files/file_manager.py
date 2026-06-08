"""FileManager for file upload handling.

This module provides the main FileManager class for handling file uploads,
including validation, storage, and metadata generation.

The FileManager is the single source of truth for all FileMetadata operations.
All components (DocumentConversionTask, InvocationService, UploadedFileRetriever)
must access FileMetadata records through FileManager methods, not via direct
database queries (encapsulation principle).
"""

from uuid import UUID, uuid4

import structlog
from fastapi import UploadFile
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.audit.dispatcher import AuditEventDispatcher
from nexus.core.config.base import get_settings
from nexus.core.exceptions import SafeValueError
from nexus.files import storage, utils, validators
from nexus.files.audit.files_uploaded import FilesUploadedEvent
from nexus.files.exceptions import FileValidationError
from nexus.files.models import FileMetadata, FileStatus
from nexus.files.retrievers.base import BaseRetriever
from nexus.files.retrievers.local import LocalFileRetriever
from nexus.files.storage import sanitize_filename

logger = structlog.stdlib.get_logger(__name__)

UNKNOWN_FILENAME = "unknown"


class FileManager:
    """Manager for file upload operations.

    This class handles file validation, storage, and metadata generation
    for file uploads. The FileManager supports multiple storage backends
    and selects the appropriate retriever based on runtime context
    (file size, type, user preferences, etc.).

    The FileManager is the single source of truth for all FileMetadata operations.
    All components (DocumentConversionTask, InvocationService, UploadedFileRetriever)
    must access FileMetadata records through FileManager methods, not via direct
    database queries (encapsulation principle).

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
            FileValidationError: If file validation fails (count, size, or MIME type)
            OSError: If storage operation fails (disk full, permission denied)
            PermissionError: If insufficient permissions to write
            IOError: If I/O operation fails

        """
        logger.info(
            "Starting file upload processing",
            file_count=len(files),
        )

        # Step 1: Validate all files (single read per file)
        try:
            validated_files = await validators.validate_files(files, self.settings)
        except FileValidationError:
            logger.warning("File validation failed")
            # Dispatch error audit event before raising
            AuditEventDispatcher.dispatch(
                FilesUploadedEvent(
                    file_count=len(files),
                    total_size_bytes=0,
                    file_details=[{"filename": sanitize_filename(f.filename or UNKNOWN_FILENAME)} for f in files],
                    error_type="FileValidationError",
                )
            )
            raise

        # Step 2: Save files and collect metadata
        # Track saved files for cleanup on failure
        file_metadata_list: list[FileMetadata] = []
        saved_file_paths: list[str] = []

        try:
            for (file_content, mime_type), file in zip(validated_files, files, strict=True):
                safe_filename = sanitize_filename(file.filename) if file.filename else UNKNOWN_FILENAME
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
                    safe_filename,
                    str(file_id),
                    retriever,
                )

                # Track saved path for potential cleanup
                saved_file_paths.append(file_path)

                # Create metadata with the generated file_id as primary key
                metadata = FileMetadata(
                    id=file_id,  # Use as primary key (inherited from BaseResource)
                    filename=safe_filename,
                    size_bytes=file_size_bytes,
                    mime_type=mime_type,
                    file_path=file_path,
                    status=FileStatus.PENDING_CONVERSION,
                )
                file_metadata_list.append(metadata)

                logger.info(
                    "File processed successfully",
                    filename=safe_filename,
                    file_id=file_id,
                )

        except OSError as e:
            # Storage failure - cleanup already saved files
            logger.exception(
                "Storage failure during file processing, cleaning up saved files",
                saved_file_count=len(saved_file_paths),
            )

            # Attempt to delete saved files
            await utils.cleanup_files(saved_file_paths, context="after storage failure")

            # Dispatch error audit event before raising
            error_type = type(e).__name__
            AuditEventDispatcher.dispatch(
                FilesUploadedEvent(
                    file_count=len(files),
                    total_size_bytes=0,
                    file_details=[{"filename": sanitize_filename(f.filename or UNKNOWN_FILENAME)} for f in files],
                    error_type=error_type,
                )
            )

            # Re-raise original exception
            raise

        logger.info(
            "All files processed successfully",
            file_count=len(file_metadata_list),
        )

        # Dispatch success audit event
        file_details = [
            {
                "file_id": str(fm.id),
                "filename": fm.filename,
                "mime_type": fm.mime_type,
                "size_bytes": fm.size_bytes,
            }
            for fm in file_metadata_list
        ]
        total_size = sum(fm.size_bytes for fm in file_metadata_list)

        AuditEventDispatcher.dispatch(
            FilesUploadedEvent(
                file_count=len(file_metadata_list),
                total_size_bytes=total_size,
                file_details=file_details,
            )
        )

        return file_metadata_list

    async def get_file_metadata(
        self,
        file_id: UUID,
        session: AsyncSession,
    ) -> FileMetadata | None:
        """Get FileMetadata record by file_id.

        Args:
            file_id: UUID of the file to retrieve
            session: Database session

        Returns:
            FileMetadata record if found, None otherwise

        """
        return await session.get(FileMetadata, file_id)

    async def get_files_metadata(
        self,
        file_ids: list[UUID],
        session: AsyncSession,
    ) -> list[FileMetadata]:
        """Get multiple FileMetadata records by file_ids.

        Args:
            file_ids: List of file UUIDs to retrieve
            session: Database session

        Returns:
            List of FileMetadata records (may be fewer than requested if some not found)

        """
        if not file_ids:
            return []

        # Query all matching records
        # FileMetadata.id is inherited from BaseResource, so type checker doesn't see in_() method
        statement = select(FileMetadata).where(FileMetadata.id.in_(file_ids))  # type: ignore[attr-defined]
        result = await session.exec(statement)
        return list(result.all())

    async def update_file_status(
        self,
        file_id: UUID,
        status: FileStatus,
        session: AsyncSession,
        *,
        converted_content_path: str | None = None,
        conversion_error: str | None = None,
    ) -> FileMetadata:
        """Update file conversion status in database.

        Used by DocumentConversionTask to update status after conversion.

        Args:
            file_id: UUID of the file to update
            status: New status (CONVERTING, CONVERTED, CONVERSION_FAILED)
            session: Database session
            converted_content_path: Path to converted markdown (if successful)
            conversion_error: Error message (if failed)

        Returns:
            Updated FileMetadata record

        Raises:
            ValueError: If file not found

        """
        file_metadata = await session.get(FileMetadata, file_id)
        if not file_metadata:
            msg = f"File not found: {file_id}"
            raise SafeValueError(msg)

        # Update fields
        file_metadata.status = status
        if converted_content_path is not None:
            file_metadata.converted_content_path = converted_content_path
        if conversion_error is not None:
            file_metadata.conversion_error = conversion_error

        session.add(file_metadata)
        await session.commit()

        logger.info(
            "File status updated",
            file_id=file_id,
            status=status.value,
        )

        return file_metadata


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
