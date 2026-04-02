"""Unit tests for OrchestratorAgent context integration and routing."""

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from langchain_core.messages import HumanMessage

from nexus.agent_orchestrator.agents.orchestrator_agent import OrchestratorAgent
from nexus.agent_orchestrator.constants import AgentRoutes
from nexus.agent_orchestrator.context_manager.models import ContextPackage

if TYPE_CHECKING:
    from nexus.agent_orchestrator.models.agent_state import AgentState


class TestOrchestratorAgentContextIntegration:
    """Test OrchestratorAgent context integration functionality."""

    @pytest.mark.asyncio
    async def test_orchestrator_integrates_context_successfully(self) -> None:
        """Test successful context integration with prompt enhancement."""
        # Arrange
        mock_context_manager = MagicMock()
        test_context = ContextPackage(
            correlation_id="test-correlation",
            payload={"relevant_docs": "Documentation about deployment tools"},
            grounding_score=0.85,
            citations=["file-id-doc1", "file-id-doc2"],
        )
        mock_context_manager.plan_request = AsyncMock(return_value=test_context)

        orchestrator = OrchestratorAgent(mock_context_manager)
        invocation_id = str(uuid4())
        state: AgentState = {
            "prompt": "What deployment tools are available?",
            "original_prompt": "What deployment tools are available?",
            "session_id": "test-session",
            "correlation_id": "initial-correlation",
            "invocation_id": invocation_id,
            "context_package": None,
            "current_agent": "",
            "messages": [HumanMessage("test")],
            "result": None,
            "metadata": None,
            "llm_token_usage_log": [],
        }

        # Act
        result_state = await orchestrator.execute(state)

        # Assert
        assert result_state["current_agent"] == AgentRoutes.GENERIC_AGENT
        assert result_state["context_package"] is not None
        assert result_state["context_package"]["correlation_id"] == "test-correlation"
        assert result_state["context_package"]["grounding_score"] == 0.85
        assert result_state["context_package"]["context_applied"] is True

        # Verify prompt was enhanced with context
        enhanced_prompt = result_state["prompt"]
        assert "What deployment tools are available?" in enhanced_prompt
        assert "--- CONTEXT ---" in enhanced_prompt
        assert "Documentation about deployment tools" in enhanced_prompt

    @pytest.mark.asyncio
    async def test_orchestrator_handles_context_failure_gracefully(self) -> None:
        """Test graceful fallback when context integration fails."""
        # Arrange
        mock_context_manager = MagicMock()
        mock_context_manager.plan_request = AsyncMock(side_effect=ConnectionError("Context service unavailable"))

        orchestrator = OrchestratorAgent(mock_context_manager)
        invocation_id = str(uuid4())
        original_prompt = "What deployment tools are available?"
        state: AgentState = {
            "prompt": original_prompt,
            "original_prompt": original_prompt,
            "session_id": "test-session",
            "correlation_id": "initial-correlation",
            "invocation_id": invocation_id,
            "context_package": None,
            "current_agent": "",
            "messages": [HumanMessage("test")],
            "result": None,
            "metadata": None,
            "llm_token_usage_log": [],
        }

        # Act
        with patch("nexus.agent_orchestrator.agents.orchestrator_agent.logger") as mock_logger:
            result_state = await orchestrator.execute(state)

            # Assert
            assert result_state["current_agent"] == AgentRoutes.GENERIC_AGENT
            assert result_state["context_package"] is None
            assert result_state["prompt"] == original_prompt  # Original prompt preserved

            # Verify error was logged
            mock_logger.warning.assert_called_once()
            warning_call = mock_logger.warning.call_args[0]
            warning_kwargs = mock_logger.warning.call_args[1]
            assert "Context integration failed" in warning_call[0]
            assert warning_kwargs.get("invocation_id") == invocation_id

    @pytest.mark.asyncio
    async def test_orchestrator_handles_various_context_exceptions(self) -> None:
        """Test handling of different context integration exception types."""
        exceptions = [
            ConnectionError("Database connection failed"),
            TimeoutError("Context retrieval timed out"),
            ValueError("Invalid query format"),
            RuntimeError("Context service internal error"),
            KeyError("Missing required field"),
            AttributeError("Context package malformed"),
        ]

        for exception in exceptions:
            # Arrange
            mock_context_manager = MagicMock()
            mock_context_manager.plan_request = AsyncMock(side_effect=exception)

            orchestrator = OrchestratorAgent(mock_context_manager)
            invocation_id = str(uuid4())
            original_prompt = f"Test prompt for {type(exception).__name__}"
            state: AgentState = {
                "prompt": original_prompt,
                "original_prompt": original_prompt,
                "session_id": "test-session",
                "correlation_id": "initial-correlation",
                "invocation_id": invocation_id,
                "context_package": None,
                "current_agent": "",
                "messages": [HumanMessage("test")],
                "result": None,
                "metadata": None,
                "llm_token_usage_log": [],
            }

            # Act
            result_state = await orchestrator.execute(state)

            # Assert
            assert result_state["context_package"] is None, f"Failed for {type(exception).__name__}"
            assert result_state["prompt"] == original_prompt, f"Failed for {type(exception).__name__}"
            assert result_state["current_agent"] == AgentRoutes.GENERIC_AGENT, f"Failed for {type(exception).__name__}"


