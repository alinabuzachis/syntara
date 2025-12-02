"""Unit tests for OrchestrationService LangGraph integration."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from langchain_core.messages import AIMessage

from nexus.agent_orchestrator.context_manager.models import ContextPackage
from nexus.agent_orchestrator.exceptions import AgentError
from nexus.agent_orchestrator.services.orchestration_service import OrchestrationService


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
        assert service.graph is not None
        assert service.llm == mock_llm
        assert service.context_manager == mock_context_manager


class TestOrchestrationServiceExecution:
    """Test OrchestrationService execution flow."""

    @pytest.mark.asyncio
    async def test_orchestration_service_executes_full_workflow(self) -> None:
        """Test full orchestration workflow with context integration and agent execution."""
        # Arrange
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = AIMessage(content="Test response from LLM")
        mock_llm.model_name = "test-model"

        mock_context_manager = MagicMock()
        test_context = ContextPackage(
            correlation_id="test-correlation",
            payload={"docs": "Relevant documentation"},
            grounding_score=0.8,
            citations=[{"source": "doc1.md"}],
        )
        mock_context_manager.plan_request.return_value = test_context

        service = OrchestrationService(mock_llm, mock_context_manager)
        invocation_id = uuid4()

        # Act
        result = await service.execute(
            prompt="What deployment tools are available?",
            session_id="test-session",
            invocation_id=invocation_id,
            correlation_id="initial-correlation",
        )

        # Assert
        assert isinstance(result, dict)
        assert "content" in result
        assert result["content"] == "Test response from LLM"
        assert "correlation_id" in result
        assert "grounding_score" in result
        assert "context_enhancement" in result

        # Verify context manager was called
        mock_context_manager.plan_request.assert_called_once()

        # Verify LLM was called
        mock_llm.ainvoke.assert_called_once()

    @pytest.mark.asyncio
    async def test_orchestration_service_handles_context_failure_gracefully(self) -> None:
        """Test that orchestration continues when context integration fails."""
        # Arrange
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = AIMessage(content="Response without context")
        mock_llm.model_name = "test-model"

        mock_context_manager = MagicMock()
        mock_context_manager.plan_request.side_effect = ConnectionError("Context service unavailable")

        service = OrchestrationService(mock_llm, mock_context_manager)
        invocation_id = uuid4()

        # Act
        result = await service.execute(
            prompt="What tools are available?",
            session_id="test-session",
            invocation_id=invocation_id,
            correlation_id="initial-correlation",
        )

        # Assert
        assert isinstance(result, dict)
        assert "content" in result
        assert result["content"] == "Response without context"
        assert "correlation_id" in result

        # Should still have correlation_id from initial state when context fails
        assert result["correlation_id"] == "initial-correlation"

        # Verify LLM was still called despite context failure
        mock_llm.ainvoke.assert_called_once()

    @pytest.mark.asyncio
    async def test_orchestration_service_handles_llm_errors(self) -> None:
        """Test error handling when LLM execution fails."""
        # Arrange
        mock_llm = AsyncMock()
        mock_llm.ainvoke.side_effect = RuntimeError("LLM service unavailable")
        mock_llm.model_name = "test-model"

        mock_context_manager = MagicMock()
        test_context = ContextPackage(correlation_id="test", payload={}, grounding_score=0.0)
        mock_context_manager.plan_request.return_value = test_context

        service = OrchestrationService(mock_llm, mock_context_manager)
        invocation_id = uuid4()

        # Act & Assert - Should raise AgentError when LLM fails
        with pytest.raises(AgentError) as exc_info:
            await service.execute(
                prompt="Test prompt",
                session_id="test-session",
                invocation_id=invocation_id,
                correlation_id="initial-correlation",
            )

        # Verify the error contains the original LLM error message
        assert "Execution error: LLM service unavailable" in str(exc_info.value)
        assert exc_info.value.invocation_id == str(invocation_id)

    @pytest.mark.asyncio
    async def test_orchestration_service_uses_session_checkpointing(self) -> None:
        """Test that session checkpointing works for multi-turn conversations."""
        # Arrange
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = AIMessage(content="First response")
        mock_llm.model_name = "test-model"

        mock_context_manager = MagicMock()
        test_context = ContextPackage(correlation_id="test", payload={}, grounding_score=0.0)
        mock_context_manager.plan_request.return_value = test_context

        service = OrchestrationService(mock_llm, mock_context_manager)
        session_id = "multi-turn-session"
        invocation_id_1 = uuid4()
        invocation_id_2 = uuid4()

        # Act - First invocation
        result1 = await service.execute(
            prompt="First prompt",
            session_id=session_id,
            invocation_id=invocation_id_1,
        )

        # Configure for second invocation
        mock_llm.ainvoke.return_value = AIMessage(content="Second response")

        # Act - Second invocation with same session
        result2 = await service.execute(
            prompt="Second prompt",
            session_id=session_id,
            invocation_id=invocation_id_2,
        )

        # Assert
        assert result1["content"] == "First response"
        assert result2["content"] == "Second response"

        # Both should have been executed (checkpointing allows state persistence)
        assert mock_llm.ainvoke.call_count == 2


class TestOrchestrationServiceRouting:
    """Test OrchestrationService routing logic through LangGraph."""

    @pytest.mark.asyncio
    async def test_orchestration_service_routes_to_generic_agent(self) -> None:
        """Test that orchestration routes to generic agent correctly."""
        # Arrange
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = AIMessage(content="Generic agent response")
        mock_llm.model_name = "test-model"

        mock_context_manager = MagicMock()
        test_context = ContextPackage(correlation_id="test", payload={}, grounding_score=0.0)
        mock_context_manager.plan_request.return_value = test_context

        service = OrchestrationService(mock_llm, mock_context_manager)

        # Act
        result = await service.execute(
            prompt="What tools are available?",  # Non-workflow prompt
            session_id="test-session",
            invocation_id=uuid4(),
        )

        # Assert
        assert "content" in result
        assert result["content"] == "Generic agent response"

        # Verify the LLM was called (indicating generic agent was executed)
        mock_llm.ainvoke.assert_called_once()

    @pytest.mark.asyncio
    async def test_orchestration_service_routes_workflow_prompts_correctly(self) -> None:
        """Test routing of workflow-related prompts."""
        # Arrange
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = AIMessage(content="Workflow-related response")
        mock_llm.model_name = "test-model"

        mock_context_manager = MagicMock()
        test_context = ContextPackage(correlation_id="test", payload={}, grounding_score=0.0)
        mock_context_manager.plan_request.return_value = test_context

        service = OrchestrationService(mock_llm, mock_context_manager)

        # Act
        result = await service.execute(
            prompt="Create a deployment workflow",  # Workflow prompt
            session_id="test-session",
            invocation_id=uuid4(),
        )

        # Assert
        assert "content" in result
        assert result["content"] == "Workflow-related response"

        # Currently routes to generic agent (as per current implementation)
        mock_llm.ainvoke.assert_called_once()


class TestOrchestrationServiceContextEnhancement:
    """Test context enhancement functionality in OrchestrationService."""

    @pytest.mark.asyncio
    async def test_orchestration_service_enhances_result_with_context_metadata(self) -> None:
        """Test that results are enhanced with context metadata."""
        # Arrange
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = AIMessage(content="Enhanced response")
        mock_llm.model_name = "test-model"

        mock_context_manager = MagicMock()
        test_context = ContextPackage(
            id="context-package-123",
            correlation_id="test-correlation",
            payload={"docs": "Relevant info"},
            grounding_score=0.85,
            citations=[{"source": "doc1.md"}, {"source": "doc2.md"}],
        )
        mock_context_manager.plan_request.return_value = test_context

        service = OrchestrationService(mock_llm, mock_context_manager)

        # Act
        result = await service.execute(
            prompt="Test prompt with context",
            session_id="test-session",
            invocation_id=uuid4(),
            correlation_id="initial-correlation",
        )

        # Assert
        assert result["correlation_id"] == "test-correlation"  # From context package
        assert result["grounding_score"] == 0.85
        assert "context_enhancement" in result
        assert result["context_enhancement"]["turn_id"] == "context-package-123"
        assert result["context_enhancement"]["citations"] == [{"source": "doc1.md"}, {"source": "doc2.md"}]
        assert result["context_enhancement"]["context_applied"] is True

    @pytest.mark.asyncio
    async def test_orchestration_service_handles_no_context_metadata(self) -> None:
        """Test result enhancement when no context is applied."""
        # Arrange
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = AIMessage(content="Response without context")
        mock_llm.model_name = "test-model"

        mock_context_manager = MagicMock()
        mock_context_manager.plan_request.side_effect = ConnectionError("No context")

        service = OrchestrationService(mock_llm, mock_context_manager)
        initial_correlation_id = "initial-correlation"

        # Act
        result = await service.execute(
            prompt="Test prompt without context",
            session_id="test-session",
            invocation_id=uuid4(),
            correlation_id=initial_correlation_id,
        )

        # Assert
        # Should use initial correlation_id when no context is applied
        assert result["correlation_id"] == initial_correlation_id
        assert "grounding_score" not in result or result.get("grounding_score") is None
        assert "context_enhancement" not in result or result.get("context_enhancement") is None


class TestOrchestrationServiceLogging:
    """Test OrchestrationService logging and observability."""

    @pytest.mark.asyncio
    async def test_orchestration_service_logs_execution_flow(self) -> None:
        """Test that orchestration service logs execution with correlation IDs."""
        # Arrange
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = AIMessage(content="Test response")
        mock_llm.model_name = "test-model"

        mock_context_manager = MagicMock()
        test_context = ContextPackage(correlation_id="test", payload={}, grounding_score=0.0)
        mock_context_manager.plan_request.return_value = test_context

        service = OrchestrationService(mock_llm, mock_context_manager)
        invocation_id = uuid4()

        # Act
        with patch("nexus.agent_orchestrator.services.orchestration_service.logger") as mock_logger:
            await service.execute(
                prompt="Test prompt",
                session_id="test-session",
                invocation_id=invocation_id,
            )

            # Assert
            # Verify execution start was logged
            start_calls = [call for call in mock_logger.info.call_args_list if "Executing orchestration" in str(call)]
            assert len(start_calls) == 1
            assert str(invocation_id) in str(start_calls[0])

            # Verify completion was logged
            completion_calls = [
                call for call in mock_logger.info.call_args_list if "Orchestration completed" in str(call)
            ]
            assert len(completion_calls) == 1
            assert str(invocation_id) in str(completion_calls[0])

    @pytest.mark.asyncio
    async def test_orchestration_service_logs_failures(self) -> None:
        """Test that orchestration service logs failures appropriately."""
        # Arrange
        mock_llm = AsyncMock()
        mock_llm.ainvoke.side_effect = RuntimeError("Test failure")
        mock_llm.model_name = "test-model"

        mock_context_manager = MagicMock()
        test_context = ContextPackage(correlation_id="test", payload={}, grounding_score=0.0)
        mock_context_manager.plan_request.return_value = test_context

        service = OrchestrationService(mock_llm, mock_context_manager)
        invocation_id = uuid4()

        # Act & Assert
        with patch("nexus.agent_orchestrator.services.orchestration_service.logger") as mock_logger:
            with pytest.raises(AgentError) as exc_info:
                await service.execute(
                    prompt="Test prompt",
                    session_id="test-session",
                    invocation_id=invocation_id,
                )

            # Assert - Should raise AgentError when LLM fails
            assert "Execution error: Test failure" in str(exc_info.value)
            assert exc_info.value.invocation_id == str(invocation_id)

            # Verify orchestration failure was logged
            failure_calls = [
                call for call in mock_logger.exception.call_args_list if "Orchestration failed" in str(call)
            ]
            assert len(failure_calls) == 1  # Orchestration failure should be logged
