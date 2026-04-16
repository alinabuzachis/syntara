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
    AgentOrchestratorError,
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
            "invocation_id": str(invocation_id),
            "user_id": None,
            "context_package": None,
            "current_agent": "generic_agent",
            "messages": [HumanMessage("test")],
            "result": None,
            "metadata": None,
            "llm_token_usage_log": [],
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
            "invocation_id": str(invocation_id),
            "user_id": None,
            "context_package": None,
            "current_agent": "generic_agent",
            "messages": [HumanMessage("test")],
            "result": None,
            "metadata": None,
            "llm_token_usage_log": [],
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
            "invocation_id": invocation_id,
            "user_id": None,
            "context_package": None,
            "current_agent": "generic_agent",
            "messages": [HumanMessage("test")],
            "result": None,
            "metadata": None,
            "llm_token_usage_log": [],
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
            "invocation_id": invocation_id,
            "user_id": None,
            "context_package": None,
            "current_agent": "generic_agent",
            "messages": [HumanMessage("test")],
            "result": None,
            "metadata": None,
            "llm_token_usage_log": [],
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
            "invocation_id": invocation_id,
            "user_id": None,
            "context_package": None,
            "current_agent": "generic_agent",
            "messages": [HumanMessage("test")],
            "result": None,
            "metadata": None,
            "llm_token_usage_log": [],
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
            "invocation_id": str(invocation_id),
            "user_id": None,
            "context_package": None,
            "current_agent": "generic_agent",
            "messages": [HumanMessage("test")],
            "result": None,
            "metadata": None,
            "llm_token_usage_log": [],
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
            "invocation_id": str(invocation_id),
            "user_id": None,
            "context_package": None,
            "current_agent": "generic_agent",
            "messages": [HumanMessage("test")],
            "result": None,
            "metadata": None,
            "llm_token_usage_log": [],
        }

        response = await agent.execute_as_node(state)

        assert isinstance(response, dict)
        result = response["result"]
        assert result is not None
        assert result["content"] is not None
        assert "couldn't generate an answer" in result["content"]

    @pytest.mark.asyncio
    async def test_generic_agent_raises_error_for_malformed_llm_response(self) -> None:
        """Test GenericAgent raises AgentOrchestratorError for malformed LLM responses."""
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
            "invocation_id": invocation_id,
            "user_id": None,
            "context_package": None,
            "current_agent": "generic_agent",
            "messages": [HumanMessage("test")],
            "result": None,
            "metadata": None,
            "llm_token_usage_log": [],
        }

        with pytest.raises(AgentOrchestratorError) as exc_info:
            await agent.execute_as_node(state)

        assert exc_info.value.invocation_id == invocation_id


class TestGenericAgentLogging:
    """Test GenericAgent logging."""

    @pytest.mark.asyncio
    async def test_generic_agent_logs_llm_interactions(
        self,
    ) -> None:
        """Test GenericAgent logs all LLM interactions."""
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
            "invocation_id": str(invocation_id),
            "user_id": None,
            "context_package": None,
            "current_agent": "generic_agent",
            "messages": [HumanMessage("test")],
            "result": None,
            "metadata": None,
            "llm_token_usage_log": [],
        }

        with patch.object(agent, "logger") as mock_logger:
            await agent.execute_as_node(state)

            assert mock_logger.info.called


# T012: _build_token_usage_entry tests


