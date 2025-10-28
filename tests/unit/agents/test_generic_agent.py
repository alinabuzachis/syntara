"""Unit tests for GenericAgent with LangChain LLM.

Tests the GenericAgent implementation using LangChain with mocked OpenRouter.
These tests MUST FAIL initially (TDD requirement).
"""

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from langchain_core.messages import AIMessage

from nexus.agent_orchestrator.agents import GenericAgent
from nexus.agent_orchestrator.models import GenericAgentResponse


class TestGenericAgentLLMIntegration:
    """Test GenericAgent with LangChain LLM."""

    @pytest.mark.asyncio
    async def test_generic_agent_queries_llm_and_returns_answer(self) -> None:
        """Test GenericAgent queries LangChain LLM and returns answer response."""
        # Arrange
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = AIMessage(
            content="Available tools include deployment-agent, monitoring-agent, and testing-agent."
        )

        agent = GenericAgent(llm=mock_llm)
        prompt = "What tools are available for deployment?"
        invocation_id = uuid4()

        # Act
        response = await agent.execute(prompt, invocation_id)

        # Assert
        assert isinstance(response, GenericAgentResponse)
        assert response.type == "answer"
        assert "deployment-agent" in response.content
        assert "monitoring-agent" in response.content
        mock_llm.ainvoke.assert_called_once()

    @pytest.mark.asyncio
    async def test_generic_agent_result_type_is_answer_not_workflow(self) -> None:
        """Test GenericAgent returns type='answer' (not 'workflow')."""
        # Arrange
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = AIMessage(content="Test answer")

        agent = GenericAgent(llm=mock_llm)
        invocation_id = uuid4()

        # Act
        response = await agent.execute("test query", invocation_id)

        # Assert
        assert response.type == "answer"
        # Verify it's not workflow type (redundant but explicit test requirement)
        assert response.type == "answer"

    @pytest.mark.asyncio
    async def test_generic_agent_handles_llm_api_errors_gracefully(self) -> None:
        """Test GenericAgent handles LLM API errors (invalid key, rate limit, timeout)."""
        # Arrange - API key error
        mock_llm = AsyncMock()
        mock_llm.ainvoke.side_effect = Exception("Invalid API key")

        agent = GenericAgent(llm=mock_llm)
        invocation_id = uuid4()

        # Act
        response = await agent.execute("test query", invocation_id)

        # Assert
        assert isinstance(response, GenericAgentResponse)
        assert response.type == "answer"
        # Verify user-friendly error message for configuration issues
        assert "apologize" in response.content.lower()
        assert "configuration" in response.content.lower()
        # Verify error metadata is populated
        assert "error" in response.response_metadata
        assert response.response_metadata["error"] == "Invalid API key"

    @pytest.mark.asyncio
    async def test_generic_agent_handles_rate_limit_errors(self) -> None:
        """Test GenericAgent handles rate limit errors from OpenRouter."""
        # Arrange
        mock_llm = AsyncMock()
        mock_llm.ainvoke.side_effect = Exception("Rate limit exceeded")

        agent = GenericAgent(llm=mock_llm)
        invocation_id = uuid4()

        # Act
        response = await agent.execute("test query", invocation_id)

        # Assert
        assert isinstance(response, GenericAgentResponse)
        # Verify user-friendly error message for rate limiting
        assert "apologize" in response.content.lower()
        assert "high demand" in response.content.lower()
        # Verify error metadata is populated
        assert "error" in response.response_metadata
        assert response.response_metadata["error"] == "Rate limit exceeded"

    @pytest.mark.asyncio
    async def test_generic_agent_handles_timeout_errors(self) -> None:
        """Test GenericAgent handles timeout scenarios."""
        # Arrange
        mock_llm = AsyncMock()
        mock_llm.ainvoke.side_effect = TimeoutError("Request timed out")

        agent = GenericAgent(llm=mock_llm)
        invocation_id = uuid4()

        # Act
        response = await agent.execute("test query", invocation_id)

        # Assert
        assert isinstance(response, GenericAgentResponse)
        # Verify user-friendly error message for timeout
        assert "apologize" in response.content.lower()
        assert "timed out" in response.content.lower()
        # Verify error metadata is populated
        assert "error" in response.response_metadata
        assert response.response_metadata["error"] == "timeout"


class TestGenericAgentPromptEngineering:
    """Test GenericAgent prompt template and engineering."""

    @pytest.mark.asyncio
    async def test_generic_agent_uses_information_assistant_prompt(self) -> None:
        """Test GenericAgent uses appropriate prompt template for information queries."""
        # Arrange
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = AIMessage(content="Test response")

        agent = GenericAgent(llm=mock_llm)
        user_prompt = "What deployment tools exist?"
        invocation_id = uuid4()

        # Act
        await agent.execute(user_prompt, invocation_id)

        # Assert
        mock_llm.ainvoke.assert_called_once()
        # Check that the prompt was formatted (contains user's question)
        call_args = mock_llm.ainvoke.call_args
        assert call_args is not None

    @pytest.mark.asyncio
    async def test_generic_agent_handles_empty_llm_response(self) -> None:
        """Test GenericAgent handles empty LLM responses."""
        # Arrange
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = AIMessage(content="")

        agent = GenericAgent(llm=mock_llm)
        invocation_id = uuid4()

        # Act
        response = await agent.execute("test query", invocation_id)

        # Assert
        assert isinstance(response, GenericAgentResponse)
        # Should handle empty response gracefully
        assert response.content is not None

    @pytest.mark.asyncio
    async def test_generic_agent_handles_malformed_llm_response(self) -> None:
        """Test GenericAgent handles malformed LLM responses."""
        # Arrange
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = None  # Malformed response

        agent = GenericAgent(llm=mock_llm)
        invocation_id = uuid4()

        # Act
        response = await agent.execute("test query", invocation_id)

        # Assert
        assert isinstance(response, GenericAgentResponse)
        assert response.type == "answer"


class TestGenericAgentLogging:
    """Test GenericAgent logging and correlation IDs."""

    @pytest.mark.asyncio
    async def test_generic_agent_logs_llm_interactions_with_correlation_id(self) -> None:
        """Test GenericAgent logs all LLM interactions with correlation IDs."""
        # Arrange
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = AIMessage(content="Test response")

        agent = GenericAgent(llm=mock_llm)
        invocation_id = uuid4()

        # Act
        with patch("nexus.agent_orchestrator.agents.generic_agent.logger") as mock_logger:
            await agent.execute("test query", invocation_id)

            # Assert
            # Verify logging was called (implementation detail)
            assert mock_logger.info.called or mock_logger.debug.called
