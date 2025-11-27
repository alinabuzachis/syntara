"""Tests for DocumentConversionTask.

This module tests the background task execution for document conversion
with invocation integration and FileMetadata status management.
"""

from typing import Any, cast
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import pytest

from nexus.agent_orchestrator.context_manager.file_manager import FileMetadata
from nexus.agent_orchestrator.context_manager.file_manager.document_conversion.services import create_conversion_task
from nexus.agent_orchestrator.context_manager.file_manager.document_conversion.services.document_conversion_task import (  # noqa: E501
    DocumentConversionTask,
)
from nexus.agent_orchestrator.context_manager.file_manager.document_conversion.services.types import ConversionState
from nexus.agent_orchestrator.models.invocation import Invocation
from nexus.core.constants import CONTEXT_KEY_FILE_METADATA


@pytest.fixture
def sample_invocation_id() -> UUID:
    """Fixture providing a sample invocation ID."""
    return uuid4()


@pytest.fixture
def sample_file_metadata() -> FileMetadata:
    """Fixture providing sample FileMetadata for testing."""
    return FileMetadata(
        file_id="test-file-id-123",
        filename="test.pdf",
        file_path="/uploads/test.pdf",
        mime_type="application/pdf",
        size_bytes=1024,
        status="pending_parse",
    )


@pytest.fixture
def sample_invocation(sample_invocation_id: UUID, sample_file_metadata: FileMetadata) -> Invocation:
    """Fixture providing a sample invocation with file metadata."""
    return Invocation(
        id=sample_invocation_id,
        agent_name="test_agent",
        context_data={CONTEXT_KEY_FILE_METADATA: [sample_file_metadata.model_dump()]},
    )


class TestDocumentConversionTaskInit:
    """Test DocumentConversionTask initialization."""

    def test_init_with_default_session_factory(self) -> None:
        """Test initialization with default session factory."""
        task = create_conversion_task()
        assert task.service is not None
        assert task.session_factory is not None
        assert task.get_async_session_context is not None


