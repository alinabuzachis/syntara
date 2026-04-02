"""Unit tests for OrchestrationService LangGraph streaming integration."""

from collections.abc import AsyncGenerator
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from nexus.agent_orchestrator.context_manager.models import ContextPackage
from nexus.agent_orchestrator.services.orchestration_service import OrchestrationService


def create_mock_streaming_event(event_type: str, content: str | None = None) -> dict[str, Any]:
    """Helper to create mock LangGraph streaming events.

    Args:
        event_type: Type of event (e.g., "on_chat_model_stream", "on_chain_end")
        content: Optional content for chunk

    Returns:
        Mock event dictionary

    """
    if event_type == "on_chat_model_stream":
        chunk = MagicMock()
        chunk.content = content
        return {"event": event_type, "data": {"chunk": chunk}}
    return {"event": event_type, "data": {}}


async def mock_astream_events_generator(*chunks: str) -> AsyncGenerator[dict[str, Any], None]:
    """Create async generator for mocked astream_events.

    Args:
        *chunks: String chunks to yield as streaming events

    Yields:
        Mock streaming events

    """
    for chunk in chunks:
        yield create_mock_streaming_event("on_chat_model_stream", chunk)
    # Yield final non-streaming event to signal completion
    yield {"event": "on_chain_end", "data": {}}


class TestOrchestrationServiceInitialization:
    """Test OrchestrationService initialization and graph setup."""

    def test_orchestration_service_initializes_langgraph_successfully(self) -> None:
        """Test that OrchestrationService sets up LangGraph correctly."""
        # Arrange
        mock_llm = AsyncMock()
        mock_context_manager = MagicMock()

        # Act

        service = OrchestrationService(mock_llm, mock_context_manager)

        # Assert
        assert service.llm == mock_llm
        assert service.context_manager == mock_context_manager


