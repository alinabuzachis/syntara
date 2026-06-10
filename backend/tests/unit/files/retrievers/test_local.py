"""Unit tests for LocalFileRetriever.

These tests validate:
- File saving to local storage
- Directory creation
- Path handling (relative vs absolute)
- Error handling for storage failures
"""

import tempfile
from pathlib import Path

import pytest

from nexus.files.exceptions import FileContentNotFoundError
from nexus.files.retrievers.local import LocalFileRetriever


@pytest.mark.asyncio
async def test_save_file_creates_directory() -> None:
    """Test that save_file creates storage directory if it doesn't exist."""
    # Arrange
    with tempfile.TemporaryDirectory() as tmpdir:
        storage_dir = Path(tmpdir) / "new-storage"
        retriever = LocalFileRetriever(storage_dir=str(storage_dir))

        file_path = "test-invocation/test.pdf"
        content = b"test content"

        # Act
        result = await retriever.save_file(content, file_path)

        # Assert
        assert storage_dir.exists()
        assert Path(result).exists()
        assert Path(result).read_bytes() == content


@pytest.mark.asyncio
async def test_save_file_returns_absolute_path() -> None:
    """Test that save_file returns absolute path to saved file."""
    # Arrange
    with tempfile.TemporaryDirectory() as tmpdir:
        storage_dir = Path(tmpdir) / "storage"
        retriever = LocalFileRetriever(storage_dir=str(storage_dir))

        file_path = "test-invocation/test.pdf"
        content = b"test content"

        # Act
        result = await retriever.save_file(content, file_path)

        # Assert
        assert Path(result).is_absolute()
        assert str(storage_dir / file_path) == result


@pytest.mark.asyncio
async def test_save_file_handles_nested_directories() -> None:
    """Test that save_file creates nested directory structure."""
    # Arrange
    with tempfile.TemporaryDirectory() as tmpdir:
        storage_dir = Path(tmpdir)
        retriever = LocalFileRetriever(storage_dir=str(storage_dir))

        file_path = "invocation-123/files/nested/test.pdf"
        content = b"nested file content"

        # Act
        result = await retriever.save_file(content, file_path)

        # Assert
        saved_file = Path(result)
        assert saved_file.exists()
        assert saved_file.parent.name == "nested"
        assert saved_file.read_bytes() == content


@pytest.mark.asyncio
async def test_save_file_overwrites_existing_file() -> None:
    """Test that save_file overwrites existing file with same path."""
    # Arrange
    with tempfile.TemporaryDirectory() as tmpdir:
        storage_dir = Path(tmpdir)
        retriever = LocalFileRetriever(storage_dir=str(storage_dir))

        file_path = "test-invocation/test.pdf"
        original_content = b"original content"
        new_content = b"new content"

        # Save original file
        result1 = await retriever.save_file(original_content, file_path)

        # Act - Save again with different content
        result2 = await retriever.save_file(new_content, file_path)

        # Assert
        assert result1 == result2  # Same path
        assert Path(result2).read_bytes() == new_content


@pytest.mark.asyncio
async def test_save_file_handles_absolute_path() -> None:
    """Test that save_file handles absolute file paths correctly."""
    # Arrange
    with tempfile.TemporaryDirectory() as tmpdir:
        storage_dir = Path(tmpdir) / "storage"
        retriever = LocalFileRetriever(storage_dir=str(storage_dir))

        # Use absolute path
        absolute_file_path = str(Path(tmpdir) / "absolute-test.pdf")
        content = b"absolute path test"

        # Act
        result = await retriever.save_file(content, absolute_file_path)

        # Assert
        assert result == absolute_file_path
        assert Path(result).read_bytes() == content


@pytest.mark.asyncio
async def test_save_file_with_special_characters() -> None:
    """Test that save_file handles filenames with special characters."""
    # Arrange
    with tempfile.TemporaryDirectory() as tmpdir:
        storage_dir = Path(tmpdir)
        retriever = LocalFileRetriever(storage_dir=str(storage_dir))

        file_path = "test-invocation/file with spaces & special-chars.pdf"
        content = b"special chars test"

        # Act
        result = await retriever.save_file(content, file_path)

        # Assert
        assert Path(result).exists()
        assert Path(result).read_bytes() == content


@pytest.mark.asyncio
async def test_save_file_with_binary_content() -> None:
    """Test that save_file correctly handles binary content."""
    # Arrange
    with tempfile.TemporaryDirectory() as tmpdir:
        storage_dir = Path(tmpdir)
        retriever = LocalFileRetriever(storage_dir=str(storage_dir))

        file_path = "test-invocation/binary.dat"
        # Create binary content with various byte values
        content = bytes(range(256))

        # Act
        result = await retriever.save_file(content, file_path)

        # Assert
        assert Path(result).read_bytes() == content


@pytest.mark.asyncio
async def test_save_file_with_large_file() -> None:
    """Test that save_file handles large files (10MB)."""
    # Arrange
    with tempfile.TemporaryDirectory() as tmpdir:
        storage_dir = Path(tmpdir)
        retriever = LocalFileRetriever(storage_dir=str(storage_dir))

        file_path = "test-invocation/large.dat"
        # Create 10MB file
        content = b"0" * (10 * 1024 * 1024)

        # Act
        result = await retriever.save_file(content, file_path)

        # Assert
        saved_file = Path(result)
        assert saved_file.exists()
        assert saved_file.stat().st_size == len(content)


@pytest.mark.asyncio
async def test_save_file_creates_parent_directories() -> None:
    """Test that save_file creates all necessary parent directories."""
    # Arrange
    with tempfile.TemporaryDirectory() as tmpdir:
        storage_dir = Path(tmpdir)
        retriever = LocalFileRetriever(storage_dir=str(storage_dir))

        file_path = "level1/level2/level3/test.pdf"
        content = b"deep nesting test"

        # Act
        result = await retriever.save_file(content, file_path)

        # Assert
        saved_file = Path(result)
        assert saved_file.exists()
        assert saved_file.parent.parent.parent.name == "level1"


# =============================================================================
# health_check tests
# =============================================================================


@pytest.mark.asyncio
async def test_health_check_writable_dir() -> None:
    """Test health_check returns True for a writable directory."""
    with tempfile.TemporaryDirectory() as tmpdir:
        retriever = LocalFileRetriever(storage_dir=str(tmpdir))
        assert await retriever.health_check() is True


@pytest.mark.asyncio
async def test_health_check_nonexistent_dir() -> None:
    """Test health_check returns False for a non-writable path."""
    retriever = LocalFileRetriever(storage_dir="/nonexistent/path/xyz")
    assert await retriever.health_check() is False


# =============================================================================
# delete_file tests
# =============================================================================


@pytest.mark.asyncio
async def test_delete_file_removes_existing_file() -> None:
    """Test delete_file removes a file and returns True."""
    with tempfile.TemporaryDirectory() as tmpdir:
        retriever = LocalFileRetriever(storage_dir=str(tmpdir))
        path = await retriever.save_file(b"to delete", "nexus-test-delete.txt")
        assert await retriever.file_exists(path) is True

        result = await retriever.delete_file(path)
        assert result is True
        assert await retriever.file_exists(path) is False


@pytest.mark.asyncio
async def test_delete_file_nonexistent_raises() -> None:
    """Test delete_file raises FileNotFoundError for nonexistent file."""
    with tempfile.TemporaryDirectory() as tmpdir:
        retriever = LocalFileRetriever(storage_dir=str(tmpdir))
        with pytest.raises(FileContentNotFoundError, match="File not found"):
            await retriever.delete_file(str(Path(tmpdir) / "nonexistent.txt"))
