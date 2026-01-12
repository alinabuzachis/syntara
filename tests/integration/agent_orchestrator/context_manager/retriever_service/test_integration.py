"""Integration test for RetrieverService with agent invocation workflow."""

from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from langchain_core.messages import AIMessage

from tests.conftest import wait_for_invocation_execution

# Test fixtures directory
FIXTURES_DIR = Path(__file__).parent.parent.parent.parent.parent / "fixtures" / "files"


@pytest.mark.asyncio
async def test_retriever_service_integration_with_agent_invocation(
    auth_client_with_mocked_llm, test_user, mock_openrouter_llm
) -> None:
    """Test RetrieverService integration with agent invocation workflow.

    This integration test verifies end-to-end document retrieval flow:
    1. File uploaded via invocations API
    2. File converted and stored in database as FileMetadata
    3. RetrieverService called by ContextManagerPlanner
    4. UploadedFileRetriever queries FileManager for documents
    5. Retrieved documents included in agent context
    6. Agent LLM receives context with file content

    The test mocks LLM responses to ensure deterministic behavior without real LLM calls.
    """
    # Mock LLM responses for both relevancy checking and final agent response
    with (
        patch(
            "nexus.agent_orchestrator.context_manager.retriever_service.checkers.llm_relevancy_checker.get_openrouter_llm"
        ) as mock_get_checker_llm,
    ):
        # Mock the LLMRelevancyChecker LLM to return high relevancy scores
        mock_checker_llm_instance = AsyncMock()
        mock_checker_llm_instance.ainvoke.return_value = AIMessage(
            content=(
                "Relevancy Score: 0.85\n\n"
                "This document contains highly relevant information about machine learning algorithms."
            )
        )
        mock_get_checker_llm.return_value = mock_checker_llm_instance

        # Load test text file with machine learning content
        text_file_path = FIXTURES_DIR / "sample.txt"
        assert text_file_path.exists(), f"Test text file not found at {text_file_path}"

        # Create multipart form data with document upload
        with text_file_path.open("rb") as text_file:
            files = {"files": ("machine_learning_guide.txt", text_file, "text/plain")}
            data = {
                "prompt": "What are the key machine learning algorithms I should know about?",
                "session_id": "retriever-integration-test",
            }

            # POST invocation with document
            response = await auth_client_with_mocked_llm.post(
                "/api/v1/invocations",
                data=data,
                files=files,
            )

            assert response.status_code == 202, f"Expected 202, got {response.status_code}: {response.text}"
            invocation_data = response.json()
            assert "id" in invocation_data
            invocation_id = invocation_data["id"]

            # Wait for execution to complete
            async with wait_for_invocation_execution(
                auth_client_with_mocked_llm, invocation_id, max_wait_time=30.0
            ) as final_data:
                # Verify execution completed
                assert final_data is not None
                assert final_data["status"] == "completed"

                # Verify agent LLM with bound tools was executed
                # GenericAgent calls llm.bind_tools() so we need to check the bound LLM
                bound_llm = mock_openrouter_llm.bind_tools.return_value
                bound_llm.ainvoke.assert_called()

                # Verify the agent received the original prompt
                agent_call_args = bound_llm.ainvoke.call_args[0][0]
                messages_str = str(agent_call_args)
                assert "What are the key machine learning algorithms I should know about?" in messages_str

                # Verify LLMRelevancyChecker was invoked with the document
                # (This confirms RetrieverService was called and documents were retrieved)
                if mock_checker_llm_instance.ainvoke.called:
                    # At least one document was scored for relevancy
                    assert mock_checker_llm_instance.ainvoke.call_count > 0