class TestDocumentConversionTaskUpdateMetadata:
    """Test DocumentConversionTask metadata update functionality - CRITICAL functionality."""

    @pytest.mark.asyncio
    async def test_update_metadata_success_with_mocked_session(
        self,
        sample_invocation_id: UUID,
        sample_file_metadata: FileMetadata,
        sample_invocation: Invocation,
    ) -> None:
        """Test metadata updater successfully updates file metadata."""
        # Create a task and mock its _load_invocation method to avoid session complexity
        task = create_conversion_task()

        with (
            patch.object(task, "_load_invocation", new_callable=AsyncMock) as mock_load_invocation,
            patch.object(task, "get_async_session_context") as mock_session_context,
        ):
            # Mock session context manager
            mock_session = AsyncMock()
            mock_session_context.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session_context.return_value.__aexit__ = AsyncMock(return_value=None)

            # Mock _load_invocation to return our sample
            mock_load_invocation.return_value = sample_invocation

            # Create metadata updater
            updater = task._get_metadata_updater(sample_invocation_id)  # noqa: SLF001

            # Update the file metadata status
            updated_metadata = sample_file_metadata.model_copy(update={"status": "converted"})
            await updater(updated_metadata)

            # Verify _load_invocation was called
            mock_load_invocation.assert_called_once_with(sample_invocation_id)

            # Verify the context data was updated correctly
            context_data = sample_invocation.context_data
            file_metadata_list = cast("list[dict[str, Any]]", context_data[CONTEXT_KEY_FILE_METADATA])
            assert len(file_metadata_list) == 1
            assert file_metadata_list[0]["status"] == "converted"
            assert file_metadata_list[0]["filename"] == sample_file_metadata.filename

            # Verify database operations were called
            mock_session.add.assert_called_once_with(sample_invocation)
            mock_session.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_update_metadata_with_multiple_files(
        self,
        sample_invocation_id: UUID,
        sample_file_metadata: FileMetadata,
    ) -> None:
        """Test metadata updater with multiple files in invocation."""
        # Create invocation with multiple files
        file_metadata_2 = sample_file_metadata.model_copy(
            update={"filename": "test2.docx", "file_id": "test-file-id-456"}
        )
        file_metadata_3 = sample_file_metadata.model_copy(
            update={"filename": "test3.txt", "file_id": "test-file-id-789"}
        )

        multi_file_invocation = Invocation(
            id=sample_invocation_id,
            agent_name="test_agent",
            context_data={
                CONTEXT_KEY_FILE_METADATA: [
                    sample_file_metadata.model_dump(),
                    file_metadata_2.model_dump(),
                    file_metadata_3.model_dump(),
                ]
            },
        )

        # Create a task and mock its _load_invocation method
        task = create_conversion_task()

        with (
            patch.object(task, "_load_invocation", new_callable=AsyncMock) as mock_load_invocation,
            patch.object(task, "get_async_session_context") as mock_session_context,
        ):
            # Mock session context manager
            mock_session = AsyncMock()
            mock_session_context.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session_context.return_value.__aexit__ = AsyncMock(return_value=None)

            # Mock _load_invocation to return multi-file invocation
            mock_load_invocation.return_value = multi_file_invocation

            # Create metadata updater
            updater = task._get_metadata_updater(sample_invocation_id)  # noqa: SLF001

            # Update the second file's metadata
            updated_file_2 = file_metadata_2.model_copy(update={"status": "converted"})
            await updater(updated_file_2)

            # Verify the specific file was updated
            context_data = multi_file_invocation.context_data
            file_metadata_list = cast("list[dict[str, Any]]", context_data[CONTEXT_KEY_FILE_METADATA])
            assert len(file_metadata_list) == 3

            # Check that only the second file was updated
            assert file_metadata_list[0]["status"] == "pending_parse"  # First file unchanged
            assert file_metadata_list[1]["status"] == "converted"  # Second file updated
            assert file_metadata_list[1]["filename"] == "test2.docx"  # Correct file
            assert file_metadata_list[2]["status"] == "pending_parse"  # Third file unchanged

    @pytest.mark.asyncio
    async def test_update_metadata_invocation_not_found(
        self,
        sample_invocation_id: UUID,
        sample_file_metadata: FileMetadata,
    ) -> None:
        """Test metadata updater when invocation is not found."""
        # Create a task and mock its _load_invocation method
        task = create_conversion_task()

        with (
            patch.object(task, "_load_invocation", new_callable=AsyncMock) as mock_load_invocation,
            patch.object(task, "get_async_session_context") as mock_session_context,
        ):
            # Mock session context manager
            mock_session = AsyncMock()
            mock_session_context.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session_context.return_value.__aexit__ = AsyncMock(return_value=None)

            # Mock _load_invocation to return None
            mock_load_invocation.return_value = None

            # Create metadata updater
            updater = task._get_metadata_updater(sample_invocation_id)  # noqa: SLF001

            # Try to update metadata (should not raise error)
            await updater(sample_file_metadata)

            # Verify _load_invocation was called
            mock_load_invocation.assert_called_once_with(sample_invocation_id)

            # Verify no database operations were performed
            mock_session.add.assert_not_called()
            mock_session.commit.assert_not_called()

    @pytest.mark.asyncio
    async def test_update_metadata_preserves_other_metadata_fields(
        self,
        sample_invocation_id: UUID,
        sample_file_metadata: FileMetadata,
        sample_invocation: Invocation,
    ) -> None:
        """Test that metadata updater preserves all other fields when updating status."""
        # Create a task and mock its _load_invocation method
        task = create_conversion_task()

        with (
            patch.object(task, "_load_invocation", new_callable=AsyncMock) as mock_load_invocation,
            patch.object(task, "get_async_session_context") as mock_session_context,
        ):
            # Mock session context manager
            mock_session = AsyncMock()
            mock_session_context.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session_context.return_value.__aexit__ = AsyncMock(return_value=None)

            # Mock _load_invocation to return our sample
            mock_load_invocation.return_value = sample_invocation

            # Create metadata updater
            updater = task._get_metadata_updater(sample_invocation_id)  # noqa: SLF001

            # Update with additional metadata fields
            updated_metadata = sample_file_metadata.model_copy(
                update={
                    "status": "converted",
                    "conversion": {
                        "converted_path": "/converted/test.md",
                        "conversion_time_ms": 1500,
                        "converter_used": "pdf_converter",
                    },
                }
            )
            await updater(updated_metadata)

            # Verify all fields were preserved and updated
            context_data = sample_invocation.context_data
            file_metadata_list = cast("list[dict[str, Any]]", context_data[CONTEXT_KEY_FILE_METADATA])
            updated_file = file_metadata_list[0]

            # Check original fields are preserved
            assert updated_file["file_id"] == sample_file_metadata.file_id
            assert updated_file["filename"] == sample_file_metadata.filename
            assert updated_file["file_path"] == sample_file_metadata.file_path
            assert updated_file["mime_type"] == sample_file_metadata.mime_type
            assert updated_file["size_bytes"] == sample_file_metadata.size_bytes

            # Check updated fields
            assert updated_file["status"] == "converted"
            assert updated_file["conversion"]["converted_path"] == "/converted/test.md"
            assert updated_file["conversion"]["conversion_time_ms"] == 1500
            assert updated_file["conversion"]["converter_used"] == "pdf_converter"


