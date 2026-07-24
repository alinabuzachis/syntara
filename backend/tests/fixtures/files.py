"""Test fixture file utilities and sample file paths."""

from pathlib import Path

__all__ = [
    "generate_large_file",
    "get_fixtures_dir",
]


def generate_large_file(size_mb: int) -> bytes:
    """Generate a large file of the specified size in megabytes."""
    return b"0" * (size_mb * 1024 * 1024)


def get_fixtures_dir() -> Path:
    """Get the directory containing sample test fixture files."""
    return Path(__file__).parent / "files"