class TestOrchestrationServiceStreamingExecution:
    """Test OrchestrationService streaming execution flow."""

    @pytest.mark.asyncio
    async def test_orchestration_service_streams_llm_responses(self) -> None:
        """Test that OrchestrationService streams LLM responses to Cache."""
        # Arrange
        mock_llm = AsyncMock()
        mock_llm.model_name = "test-model"

        mock_context_manager = MagicMock()
        test_context = ContextPackage(
            correlation_id="test-correlation",
            payload={"docs": "Relevant documentation"},
            grounding_score=0.8,
            citations=["file-id-doc1"],
        )
        mock_context_manager.plan_request = AsyncMock(return_value=test_context)

        service = OrchestrationService(mock_llm, mock_context_manager)
        invocation_id = uuid4()

        # Mock astream_events to return streaming chunks
        mock_graph = AsyncMock()
        mock_graph.astream_events = lambda *_args, **_kwargs: mock_astream_events_generator("Hello", " ", "World")

        with (
            patch.object(service, "_setup_graph", return_value=mock_graph),
            patch("nexus.agent_orchestrator.services.orchestration_service.StreamClient") as mock_stream_client,
        ):
            mock_client_instance = AsyncMock()
            mock_stream_client.return_value.__aenter__.return_value = mock_client_instance

            # Act
            result = await service.execute(
                prompt="Test prompt",
                session_id="test-session",
                invocation_id=invocation_id,
                correlation_id="initial-correlation",
            )

            # Assert - Result should contain streaming metadata
            assert isinstance(result, dict)
            assert "response_metadata" in result
            assert result["response_metadata"]["source"] == "streaming"
            assert result["response_metadata"]["orchestration"] == "langgraph"
            assert "stream_id" in result["response_metadata"]
            assert result["type"] == "answer"
            assert "WebSocket endpoint" in result["content"]

            # Verify events were published to Cache
            # 3 delta events (Hello, " ", World) + 1 completion event = 4 publish calls
            assert mock_client_instance.publish.call_count == 4

            # Verify delta events
            delta_calls = [c for c in mock_client_instance.publish.call_args_list if "delta" in str(c)]
            assert len(delta_calls) == 3

            # Verify completion event
            completion_calls = [c for c in mock_client_instance.publish.call_args_list if "completion" in str(c)]
            assert len(completion_calls) == 1

    @pytest.mark.asyncio
    async def test_orchestration_service_publishes_delta_events_correctly(self) -> None:
        """Test that delta events are published with correct structure."""
        # Arrange
        mock_llm = AsyncMock()
        mock_llm.model_name = "test-model"

        mock_context_manager = MagicMock()
        test_context = ContextPackage(correlation_id="test", payload={}, grounding_score=0.0)
        mock_context_manager.plan_request.return_value = test_context

        service = OrchestrationService(mock_llm, mock_context_manager)
        invocation_id = uuid4()

        # Mock astream_events
        mock_graph = AsyncMock()
        mock_graph.astream_events = lambda *_args, **_kwargs: mock_astream_events_generator("Test")

        with (
            patch.object(service, "_setup_graph", return_value=mock_graph),
            patch("nexus.agent_orchestrator.services.orchestration_service.StreamClient") as mock_stream_client,
        ):
            mock_client_instance = AsyncMock()
            mock_stream_client.return_value.__aenter__.return_value = mock_client_instance

            # Act
            await service.execute(
                prompt="Test",
                session_id="test-session",
                invocation_id=invocation_id,
            )

            # Assert - Check delta event structure
            delta_call = next(c for c in mock_client_instance.publish.call_args_list if "delta" in str(c))
            _stream_id, event = delta_call[0]

            assert event["event_type"] == "delta"
            assert event["invocation_id"] == str(invocation_id)
            assert "timestamp" in event
            assert event["data"]["delta"] == "Test"

    @pytest.mark.asyncio
    async def test_orchestration_service_publishes_completion_event(self) -> None:
        """Test that completion event is published after streaming."""
        # Arrange
        mock_llm = AsyncMock()
        mock_llm.model_name = "test-model"

        mock_context_manager = MagicMock()
        test_context = ContextPackage(correlation_id="test", payload={}, grounding_score=0.0)
        mock_context_manager.plan_request.return_value = test_context

        service = OrchestrationService(mock_llm, mock_context_manager)
        invocation_id = uuid4()

        # Mock astream_events
        mock_graph = AsyncMock()
        mock_graph.astream_events = lambda *_args, **_kwargs: mock_astream_events_generator("Done")

        with (
            patch.object(service, "_setup_graph", return_value=mock_graph),
            patch("nexus.agent_orchestrator.services.orchestration_service.StreamClient") as mock_stream_client,
        ):
            mock_client_instance = AsyncMock()
            mock_stream_client.return_value.__aenter__.return_value = mock_client_instance

            # Act
            await service.execute(
                prompt="Test",
                session_id="test-session",
                invocation_id=invocation_id,
            )

            # Assert - Check completion event
            completion_call = next(c for c in mock_client_instance.publish.call_args_list if "completion" in str(c))
            _stream_id, event = completion_call[0]

            assert event["event_type"] == "completion"
            assert event["invocation_id"] == str(invocation_id)
            assert "timestamp" in event
            assert event["data"] == {}


