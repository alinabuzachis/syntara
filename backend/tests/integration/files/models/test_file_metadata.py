"""Unit tests for FileMetadata SQLModel.

This file contains comprehensive tests for the FileMetadata model, covering both
ORM (database) usage and Pydantic (schema validation) usage.

Tests cover:
- Database operations (creation, queries)
- FileStatus enum handling
- Field validation and constraints
- Inheritance from BaseResource (id, created_at, updated_at)
"""

from datetime import UTC, datetime
from uuid import UUID

import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.files.models import FileMetadata, FileStatus


@pytest.mark.asyncio
async def test_file_metadata_create_with_defaults(test_db_session: AsyncSession) -> None:
    """Test creating FileMetadata with required fields and default values."""
    file_metadata = FileMetadata(
        filename="document.pdf",
        mime_type="application/pdf",
        size_bytes=1024,
        file_path="/storage/nexus-abc123-document.pdf",
    )

    test_db_session.add(file_metadata)
    await test_db_session.commit()

    # Verify required fields
    assert file_metadata.id is not None
    assert isinstance(file_metadata.id, UUID)
    assert file_metadata.filename == "document.pdf"
    assert file_metadata.mime_type == "application/pdf"
    assert file_metadata.size_bytes == 1024
    assert file_metadata.file_path == "/storage/nexus-abc123-document.pdf"

    # Verify default values
    assert file_metadata.status == FileStatus.PENDING_CONVERSION
    assert file_metadata.converted_content_path is None
    assert file_metadata.conversion_error is None

    # Verify BaseResource fields (auto-generated)
    assert file_metadata.created_at is not None
    assert file_metadata.updated_at is not None
    assert isinstance(file_metadata.created_at, datetime)
    assert isinstance(file_metadata.updated_at, datetime)


@pytest.mark.asyncio
async def test_file_metadata_status_enum_values(test_db_session: AsyncSession) -> None:
    """Test FileStatus enum has all expected values."""
    # Verify all expected enum values exist
    assert FileStatus.PENDING_CONVERSION.value == "pending_conversion"
    assert FileStatus.CONVERTING.value == "converting"
    assert FileStatus.CONVERTED.value == "converted"
    assert FileStatus.CONVERSION_FAILED.value == "conversion_failed"

    # Test creating FileMetadata with each status
    for status in FileStatus:
        file_metadata = FileMetadata(
            filename=f"file_{status.value}.txt",
            mime_type="text/plain",
            size_bytes=100,
            file_path=f"/storage/nexus-{status.value}-file.txt",
            status=status,
        )
        test_db_session.add(file_metadata)
        await test_db_session.commit()

        assert file_metadata.status == status


@pytest.mark.asyncio
async def test_file_metadata_validates_required_fields(test_db_session: AsyncSession) -> None:
    """Test that required fields are enforced via validation."""
    from pydantic import ValidationError as PydanticValidationError

    # SQLModel with validate_assignment=True raises ValidationError
    # when trying to set a required field to None
    file_metadata = FileMetadata(
        filename="test.pdf",
        mime_type="application/pdf",
        size_bytes=1024,
        file_path="/storage/file.pdf",
    )

    # Trying to set a required field to None should raise validation error
    with pytest.raises(PydanticValidationError):
        file_metadata.filename = None  # type: ignore[assignment]


@pytest.mark.asyncio
async def test_file_metadata_inherits_base_resource_fields(test_db_session: AsyncSession) -> None:
    """Test that FileMetadata inherits id, created_at, updated_at from BaseResource."""
    file_metadata = FileMetadata(
        filename="test.txt",
        mime_type="text/plain",
        size_bytes=256,
        file_path="/storage/nexus-test-test.txt",
    )

    test_db_session.add(file_metadata)
    await test_db_session.commit()

    # id should be auto-generated UUID
    assert file_metadata.id is not None
    assert isinstance(file_metadata.id, UUID)

    # Timestamps should be set automatically
    assert file_metadata.created_at is not None
    assert file_metadata.updated_at is not None

    # Timestamps should have timezone info (UTC)
    assert file_metadata.created_at.tzinfo is not None
    assert file_metadata.updated_at.tzinfo is not None


@pytest.mark.asyncio
async def test_file_metadata_with_converted_content(test_db_session: AsyncSession) -> None:
    """Test FileMetadata with converted content path set."""
    file_metadata = FileMetadata(
        filename="document.pdf",
        mime_type="application/pdf",
        size_bytes=2048,
        file_path="/storage/nexus-abc123-document.pdf",
        converted_content_path="/storage/nexus-abc123-content.md",
        status=FileStatus.CONVERTED,
    )

    test_db_session.add(file_metadata)
    await test_db_session.commit()

    assert file_metadata.status == FileStatus.CONVERTED
    assert file_metadata.converted_content_path == "/storage/nexus-abc123-content.md"
    assert file_metadata.conversion_error is None


