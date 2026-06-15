"""Test auto-discovery of files audit handlers."""

import nexus.files.audit
from nexus.audit.discovery import discover_handlers
from nexus.files.audit.file_cleaned_up import FileCleanedUpEvent, FileCleanedUpHandler
from nexus.files.audit.file_converted import FileConvertedEvent, FileConvertedHandler
from nexus.files.audit.file_downloaded import FileDownloadedEvent, FileDownloadedHandler
from nexus.files.audit.file_integrity_failed import FileIntegrityFailedEvent, FileIntegrityFailedHandler
from nexus.files.audit.files_uploaded import FilesUploadedEvent, FilesUploadedHandler


def test_all_handlers_registered() -> None:
    """Verify that all files audit handlers are auto-discovered."""
    registry = discover_handlers(nexus.files.audit)

    assert len(registry) == 5, "Expected 5 handlers to be registered"
    assert FilesUploadedEvent in registry
    assert FileConvertedEvent in registry
    assert FileDownloadedEvent in registry
    assert FileIntegrityFailedEvent in registry
    assert FileCleanedUpEvent in registry

    assert isinstance(registry[FilesUploadedEvent], FilesUploadedHandler)
    assert isinstance(registry[FileConvertedEvent], FileConvertedHandler)
    assert isinstance(registry[FileDownloadedEvent], FileDownloadedHandler)
    assert isinstance(registry[FileIntegrityFailedEvent], FileIntegrityFailedHandler)
    assert isinstance(registry[FileCleanedUpEvent], FileCleanedUpHandler)