class TestOrchestrationServiceErrorHandling:
    """Test OrchestrationService streaming error handling."""

    @pytest.mark.asyncio
    async def test_orchestration_service_handles_llm_errors_during_streaming(self) -> None:
        """Test error handling when LLM streaming fails."""
        # Arrange
        mock_llm = AsyncMock()
        mock_llm.model_name = "test-model"

        mock_context_manager = MagicMock()
        test_context = ContextPackage(correlation_id="test", payload={}, grounding_score=0.0)
        mock_context_manager.plan_request.return_value = test_context

        service = OrchestrationService(mock_llm, mock_context_manager)
        invocation_id = uuid4()

        # Mock astream_events to raise error

        async def error_generator() -> AsyncGenerator[dict[str, Any], None]:
            yield create_mock_streaming_event("on_chat_model_stream", "Partial")
            msg = "LLM streaming error"
            raise RuntimeError(msg)

        mock_graph = AsyncMock()
        mock_graph.astream_events = lambda *_args, **_kwargs: error_generator()

        with (
            patch.object(service, "_setup_graph", return_value=mock_graph),
            patch("nexus.agent_orchestrator.services.orchestration_service.StreamClient") as mock_stream_client,
        ):
            mock_client_instance = AsyncMock()
            mock_stream_client.return_value.__aenter__.return_value = mock_client_instance

            # Act & Assert - Should raise error
            with pytest.raises(RuntimeError) as exc_info:
                await service.execute(
                    prompt="Test",
                    session_id="test-session",
                    invocation_id=invocation_id,
                )

            assert "LLM streaming error" in str(exc_info.value)

            # Verify error event was published
            error_calls = [c for c in mock_client_instance.publish.call_args_list if "error" in str(c)]
            assert len(error_calls) == 1

    @pytest.mark.asyncio
    async def test_orchestration_service_publishes_error_event_on_failure(self) -> None:
        """Test that error events are published when streaming fails."""
        # Arrange
        mock_llm = AsyncMock()
        mock_llm.model_name = "test-model"

        mock_context_manager = MagicMock()
        test_context = ContextPackage(correlation_id="test", payload={}, grounding_score=0.0)
        mock_context_manager.plan_request.return_value = test_context

        service = OrchestrationService(mock_llm, mock_context_manager)
        invocation_id = uuid4()

        # Mock astream_events to raise error - no partial content, immediate failure

        async def error_generator(*, should_yield: bool = False) -> AsyncGenerator[dict[str, Any], None]:
            msg = "Test error"
            if should_yield:  # Never called with True, but makes this a generator
                yield create_mock_streaming_event("on_chat_model_stream", "")
            raise ValueError(msg)

        mock_graph = AsyncMock()
        mock_graph.astream_events = lambda *_args, **_kwargs: error_generator()

        with (
            patch.object(service, "_setup_graph", return_value=mock_graph),
            patch("nexus.agent_orchestrator.services.orchestration_service.StreamClient") as mock_stream_client,
        ):
            mock_client_instance = AsyncMock()
            mock_stream_client.return_value.__aenter__.return_value = mock_client_instance

            # Act & Assert
            with pytest.raises(ValueError):
                await service.execute(
                    prompt="Test",
                    session_id="test-session",
                    invocation_id=invocation_id,
                )

            # Verify error event was published
            error_calls = [c for c in mock_client_instance.publish.call_args_list if "error" in str(c)]
            assert len(error_calls) == 1


class TestOrchestrationServiceSessionManagement:
    """Test OrchestrationService session management for multi-turn conversations."""

    @pytest.mark.asyncio
    async def test_orchestration_service_uses_session_checkpointing(self) -> None:
        """Test that session checkpointing works for multi-turn conversations."""
        # Arrange
        mock_llm = AsyncMock()
        mock_llm.model_name = "test-model"

        mock_context_manager = MagicMock()
        test_context = ContextPackage(correlation_id="test", payload={}, grounding_score=0.0)
        mock_context_manager.plan_request = AsyncMock(return_value=test_context)

        service = OrchestrationService(mock_llm, mock_context_manager)
        session_id = "multi-turn-session"
        invocation_id_1 = uuid4()
        invocation_id_2 = uuid4()

        # Mock astream_events with tracking
        mock_graph = AsyncMock()
        call_tracker = []

        def track_calls(state: object, config: object, **kwargs: object) -> AsyncGenerator[dict[str, Any], None]:
            call_tracker.append((state, config, kwargs))
            return mock_astream_events_generator("Response")

        mock_graph.astream_events = track_calls

        with (
            patch.object(service, "_setup_graph", return_value=mock_graph),
            patch("nexus.agent_orchestrator.services.orchestration_service.StreamClient") as mock_stream_client,
        ):
            mock_client_instance = AsyncMock()
            mock_stream_client.return_value.__aenter__.return_value = mock_client_instance

            # Act - First invocation
            result1 = await service.execute(
                prompt="First prompt",
                session_id=session_id,
                invocation_id=invocation_id_1,
            )

            # Act - Second invocation with same session
            result2 = await service.execute(
                prompt="Second prompt",
                session_id=session_id,
                invocation_id=invocation_id_2,
            )

            # Assert - Both should return streaming metadata
            assert "response_metadata" in result1
            assert "response_metadata" in result2
            assert result1["response_metadata"]["source"] == "streaming"
            assert result2["response_metadata"]["source"] == "streaming"

            # Both should have been executed with same session_id for checkpointing
            assert len(call_tracker) == 2

            # Verify both used the same session_id in config
            call1 = call_tracker[0]
            call2 = call_tracker[1]
            assert call1[1]["configurable"]["thread_id"] == session_id  # type: ignore[index]
            assert call2[1]["configurable"]["thread_id"] == session_id  # type: ignore[index]


