"""Integration tests for UploadedFileRetriever.

This module tests the integration between UploadedFileRetriever and FileManager,
ensuring proper document retrieval from uploaded files.

These tests follow TDD - they MUST FAIL initially since UploadedFileRetriever doesn't exist yet.
"""

import tempfile
from pathlib import Path
from uuid import uuid4

import pytest

from nexus.agent_orchestrator.context_manager.file_manager import FileMetadata
from nexus.agent_orchestrator.context_manager.retriever_service.models.relevant_document import RelevantDocument
from nexus.agent_orchestrator.context_manager.retriever_service.retrievers.uploaded_file_retriever import (
    UploadedFileRetriever,
)


@pytest.mark.integration
class TestUploadedFileRetrieverIntegration:
    """Integration tests for UploadedFileRetriever with FileManager."""

    @pytest.mark.asyncio
    async def test_retrieve_converted_documents(self) -> None:
        """Test retrieving documents from converted uploaded files."""
        # Setup temporary files for testing
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)

            # Create a test converted file
            converted_file = temp_path / "converted_document.txt"
            test_content = "This is a test document with important information about machine learning algorithms."
            converted_file.write_text(test_content, encoding="utf-8")

            # Create file metadata as would be stored in invocation context
            file_metadata = FileMetadata(
                file_id=str(uuid4()),
                filename="original_document.pdf",
                size_bytes=1024,
                mime_type="application/pdf",
                file_path=str(temp_path / "original_document.pdf"),
                status="converted",
                conversion={"output_path": str(converted_file)},
            )

            # Setup invocation context with file metadata
            invocation_context = {"file_metadata": [file_metadata.model_dump()]}

            # Create UploadedFileRetriever instance
            retriever = UploadedFileRetriever()

            # Execute retrieval
            documents = await retriever.retrieve_documents(invocation_context)

            # Verify results
            assert len(documents) == 1
            doc = documents[0]
            assert isinstance(doc, RelevantDocument)
            assert doc.content == test_content
            assert doc.relevancy_score == pytest.approx(1.0)  # Initial neutral score
            assert doc.source_type == "uploaded_file"
            assert doc.file_metadata.file_id == file_metadata.file_id
            assert "retrieved_at" in doc.retrieval_metadata

    @pytest.mark.asyncio
    async def test_skip_unconverted_files(self) -> None:
        """Test that unconverted files are skipped during retrieval."""
        # Create file metadata for unconverted file
        pending_file = FileMetadata(
            file_id=str(uuid4()),
            filename="pending_document.pdf",
            size_bytes=512,
            mime_type="application/pdf",
            file_path="/path/to/pending.pdf",
            status="pending_parse",  # Not converted yet
        )

        converting_file = FileMetadata(
            file_id=str(uuid4()),
            filename="converting_document.pdf",
            size_bytes=768,
            mime_type="application/pdf",
            file_path="/path/to/converting.pdf",
            status="converting",  # Still converting
        )

        invocation_context = {"file_metadata": [pending_file.model_dump(), converting_file.model_dump()]}

        retriever = UploadedFileRetriever()
        documents = await retriever.retrieve_documents(invocation_context)

        # Should return empty list since no files are converted
        assert documents == []

    @pytest.mark.asyncio
    async def test_skip_files_without_conversion_path(self) -> None:
        """Test that converted files without conversion file_path are skipped."""
        file_metadata = FileMetadata(
            file_id=str(uuid4()),
            filename="incomplete_conversion.pdf",
            size_bytes=256,
            mime_type="application/pdf",
            file_path="/path/to/incomplete.pdf",
            status="converted",
            conversion={},  # Missing file_path in conversion metadata
        )

        invocation_context = {"file_metadata": [file_metadata.model_dump()]}

        retriever = UploadedFileRetriever()
        documents = await retriever.retrieve_documents(invocation_context)

        # Should return empty list since conversion path is missing
        assert documents == []

    @pytest.mark.asyncio
    async def test_handle_missing_converted_file(self) -> None:
        """Test handling when converted file doesn't exist on disk."""
        file_metadata = FileMetadata(
            file_id=str(uuid4()),
            filename="missing_converted.pdf",
            size_bytes=512,
            mime_type="application/pdf",
            file_path="/path/to/original.pdf",
            status="converted",
            conversion={"output_path": "/nonexistent/converted.txt"},
        )

        invocation_context = {"file_metadata": [file_metadata.model_dump()]}

        retriever = UploadedFileRetriever()

        # Should handle gracefully - either skip the file or raise DocumentRetrievalError
        # Implementation will determine exact behavior
        await retriever.retrieve_documents(invocation_context)
        # Could be empty list (graceful skip) or raise DocumentRetrievalError

    @pytest.mark.asyncio
    async def test_empty_invocation_context(self) -> None:
        """Test handling of empty invocation context."""
        retriever = UploadedFileRetriever()

        # Empty context
        documents = await retriever.retrieve_documents({})
        assert documents == []

        # Context with empty file_metadata
        documents = await retriever.retrieve_documents({"file_metadata": []})
        assert documents == []

    @pytest.mark.asyncio
    async def test_multiple_converted_files(self) -> None:
        """Test retrieving multiple converted files."""
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)

            # Create multiple test files
            file1 = temp_path / "doc1.txt"
            file2 = temp_path / "doc2.txt"
            file1.write_text("First document content", encoding="utf-8")
            file2.write_text("Second document content", encoding="utf-8")

            # Create metadata for multiple files
            file_metadata_1 = FileMetadata(
                file_id=str(uuid4()),
                filename="document1.pdf",
                size_bytes=1024,
                mime_type="application/pdf",
                file_path=str(temp_path / "document1.pdf"),
                status="converted",
                conversion={"output_path": str(file1)},
            )

            file_metadata_2 = FileMetadata(
                file_id=str(uuid4()),
                filename="document2.docx",
                size_bytes=2048,
                mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                file_path=str(temp_path / "document2.docx"),
                status="converted",
                conversion={"output_path": str(file2)},
            )

            invocation_context = {"file_metadata": [file_metadata_1.model_dump(), file_metadata_2.model_dump()]}

            retriever = UploadedFileRetriever()
            documents = await retriever.retrieve_documents(invocation_context)

            # Should return both documents
            assert len(documents) == 2

            # Verify both documents are properly created
            contents = {doc.content for doc in documents}
            assert "First document content" in contents
            assert "Second document content" in contents

            # All documents should have proper metadata
            for doc in documents:
                assert isinstance(doc, RelevantDocument)
                assert doc.relevancy_score == pytest.approx(1.0)
                assert doc.source_type == "uploaded_file"
                assert doc.file_metadata.status == "converted"

    @pytest.mark.asyncio
    async def test_file_manager_integration(self) -> None:
        """Test integration with FileManager through dependency injection."""
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            test_file = temp_path / "integration_test.txt"
            test_content = "Integration test content for FileManager"
            test_file.write_text(test_content, encoding="utf-8")

            file_metadata = FileMetadata(
                file_id=str(uuid4()),
                filename="integration_test.pdf",
                size_bytes=len(test_content),
                mime_type="application/pdf",
                file_path=str(temp_path / "integration_test.pdf"),
                status="converted",
                conversion={"output_path": str(test_file)},
            )

            invocation_context = {"file_metadata": [file_metadata.model_dump()]}

            # Create retriever - it should internally use FileManager
            retriever = UploadedFileRetriever()
            documents = await retriever.retrieve_documents(invocation_context)

            assert len(documents) == 1
            doc = documents[0]
            assert doc.content == test_content

            # Verify retrieval metadata contains FileManager details
            assert doc.retrieval_metadata["file_path"] == str(test_file)
            assert "retrieved_at" in doc.retrieval_metadata
