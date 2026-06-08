"""Unit tests for GenericAgent structured output support."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any
from unittest.mock import AsyncMock, MagicMock, patch

from nexus.audit.emitter import AuditActorContext

if TYPE_CHECKING:
    from collections.abc import Callable, Coroutine
from uuid import uuid4

import pytest
from langchain_core.messages import AIMessage, HumanMessage
from langchain_openai import ChatOpenAI

from nexus.agent_orchestrator.agents.generic_agent import GenericAgent
from nexus.agent_orchestrator.models.agent_state import AgentState


@pytest.fixture
def mock_llm() -> MagicMock:
    """Create a mock ChatOpenAI instance."""
    llm: MagicMock = MagicMock(spec=ChatOpenAI)
    llm.model_name = "gpt-4"
    return llm


@pytest.fixture
def sample_state() -> AgentState:
    """Create a sample agent state for testing."""
    return AgentState(
        prompt="Extract server information",
        original_prompt="Extract server information",
        session_id="test-session",
        invocation_id=uuid4(),
        actor_context=AuditActorContext(),
        context_package=None,
        current_agent="generic_agent",
        metadata=None,
        messages=[HumanMessage(content="Extract server information")],
        result=None,
        llm_token_usage_log=[],
    )


@pytest.fixture
def server_info_schema() -> dict[str, Any]:
    """JSON Schema for server information."""
    return {
        "type": "object",
        "properties": {
            "hostname": {"type": "string"},
            "ip": {"type": "string"},
            "status": {"type": "string"},
        },
        "required": ["hostname", "ip"],
    }


def _make_record_side_effect() -> Callable[..., Coroutine[Any, Any, Any]]:
    async def _side_effect(_recorder: object, fn: Callable[..., Any], *, model: object = None) -> Any:  # noqa: ANN401
        return await fn()

    return _side_effect


class TestGenericAgentStructuredOutputNoTools:
    """Test GenericAgent structured output with no tools (Case B)."""

    @pytest.mark.asyncio
    async def test_execute_structured_output_no_tools_success(
        self, mock_llm: MagicMock, sample_state: AgentState, server_info_schema: dict[str, Any]
    ) -> None:
        """Test structured output execution with no tools succeeds."""
        sample_state["response_schema"] = server_info_schema

        parsed_output = {"hostname": "server-01", "ip": "192.168.1.10", "status": "active"}

        mock_structured_llm = MagicMock()
        mock_structured_llm.ainvoke = AsyncMock(return_value=parsed_output)
        mock_llm.with_structured_output.return_value = mock_structured_llm

        agent = GenericAgent(llm=mock_llm, available_tools=[])

        with patch("nexus.agent_orchestrator.agents.generic_agent.record_llm_call") as mock_record:
            mock_record.side_effect = _make_record_side_effect()
            result_state = await agent.execute_as_node(sample_state)

        assert result_state["result"] is not None
        assert result_state["result"]["content"] == parsed_output
        assert result_state["result"]["structured_output_metadata"]["fallback_strategy_used"] == "native"

    @pytest.mark.asyncio
    async def test_execute_structured_output_no_tools_fallback(
        self, mock_llm: MagicMock, sample_state: AgentState, server_info_schema: dict[str, Any]
    ) -> None:
        """Test structured output falls back to standard execution on error."""
        sample_state["response_schema"] = server_info_schema

        mock_structured_llm = MagicMock()
        mock_structured_llm.ainvoke = AsyncMock(side_effect=Exception("Structured output not supported"))
        mock_llm.with_structured_output.return_value = mock_structured_llm

        standard_message = AIMessage(
            content="hostname: server-01, ip: 192.168.1.10",
            response_metadata={"model": "gpt-4"},
            usage_metadata={"input_tokens": 100, "output_tokens": 50, "total_tokens": 150},
        )
        mock_llm.bind_tools.return_value.ainvoke = AsyncMock(return_value=standard_message)

        agent = GenericAgent(llm=mock_llm, available_tools=[])

        with patch("nexus.agent_orchestrator.agents.generic_agent.record_llm_call") as mock_record:
            mock_record.side_effect = _make_record_side_effect()
            result_state = await agent.execute_as_node(sample_state)

        assert result_state["result"] is not None
        assert isinstance(result_state["result"]["content"], str)
        assert "server-01" in result_state["result"]["content"]


class TestGenericAgentStructuredOutputWithTools:
    """Test GenericAgent structured output with tools (Case A)."""

    @pytest.mark.asyncio
    async def test_execute_structured_output_with_tools_extraction(
        self, mock_llm: MagicMock, sample_state: AgentState, server_info_schema: dict[str, Any]
    ) -> None:
        """Test structured output extraction after tool loop."""
        sample_state["response_schema"] = server_info_schema

        standard_message = AIMessage(
            content="The server hostname is server-01 and IP is 192.168.1.10",
            response_metadata={"model": "gpt-4"},
            usage_metadata={"input_tokens": 100, "output_tokens": 50, "total_tokens": 150},
        )
        mock_llm.bind_tools.return_value.ainvoke = AsyncMock(return_value=standard_message)

        extracted_output = {"hostname": "server-01", "ip": "192.168.1.10", "status": "unknown"}
        mock_extraction_llm = MagicMock()
        mock_extraction_llm.ainvoke = AsyncMock(return_value=extracted_output)
        mock_llm.with_structured_output.return_value = mock_extraction_llm

        mock_tool = MagicMock()
        mock_tool.name = "test_tool"

        agent = GenericAgent(llm=mock_llm, available_tools=[mock_tool])
        with patch("nexus.agent_orchestrator.agents.generic_agent.record_llm_call") as mock_record:
            mock_record.side_effect = _make_record_side_effect()
            result_state = await agent.execute_as_node(sample_state)

        assert result_state["result"] is not None
        assert result_state["result"]["content"] == extracted_output
        assert result_state["result"]["structured_output_metadata"]["fallback_strategy_used"] == "native"

    @pytest.mark.asyncio
    async def test_execute_structured_output_with_tools_extraction_failure(
        self, mock_llm: MagicMock, sample_state: AgentState, server_info_schema: dict[str, Any]
    ) -> None:
        """Test structured output extraction failure keeps raw text."""
        sample_state["response_schema"] = server_info_schema

        standard_message = AIMessage(
            content="The server hostname is server-01",
            response_metadata={"model": "gpt-4"},
            usage_metadata={"input_tokens": 100, "output_tokens": 50, "total_tokens": 150},
        )
        mock_llm.bind_tools.return_value.ainvoke = AsyncMock(return_value=standard_message)

        mock_extraction_llm = MagicMock()
        mock_extraction_llm.ainvoke = AsyncMock(side_effect=Exception("Extraction failed"))
        mock_llm.with_structured_output.return_value = mock_extraction_llm

        mock_tool = MagicMock()
        mock_tool.name = "test_tool"

        agent = GenericAgent(llm=mock_llm, available_tools=[mock_tool])
        with patch("nexus.agent_orchestrator.agents.generic_agent.record_llm_call") as mock_record:
            mock_record.side_effect = _make_record_side_effect()
            result_state = await agent.execute_as_node(sample_state)

        assert result_state["result"] is not None
        assert isinstance(result_state["result"]["content"], str)
        assert "server-01" in result_state["result"]["content"]
        assert result_state["result"]["structured_output_metadata"]["fallback_strategy_used"] == "none"


class TestGenericAgentTokenTracking:
    """Test token usage tracking with structured output."""

    @pytest.mark.asyncio
    async def test_token_tracking_structured_output(
        self, mock_llm: MagicMock, sample_state: AgentState, server_info_schema: dict[str, Any]
    ) -> None:
        """Test structured output with json_mode returns empty token log (no include_raw)."""
        sample_state["response_schema"] = server_info_schema

        parsed_output = {"hostname": "server-01", "ip": "192.168.1.10"}

        mock_structured_llm = MagicMock()
        mock_structured_llm.ainvoke = AsyncMock(return_value=parsed_output)
        mock_llm.with_structured_output.return_value = mock_structured_llm

        agent = GenericAgent(llm=mock_llm, available_tools=[])

        with patch("nexus.agent_orchestrator.agents.generic_agent.record_llm_call") as mock_record:
            mock_record.side_effect = _make_record_side_effect()
            result_state = await agent.execute_as_node(sample_state)

        result = result_state["result"]
        assert result is not None
        assert result["content"] == parsed_output
        assert result["structured_output_metadata"]["fallback_strategy_used"] == "native"
        assert len(result_state["llm_token_usage_log"]) == 0
