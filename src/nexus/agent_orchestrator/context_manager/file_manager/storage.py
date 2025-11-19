"""File storage operations.

This module provides file storage operations using the retriever pattern
for pluggable storage backends.
"""

import logging
from pathlib import Path

from nexus.agent_orchestrator.context_manager.file_manager.retrievers.base import BaseRetriever

logger = logging.getLogger(__name__)


def sanitize_filename(filename: str, max_length: int = 200) -> str:
    """Sanitize filename to prevent path traversal and filesystem issues.

    Args:
        filename: Original filename from user upload
        max_length: Maximum allowed filename length (default 200)

    Returns:
        Sanitized filename safe for filesystem storage

    Note:
        Files are saved with pattern: nexus-{36-char-uuid}-{filename}
        Total prefix length is ~43 chars, so we limit filename to 200 chars
        to ensure total path stays well under the 255-byte filesystem limit.

    """
    # Remove path components, keep only basename
    safe_name = Path(filename).name

    # Remove dangerous characters, keep only alphanumeric and .-_
    safe_name = "".join(c for c in safe_name if c.isalnum() or c in ".-_")

    # Remove leading/trailing dots, dashes, underscores (filesystem edge cases)
    safe_name = safe_name.strip(".-_")

    # Ensure non-empty after sanitization
    if not safe_name:
        return "unnamed"

    # Enforce length limit (filesystem typically limits to 255 bytes)
    # Extension preservation is nice-to-have but not critical since we validate via MIME type
    if len(safe_name) > max_length:
        safe_name = safe_name[:max_length]

    return safe_name


async def save_file(
    file_content: bytes,
    filename: str,
    invocation_id: str,
    retriever: BaseRetriever,
) -> str:
    """Save uploaded file to storage using the configured retriever.

    Files are saved with the naming pattern: nexus-{invocation_id}-{sanitized_filename}

    Args:
        file_content: File content as bytes
        filename: Original filename from upload
        invocation_id: Invocation ID for file naming
        retriever: Storage retriever to use for saving file

    Returns:
        Absolute path where file was saved

    Raises:
        OSError: If save operation fails (disk full, permission denied)
        PermissionError: If insufficient permissions to write
        IOError: If I/O operation fails

    """
    # Sanitize filename to prevent path traversal
    safe_filename = sanitize_filename(filename)

    # Generate file path with naming pattern
    file_path = f"nexus-{invocation_id}-{safe_filename}"

    # Save using retriever
    try:
        saved_path = await retriever.save_file(file_content, file_path)

        logger.info(
            "File saved to storage (filename=%s, invocation_id=%s, size=%d bytes)",
            safe_filename,
            invocation_id,
            len(file_content),
        )

        return saved_path

    except (OSError, PermissionError):
        # Log detailed error information (not exposed to client)
        logger.exception(
            "Storage failure (filename=%s, invocation_id=%s, path=%s, size=%d bytes)",
            safe_filename,
            invocation_id,
            file_path,
            len(file_content),
        )
        # Re-raise for caller to handle
        raise
