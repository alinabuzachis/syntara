"""Unit tests for GenericAgent audit event dispatch.

Verifies that GenericAgent emits the expected audit events during execution:
- AgentExecutionEvent (STARTED, COMPLETED, FAILED)
- LLMInteractionEvent (SUCCESS, EMPTY_RESPONSE, ERROR for standard/structured_output/extraction)
"""

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from langchain_core.messages import AIMessage

from nexus.agent_orchestrator.agents.generic_agent import GenericAgent
from nexus.agent_orchestrator.audit.agent_execution import (
    AgentExecutionEvent,
    AgentExecutionHandler,
)
from nexus.agent_orchestrator.audit.llm_interaction import (
    LLMInteractionEvent,
    LLMInteractionHandler,
    LLMInteractionStatus,
    LLMInteractionType,
)
from nexus.agent_orchestrator.exceptions import EmptyLLMResponseError
from nexus.agent_orchestrator.models.agent_state import AgentState
from nexus.audit.dispatcher import AuditEventDispatcher
from nexus.audit.emitter import AuditActorContext
from nexus.audit.events.function_execution import FunctionExecutionEvent, FunctionExecutionHandler
from nexus.audit.models.audit_event import AuditEvent, EventCategory, EventStatus


def _make_agent_state(**overrides: object) -> AgentState:
    """Build a minimal AgentState for testing."""
    defaults: AgentState = {
        "messages": [],
        "prompt": "test prompt",
        "original_prompt": "test prompt",
        "session_id": "sess-1",
        "invocation_id": uuid4(),
        "actor_context": AuditActorContext(),
        "current_agent": "generic_agent",
        "context_package": None,
        "metadata": None,
        "result": None,
        "llm_token_usage_log": [],
    }
    state = defaults.copy()
    state.update(overrides)  # type: ignore[typeddict-item]
    return state


class TestGenericAgentExecutionEvents:
    """Tests for AgentExecutionEvent dispatch during _execute()."""

    def setup_method(self) -> None:
        """Register audit event handlers for GenericAgent tests."""
        AuditEventDispatcher.reset()
        AuditEventDispatcher.register(
            {
                AgentExecutionEvent: AgentExecutionHandler(),
                LLMInteractionEvent: LLMInteractionHandler(),
                FunctionExecutionEvent: FunctionExecutionHandler(),
            }
        )

    def teardown_method(self) -> None:
        """Reset audit event dispatcher after tests."""
        AuditEventDispatcher.reset()

    @pytest.mark.asyncio
    async def test_execute_emits_started_and_completed_events(self) -> None:
        """Successful execution emits STARTED and COMPLETED AgentExecutionEvents."""
        session_id = "sess-123"
        invocation_id = uuid4()
        execution_id = uuid4()

        state = _make_agent_state(
            session_id=session_id,
            invocation_id=invocation_id,
            execution_id=execution_id,
        )

        # Mock LLM to return valid response
        mock_llm = MagicMock()
        mock_llm.bind_tools.return_value.ainvoke = AsyncMock(
            return_value=AIMessage(content="test response", response_metadata={})
        )
        mock_llm.model_name = "test-model"

        agent = GenericAgent(llm=mock_llm, available_tools=[])

        with (
            patch("nexus.audit.emitter._do_emit_audit_event") as mock_do_emit,
            patch("nexus.metrics.instrumentation.record_llm_call", side_effect=lambda _, fn, **__: fn()),
        ):
            await agent._execute(state)

        # Verify events: STARTED, SUCCESS (LLM), COMPLETED, plus @audit decorator event
        assert mock_do_emit.call_count >= 3
        events: list[AuditEvent] = [call.args[0] for call in mock_do_emit.call_args_list]

        # Filter to AgentExecutionEvents only (by event_action pattern)
        execution_events = [e for e in events if e.event_action in ["agent_started", "agent_completed"]]
        assert len(execution_events) == 2

        # Event 1: STARTED
        assert execution_events[0].event_action == "agent_started"
        assert execution_events[0].event_category == EventCategory.AGENT_INTERACTION
        assert execution_events[0].event_status == EventStatus.SUCCESS
        assert execution_events[0].structured_data.status == "started"  # type: ignore[attr-defined]
        assert execution_events[0].structured_data.agent_type == "generic_agent"  # type: ignore[attr-defined]
        assert execution_events[0].structured_data.session_id == "[REDACTED]"  # type: ignore[attr-defined]
        assert execution_events[0].structured_data.invocation_id == str(invocation_id)  # type: ignore[attr-defined]

        # Event 2: COMPLETED
        assert execution_events[1].event_action == "agent_completed"
        assert execution_events[1].structured_data.status == "completed"  # type: ignore[attr-defined]
        assert execution_events[1].structured_data.agent_type == "generic_agent"  # type: ignore[attr-defined]

    @pytest.mark.asyncio
    async def test_execute_emits_failed_event_on_exception(self) -> None:
        """Failed execution emits STARTED and FAILED AgentExecutionEvents."""
        session_id = "sess-456"
        invocation_id = uuid4()

        state = _make_agent_state(session_id=session_id, invocation_id=invocation_id)

        # Mock LLM to raise exception
        mock_llm = MagicMock()
        mock_llm.bind_tools.return_value.ainvoke = AsyncMock(side_effect=ValueError("LLM error"))
        mock_llm.model_name = "test-model"

        agent = GenericAgent(llm=mock_llm, available_tools=[])

        with (
            patch("nexus.audit.emitter._do_emit_audit_event") as mock_do_emit,
            patch("nexus.metrics.instrumentation.record_llm_call", side_effect=lambda _, fn, **__: fn()),
            pytest.raises(ValueError),
        ):
            await agent._execute(state)

        events: list[AuditEvent] = [call.args[0] for call in mock_do_emit.call_args_list]
        execution_events = [e for e in events if e.event_action in ["agent_started", "agent_failed"]]

        # Should have STARTED and FAILED
        assert len(execution_events) == 2
        assert execution_events[0].structured_data.status == "started"  # type: ignore[attr-defined]
        assert execution_events[1].structured_data.status == "failed"  # type: ignore[attr-defined]
        assert execution_events[1].structured_data.error_type == "ValueError"