class TestOrchestrationServiceLogging:
    """Test OrchestrationService logging and observability."""

    @pytest.mark.asyncio
    async def test_orchestration_service_logs_streaming_flow(self) -> None:
        """Test that orchestration service logs streaming execution."""
        # Arrange
        mock_llm = AsyncMock()
        mock_llm.model_name = "test-model"

        mock_context_manager = MagicMock()
        test_context = ContextPackage(correlation_id="test", payload={}, grounding_score=0.0)
        mock_context_manager.plan_request = AsyncMock(return_value=test_context)

        service = OrchestrationService(mock_llm, mock_context_manager)
        invocation_id = uuid4()

        # Mock astream_events
        mock_graph = AsyncMock()
        mock_graph.astream_events = lambda *_args, **_kwargs: mock_astream_events_generator("Test")

        with (
            patch.object(service, "_setup_graph", return_value=mock_graph),
            patch("nexus.agent_orchestrator.services.orchestration_service.StreamClient") as mock_stream_client,
            patch("nexus.agent_orchestrator.services.orchestration_service.logger") as mock_logger,
        ):
            mock_client_instance = AsyncMock()
            mock_stream_client.return_value.__aenter__.return_value = mock_client_instance

            # Act
            await service.execute(
                prompt="Test prompt",
                session_id="test-session",
                invocation_id=invocation_id,
            )

            # Assert - Verify streaming start was logged
            start_calls = [c for c in mock_logger.info.call_args_list if "Executing streaming orchestration" in str(c)]
            assert len(start_calls) == 1
            assert str(invocation_id) in str(start_calls[0])

            # Verify completion was logged
            completion_calls = [
                c for c in mock_logger.info.call_args_list if "Streaming orchestration completed" in str(c)
            ]
            assert len(completion_calls) == 1
            assert str(invocation_id) in str(completion_calls[0])


class TestToolEventDataModels:
    """Test ToolCallEventData and ToolResultEventData models."""

    def test_tool_call_event_data_serialization(self) -> None:
        """Test that ToolCallEventData serializes correctly with to_dict()."""
        from nexus.agent_orchestrator.models.streaming_events import ToolCallEventData

        # Arrange
        tool_call = ToolCallEventData(
            tool_name="calculate_sum",
            tool_input={"a": 5, "b": 3},
        )

        # Act
        result = tool_call.to_dict()

        # Assert
        assert result == {"tool_name": "calculate_sum", "tool_input": {"a": 5, "b": 3}}
        assert isinstance(result["tool_name"], str)
        assert isinstance(result["tool_input"], dict)

    def test_tool_result_event_data_serialization(self) -> None:
        """Test that ToolResultEventData serializes correctly with to_dict()."""
        from nexus.agent_orchestrator.models.streaming_events import ToolResultEventData

        # Arrange
        tool_result = ToolResultEventData(
            tool_name="calculate_sum",
            tool_output='{"result": 8}',
        )

        # Act
        result = tool_result.to_dict()

        # Assert
        assert result == {"tool_name": "calculate_sum", "tool_output": '{"result": 8}'}
        assert isinstance(result["tool_name"], str)
        assert isinstance(result["tool_output"], str)