class TestOrchestratorAgentRouting:
    """Test OrchestratorAgent routing logic."""

    @pytest.mark.asyncio
    async def test_orchestrator_routes_workflow_keywords_to_generic_agent(self) -> None:
        """Test routing of workflow-related prompts to generic agent."""
        workflow_prompts = [
            "create a deployment workflow",
            "build a CI/CD workflow",
            "generate a testing workflow",
            "workflow for database migration",
        ]

        for prompt in workflow_prompts:
            # Arrange
            mock_context_manager = MagicMock()
            mock_context_manager.plan_request = AsyncMock(
                return_value=ContextPackage(correlation_id="test", payload={}, grounding_score=0.0)
            )

            orchestrator = OrchestratorAgent(mock_context_manager)
            invocation_id = str(uuid4())
            state: AgentState = {
                "prompt": prompt,
                "original_prompt": prompt,
                "session_id": "test-session",
                "correlation_id": "initial-correlation",
                "invocation_id": invocation_id,
                "context_package": None,
                "current_agent": "",
                "messages": [HumanMessage("test")],
                "result": None,
                "metadata": None,
                "llm_token_usage_log": [],
            }

            # Act
            result_state = await orchestrator.execute(state)

            # Assert
            assert result_state["current_agent"] == AgentRoutes.GENERIC_AGENT, f"Failed for prompt: {prompt}"

    @pytest.mark.asyncio
    async def test_orchestrator_routes_default_queries_to_generic_agent(self) -> None:
        """Test default routing to generic agent for non-workflow queries."""
        default_prompts = [
            "What tools are available?",
            "How do I configure monitoring?",
            "Explain the deployment process",
            "Help me with troubleshooting",
        ]

        for prompt in default_prompts:
            # Arrange
            mock_context_manager = MagicMock()
            mock_context_manager.plan_request = AsyncMock(
                return_value=ContextPackage(correlation_id="test", payload={}, grounding_score=0.0)
            )

            orchestrator = OrchestratorAgent(mock_context_manager)
            invocation_id = str(uuid4())
            state: AgentState = {
                "prompt": prompt,
                "original_prompt": prompt,
                "session_id": "test-session",
                "correlation_id": "initial-correlation",
                "invocation_id": invocation_id,
                "context_package": None,
                "current_agent": "",
                "messages": [HumanMessage("test")],
                "result": None,
                "metadata": None,
                "llm_token_usage_log": [],
            }

            # Act
            result_state = await orchestrator.execute(state)

            # Assert
            assert result_state["current_agent"] == AgentRoutes.GENERIC_AGENT, f"Failed for prompt: {prompt}"