class TestGenericAgentLLMInteractionEvents:
    """Tests for LLMInteractionEvent dispatch during LLM calls."""

    def setup_method(self) -> None:
        """Register audit event handlers for LLM interaction tests."""
        AuditEventDispatcher.reset()
        AuditEventDispatcher.register(
            {
                LLMInteractionEvent: LLMInteractionHandler(),
            }
        )

    def teardown_method(self) -> None:
        """Reset audit event dispatcher after tests."""
        AuditEventDispatcher.reset()

    @pytest.mark.asyncio
    async def test_execute_standard_emits_success_event(self) -> None:
        """Standard LLM call emits SUCCESS LLMInteractionEvent."""
        invocation_id = uuid4()
        execution_id = uuid4()

        state = _make_agent_state(invocation_id=invocation_id, execution_id=execution_id)

        mock_llm = MagicMock()
        mock_llm.bind_tools.return_value.ainvoke = AsyncMock(
            return_value=AIMessage(content="answer", response_metadata={})
        )
        mock_llm.model_name = "test-model"

        agent = GenericAgent(llm=mock_llm, available_tools=[])

        with (
            patch("nexus.audit.emitter._do_emit_audit_event") as mock_do_emit,
            patch("nexus.metrics.instrumentation.record_llm_call", side_effect=lambda _, fn, **__: fn()),
        ):
            await agent._execute_standard(state)

        events: list[AuditEvent] = [call.args[0] for call in mock_do_emit.call_args_list]
        llm_events = [e for e in events if e.event_action == "llm_call"]

        assert len(llm_events) == 1
        assert llm_events[0].structured_data.interaction_type == LLMInteractionType.STANDARD  # type: ignore[attr-defined]
        assert llm_events[0].structured_data.status == LLMInteractionStatus.SUCCESS  # type: ignore[attr-defined]
        assert llm_events[0].structured_data.model_name == "test-model"  # type: ignore[attr-defined]

    @pytest.mark.asyncio
    async def test_execute_standard_emits_empty_response_event(self) -> None:
        """Empty LLM response emits EMPTY_RESPONSE LLMInteractionEvent."""
        invocation_id = uuid4()

        state = _make_agent_state(invocation_id=invocation_id)

        mock_llm = MagicMock()
        mock_llm.bind_tools.return_value.ainvoke = AsyncMock(return_value=AIMessage(content="", response_metadata={}))
        mock_llm.model_name = "test-model"

        agent = GenericAgent(llm=mock_llm, available_tools=[])

        with (
            patch("nexus.audit.emitter._do_emit_audit_event") as mock_do_emit,
            patch("nexus.metrics.instrumentation.record_llm_call", side_effect=lambda _, fn, **__: fn()),
            pytest.raises(EmptyLLMResponseError),
        ):
            await agent._execute_standard(state)

        events: list[AuditEvent] = [call.args[0] for call in mock_do_emit.call_args_list]
        llm_events = [e for e in events if e.event_action == "llm_call"]

        assert len(llm_events) == 1
        assert llm_events[0].structured_data.status == LLMInteractionStatus.EMPTY_RESPONSE  # type: ignore[attr-defined]
        assert llm_events[0].structured_data.error_type is None
        assert llm_events[0].structured_data.error_message is None

    @pytest.mark.asyncio
    async def test_execute_structured_emits_success_event(self) -> None:
        """Structured output emits SUCCESS LLMInteractionEvent."""
        invocation_id = uuid4()
        execution_id = uuid4()

        state = _make_agent_state(invocation_id=invocation_id, execution_id=execution_id)
        response_schema: dict[str, Any] = {"type": "object"}

        mock_llm = MagicMock()
        mock_llm.with_structured_output.return_value.ainvoke = AsyncMock(return_value={"result": "structured"})
        mock_llm.model_name = "test-model"

        agent = GenericAgent(llm=mock_llm, available_tools=[])

        with (
            patch("nexus.audit.emitter._do_emit_audit_event") as mock_do_emit,
            patch("nexus.metrics.instrumentation.record_llm_call", side_effect=lambda _, fn, **__: fn()),
        ):
            await agent._execute_structured(state, response_schema)

        events: list[AuditEvent] = [call.args[0] for call in mock_do_emit.call_args_list]
        llm_events = [e for e in events if e.event_action == "llm_call"]

        assert len(llm_events) == 1
        assert llm_events[0].structured_data.interaction_type == LLMInteractionType.STRUCTURED_OUTPUT  # type: ignore[attr-defined]
        assert llm_events[0].structured_data.status == LLMInteractionStatus.SUCCESS  # type: ignore[attr-defined]
        assert llm_events[0].structured_data.response_schema_provided is True  # type: ignore[attr-defined]

    @pytest.mark.asyncio
    async def test_execute_structured_emits_error_event_on_failure(self) -> None:
        """Structured output failure emits ERROR LLMInteractionEvent."""
        invocation_id = uuid4()

        state = _make_agent_state(invocation_id=invocation_id)
        response_schema: dict[str, Any] = {"type": "object"}

        mock_llm = MagicMock()
        mock_llm.with_structured_output.return_value.ainvoke = AsyncMock(side_effect=ValueError("Schema error"))
        mock_llm.bind_tools.return_value.ainvoke = AsyncMock(
            return_value=AIMessage(content="fallback", response_metadata={})
        )
        mock_llm.model_name = "test-model"

        agent = GenericAgent(llm=mock_llm, available_tools=[])

        with (
            patch("nexus.audit.emitter._do_emit_audit_event") as mock_do_emit,
            patch("nexus.metrics.instrumentation.record_llm_call", side_effect=lambda _, fn, **__: fn()),
        ):
            await agent._execute_structured(state, response_schema)

        events: list[AuditEvent] = [call.args[0] for call in mock_do_emit.call_args_list]
        llm_events = [e for e in events if e.event_action == "llm_call"]

        # Should have ERROR (structured_output) + SUCCESS (standard fallback)
        assert len(llm_events) >= 1
        error_event = next(
            e
            for e in llm_events
            if e.structured_data.interaction_type == LLMInteractionType.STRUCTURED_OUTPUT  # type: ignore[attr-defined]
        )
        assert error_event.structured_data.status == LLMInteractionStatus.ERROR  # type: ignore[attr-defined]
        assert error_event.structured_data.error_type == "ValueError"

    @pytest.mark.asyncio
    async def test_extract_structured_output_emits_success_event(self) -> None:
        """Extraction step emits SUCCESS LLMInteractionEvent."""
        invocation_id = uuid4()
        execution_id = uuid4()

        state = _make_agent_state(
            invocation_id=invocation_id,
            execution_id=execution_id,
            result={"content": "raw text"},
        )
        response_schema: dict[str, Any] = {"type": "object"}

        mock_llm = MagicMock()
        mock_llm.with_structured_output.return_value.ainvoke = AsyncMock(return_value={"extracted": "data"})
        mock_llm.model_name = "test-model"

        agent = GenericAgent(llm=mock_llm, available_tools=[])

        with (
            patch("nexus.audit.emitter._do_emit_audit_event") as mock_do_emit,
            patch("nexus.metrics.instrumentation.record_llm_call", side_effect=lambda _, fn, **__: fn()),
        ):
            await agent._extract_structured_output(state, response_schema)

        events: list[AuditEvent] = [call.args[0] for call in mock_do_emit.call_args_list]
        llm_events = [e for e in events if e.event_action == "llm_call"]

        assert len(llm_events) == 1
        assert llm_events[0].structured_data.interaction_type == LLMInteractionType.EXTRACTION  # type: ignore[attr-defined]
        assert llm_events[0].structured_data.status == LLMInteractionStatus.SUCCESS  # type: ignore[attr-defined]

    @pytest.mark.asyncio
    async def test_extract_structured_output_emits_error_event_on_failure(self) -> None:
        """Extraction failure emits ERROR LLMInteractionEvent."""
        invocation_id = uuid4()

        state = _make_agent_state(invocation_id=invocation_id, result={"content": "text"})
        response_schema: dict[str, Any] = {"type": "object"}

        mock_llm = MagicMock()
        mock_llm.with_structured_output.return_value.ainvoke = AsyncMock(side_effect=RuntimeError("Extraction failed"))
        mock_llm.model_name = "test-model"

        agent = GenericAgent(llm=mock_llm, available_tools=[])

        with (
            patch("nexus.audit.emitter._do_emit_audit_event") as mock_do_emit,
            patch("nexus.metrics.instrumentation.record_llm_call", side_effect=lambda _, fn, **__: fn()),
        ):
            await agent._extract_structured_output(state, response_schema)

        events: list[AuditEvent] = [call.args[0] for call in mock_do_emit.call_args_list]
        llm_events = [e for e in events if e.event_action == "llm_call"]

        assert len(llm_events) == 1
        assert llm_events[0].structured_data.status == LLMInteractionStatus.ERROR  # type: ignore[attr-defined]
        assert llm_events[0].structured_data.error_type == "RuntimeError"
