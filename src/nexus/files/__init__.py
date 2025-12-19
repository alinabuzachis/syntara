"""Files module for file upload handling.

This module provides the FileManager class and related functionality
for handling file uploads, storage, validation, and document conversion.
"""

from nexus.files.file_manager import FileManager, FileMetadata, get_file_manager

__all__ = [
    "FileManager",
    "FileMetadata",
    "get_file_manager",
]