class TestOrchestratorAgentPromptFormatting:
    """Test OrchestratorAgent prompt formatting logic."""

    @pytest.mark.asyncio
    async def test_orchestrator_formats_context_with_sections(self) -> None:
        """Test context payload formatting into enhanced prompt."""
        # Arrange
        mock_context_manager = MagicMock()
        test_context = ContextPackage(
            correlation_id="test-correlation",
            payload={
                "Documentation": "Deployment tools documentation",
                "Examples": "Example deployment configurations",
                "Best Practices": "Security and performance guidelines",
            },
            grounding_score=0.90,
        )
        mock_context_manager.plan_request = AsyncMock(return_value=test_context)

        orchestrator = OrchestratorAgent(mock_context_manager)
        invocation_id = str(uuid4())
        original_prompt = "How do I deploy applications?"
        state: AgentState = {
            "prompt": original_prompt,
            "original_prompt": original_prompt,
            "session_id": "test-session",
            "correlation_id": "initial-correlation",
            "invocation_id": invocation_id,
            "context_package": None,
            "current_agent": "",
            "messages": [HumanMessage("test")],
            "result": None,
            "metadata": None,
            "llm_token_usage_log": [],
        }

        # Act
        result_state = await orchestrator.execute(state)

        # Assert
        enhanced_prompt = result_state["prompt"]

        # Verify original prompt is preserved
        assert original_prompt in enhanced_prompt

        # Verify context sections are formatted correctly
        assert "--- CONTEXT ---" in enhanced_prompt
        assert "--- END CONTEXT ---" in enhanced_prompt
        assert "## Documentation" in enhanced_prompt
        assert "## Examples" in enhanced_prompt
        assert "## Best Practices" in enhanced_prompt
        assert "Deployment tools documentation" in enhanced_prompt

    @pytest.mark.asyncio
    async def test_orchestrator_handles_empty_context_payload(self) -> None:
        """Test handling of empty context payload."""
        # Arrange
        mock_context_manager = MagicMock()
        test_context = ContextPackage(
            correlation_id="test-correlation",
            payload={},  # Empty payload
            grounding_score=0.0,
        )
        mock_context_manager.plan_request = AsyncMock(return_value=test_context)

        orchestrator = OrchestratorAgent(mock_context_manager)
        invocation_id = str(uuid4())
        original_prompt = "What are the available tools?"
        state: AgentState = {
            "prompt": original_prompt,
            "original_prompt": original_prompt,
            "session_id": "test-session",
            "correlation_id": "initial-correlation",
            "invocation_id": invocation_id,
            "context_package": None,
            "current_agent": "",
            "messages": [HumanMessage("test")],
            "result": None,
            "metadata": None,
            "llm_token_usage_log": [],
        }

        # Act
        result_state = await orchestrator.execute(state)

        # Assert
        # With empty payload, prompt should remain unchanged
        assert result_state["prompt"] == original_prompt
        assert result_state["context_package"] is not None
        assert result_state["context_package"]["context_applied"] is True


class TestOrchestratorAgentLogging:
    """Test OrchestratorAgent logging and observability."""

    @pytest.mark.asyncio
    async def test_orchestrator_logs_execution_flow(self) -> None:
        """Test that orchestrator logs execution flow with correlation IDs."""
        # Arrange
        mock_context_manager = MagicMock()
        test_context = ContextPackage(correlation_id="test-correlation", payload={}, grounding_score=0.75)
        mock_context_manager.plan_request = AsyncMock(return_value=test_context)

        orchestrator = OrchestratorAgent(mock_context_manager)
        invocation_id = str(uuid4())
        state: AgentState = {
            "prompt": "test query",
            "original_prompt": "test query",
            "session_id": "test-session",
            "correlation_id": "initial-correlation",
            "invocation_id": invocation_id,
            "context_package": None,
            "current_agent": "",
            "messages": [HumanMessage("test")],
            "result": None,
            "metadata": None,
            "llm_token_usage_log": [],
        }

        # Act
        with patch("nexus.agent_orchestrator.agents.orchestrator_agent.logger") as mock_logger:
            await orchestrator.execute(state)

            # Assert
            # Verify orchestration start was logged
            start_calls = [call for call in mock_logger.info.call_args_list if "Orchestrator processing" in str(call)]
            assert len(start_calls) == 1
            assert invocation_id in str(start_calls[0])

            # Verify context enhancement was logged
            context_calls = [call for call in mock_logger.info.call_args_list if "Context enhanced prompt" in str(call)]
            assert len(context_calls) == 1
            assert invocation_id in str(context_calls[0])

            # Verify routing was logged
            routing_calls = [call for call in mock_logger.info.call_args_list if "Orchestrator routed" in str(call)]
            assert len(routing_calls) == 1
            assert invocation_id in str(routing_calls[0])
