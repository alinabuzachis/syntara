"""Files module for file upload handling.

This module provides the FileManager class and related functionality
for handling file uploads, storage, validation, and document conversion.

Key exports:
    - FileMetadata: SQLModel table for file metadata storage in database
    - FileStatus: Enum for file conversion lifecycle states
    - FileManager: Manager for file upload operations
    - get_file_manager: Factory function for dependency injection
"""

from nexus.files.file_manager import FileManager, get_file_manager
from nexus.files.models import FileMetadata, FileStatus

__all__ = [
    "FileManager",
    "FileMetadata",
    "FileStatus",
    "get_file_manager",
]
