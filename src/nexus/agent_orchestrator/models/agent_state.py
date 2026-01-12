"""AgentState model for LangGraph state management.

This module defines the state structure that flows through the LangGraph
state machine during agent orchestration.
"""

import operator
from typing import Annotated, Any
from uuid import UUID

from langchain.messages import AnyMessage
from langchain_core.messages import HumanMessage
from typing_extensions import TypedDict

from nexus.agent_orchestrator.constants import AgentRoutes


class AgentState(TypedDict):
    """State model for LangGraph agent orchestration.

    This state is passed between nodes in the LangGraph execution flow,
    containing all necessary information for agent coordination and
    context management.
    """

    # Core prompt data
    prompt: str
    """The current prompt being processed (may be context-enhanced)"""

    original_prompt: str
    """The original user prompt before context enhancement"""

    # Session and correlation tracking
    session_id: str
    """Session identifier for multi-turn conversation tracking"""

    correlation_id: str
    """Correlation ID for distributed tracing and debugging"""

    invocation_id: str
    """UUID of the invocation being processed"""

    # Context management
    context_package: dict[str, Any] | None
    """Context package from ContextManagerPlanner, if available"""

    # Routing and execution state
    current_agent: str
    """Name of the current/target agent ('orchestrator', 'generic_agent', 'workflow_generator')"""

    # Tool execution messages
    messages: Annotated[list[AnyMessage], operator.add]
    """Messages for LangGraph ToolNode execution and LLM communication"""

    # Results
    result: dict[str, Any] | None
    """Final result from agent execution"""


class AgentStateFactory:
    """Factory for creating AgentState instances."""

    @staticmethod
    def create_initial_state(
        prompt: str,
        session_id: str,
        invocation_id: UUID,
        correlation_id: str | None = None,
    ) -> AgentState:
        """Create initial state for LangGraph execution.

        Args:
            prompt: User's original prompt
            session_id: Session identifier
            invocation_id: Invocation UUID
            correlation_id: Optional correlation ID (defaults to invocation_id)

        Returns:
            Initial AgentState ready for orchestration

        """
        return AgentState(
            prompt=prompt,
            original_prompt=prompt,
            session_id=session_id,
            correlation_id=correlation_id or str(invocation_id),
            invocation_id=str(invocation_id),
            context_package=None,
            current_agent=AgentRoutes.ORCHESTRATOR,
            messages=[HumanMessage(prompt)],
            result=None,
        )
