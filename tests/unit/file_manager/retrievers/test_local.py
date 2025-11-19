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

from nexus.agent_orchestrator.context_manager.file_manager.retrievers.local import LocalFileRetriever


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
