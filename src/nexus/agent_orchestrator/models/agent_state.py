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

    user_id: str | None
    """UUID of the user who initiated the invocation (from JWT claims)"""

    # Context management
    context_package: dict[str, Any] | None
    """Context package from ContextManagerPlanner, if available"""

    # Routing and execution state
    current_agent: str
    """Name of the current/target agent ('orchestrator', 'generic_agent', 'workflow_generator')"""

    # Metadata and context
    metadata: dict[str, Any] | None
    """Metadata from invocation context_data (includes callback_url for PR #271)"""

    # Tool execution messages
    messages: Annotated[list[AnyMessage], operator.add]
    """Messages for LangGraph ToolNode execution and LLM communication"""

    # Results
    result: dict[str, Any] | None
    """Final result from agent execution"""

    # Token usage tracking (accumulated across LLM calls via operator.add)
    llm_token_usage_log: Annotated[list[dict[str, Any]], operator.add]
    """Per-call token usage entries from LLM provider responses"""


class AgentStateFactory:
    """Factory for creating AgentState instances."""

    @staticmethod
    def create_initial_state(
        prompt: str,
        session_id: str,
        invocation_id: UUID,
        correlation_id: str | None = None,
        metadata: dict[str, Any] | None = None,
        user_id: UUID | None = None,
    ) -> AgentState:
        """Create initial state for LangGraph execution.

        Args:
            prompt: User's original prompt
            session_id: Session identifier
            invocation_id: Invocation UUID
            correlation_id: Optional correlation ID (defaults to invocation_id)
            metadata: Optional metadata from invocation context_data (e.g., callback_url)
            user_id: Optional UUID of the user who initiated the invocation

        Returns:
            Initial AgentState ready for orchestration

        """
        return AgentState(
            prompt=prompt,
            original_prompt=prompt,
            session_id=session_id,
            correlation_id=correlation_id or str(invocation_id),
            invocation_id=str(invocation_id),
            user_id=str(user_id) if user_id else None,
            context_package=None,
            current_agent=AgentRoutes.ORCHESTRATOR,
            metadata=metadata,
            messages=[HumanMessage(prompt)],
            result=None,
            llm_token_usage_log=[],
        )
