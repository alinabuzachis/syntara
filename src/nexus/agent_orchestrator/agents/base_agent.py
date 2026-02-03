"""Base agent class providing common functionality for all agents."""

from abc import ABC, abstractmethod
from typing import NoReturn

import structlog

from nexus.agent_orchestrator.exceptions import (
    AgentConfigurationError,
    AgentError,
    AgentRateLimitError,
    AgentTimeoutError,
)
from nexus.agent_orchestrator.models.agent_response import (
    GenericAgentResponse,
)
from nexus.agent_orchestrator.models.agent_state import AgentState

logger = structlog.stdlib.get_logger(__name__)


class BaseAgent(ABC):
    """Abstract base class for all agents in the orchestration system.

    Provides common functionality including:
    - Standardized error handling
    - Logging patterns
    - Empty response handling
    - LangGraph node execution interface via Template Method pattern
    """

    def __init__(self) -> None:
        """Initialize base agent."""
        self.logger = structlog.stdlib.get_logger(self.__class__.__name__)

    async def execute_as_node(self, state: AgentState) -> AgentState:
        """Execute as LangGraph node with standardized workflow.

        This template method enforces a consistent execution pattern across all agents:
        1. Log execution start
        2. Execute agent-specific logic via _execute()
        3. Convert SQLModel response to dict for LangGraph
        4. Log execution success
        5. Handle errors consistently

        Args:
            state: LangGraph state containing prompt and metadata

        Returns:
            Response dictionary compatible with AgentState (from SQLModel.model_dump())

        Raises:
            AgentError: For general agent execution errors
            AgentTimeoutError: When execution times out
            AgentConfigurationError: For configuration/validation errors
            AgentRateLimitError: When rate limits are exceeded

        """
        self._log_execution_start(state["invocation_id"], state["session_id"])

        try:
            # Call agent-specific implementation (returns SQLModel instance)
            updated_state = await self._execute(state)

            self._log_execution_success(state["invocation_id"])

            return updated_state

        except Exception as e:  # noqa: BLE001
            self._handle_execution_error(e, state["invocation_id"])

    @abstractmethod
    async def _execute(self, state: AgentState) -> AgentState:
        """Execute agent-specific logic.

        This method must be implemented by each concrete agent to provide
        the actual execution logic. The base class handles logging, conversion
        to dict, and error handling.

        Args:
            state: LangGraph state containing prompt and metadata

        Returns:
            BaseAgentResponse subclass instance

        """

    def _handle_execution_error(self, error: Exception, invocation_id: str) -> NoReturn:
        """Handle execution errors by raising appropriate agent exceptions.

        This method inspects the error and raises the appropriate typed
        exception with proper chaining. Use this in except blocks to
        standardize error handling across agents.

        Args:
            error: The original exception that occurred
            invocation_id: Invocation ID for error context

        Raises:
            AgentTimeoutError: When the error is a timeout
            AgentConfigurationError: For configuration/validation errors
            AgentRateLimitError: When rate limits are detected
            AgentError: For all other errors

        """
        # Handle timeout errors
        if isinstance(error, TimeoutError):
            msg = "Request timed out"
            raise AgentTimeoutError(msg, invocation_id) from error

        # Handle configuration and validation errors
        if isinstance(error, (KeyError, ValueError)):
            msg = f"Configuration or validation error: {error}"
            raise AgentConfigurationError(msg, invocation_id) from error

        # Check for API configuration errors in message (invalid key, etc.)
        error_msg = str(error).lower()
        if "invalid" in error_msg and "key" in error_msg:
            raise AgentConfigurationError(str(error), invocation_id) from error

        # Check for rate limit errors in error message
        if "rate limit" in error_msg:
            raise AgentRateLimitError(str(error), invocation_id) from error

        # Handle as general agent error
        msg = f"Execution error: {error}"
        raise AgentError(msg, invocation_id) from error

    def _log_execution_start(self, invocation_id: str, session_id: str) -> None:
        """Log the start of agent execution.

        Args:
            invocation_id: Invocation ID
            session_id: Session ID

        """
        self.logger.info(
            "Agent executing as node",
            agent_class=self.__class__.__name__,
            invocation_id=invocation_id,
            session_id=session_id,
        )

    def _log_execution_success(self, invocation_id: str) -> None:
        """Log successful completion of agent execution.

        Args:
            invocation_id: Invocation ID

        """
        self.logger.info(
            "Agent node execution completed successfully",
            agent_class=self.__class__.__name__,
            invocation_id=invocation_id,
        )

    def _handle_empty_response(
        self,
        invocation_id: str,
        response_metadata: dict[str, object],
        message: str | None,
    ) -> GenericAgentResponse:
        """Handle cases where the agent produces an empty response.

        Args:
            invocation_id: Invocation ID for logging
            response_metadata: Metadata from the LLM response
            message: Custom message to return, or None to use default

        Returns:
            GenericAgentResponse with message and warning metadata

        """
        self.logger.warning(
            "Empty response for execution",
            invocation_id=invocation_id,
        )
        if not message:
            message = (
                "I apologize, but I couldn't generate an answer to your question. "
                "Please try rephrasing or providing more details."
            )
        response_metadata["warning"] = "empty_response"
        return GenericAgentResponse(
            content=message,
            response_metadata=response_metadata,
        )
