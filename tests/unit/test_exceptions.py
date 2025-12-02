"""Unit tests for custom agent orchestration exceptions."""

from uuid import uuid4

from nexus.agent_orchestrator.exceptions import (
    AgentConfigurationError,
    AgentError,
    AgentRateLimitError,
    AgentTimeoutError,
    ContextIntegrationError,
    OrchestrationError,
)


class TestAgentError:
    """Test base AgentError functionality."""

    def test_agent_error_initialization(self) -> None:
        """Test AgentError initialization with message and invocation_id."""
        message = "Test error message"
        invocation_id = str(uuid4())

        error = AgentError(message, invocation_id)

        assert str(error) == message
        assert error.message == message
        assert error.invocation_id == invocation_id

    def test_agent_error_initialization_without_invocation_id(self) -> None:
        """Test AgentError initialization without invocation_id."""
        message = "Test error without invocation ID"

        error = AgentError(message)

        assert str(error) == message
        assert error.message == message
        assert error.invocation_id is None


class TestExceptionInheritance:
    """Test that all exception types inherit from AgentError."""

    def test_configuration_error_inherits_agent_error(self) -> None:
        """Test AgentConfigurationError inherits from AgentError."""
        error = AgentConfigurationError("Config error")
        assert isinstance(error, AgentError)
        assert str(error) == "Config error"

    def test_rate_limit_error_inherits_agent_error(self) -> None:
        """Test AgentRateLimitError inherits from AgentError."""
        error = AgentRateLimitError("Rate limit exceeded")
        assert isinstance(error, AgentError)
        assert str(error) == "Rate limit exceeded"

    def test_timeout_error_inherits_agent_error(self) -> None:
        """Test AgentTimeoutError inherits from AgentError."""
        error = AgentTimeoutError("Request timeout")
        assert isinstance(error, AgentError)
        assert str(error) == "Request timeout"

    def test_context_integration_error_inherits_agent_error(self) -> None:
        """Test ContextIntegrationError inherits from AgentError."""
        error = ContextIntegrationError("Context integration failed")
        assert isinstance(error, AgentError)
        assert str(error) == "Context integration failed"

    def test_orchestration_error_inherits_agent_error(self) -> None:
        """Test OrchestrationError inherits from AgentError."""
        error = OrchestrationError("Orchestration failed")
        assert isinstance(error, AgentError)
        assert str(error) == "Orchestration failed"


class TestErrorChaining:
    """Test error chaining and cause tracking."""

    def test_errors_can_be_chained(self) -> None:
        """Test that errors can be properly chained."""
        original_error = ConnectionError("Network failed")

        agent_error = AgentError(f"Processing failed: {original_error}")

        assert "Network failed" in str(agent_error)
        assert isinstance(agent_error, Exception)

    def test_configuration_error_with_underlying_cause(self) -> None:
        """Test configuration error with underlying cause."""
        original_error = KeyError("API_KEY")

        config_error = AgentConfigurationError(f"Missing configuration: {original_error}")

        assert "API_KEY" in str(config_error)
        assert isinstance(config_error, AgentError)
