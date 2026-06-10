"""Unit tests for S3FileRetriever.

Tests validate all BaseRetriever methods against moto mock S3,
including happy paths, edge cases, and error handling.
"""

import hashlib
import os
from collections.abc import Generator
from typing import Any

import boto3
import pytest
from moto import mock_aws

from nexus.files.exceptions import FileContentNotFoundError
from nexus.files.retrievers.s3 import S3FileRetriever

BUCKET_NAME = "nexus-test-files"
REGION = "us-east-1"


@pytest.fixture(autouse=True)
def _aws_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("AWS_DEFAULT_REGION", REGION)


@pytest.fixture
def s3_retriever() -> Generator[S3FileRetriever, None, None]:  # noqa: D103
    with mock_aws():
        conn = boto3.client("s3", region_name=REGION)
        conn.create_bucket(Bucket=BUCKET_NAME)

        retriever = S3FileRetriever(
            endpoint_url=None,
            bucket_name=BUCKET_NAME,
            region_name=REGION,
        )
        yield retriever


# --- save_file + load_file ---


@pytest.mark.asyncio
async def test_save_and_load_file(s3_retriever: S3FileRetriever) -> None:
    """Test round-trip save and load for small files."""
    content = b"Hello from S3FileRetriever!" * 30
    key = "nexus-test-uuid-document.txt"

    stored_key = await s3_retriever.save_file(content, key)
    assert stored_key == key

    loaded = await s3_retriever.load_file(key)
    assert loaded == content


@pytest.mark.asyncio
async def test_save_and_load_large_file_multipart(s3_retriever: S3FileRetriever) -> None:
    """Test multipart upload for files exceeding 5MB threshold."""
    content = os.urandom(6 * 1024 * 1024)
    key = "nexus-test-uuid-large.bin"

    stored_key = await s3_retriever.save_file(content, key)
    assert stored_key == key

    loaded = await s3_retriever.load_file(key)
    assert loaded == content


# --- file_exists ---


@pytest.mark.asyncio
async def test_file_exists_true(s3_retriever: S3FileRetriever) -> None:
    """Test file_exists returns True for existing file."""
    await s3_retriever.save_file(b"exists test", "nexus-test-uuid-exists.txt")
    assert await s3_retriever.file_exists("nexus-test-uuid-exists.txt") is True


@pytest.mark.asyncio
async def test_file_exists_false(s3_retriever: S3FileRetriever) -> None:
    """Test file_exists returns False for nonexistent file."""
    assert await s3_retriever.file_exists("nonexistent-key") is False


# --- get_file_metadata ---


@pytest.mark.asyncio
async def test_get_file_metadata(s3_retriever: S3FileRetriever) -> None:
    """Test metadata retrieval for existing file."""
    content = b"metadata test content"
    key = "nexus-test-uuid-metadata.txt"

    await s3_retriever.save_file(content, key)
    metadata: dict[str, Any] = await s3_retriever.get_file_metadata(key)

    assert metadata["size"] == len(content)
    assert metadata["exists"] is True
    assert metadata["path"] == key
    assert "modified" in metadata
    assert "etag" in metadata


# --- delete_file ---


@pytest.mark.asyncio
async def test_delete_file(s3_retriever: S3FileRetriever) -> None:
    """Test file deletion removes file from S3."""
    content = b"to be deleted"
    key = "nexus-test-uuid-delete.txt"

    await s3_retriever.save_file(content, key)
    assert await s3_retriever.file_exists(key) is True

    result = await s3_retriever.delete_file(key)
    assert result is True
    assert await s3_retriever.file_exists(key) is False


# --- health_check ---


@pytest.mark.asyncio
async def test_health_check_passes(s3_retriever: S3FileRetriever) -> None:
    """Test health_check returns True for valid bucket."""
    assert await s3_retriever.health_check() is True


@pytest.mark.asyncio
async def test_health_check_fails_for_nonexistent_bucket() -> None:
    """Test health_check returns False for nonexistent bucket."""
    with mock_aws():
        retriever = S3FileRetriever(
            endpoint_url=None,
            bucket_name="nonexistent-bucket",
            region_name=REGION,
        )
        assert await retriever.health_check() is False


# --- Content integrity ---


@pytest.mark.asyncio
async def test_content_hash_roundtrip(s3_retriever: S3FileRetriever) -> None:
    """Test SHA-256 hash is preserved across save/load cycle."""
    content = os.urandom(1024)
    key = "nexus-test-uuid-hash.bin"
    expected_hash = hashlib.sha256(content).hexdigest()

    await s3_retriever.save_file(content, key)
    loaded = await s3_retriever.load_file(key)
    actual_hash = hashlib.sha256(loaded).hexdigest()

    assert actual_hash == expected_hash


# --- Edge cases ---


@pytest.mark.asyncio
async def test_empty_file(s3_retriever: S3FileRetriever) -> None:
    """Test handling of empty files."""
    key = "nexus-test-uuid-empty.txt"

    await s3_retriever.save_file(b"", key)
    loaded = await s3_retriever.load_file(key)
    assert loaded == b""


@pytest.mark.asyncio
async def test_special_characters_in_key(s3_retriever: S3FileRetriever) -> None:
    """Test keys with special characters."""
    content = b"special chars"
    key = "nexus-550e8400-file (final).pdf"

    await s3_retriever.save_file(content, key)
    loaded = await s3_retriever.load_file(key)
    assert loaded == content


@pytest.mark.asyncio
async def test_overwrite_existing_file(s3_retriever: S3FileRetriever) -> None:
    """Test that saving to the same key overwrites the previous content."""
    key = "nexus-test-uuid-overwrite.txt"

    await s3_retriever.save_file(b"version 1", key)
    await s3_retriever.save_file(b"version 2", key)

    loaded = await s3_retriever.load_file(key)
    assert loaded == b"version 2"


# --- Error paths ---


@pytest.mark.asyncio
async def test_load_nonexistent_file(s3_retriever: S3FileRetriever) -> None:
    """Test loading nonexistent file raises FileNotFoundError."""
    with pytest.raises(FileContentNotFoundError, match="File not found"):
        await s3_retriever.load_file("does-not-exist")


@pytest.mark.asyncio
async def test_get_metadata_nonexistent_file(s3_retriever: S3FileRetriever) -> None:
    """Test get_file_metadata for nonexistent file raises FileNotFoundError."""
    with pytest.raises(FileContentNotFoundError, match="File not found"):
        await s3_retriever.get_file_metadata("does-not-exist")
