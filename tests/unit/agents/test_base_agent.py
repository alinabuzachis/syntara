"""Unit tests for BaseAgent abstract class and error handling utilities."""

from unittest.mock import patch
from uuid import uuid4

import pytest

from nexus.agent_orchestrator.agents.base_agent import BaseAgent
from nexus.agent_orchestrator.exceptions import (
    AgentConfigurationError,
    AgentError,
    AgentRateLimitError,
    AgentTimeoutError,
)
from nexus.agent_orchestrator.models.agent_response import GenericAgentResponse


class ConcreteAgent(BaseAgent):
    """Concrete implementation of BaseAgent for testing."""

    async def _execute(self, state) -> GenericAgentResponse:  # noqa: ARG002
        """Test implementation."""
        return GenericAgentResponse(content="test response")


class TestBaseAgentInitialization:
    """Test BaseAgent initialization."""

    def test_base_agent_initializes_logger(self) -> None:
        """Test that BaseAgent initializes logger with correct name."""
        agent = ConcreteAgent()

        assert agent.logger is not None
        assert agent.logger.name == "ConcreteAgent"


class TestBaseAgentErrorHandling:
    """Test BaseAgent error handling helper method."""

    def test_handle_execution_error_converts_timeout_error(self) -> None:
        """Test that TimeoutError is converted to AgentTimeoutError."""
        agent = ConcreteAgent()
        invocation_id = str(uuid4())
        original_error = TimeoutError("Connection timed out")

        with pytest.raises(AgentTimeoutError) as exc_info:
            agent._handle_execution_error(original_error, invocation_id)

        assert exc_info.value.invocation_id == invocation_id
        assert exc_info.value.__cause__ == original_error

    def test_handle_execution_error_converts_key_error(self) -> None:
        """Test that KeyError is converted to AgentConfigurationError."""
        agent = ConcreteAgent()
        invocation_id = str(uuid4())
        original_error = KeyError("API_KEY")

        with pytest.raises(AgentConfigurationError) as exc_info:
            agent._handle_execution_error(original_error, invocation_id)

        assert exc_info.value.invocation_id == invocation_id
        assert "API_KEY" in str(exc_info.value)
        assert exc_info.value.__cause__ == original_error

    def test_handle_execution_error_converts_value_error(self) -> None:
        """Test that ValueError is converted to AgentConfigurationError."""
        agent = ConcreteAgent()
        invocation_id = str(uuid4())
        original_error = ValueError("Invalid configuration")

        with pytest.raises(AgentConfigurationError) as exc_info:
            agent._handle_execution_error(original_error, invocation_id)

        assert exc_info.value.invocation_id == invocation_id
        assert "Invalid configuration" in str(exc_info.value)
        assert exc_info.value.__cause__ == original_error

    def test_handle_execution_error_detects_invalid_key_in_message(self) -> None:
        """Test errors with 'invalid key' become AgentConfigurationError."""
        agent = ConcreteAgent()
        invocation_id = str(uuid4())
        original_error = RuntimeError("Invalid API key provided")

        with pytest.raises(AgentConfigurationError) as exc_info:
            agent._handle_execution_error(original_error, invocation_id)

        assert exc_info.value.invocation_id == invocation_id
        assert "Invalid API key" in str(exc_info.value)
        assert exc_info.value.__cause__ == original_error

    def test_handle_execution_error_detects_rate_limit_in_message(self) -> None:
        """Test that errors with 'rate limit' in message become AgentRateLimitError."""
        agent = ConcreteAgent()
        invocation_id = str(uuid4())
        original_error = RuntimeError("Rate limit exceeded for API")

        with pytest.raises(AgentRateLimitError) as exc_info:
            agent._handle_execution_error(original_error, invocation_id)

        assert exc_info.value.invocation_id == invocation_id
        assert "Rate limit exceeded" in str(exc_info.value)
        assert exc_info.value.__cause__ == original_error

    def test_handle_execution_error_converts_general_errors(self) -> None:
        """Test that general errors are converted to AgentError."""
        agent = ConcreteAgent()
        invocation_id = str(uuid4())
        original_error = ConnectionError("Network failure")

        with pytest.raises(AgentError) as exc_info:
            agent._handle_execution_error(original_error, invocation_id)

        assert exc_info.value.invocation_id == invocation_id
        assert "Network failure" in str(exc_info.value)
        assert exc_info.value.__cause__ == original_error


class TestBaseAgentEmptyResponseHandling:
    """Test BaseAgent empty response handling."""

    def test_handle_empty_response_returns_proper_format(self) -> None:
        """Test that empty response handler returns GenericAgentResponse."""
        agent = ConcreteAgent()
        invocation_id = str(uuid4())
        response_metadata: dict[str, object] = {"model": "test-model"}

        result = agent._handle_empty_response(invocation_id, response_metadata, message=None)

        assert result.type == "answer"
        assert "couldn't generate an answer" in result.content
        assert result.response_metadata["warning"] == "empty_response"
        assert result.response_metadata["model"] == "test-model"

    def test_handle_empty_response_uses_custom_message(self) -> None:
        """Test that empty response handler uses provided custom message."""
        agent = ConcreteAgent()
        invocation_id = str(uuid4())
        response_metadata: dict[str, object] = {}
        custom_message = "Custom fallback message"

        result = agent._handle_empty_response(invocation_id, response_metadata, message=custom_message)

        assert result.content == custom_message
        assert result.response_metadata["warning"] == "empty_response"


class TestBaseAgentLogging:
    """Test BaseAgent logging helper methods."""

    def test_log_execution_start_logs_with_correct_format(self) -> None:
        """Test that execution start is logged with invocation and session IDs."""
        agent = ConcreteAgent()
        invocation_id = str(uuid4())
        session_id = "test-session-123"

        with patch.object(agent.logger, "info") as mock_info:
            agent._log_execution_start(invocation_id, session_id)

            mock_info.assert_called_once()
            call_args = mock_info.call_args[0]
            # First arg is format string, subsequent args are values
            assert "executing as node" in call_args[0]
            assert call_args[1] == "ConcreteAgent"
            assert call_args[2] == invocation_id
            assert call_args[3] == session_id

    def test_log_execution_success_logs_with_correct_format(self) -> None:
        """Test that execution success is logged with invocation ID."""
        agent = ConcreteAgent()
        invocation_id = str(uuid4())

        with patch.object(agent.logger, "info") as mock_info:
            agent._log_execution_success(invocation_id)

            mock_info.assert_called_once()
            call_args = mock_info.call_args[0]
            # First arg is format string, subsequent args are values
            assert "completed successfully" in call_args[0]
            assert call_args[1] == "ConcreteAgent"
            assert call_args[2] == invocation_id
