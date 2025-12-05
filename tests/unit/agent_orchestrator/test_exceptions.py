"""Unit tests for agent orchestrator exceptions."""

from nexus.agent_orchestrator.exceptions import LLMConfigurationError


class TestLLMConfigurationError:
    """Tests for LLMConfigurationError exception."""

    def test_message_is_preserved(self) -> None:
        """Test that exception message is preserved."""
        message = "NEXUS_OPENROUTER_API_KEY environment variable is required"
        error = LLMConfigurationError(message)
        assert str(error) == message