@pytest.mark.asyncio
async def ***REMOVED***(test_db_session: AsyncSession) -> None:
    """Test FileMetadata with conversion failure and error message."""
    error_message = "Failed to parse PDF: corrupted file"

    file_metadata = FileMetadata(
        filename="corrupted.pdf",
        mime_type="application/pdf",
        size_bytes=512,
        file_path="/storage/nexus-xyz789-corrupted.pdf",
        status=FileStatus.CONVERSION_FAILED,
        conversion_error=error_message,
    )

    test_db_session.add(file_metadata)
    await test_db_session.commit()

    assert file_metadata.status == FileStatus.CONVERSION_FAILED
    assert file_metadata.conversion_error == error_message
    assert file_metadata.converted_content_path is None


@pytest.mark.asyncio
async def test_file_metadata_size_bytes_must_be_non_negative(test_db_session: AsyncSession) -> None:
    """Test that size_bytes field must be non-negative (ge=0)."""
    with pytest.raises((ValueError, TypeError)):
        FileMetadata(
            filename="test.txt",
            mime_type="text/plain",
            size_bytes=-1,  # Negative size should fail
            file_path="/storage/test.txt",
        )


@pytest.mark.asyncio
async def test_file_metadata_update_status(test_db_session: AsyncSession) -> None:
    """Test updating FileMetadata status after creation."""
    # Create with pending status
    file_metadata = FileMetadata(
        filename="processing.docx",
        mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size_bytes=4096,
        file_path="/storage/nexus-proc123-processing.docx",
        status=FileStatus.PENDING_CONVERSION,
    )

    test_db_session.add(file_metadata)
    await test_db_session.commit()

    # Update to converting
    file_metadata.status = FileStatus.CONVERTING
    await test_db_session.commit()

    assert file_metadata.status == FileStatus.CONVERTING

    # Update to converted with content path
    file_metadata.status = FileStatus.CONVERTED
    file_metadata.converted_content_path = "/storage/nexus-proc123-content.md"
    await test_db_session.commit()

    assert file_metadata.status == FileStatus.CONVERTED
    assert file_metadata.converted_content_path == "/storage/nexus-proc123-content.md"


@pytest.mark.asyncio
async def test_file_metadata_storage_backend_defaults_to_local(test_db_session: AsyncSession) -> None:
    """Test that storage_backend defaults to 'local'."""
    file_metadata = FileMetadata(
        filename="test.pdf",
        mime_type="application/pdf",
        size_bytes=1024,
        file_path="/storage/nexus-abc-test.pdf",
    )
    test_db_session.add(file_metadata)
    await test_db_session.commit()

    assert file_metadata.storage_backend == "local"


@pytest.mark.asyncio
async def test_file_metadata_storage_backend_custom_value(test_db_session: AsyncSession) -> None:
    """Test setting storage_backend to a custom value like 's3'."""
    file_metadata = FileMetadata(
        filename="test.pdf",
        mime_type="application/pdf",
        size_bytes=1024,
        file_path="nexus-abc-test.pdf",
        storage_backend="s3",
    )
    test_db_session.add(file_metadata)
    await test_db_session.commit()

    assert file_metadata.storage_backend == "s3"


@pytest.mark.asyncio
async def ***REMOVED***(test_db_session: AsyncSession) -> None:
    """Test that content_hash defaults to None and accepts a SHA-256 value."""
    file_metadata = FileMetadata(
        filename="test.pdf",
        mime_type="application/pdf",
        size_bytes=1024,
        file_path="/storage/nexus-abc-test.pdf",
    )
    test_db_session.add(file_metadata)
    await test_db_session.commit()

    assert file_metadata.content_hash is None

    sha256 = "a" * 64
    file_metadata.content_hash = sha256
    await test_db_session.commit()
    assert file_metadata.content_hash == sha256


@pytest.mark.asyncio
async def test_file_metadata_retention_expires_at_nullable(test_db_session: AsyncSession) -> None:
    """Test that retention_expires_at defaults to None and accepts a datetime."""
    file_metadata = FileMetadata(
        filename="test.pdf",
        mime_type="application/pdf",
        size_bytes=1024,
        file_path="/storage/nexus-abc-test.pdf",
    )
    test_db_session.add(file_metadata)
    await test_db_session.commit()

    assert file_metadata.retention_expires_at is None

    expiry = datetime(2026, 12, 31, 23, 59, 59, tzinfo=UTC)
    file_metadata.retention_expires_at = expiry
    await test_db_session.commit()
    assert file_metadata.retention_expires_at is not None


@pytest.mark.asyncio
async def test_file_metadata_create_with_all_new_fields(test_db_session: AsyncSession) -> None:
    """Test creating FileMetadata with all three new fields set."""
    expiry = datetime(2026, 7, 1, 0, 0, 0, tzinfo=UTC)
    sha256 = "b" * 64

    file_metadata = FileMetadata(
        filename="report.docx",
        mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size_bytes=4096,
        file_path="nexus-xyz-report.docx",
        storage_backend="s3",
        content_hash=sha256,
        retention_expires_at=expiry,
    )
    test_db_session.add(file_metadata)
    await test_db_session.commit()

    assert file_metadata.storage_backend == "s3"
    assert file_metadata.content_hash == sha256
    assert file_metadata.retention_expires_at == expiry