class TestDocumentConversionTaskLoadFileMetadata:
    """Test DocumentConversionTask file metadata loading."""

    @pytest.mark.asyncio
    async def test_load_invocation_file_metadata_success(
        self, sample_invocation: Invocation, sample_file_metadata: FileMetadata
    ) -> None:
        """Test successful file metadata loading."""
        result = await DocumentConversionTask._load_invocation_file_metadata(sample_invocation)  # noqa: SLF001

        assert len(result) == 1
        assert result[0]["filename"] == sample_file_metadata.filename

    @pytest.mark.asyncio
    async def test_load_invocation_file_metadata_no_invocation(self) -> None:
        """Test file metadata loading when invocation is None."""
        result = await DocumentConversionTask._load_invocation_file_metadata(None)  # noqa: SLF001
        assert result == []

    @pytest.mark.asyncio
    async def test_load_invocation_file_metadata_no_context_data(self, sample_invocation_id: UUID) -> None:
        """Test file metadata loading when no context data exists."""
        invocation = Invocation(id=sample_invocation_id, agent_name="test_agent")
        result = await DocumentConversionTask._load_invocation_file_metadata(invocation)  # noqa: SLF001
        assert result == []

    @pytest.mark.asyncio
    async def test_load_invocation_file_metadata_no_file_metadata(self, sample_invocation_id: UUID) -> None:
        """Test file metadata loading when no file metadata exists in context."""
        invocation = Invocation(
            id=sample_invocation_id,
            agent_name="test_agent",
            context_data={"other_key": "other_value"},
        )
        result = await DocumentConversionTask._load_invocation_file_metadata(invocation)  # noqa: SLF001
        assert result == []


class TestDocumentConversionTaskSingleDocumentConversion:
    """Test DocumentConversionTask single document conversion."""

    @pytest.mark.asyncio
    async def test_convert_single_document_success(
        self,
        sample_invocation_id: UUID,
        sample_file_metadata: FileMetadata,
    ) -> None:
        """Test successful single document conversion."""
        task = create_conversion_task()
        with patch.object(
            task.service, "convert_file", new_callable=AsyncMock, return_value=ConversionState.SUCCESS
        ) as mock_convert:
            file_metadata_dict = sample_file_metadata.model_dump()

            result = await task._convert_single_document(sample_invocation_id, file_metadata_dict)  # noqa: SLF001

            assert result == ConversionState.SUCCESS
            mock_convert.assert_called_once()

    @pytest.mark.asyncio
    async def test_convert_single_document_skip_non_pending(
        self,
        sample_invocation_id: UUID,
        sample_file_metadata: FileMetadata,
    ) -> None:
        """Test single document conversion skips non-pending files."""
        task = create_conversion_task()
        # Set status to something other than pending_parse
        file_metadata = sample_file_metadata.model_copy(update={"status": "converted"})
        file_metadata_dict = file_metadata.model_dump()

        result = await task._convert_single_document(sample_invocation_id, file_metadata_dict)  # noqa: SLF001

        assert result == ConversionState.SKIPPED

    @pytest.mark.asyncio
    async def test_convert_single_document_conversion_failure(
        self,
        sample_invocation_id: UUID,
        sample_file_metadata: FileMetadata,
    ) -> None:
        """Test single document conversion failure handling."""
        task = create_conversion_task()
        with (
            patch.object(
                task.service, "convert_file", new_callable=AsyncMock, side_effect=Exception("Conversion error")
            ),
            patch.object(task, "_get_metadata_updater", return_value=AsyncMock()) as mock_updater,
        ):
            file_metadata_dict = sample_file_metadata.model_dump()

            result = await task._convert_single_document(sample_invocation_id, file_metadata_dict)  # noqa: SLF001

            assert result == ConversionState.FAILED
            # Verify that the metadata updater was called twice:
            # 1. Once to get the status_updater in the try block
            # 2. Once to get the updater in the exception block
            assert mock_updater.call_count == 2

    @pytest.mark.asyncio
    async def test_convert_single_document_metadata_validation_error(
        self,
        sample_invocation_id: UUID,
    ) -> None:
        """Test single document conversion with invalid metadata."""
        task = create_conversion_task()
        # Invalid file metadata dict
        invalid_metadata: dict[str, object] = {"invalid": "data"}

        # The implementation will catch the ValidationError and return FAILED
        result = await task._convert_single_document(sample_invocation_id, invalid_metadata)  # noqa: SLF001

        assert result == ConversionState.FAILED


