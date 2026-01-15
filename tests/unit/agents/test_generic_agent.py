"""Unit tests for GenericAgent with LangGraph integration.

Tests the GenericAgent implementation using LangGraph node execution.
"""

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from nexus.agent_orchestrator.agents import GenericAgent
from nexus.agent_orchestrator.exceptions import (
    AgentConfigurationError,
    AgentError,
    AgentRateLimitError,
    AgentTimeoutError,
)

if TYPE_CHECKING:
    from nexus.agent_orchestrator.models.agent_state import AgentState


class TestGenericAgentLLMIntegration:
    """Test GenericAgent with LangChain LLM."""

    @pytest.mark.asyncio
    async def test_generic_agent_queries_llm_and_returns_answer(self) -> None:
        """Test GenericAgent queries LangChain LLM via LangGraph node execution."""
        mock_llm = Mock()
        mock_llm_with_tools = AsyncMock()
        mock_llm_with_tools.ainvoke.return_value = AIMessage(
            content="Available tools include deployment-agent, monitoring-agent, and testing-agent.",
            response_metadata={},
        )
        mock_llm.bind_tools.return_value = mock_llm_with_tools
        mock_llm.model_name = "anthropic/claude-3.5-sonnet"

        agent = GenericAgent(llm=mock_llm, available_tools=[])
        invocation_id = uuid4()
        state: AgentState = {
            "prompt": "What tools are available for deployment?",
            "original_prompt": "What tools are available for deployment?",
            "session_id": "test-session",
            "correlation_id": str(invocation_id),
            "invocation_id": str(invocation_id),
            "context_package": None,
            "current_agent": "generic_agent",
            "messages": [HumanMessage("test")],
            "result": None,
            "metadata": None,
        }

        response = await agent.execute_as_node(state)

        assert isinstance(response, dict)
        assert "result" in response
        result = response["result"]
        assert result is not None
        assert result["type"] == "answer"
        assert "deployment-agent" in result["content"]
        assert "monitoring-agent" in result["content"]
        mock_llm_with_tools.ainvoke.assert_called_once()

    @pytest.mark.asyncio
    async def test_generic_agent_result_type_is_answer_not_workflow(self) -> None:
        """Test GenericAgent returns type='answer' (not 'workflow')."""
        mock_llm = Mock()
        mock_llm_with_tools = AsyncMock()
        mock_llm_with_tools.ainvoke.return_value = AIMessage(content="Test answer", response_metadata={})
        mock_llm.bind_tools.return_value = mock_llm_with_tools
        mock_llm.model_name = "anthropic/claude-3.5-sonnet"

        agent = GenericAgent(llm=mock_llm, available_tools=[])
        invocation_id = uuid4()
        state: AgentState = {
            "prompt": "test query",
            "original_prompt": "test query",
            "session_id": "test-session",
            "correlation_id": str(invocation_id),
            "invocation_id": str(invocation_id),
            "context_package": None,
            "current_agent": "generic_agent",
            "messages": [HumanMessage("test")],
            "result": None,
            "metadata": None,
        }

        response = await agent.execute_as_node(state)

        result = response["result"]
        assert result is not None
        assert result["type"] == "answer"

    @pytest.mark.asyncio
    async def test_generic_agent_raises_configuration_error_for_invalid_api_key(
        self,
    ) -> None:
        """Test GenericAgent raises AgentConfigurationError for invalid API key."""
        mock_llm = Mock()
        mock_llm_with_tools = AsyncMock()
        mock_llm_with_tools.ainvoke.side_effect = RuntimeError("Invalid API key")
        mock_llm.bind_tools.return_value = mock_llm_with_tools
        mock_llm.model_name = "anthropic/claude-3.5-sonnet"

        agent = GenericAgent(llm=mock_llm, available_tools=[])
        invocation_id = str(uuid4())
        state: AgentState = {
            "prompt": "test query",
            "original_prompt": "test query",
            "session_id": "test-session",
            "correlation_id": invocation_id,
            "invocation_id": invocation_id,
            "context_package": None,
            "current_agent": "generic_agent",
            "messages": [HumanMessage("test")],
            "result": None,
            "metadata": None,
        }

        with pytest.raises(AgentConfigurationError) as exc_info:
            await agent.execute_as_node(state)

        assert exc_info.value.invocation_id == invocation_id
        assert "Invalid API key" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_generic_agent_raises_rate_limit_error(self) -> None:
        """Test GenericAgent raises AgentRateLimitError for rate limit errors."""
        mock_llm = Mock()
        mock_llm_with_tools = AsyncMock()
        mock_llm_with_tools.ainvoke.side_effect = RuntimeError("Rate limit exceeded")
        mock_llm.bind_tools.return_value = mock_llm_with_tools
        mock_llm.model_name = "anthropic/claude-3.5-sonnet"

        agent = GenericAgent(llm=mock_llm, available_tools=[])
        invocation_id = str(uuid4())
        state: AgentState = {
            "prompt": "test query",
            "original_prompt": "test query",
            "session_id": "test-session",
            "correlation_id": invocation_id,
            "invocation_id": invocation_id,
            "context_package": None,
            "current_agent": "generic_agent",
            "messages": [HumanMessage("test")],
            "result": None,
            "metadata": None,
        }

        with pytest.raises(AgentRateLimitError) as exc_info:
            await agent.execute_as_node(state)

        assert exc_info.value.invocation_id == invocation_id
        assert "Rate limit exceeded" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_generic_agent_raises_timeout_error(self) -> None:
        """Test GenericAgent raises AgentTimeoutError for timeout scenarios."""
        mock_llm = Mock()
        mock_llm_with_tools = AsyncMock()
        mock_llm_with_tools.ainvoke.side_effect = TimeoutError("Request timed out")
        mock_llm.bind_tools.return_value = mock_llm_with_tools
        mock_llm.model_name = "anthropic/claude-3.5-sonnet"

        agent = GenericAgent(llm=mock_llm, available_tools=[])
        invocation_id = str(uuid4())
        state: AgentState = {
            "prompt": "test query",
            "original_prompt": "test query",
            "session_id": "test-session",
            "correlation_id": invocation_id,
            "invocation_id": invocation_id,
            "context_package": None,
            "current_agent": "generic_agent",
            "messages": [HumanMessage("test")],
            "result": None,
            "metadata": None,
        }

        with pytest.raises(AgentTimeoutError) as exc_info:
            await agent.execute_as_node(state)

        assert exc_info.value.invocation_id == invocation_id


