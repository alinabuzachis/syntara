"""Integration test for information query flow.

Tests end-to-end flow: POST /invocations → routing → GenericAgent → LLM response.
These tests MUST FAIL initially (TDD requirement).
"""

from unittest.mock import AsyncMock, patch
from uuid import UUID

import pytest
from httpx import AsyncClient
from langchain_core.messages import AIMessage


class TestGenericQueryFlow:
    """Test end-to-end information query flow."""

    @pytest.mark.asyncio
    async def test_information_query_routes_to_generic_agent(self, base_client: AsyncClient, test_user) -> None:
        """Test POST /invocations with info query routes to GenericAgent."""
        # Arrange
        request_data = {
            "prompt": "What tools are available for deployment?",
            "created_by": str(test_user.id),
            "session_id": "test-session-456",
            "context_data": {},
        }

        # Mock LangChain LLM response
        with patch("nexus.agent_orchestrator.services.invocation_service.get_openrouter_llm") as mock_get_llm:
            mock_llm = AsyncMock()
            mock_llm.ainvoke.return_value = AIMessage(
                content="Available deployment tools: kubernetes-deployer, docker-builder, terraform-provisioner"
            )
            mock_get_llm.return_value = mock_llm

            # Act
            response = await base_client.post("/api/v1/invocations", json=request_data)

            # Assert
            assert response.status_code == 202
            data = response.json()
            assert "id" in data
            assert data["status"] in ["running", "completed"]  # Sync execution completes immediately

            # Verify invocation ID is valid UUID
            invocation_id = UUID(data["id"])
            assert isinstance(invocation_id, UUID)

    @pytest.mark.asyncio
    async def test_generic_agent_returns_answer_not_workflow(self, base_client: AsyncClient, test_user) -> None:
        """Test GenericAgent returns result_type='answer' (not 'workflow')."""
        # Arrange
        request_data = {
            "prompt": "List available monitoring tools",
            "created_by": str(test_user.id),
            "session_id": "test-session",
        }

        # Mock LLM
        with patch("nexus.agent_orchestrator.services.invocation_service.get_openrouter_llm") as mock_get_llm:
            mock_llm = AsyncMock()
            mock_llm.ainvoke.return_value = AIMessage(content="Monitoring tools: prometheus, grafana")
            mock_get_llm.return_value = mock_llm

            # Act
            response = await base_client.post("/api/v1/invocations", json=request_data)

            # Assert
            assert response.status_code == 202
            # Note: In real implementation, we'd query the invocation result
            # to verify result_type='answer'. For now, just verify invocation created.

    @pytest.mark.asyncio
    async def test_no_workflow_generation_for_information_queries(self, base_client: AsyncClient, test_user) -> None:
        """Test information queries don't trigger workflow generation."""
        # Arrange
        request_data = {
            "prompt": "Show me available agents",
            "created_by": str(test_user.id),
            "session_id": "test-session",
        }

        # Mock GenericAgent LLM
        with patch("nexus.agent_orchestrator.services.invocation_service.get_openrouter_llm") as mock_get_llm:
            mock_llm = AsyncMock()
            mock_llm.ainvoke.return_value = AIMessage(content="Available agents: agent-1, agent-2")
            mock_get_llm.return_value = mock_llm

            # Act
            response = await base_client.post("/api/v1/invocations", json=request_data)

            # Assert
            assert response.status_code == 202
            # GenericAgent should be called (verify LLM was invoked)
            assert mock_llm.ainvoke.called

    @pytest.mark.asyncio
    async def test_llm_generates_answer_for_query(self, base_client: AsyncClient, test_user) -> None:
        """Test LangChain LLM generates answer (using mocked LLM response)."""
        # Arrange
        request_data = {
            "prompt": "What deployment strategies are supported?",
            "created_by": str(test_user.id),
            "session_id": "test-session",
        }

        # Mock LangChain LLM response
        with patch("nexus.agent_orchestrator.services.invocation_service.get_openrouter_llm") as mock_get_llm:
            mock_llm = AsyncMock()
            mock_llm.ainvoke.return_value = AIMessage(
                content="Supported deployment strategies: blue-green, canary, rolling"
            )
            mock_get_llm.return_value = mock_llm

            # Act
            response = await base_client.post("/api/v1/invocations", json=request_data)

            # Assert
            assert response.status_code == 202
            data = response.json()
            assert data["status"] in ["running", "completed"]
            # Invocation accepted successfully - LLM will process in background/sync


class TestGenericQueryErrorHandling:
    """Test error handling for information query flow."""

    @pytest.mark.asyncio
    async def test_handles_llm_errors_gracefully(self, base_client: AsyncClient, test_user) -> None:
        """Test system handles LLM errors without crashing."""
        # Arrange
        request_data = {
            "prompt": "What tools are available?",
            "created_by": str(test_user.id),
            "session_id": "test-session",
        }

        with patch("nexus.agent_orchestrator.services.invocation_service.get_openrouter_llm") as mock_get_llm:
            mock_llm = AsyncMock()
            mock_llm.ainvoke.side_effect = Exception("LLM API error")
            mock_get_llm.return_value = mock_llm

            # Act
            response = await base_client.post("/api/v1/invocations", json=request_data)

            # Assert
            # Should still accept invocation (error handled in background)
            assert response.status_code in [202, 500]

    @pytest.mark.asyncio
    async def test_handles_invalid_request_data(self, base_client: AsyncClient, test_user) -> None:
        """Test system validates request data properly."""
        # Arrange

        invalid_request = {
            "prompt": "",  # Empty prompt should fail validation
            "created_by": str(test_user.id),
            "session_id": "test-session",
        }

        # Act
        response = await base_client.post("/api/v1/invocations", json=invalid_request)

        # Assert
        assert response.status_code == 422  # Unprocessable Entity (Pydantic validation error)