class TestDocumentConversionTaskProcessConversions:
    """Test DocumentConversionTask batch conversion processing."""

    @pytest.mark.asyncio
    async def test_process_conversions_all_success(
        self,
        sample_invocation_id: UUID,
        sample_file_metadata: FileMetadata,
    ) -> None:
        """Test processing multiple conversions with all successes."""
        task = create_conversion_task()
        with patch.object(
            task, "_convert_single_document", new_callable=AsyncMock, return_value=ConversionState.SUCCESS
        ):
            files_to_convert = [sample_file_metadata.model_dump()]

            successful, failed, skipped = await task._process_conversions(sample_invocation_id, files_to_convert)  # noqa: SLF001

            assert successful == 1
            assert failed == 0
            assert skipped == 0

    @pytest.mark.asyncio
    async def test_process_conversions_mixed_results(
        self,
        sample_invocation_id: UUID,
        sample_file_metadata: FileMetadata,
    ) -> None:
        """Test processing multiple conversions with mixed results."""
        task = create_conversion_task()
        # Create multiple file metadata objects with different statuses
        files_to_convert = [
            sample_file_metadata.model_dump(),
            sample_file_metadata.model_copy(update={"filename": "test2.pdf"}).model_dump(),
            sample_file_metadata.model_copy(update={"filename": "test3.pdf"}).model_dump(),
        ]

        # Mock different outcomes for each file
        return_values = [ConversionState.SUCCESS, ConversionState.FAILED, ConversionState.SKIPPED]
        with patch.object(task, "_convert_single_document", new_callable=AsyncMock, side_effect=return_values):
            successful, failed, skipped = await task._process_conversions(sample_invocation_id, files_to_convert)  # noqa: SLF001

            # With the fixed implementation, all files should be processed
            assert successful == 1
            assert failed == 1
            assert skipped == 1

    @pytest.mark.asyncio
    async def test_process_conversions_exception_handling(
        self,
        sample_invocation_id: UUID,
        sample_file_metadata: FileMetadata,
    ) -> None:
        """Test processing conversions with exception handling."""
        task = create_conversion_task()
        files_to_convert = [sample_file_metadata.model_dump()]

        with patch.object(
            task, "_convert_single_document", new_callable=AsyncMock, side_effect=Exception("Test error")
        ):
            successful, failed, skipped = await task._process_conversions(sample_invocation_id, files_to_convert)  # noqa: SLF001

            assert successful == 0
            assert failed == 1
            assert skipped == 0


class TestDocumentConversionTaskExecuteInvocation:
    """Test DocumentConversionTask invocation execution."""

    @pytest.mark.asyncio
    async def test_execute_invocation_after_conversion_success(
        self,
        sample_invocation_id: UUID,
    ) -> None:
        """Test successful invocation execution after conversion."""
        task = create_conversion_task()
        with patch(
            "nexus.agent_orchestrator.context_manager.file_manager.document_conversion.services.document_conversion_task.InvocationExecutor"
        ) as mock_execution_service_class:
            mock_execution_service = AsyncMock()
            mock_execution_service_class.return_value = mock_execution_service

            await task._execute_invocation_after_conversion(sample_invocation_id)  # noqa: SLF001

            mock_execution_service.execute_invocation.assert_called_once_with(sample_invocation_id)

    @pytest.mark.asyncio
    async def test_execute_invocation_after_conversion_failure(
        self,
        sample_invocation_id: UUID,
    ) -> None:
        """Test invocation execution failure after conversion."""
        task = create_conversion_task()
        with patch(
            "nexus.agent_orchestrator.context_manager.file_manager.document_conversion.services.document_conversion_task.InvocationExecutor"
        ) as mock_execution_service_class:
            mock_execution_service = AsyncMock()
            mock_execution_service.execute_invocation.side_effect = Exception("Execution error")
            mock_execution_service_class.return_value = mock_execution_service

            # Should not raise exception, just log it
            await task._execute_invocation_after_conversion(sample_invocation_id)  # noqa: SLF001

            mock_execution_service.execute_invocation.assert_called_once_with(sample_invocation_id)
