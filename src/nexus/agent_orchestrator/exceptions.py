"""Custom exceptions for agent orchestration system."""


class AgentError(Exception):
    """Base exception for all agent-related errors."""

    def __init__(self, message: str, invocation_id: str | None = None) -> None:
        """Initialize AgentError.

        Args:
            message: Error message
            invocation_id: Optional invocation ID for context

        """
        super().__init__(message)
        self.message = message
        self.invocation_id = invocation_id


class AgentConfigurationError(AgentError):
    """Exception for agent configuration and validation errors."""


class AgentRateLimitError(AgentError):
    """Exception for rate limiting errors."""


class AgentTimeoutError(AgentError):
    """Exception for timeout errors."""


class ContextIntegrationError(AgentError):
    """Exception for context manager integration failures."""


class OrchestrationError(AgentError):
    """Exception for orchestration service failures."""