class TestToolEventProcessing:
    """Test tool event processing methods in OrchestrationService."""

    @pytest.mark.asyncio
    async def test_process_tool_start_event_publishes_correctly(self) -> None:
        """Test that _process_tool_start_event extracts data and publishes tool_call event."""
        # Arrange
        mock_llm = AsyncMock()
        mock_context_manager = MagicMock()
        service = OrchestrationService(mock_llm, mock_context_manager)

        invocation_id = uuid4()
        stream_id = "test-stream-id"
        mock_client = AsyncMock()

        # Simulate LangGraph on_tool_start event
        tool_start_event = {
            "event": "on_tool_start",
            "name": "calculate_sum",
            "data": {"input": {"a": 5, "b": 3}},
        }

        # Act
        await service._process_tool_start_event(tool_start_event, invocation_id, stream_id, mock_client)

        # Assert
        mock_client.publish.assert_called_once()
        call_args = mock_client.publish.call_args[0]
        assert call_args[0] == stream_id

        published_event = call_args[1]
        assert published_event["event_type"] == "tool_call"
        assert published_event["invocation_id"] == str(invocation_id)
        assert "timestamp" in published_event
        assert published_event["data"]["tool_name"] == "calculate_sum"
        assert published_event["data"]["tool_input"] == {"a": 5, "b": 3}

    @pytest.mark.asyncio
    async def test_process_tool_end_event_with_raw_string_output(self) -> None:
        """Test that _process_tool_end_event handles raw string output correctly."""
        # Arrange
        mock_llm = AsyncMock()
        mock_context_manager = MagicMock()
        service = OrchestrationService(mock_llm, mock_context_manager)

        invocation_id = uuid4()
        stream_id = "test-stream-id"
        mock_client = AsyncMock()

        # Simulate LangGraph on_tool_end event with raw string output
        tool_end_event = {
            "event": "on_tool_end",
            "name": "calculate_sum",
            "data": {"output": '{"result": 8}'},
        }

        # Act
        await service._process_tool_end_event(tool_end_event, invocation_id, stream_id, mock_client)

        # Assert
        mock_client.publish.assert_called_once()
        call_args = mock_client.publish.call_args[0]
        assert call_args[0] == stream_id

        published_event = call_args[1]
        assert published_event["event_type"] == "tool_result"
        assert published_event["invocation_id"] == str(invocation_id)
        assert published_event["data"]["tool_name"] == "calculate_sum"
        assert published_event["data"]["tool_output"] == '{"result": 8}'

    @pytest.mark.asyncio
    async def test_process_tool_end_event_with_toolmessage_object(self) -> None:
        """Test that _process_tool_end_event extracts content from ToolMessage objects."""
        # Arrange
        mock_llm = AsyncMock()
        mock_context_manager = MagicMock()
        service = OrchestrationService(mock_llm, mock_context_manager)

        invocation_id = uuid4()
        stream_id = "test-stream-id"
        mock_client = AsyncMock()

        # Simulate LangGraph on_tool_end event with ToolMessage-like object
        mock_tool_message = MagicMock()
        mock_tool_message.content = '{"operation": "sum", "result": 8}'

        tool_end_event = {
            "event": "on_tool_end",
            "name": "calculate_sum",
            "data": {"output": mock_tool_message},
        }

        # Act
        await service._process_tool_end_event(tool_end_event, invocation_id, stream_id, mock_client)

        # Assert
        mock_client.publish.assert_called_once()
        call_args = mock_client.publish.call_args[0]

        published_event = call_args[1]
        assert published_event["event_type"] == "tool_result"
        assert published_event["data"]["tool_name"] == "calculate_sum"
        # Should extract .content from ToolMessage object
        assert published_event["data"]["tool_output"] == '{"operation": "sum", "result": 8}'


# T015: _build_streaming_result with llm_token_usage_log


class TestBuildStreamingResultTokenUsage:
    """Tests for llm_token_usage_log extraction in _build_streaming_result."""

    def test_includes_llm_token_usage_log_from_final_state(self) -> None:
        """Test that llm_token_usage_log is extracted from final_state."""
        mock_llm = AsyncMock()
        mock_llm.model_name = "test-model"
        mock_context_manager = MagicMock()
        service = OrchestrationService(mock_llm, mock_context_manager)

        invocation_id = uuid4()
        final_state = {
            "result": {"content": "test", "type": "answer"},
            "llm_token_usage_log": [
                {"input_tokens": 500, "output_tokens": 100, "usage_details": {}},
            ],
        }

        result = service._build_streaming_result(invocation_id, "stream-1", final_state)  # type: ignore[arg-type]

        assert "llm_token_usage_log" in result
        assert len(result["llm_token_usage_log"]) == 1
        assert result["llm_token_usage_log"][0]["input_tokens"] == 500

    def test_defaults_to_empty_list_when_no_usage_log(self) -> None:
        """Test default empty list when final_state has no llm_token_usage_log."""
        mock_llm = AsyncMock()
        mock_llm.model_name = "test-model"
        mock_context_manager = MagicMock()
        service = OrchestrationService(mock_llm, mock_context_manager)

        invocation_id = uuid4()
        final_state = {
            "result": {"content": "test", "type": "answer"},
        }

        result = service._build_streaming_result(invocation_id, "stream-1", final_state)  # type: ignore[arg-type]

        assert result.get("llm_token_usage_log", []) == []

    def test_handles_final_state_none(self) -> None:
        """Test graceful handling when final_state is None."""
        mock_llm = AsyncMock()
        mock_llm.model_name = "test-model"
        mock_context_manager = MagicMock()
        service = OrchestrationService(mock_llm, mock_context_manager)

        invocation_id = uuid4()
        result = service._build_streaming_result(invocation_id, "stream-1", None)

        # Should return fallback response without crashing
        assert isinstance(result, dict)
        assert result.get("llm_token_usage_log", []) == []
