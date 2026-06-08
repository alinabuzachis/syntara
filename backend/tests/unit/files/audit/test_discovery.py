"""Test auto-discovery of files audit handlers."""

import nexus.files.audit
from nexus.audit.discovery import discover_handlers
from nexus.files.audit.file_converted import FileConvertedEvent, FileConvertedHandler
from nexus.files.audit.files_uploaded import FilesUploadedEvent, FilesUploadedHandler


def test_all_handlers_registered() -> None:
    """Verify that all files audit handlers are auto-discovered."""
    registry = discover_handlers(nexus.files.audit)

    assert len(registry) == 2, "Expected 2 handlers to be registered"
    assert FilesUploadedEvent in registry, "FilesUploadedEvent handler not registered"
    assert FileConvertedEvent in registry, "FileConvertedEvent handler not registered"

    assert isinstance(registry[FilesUploadedEvent], FilesUploadedHandler), (
        "FilesUploadedHandler not correctly registered"
    )
    assert isinstance(registry[FileConvertedEvent], FileConvertedHandler), (
        "FileConvertedHandler not correctly registered"
    )
