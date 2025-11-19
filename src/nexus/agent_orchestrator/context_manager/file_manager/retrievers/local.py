"""Local filesystem retriever implementation.

This module provides file storage operations for the local filesystem using
async I/O operations via aiofiles.
"""

import logging
from pathlib import Path

import aiofiles

from nexus.agent_orchestrator.context_manager.file_manager.retrievers.base import BaseRetriever

logger = logging.getLogger(__name__)


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
                "Failed to create storage directory (path=%s)",
                self.storage_dir,
            )
            raise

        # Build full file path
        full_path = storage_path / file_path if not Path(file_path).is_absolute() else Path(file_path)

        # Ensure parent directory for the file exists
        try:
            full_path.parent.mkdir(parents=True, exist_ok=True)
        except (OSError, PermissionError):
            logger.exception(
                "Failed to create parent directory for file (path=%s)",
                full_path.parent,
            )
            raise

        # Write file using async I/O
        try:
            async with aiofiles.open(full_path, "wb") as f:
                await f.write(file_content)

            logger.debug(
                "File saved successfully (path=%s, size=%d bytes)",
                full_path,
                len(file_content),
            )

            return str(full_path.absolute())

        except (OSError, PermissionError):
            logger.exception(
                "Failed to save file (path=%s, size=%d bytes)",
                full_path,
                len(file_content),
            )
            raise
