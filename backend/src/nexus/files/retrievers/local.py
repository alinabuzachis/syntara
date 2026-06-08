"""Local filesystem retriever implementation.

This module provides file storage operations for the local filesystem using
async I/O operations via aiofiles.
"""

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import aiofiles
import structlog

from nexus.files.retrievers.base import BaseRetriever

logger = structlog.stdlib.get_logger(__name__)


class LocalFileRetriever(BaseRetriever):
    """Local filesystem retriever for file storage operations.

    This retriever implements file storage on the local filesystem using
    async I/O operations for better performance and concurrency handling.

    Attributes:
        storage_dir: Base directory for file storage

    """

    def __init__(self, storage_dir: str) -> None:
        """Initialize local file retriever.

        Args:
            storage_dir: Base directory path for storing files

        """
        self.storage_dir = storage_dir

    async def save_file(
        self,
        file_content: bytes,
        file_path: str,
    ) -> str:
        """Save file content to local filesystem.

        Args:
            file_content: Raw file content as bytes
            file_path: Destination path for the file (relative or absolute)

        Returns:
            Absolute path where file was saved

        Raises:
            OSError: If save operation fails (disk full, permission denied, I/O error)
            PermissionError: If insufficient permissions to write to destination
            IOError: If I/O operation fails

        """
        # Ensure storage directory exists
        storage_path = Path(self.storage_dir)
        try:
            storage_path.mkdir(parents=True, exist_ok=True)
        except (OSError, PermissionError):
            logger.exception(
                "Failed to create storage directory",
                path=self.storage_dir,
            )
            raise

        # Build full file path
        full_path = storage_path / file_path if not Path(file_path).is_absolute() else Path(file_path)

        # Ensure parent directory for the file exists
        try:
            full_path.parent.mkdir(parents=True, exist_ok=True)
        except (OSError, PermissionError):
            logger.exception(
                "Failed to create parent directory for file",
                path=str(full_path.parent),
            )
            raise

        # Write file using async I/O
        try:
            async with aiofiles.open(full_path, "wb") as f:
                await f.write(file_content)

            logger.debug(
                "File saved successfully",
                path=str(full_path),
                size_bytes=len(file_content),
            )

            return str(full_path.absolute())

        except (OSError, PermissionError):
            logger.exception(
                "Failed to save file",
                path=str(full_path),
                size_bytes=len(file_content),
            )
            raise

    async def load_file(self, file_path: str) -> bytes:
        """Load file content from local filesystem.

        Args:
            file_path: Absolute filesystem path to the file

        Returns:
            Raw file content as bytes

        Raises:
            FileNotFoundError: If file does not exist at the specified path
            OSError: If file cannot be read due to I/O errors
            PermissionError: If insufficient permissions to read the file

        """
        file_path_obj = Path(file_path)

        if not file_path_obj.exists():
            logger.warning("File not found", file_path=file_path)
            msg = f"File not found: {file_path}"
            raise FileNotFoundError(msg)

        try:
            async with aiofiles.open(file_path_obj, "rb") as f:
                content = await f.read()

            logger.debug(
                "File loaded successfully",
                path=file_path,
                size_bytes=len(content),
            )

            return content

        except (OSError, PermissionError):
            logger.exception("Failed to load file", file_path=file_path)
            raise

    async def file_exists(self, file_path: str) -> bool:
        """Check if file exists at filesystem location.

        Args:
            file_path: Absolute filesystem path to the file

        Returns:
            True if file exists and is a file, False otherwise

        """
        try:
            file_path_obj = Path(file_path)
            exists = file_path_obj.exists() and file_path_obj.is_file()

            logger.debug("File existence check", file_path=file_path, exists=exists)
            return exists

        except (OSError, PermissionError):
            logger.exception("Error checking file existence", file_path=file_path)
            # For permission errors, assume file doesn't exist
            return False

    async def get_file_metadata(self, file_path: str) -> dict[str, Any]:
        """Get file metadata from local filesystem.

        Args:
            file_path: Absolute filesystem path to the file

        Returns:
            Dictionary containing file metadata with:
            - 'size': File size in bytes
            - 'modified': Last modified timestamp (ISO 8601 string)
            - 'path': Absolute file path
            - 'exists': Whether file exists

        Raises:
            FileNotFoundError: If file does not exist at the specified path
            OSError: If metadata cannot be retrieved due to I/O errors
            PermissionError: If insufficient permissions to access file metadata

        """
        file_path_obj = Path(file_path)

        if not file_path_obj.exists():
            logger.warning("File not found for metadata", file_path=file_path)
            msg = f"File not found: {file_path}"
            raise FileNotFoundError(msg)

        try:
            stat = file_path_obj.stat()
            modified_timestamp = datetime.fromtimestamp(stat.st_mtime, tz=UTC)

            metadata = {
                "size": stat.st_size,
                "modified": modified_timestamp.isoformat(),
                "path": str(file_path_obj.absolute()),
                "exists": True,
            }

            logger.debug(
                "File metadata retrieved",
                path=file_path,
                size_bytes=stat.st_size,
                modified=metadata["modified"],
            )

            return metadata

        except (OSError, PermissionError):
            logger.exception("Failed to get file metadata", file_path=file_path)
            raise
