"""Orchestrator Agent for LangGraph-based agent coordination.

This agent serves as the entry point for the LangGraph state machine,
handling context integration and routing requests to appropriate specialist agents.
"""

import asyncio
import copy
import time
from typing import Any, ClassVar
from uuid import UUID

import structlog

from nexus.agent_orchestrator.constants import AgentRoutes
from nexus.agent_orchestrator.context_manager.planner import ContextManagerPlanner
from nexus.agent_orchestrator.exceptions import ContextIntegrationError
from nexus.agent_orchestrator.models.agent_state import AgentState
from nexus.metrics.dependencies import get_metrics_recorder
from nexus.metrics.types import MetricType
from nexus.settings.cache.settings_cache import get_runtime_settings

logger = structlog.stdlib.get_logger(__name__)


class OrchestratorAgent:
    """Orchestrator agent responsible for context integration and routing.

    This agent:
    1. Calls the Context Manager to enhance prompts with relevant context
    2. Routes requests to appropriate specialist agents based on simple keyword analysis
    3. Handles graceful fallback when context integration fails
    """

    # Workflow keywords for routing decisions
    WORKFLOW_KEYWORDS: ClassVar[list[str]] = ["workflow", "create", "build", "generate"]

    def __init__(self, context_manager_planner: ContextManagerPlanner) -> None:
        """Initialize the orchestrator agent.

        Args:
            context_manager_planner: Context manager for prompt enhancement

        """
        self.context_manager = context_manager_planner
        self.settings = get_runtime_settings()

    async def execute(self, state: AgentState) -> AgentState:
        """Execute orchestration: context integration and routing.

        Args:
            state: Current LangGraph state

        Returns:
            Updated state with enhanced prompt and routing decision

        """
        logger.info("Orchestrator processing invocation", invocation_id=state["invocation_id"])

        # Step 1: Context Integration
        enhanced_state = await self._integrate_context(state)

        # Step 2: Route to appropriate agent
        routed_state = self._route_request(enhanced_state)

        logger.info(
            "Orchestrator routed for invocation",
            current_agent=routed_state["current_agent"],
            invocation_id=state["invocation_id"],
        )

        return routed_state

    async def _integrate_context(self, state: AgentState) -> AgentState:
        """Integrate context manager to enhance the prompt.

        Args:
            state: Current state

        Returns:
            State with enhanced prompt and context package

        """
        try:
            logger.debug("Calling context manager for session", session_id=state["session_id"])

            # Get timeout from runtime settings
            timeout = await self.settings.get_int("context_manager.request_timeout_seconds")

            # Call context manager using PR 168 pattern with configurable timeout
            user_id = UUID(state["user_id"]) if state.get("user_id") else None
            context_package = await asyncio.wait_for(
                self.context_manager.plan_request(
                    session_id=state["session_id"],
                    query=state["original_prompt"],
                    invocation_id=UUID(state["invocation_id"]),
                    user_id=user_id,
                ),
                timeout=timeout,
            )

            # Enhance prompt with context
            enhanced_prompt = self._format_context_prompt(state["original_prompt"], context_package.payload)

            # Update state with context information
            updated_state = copy.deepcopy(state)
            updated_state["prompt"] = enhanced_prompt
            updated_state["context_package"] = {
                "package_id": context_package.id,
                "grounding_score": context_package.grounding_score,
                "citations": context_package.citations,
                "context_applied": True,
            }

            logger.info(
                "Context enhanced prompt for invocation",
                invocation_id=state["invocation_id"],
                grounding_score=context_package.grounding_score,
            )

            return updated_state

        except (
            ConnectionError,
            TimeoutError,
            ValueError,
            KeyError,
            AttributeError,
            RuntimeError,
        ) as e:
            # Wrap the underlying exception in our custom exception type
            context_error = ContextIntegrationError(f"Context integration failed: {e}", state["invocation_id"])
            logger.warning(
                "Context integration failed for invocation. Proceeding with original prompt.",
                invocation_id=state["invocation_id"],
                error=str(context_error),
            )

            # Graceful fallback: use original prompt without context
            fallback_state = copy.deepcopy(state)
            fallback_state["context_package"] = None
            return fallback_state

    def _format_context_prompt(self, original_prompt: str, context_payload: dict[str, Any]) -> str:
        """Format context payload into enhanced prompt.

        Based on PR 168 prompt enhancement format.

        Args:
            original_prompt: User's original prompt
            context_payload: Context data from ContextManagerPlanner

        Returns:
            Enhanced prompt with context appended

        """
        if not context_payload:
            return original_prompt

        # Format context sections
        context_sections = []
        for key, value in context_payload.items():
            context_sections.append(f"## {key}\n{value}")

        formatted_context = "\n\n".join(context_sections)

        # Append context with clear delimiters
        return f"""{original_prompt}

--- CONTEXT ---
{formatted_context}
--- END CONTEXT ---"""

    def _route_request(self, state: AgentState) -> AgentState:
        """Route request to appropriate specialist agent.

        Uses simple keyword-based routing as agreed in planning session.

        Args:
            state: Current state with enhanced prompt

        Returns:
            State with current_agent set to target agent

        """
        start = time.perf_counter()
        prompt_lower = state["original_prompt"].lower()

        # Simple keyword matching for workflow generation
        if any(keyword in prompt_lower for keyword in self.WORKFLOW_KEYWORDS):
            target_agent = (
                AgentRoutes.GENERIC_AGENT
            )  # Routing to generic agent in both conditions, to keep space for workflow agent
            logger.debug("Routing based on workflow keywords", target_agent=target_agent)
        else:
            # Default to generic agent
            target_agent = AgentRoutes.GENERIC_AGENT
            logger.debug("Routing to default agent", target_agent=target_agent)

        # Update state with routing decision
        routed_state = copy.deepcopy(state)
        routed_state["current_agent"] = target_agent

        duration_ms = (time.perf_counter() - start) * 1000
        recorder = get_metrics_recorder()
        recorder.record(
            MetricType.AGENT_ROUTING_DURATION,
            duration_ms,
            unit="ms",
            labels={
                "invocation_id": state["invocation_id"],
                "target_agent": target_agent,
            },
        )

        return routed_state
