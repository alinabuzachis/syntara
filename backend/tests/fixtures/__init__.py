"""Test fixtures for nexus.tool_manager and file upload testing."""

from pathlib import Path

__all__ = [
    "generate_large_file",
    "get_fixtures_dir",
]


def generate_large_file(size_mb: int) -> bytes:
    """Generate a large file of the specified size.

    Args:
        size_mb: Size in megabytes

    Returns:
        bytes: File content of the specified size

    """
    return b"0" * (size_mb * 1024 * 1024)


def get_fixtures_dir() -> Path:
    """Get the fixtures directory path."""
    return Path(__file__).parent / "files"