class TestGenericAgentPromptEngineering:
    """Test GenericAgent prompt template and engineering."""

    @pytest.mark.asyncio
    async def test_generic_agent_uses_information_assistant_prompt(self) -> None:
        """Test GenericAgent uses appropriate prompt template for information queries."""
        mock_llm = Mock()
        mock_llm_with_tools = AsyncMock()
        mock_llm_with_tools.ainvoke.return_value = AIMessage(content="Test response", response_metadata={})
        mock_llm.bind_tools.return_value = mock_llm_with_tools
        mock_llm.model_name = "anthropic/claude-3.5-sonnet"

        agent = GenericAgent(llm=mock_llm, available_tools=[])
        user_prompt = "What deployment tools exist?"
        invocation_id = uuid4()
        state: AgentState = {
            "prompt": user_prompt,
            "original_prompt": user_prompt,
            "session_id": "test-session",
            "correlation_id": str(invocation_id),
            "invocation_id": str(invocation_id),
            "context_package": None,
            "current_agent": "generic_agent",
            "messages": [HumanMessage("test")],
            "result": None,
            "metadata": None,
        }

        await agent.execute_as_node(state)

        mock_llm_with_tools.ainvoke.assert_called_once()
        call_args = mock_llm_with_tools.ainvoke.call_args
        assert call_args is not None

    @pytest.mark.asyncio
    async def test_generic_agent_handles_empty_llm_response(self) -> None:
        """Test GenericAgent handles empty LLM responses."""
        mock_llm = Mock()
        mock_llm_with_tools = AsyncMock()
        mock_llm_with_tools.ainvoke.return_value = AIMessage(content="", response_metadata={})
        mock_llm.bind_tools.return_value = mock_llm_with_tools
        mock_llm.model_name = "anthropic/claude-3.5-sonnet"

        agent = GenericAgent(llm=mock_llm, available_tools=[])
        invocation_id = uuid4()
        state: AgentState = {
            "prompt": "test query",
            "original_prompt": "test query",
            "session_id": "test-session",
            "correlation_id": str(invocation_id),
            "invocation_id": str(invocation_id),
            "context_package": None,
            "current_agent": "generic_agent",
            "messages": [HumanMessage("test")],
            "result": None,
            "metadata": None,
        }

        response = await agent.execute_as_node(state)

        assert isinstance(response, dict)
        result = response["result"]
        assert result is not None
        assert result["content"] is not None
        assert "couldn't generate an answer" in result["content"]

    @pytest.mark.asyncio
    async def test_generic_agent_raises_error_for_malformed_llm_response(self) -> None:
        """Test GenericAgent raises AgentError for malformed LLM responses."""
        mock_llm = Mock()
        mock_llm_with_tools = AsyncMock()
        mock_llm_with_tools.ainvoke.return_value = None  # Malformed response
        mock_llm.bind_tools.return_value = mock_llm_with_tools
        mock_llm.model_name = "anthropic/claude-3.5-sonnet"

        agent = GenericAgent(llm=mock_llm, available_tools=[])
        invocation_id = str(uuid4())
        state: AgentState = {
            "prompt": "test query",
            "original_prompt": "test query",
            "session_id": "test-session",
            "correlation_id": invocation_id,
            "invocation_id": invocation_id,
            "context_package": None,
            "current_agent": "generic_agent",
            "messages": [HumanMessage("test")],
            "result": None,
            "metadata": None,
        }

        with pytest.raises(AgentError) as exc_info:
            await agent.execute_as_node(state)

        assert exc_info.value.invocation_id == invocation_id


class TestGenericAgentLogging:
    """Test GenericAgent logging and correlation IDs."""

    @pytest.mark.asyncio
    async def test_generic_agent_logs_llm_interactions_with_correlation_id(
        self,
    ) -> None:
        """Test GenericAgent logs all LLM interactions with correlation IDs."""
        mock_llm = Mock()
        mock_llm_with_tools = AsyncMock()
        mock_llm_with_tools.ainvoke.return_value = AIMessage(content="Test response", response_metadata={})
        mock_llm.bind_tools.return_value = mock_llm_with_tools
        mock_llm.model_name = "anthropic/claude-3.5-sonnet"

        agent = GenericAgent(llm=mock_llm, available_tools=[])
        invocation_id = uuid4()
        state: AgentState = {
            "prompt": "test query",
            "original_prompt": "test query",
            "session_id": "test-session",
            "correlation_id": str(invocation_id),
            "invocation_id": str(invocation_id),
            "context_package": None,
            "current_agent": "generic_agent",
            "messages": [HumanMessage("test")],
            "result": None,
            "metadata": None,
        }

        with patch.object(agent, "logger") as mock_logger:
            await agent.execute_as_node(state)

            assert mock_logger.info.called
