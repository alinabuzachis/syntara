"""Integration tests for document conversion with agent invocation workflow."""

from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from langchain_core.messages import AIMessage

from tests.conftest import wait_for_invocation_execution

# Test fixtures directory
FIXTURES_DIR = Path(__file__).parent.parent.parent.parent.parent.parent / "fixtures" / "files"


@pytest.mark.asyncio
async def test_invoke_agent_with_pdf_document_conversion(auth_client: AsyncClient, test_user) -> None:
    """Test complete agent invocation workflow with PDF document conversion.

    This test demonstrates T028 requirements:
    - Creation of an Invocation using POST with documents included
    - Document conversion processing in background task
    - Invocation execution after conversion completes

    """
    # Mock LangChain LLM response for after document conversion
    with patch("nexus.agent_orchestrator.services.invocation_execution_service.get_openrouter_llm") as mock_get_llm:
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = AIMessage(
            content="Document successfully processed: Sample PDF content has been converted to markdown."
        )
        mock_get_llm.return_value = mock_llm

        # Load test PDF file
        pdf_file_path = FIXTURES_DIR / "sample.pdf"
        assert pdf_file_path.exists(), f"Test PDF file not found at {pdf_file_path}"

        # Create multipart form data with two document uploads (same filename)
        with pdf_file_path.open("rb") as pdf_file:
            files = [
                ("files", ("sample.pdf", pdf_file, "application/pdf")),
                ("files", ("sample.pdf", pdf_file, "application/pdf")),
            ]
            data = {
                "prompt": "Please analyze the content of the uploaded documents and summarize them.",
                "session_id": "document-conversion-test",
            }

            # POST invocation with document
            response = await auth_client.post(
                "/api/v1/invocations",
                data=data,
                files=files,
            )

            assert response.status_code == 202, f"Expected 202, got {response.status_code}: {response.text}"
            invocation_data = response.json()
            invocation_id = invocation_data["id"]

            # Verify invocation created with expected structure
            assert "id" in invocation_data
            assert invocation_data["status"] == "created"
            assert (
                invocation_data["prompt"] == "Please analyze the content of the uploaded documents and summarize them."
            )
            assert invocation_data["session_id"] == "document-conversion-test"
            assert invocation_data["created_by"] == str(test_user.id)

            # Verify context_data contains file_metadata
            assert "context_data" in invocation_data
            assert invocation_data["context_data"] is not None
            assert "file_metadata" in invocation_data["context_data"]

            file_metadata_list = invocation_data["context_data"]["file_metadata"]
            assert isinstance(file_metadata_list, list)
            assert len(file_metadata_list) == 2

            # Check both files have correct metadata
            for file_metadata in file_metadata_list:
                assert file_metadata["filename"] == "sample.pdf"
                assert file_metadata["mime_type"] == "application/pdf"
                assert file_metadata["status"] == "pending_parse"
                assert file_metadata["size_bytes"] > 0
                assert "file_id" in file_metadata
                assert isinstance(file_metadata["file_id"], str)
                # file_path is excluded from API responses for security
                assert "file_path" not in file_metadata

            # Wait for background document conversion and invocation execution
            async with wait_for_invocation_execution(auth_client, invocation_id, max_wait_time=15.0) as final_data:
                # Verify execution completed
                assert final_data is not None
                assert final_data["status"] == "completed"

                # Verify the result contains converted content
                assert final_data["status"] == "completed"
                assert final_data["result"] is not None
                assert "content" in final_data["result"]
                result_content = final_data["result"]["content"]
                assert "Document successfully processed" in result_content

                # Verify document conversion status for both files
                updated_file_metadata_list = final_data["context_data"]["file_metadata"]
                assert len(updated_file_metadata_list) == 2

                for updated_file_metadata in updated_file_metadata_list:
                    assert updated_file_metadata["status"] == "converted"
                    assert "conversion" in updated_file_metadata
                    conversion_data = updated_file_metadata["conversion"]
                    assert "output_filename" in conversion_data
                    assert "converted_at" in conversion_data
                    assert "conversion_time_ms" in conversion_data
                    # output_path is excluded from API responses for security
                    assert "output_path" not in conversion_data


@pytest.mark.asyncio
async def test_invoke_agent_with_text_document_conversion(auth_client: AsyncClient, test_user) -> None:
    """Test agent invocation workflow with text file document conversion.

    Tests text-to-markdown conversion workflow.
    """
    # Mock LangChain LLM response
    with patch("nexus.agent_orchestrator.services.invocation_execution_service.get_openrouter_llm") as mock_get_llm:
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = AIMessage(
            content="Document successfully processed: Sample text content has been converted to markdown."
        )
        mock_get_llm.return_value = mock_llm

        # Load test text file
        text_file_path = FIXTURES_DIR / "sample.txt"
        assert text_file_path.exists(), f"Test text file not found at {text_file_path}"

        # Create multipart form data with document upload
        with text_file_path.open("rb") as text_file:
            files = {"files": ("sample.txt", text_file, "text/plain")}
            data = {
                "prompt": "What is the main content of this text file?",
                "session_id": "text-conversion-test",
            }

            # POST invocation with document
            response = await auth_client.post(
                "/api/v1/invocations",
                data=data,
                files=files,
            )

            assert response.status_code == 202
            invocation_data = response.json()
            invocation_id = invocation_data["id"]

            # Verify invocation created with text file metadata
            file_metadata = invocation_data["context_data"]["file_metadata"][0]
            assert file_metadata["filename"] == "sample.txt"
            assert file_metadata["mime_type"] == "text/plain"
            assert file_metadata["status"] == "pending_parse"
            # file_path is excluded from API responses for security
            assert "file_path" not in file_metadata

            # Wait for conversion and execution
            async with wait_for_invocation_execution(auth_client, invocation_id, max_wait_time=10.0) as final_data:
                # Verify execution completed
                assert final_data is not None
                assert final_data["status"] == "completed"

                # Verify the result contains converted content
                assert final_data["status"] == "completed"
                assert final_data["result"] is not None
                assert "content" in final_data["result"]
                result_content = final_data["result"]["content"]
                assert "Document successfully processed" in result_content

                # Verify document conversion status
                updated_file_metadata = final_data["context_data"]["file_metadata"][0]

                assert updated_file_metadata["status"] == "converted"
                assert "conversion" in updated_file_metadata
                conversion_data = updated_file_metadata["conversion"]
                assert "output_filename" in conversion_data
                assert "converted_at" in conversion_data
                assert "conversion_time_ms" in conversion_data
                # output_path is excluded from API responses for security
                assert "output_path" not in conversion_data
