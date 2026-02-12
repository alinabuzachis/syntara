"""Custom exceptions for agent orchestration system."""

from uuid import UUID

from nexus.agent_orchestrator.error_handlers import llm_configuration_error_handler
from nexus.core.exception_registry import fastapi_exception


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


@fastapi_exception(handler=llm_configuration_error_handler)
class LLMConfigurationError(Exception):
    """Raised when LLM model configuration is missing or invalid.

    This exception indicates a server-side configuration issue,
    not a problem with the client's request.
    """


class InvocationCancelledError(Exception):
    """Raised when an invocation has been cancelled during execution."""

    def __init__(self, invocation_id: UUID, phase: str = "unknown") -> None:
        """Initialize exception with invocation ID and phase where cancellation occurred.

        Args:
            invocation_id: The UUID of the cancelled invocation
            phase: The execution phase where cancellation was detected (e.g., 'retrieval', 'compression', 'assembly')

        """
        self.invocation_id = invocation_id
        self.phase = phase
        super().__init__(f"Invocation {invocation_id} was cancelled during {phase} phase")