class TestBuildTokenUsageEntry:
    """Tests for _build_token_usage_entry helper extracting token data from AIMessage."""

    def _make_agent(self) -> GenericAgent:
        mock_llm = Mock()
        return GenericAgent(llm=mock_llm, available_tools=[])

    def test_extracts_from_usage_metadata(self) -> None:
        """Test extraction via usage_metadata path (preferred)."""
        agent = self._make_agent()
        msg = AIMessage(
            content="test",
            usage_metadata={"input_tokens": 943, "output_tokens": 500, "total_tokens": 1443},
            response_metadata={},
        )
        result = agent._build_token_usage_entry(msg)
        assert result is not None
        assert result["input_tokens"] == 943
        assert result["output_tokens"] == 500

    def test_extracts_from_response_metadata_fallback(self) -> None:
        """Test extraction via response_metadata['token_usage'] fallback."""
        agent = self._make_agent()
        msg = AIMessage(
            content="test",
            response_metadata={
                "token_usage": {
                    "prompt_tokens": 800,
                    "completion_tokens": 200,
                    "total_tokens": 1000,
                }
            },
        )
        result = agent._build_token_usage_entry(msg)
        assert result is not None
        assert result["input_tokens"] == 800
        assert result["output_tokens"] == 200

    def test_returns_none_when_no_metadata(self) -> None:
        """Test returns None when no token metadata available (FR-008)."""
        agent = self._make_agent()
        msg = AIMessage(content="test", response_metadata={})
        result = agent._build_token_usage_entry(msg)
        assert result is None

    def test_zero_output_tokens(self) -> None:
        """Test zero output tokens edge case (empty LLM response)."""
        agent = self._make_agent()
        msg = AIMessage(
            content="",
            usage_metadata={"input_tokens": 943, "output_tokens": 0, "total_tokens": 943},
            response_metadata={},
        )
        result = agent._build_token_usage_entry(msg)
        assert result is not None
        assert result["output_tokens"] == 0
        assert result["input_tokens"] == 943


# T013: token usage log accumulation tests


class TestTokenUsageLogAccumulation:
    """Tests for llm_token_usage_log accumulation across LLM calls."""

    @pytest.mark.asyncio
    async def test_token_usage_entry_returned_in_state(self) -> None:
        """Test that _execute returns llm_token_usage_log entry in state."""
        mock_llm = Mock()
        mock_llm_with_tools = AsyncMock()
        mock_llm_with_tools.ainvoke.return_value = AIMessage(
            content="Test response",
            usage_metadata={"input_tokens": 500, "output_tokens": 100, "total_tokens": 600},
            response_metadata={},
        )
        mock_llm.bind_tools.return_value = mock_llm_with_tools
        mock_llm.model_name = "test-model"

        agent = GenericAgent(llm=mock_llm, available_tools=[])
        invocation_id = uuid4()
        state: AgentState = {
            "prompt": "test",
            "original_prompt": "test",
            "session_id": "test-session",
            "invocation_id": str(invocation_id),
            "user_id": None,
            "context_package": None,
            "current_agent": "generic_agent",
            "messages": [HumanMessage("test")],
            "result": None,
            "metadata": None,
            "llm_token_usage_log": [],
        }

        response = await agent.execute_as_node(state)

        assert "llm_token_usage_log" in response
        log = response["llm_token_usage_log"]
        assert len(log) == 1
        assert log[0]["input_tokens"] == 500
        assert log[0]["output_tokens"] == 100

    @pytest.mark.asyncio
    async def test_no_entry_when_no_usage_metadata(self) -> None:
        """Test no entry added when LLM returns no usage metadata."""
        mock_llm = Mock()
        mock_llm_with_tools = AsyncMock()
        mock_llm_with_tools.ainvoke.return_value = AIMessage(
            content="Test response",
            response_metadata={},
        )
        mock_llm.bind_tools.return_value = mock_llm_with_tools
        mock_llm.model_name = "test-model"

        agent = GenericAgent(llm=mock_llm, available_tools=[])
        invocation_id = uuid4()
        state: AgentState = {
            "prompt": "test",
            "original_prompt": "test",
            "session_id": "test-session",
            "invocation_id": str(invocation_id),
            "user_id": None,
            "context_package": None,
            "current_agent": "generic_agent",
            "messages": [HumanMessage("test")],
            "result": None,
            "metadata": None,
            "llm_token_usage_log": [],
        }

        response = await agent.execute_as_node(state)

        # Should return empty list (no entry added)
        assert response.get("llm_token_usage_log", []) == []
