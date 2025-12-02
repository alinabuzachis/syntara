"""OrchestrationService for LangGraph-based agent coordination.

This service manages the LangGraph state machine that coordinates
multiple specialized agents with context integration and checkpointing.
"""

import copy
import logging
from typing import Any, cast
from uuid import UUID

from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph
from langgraph.graph.state import CompiledStateGraph

from nexus.agent_orchestrator.agents.generic_agent import GenericAgent
from nexus.agent_orchestrator.agents.orchestrator_agent import OrchestratorAgent
from nexus.agent_orchestrator.constants import AgentRoutes
from nexus.agent_orchestrator.context_manager.planner import ContextManagerPlanner
from nexus.agent_orchestrator.models.agent_state import AgentState, AgentStateFactory

logger = logging.getLogger(__name__)


class OrchestrationService:
    """Service for managing LangGraph-based agent orchestration.

    This service:
    1. Sets up the LangGraph state machine with agent nodes
    2. Manages routing between orchestrator, generic_agent, and workflow_generator
    3. Handles checkpointing for multi-turn conversations
    4. Provides execution interface for the InvocationService
    """

    def __init__(self, llm: ChatOpenAI, context_manager_planner: ContextManagerPlanner) -> None:
        """Initialize the orchestration service.

        Args:
            llm: Language model for agent execution
            context_manager_planner: Context manager for prompt enhancement

        """
        self.llm = llm
        self.context_manager = context_manager_planner
        self.graph = self._setup_graph()

    def _setup_graph(self) -> CompiledStateGraph[AgentState, None, Any, Any]:
        """Set up the LangGraph state machine.

        Returns:
            Compiled LangGraph state machine

        """
        logger.info("Initializing LangGraph orchestration")

        # Create state graph
        workflow = StateGraph(AgentState)

        # Add agent nodes
        workflow.add_node(AgentRoutes.ORCHESTRATOR, self._orchestrator_node)
        workflow.add_node(AgentRoutes.GENERIC_AGENT, self._generic_agent_node)

        # Set entry point
        workflow.set_entry_point(AgentRoutes.ORCHESTRATOR)

        # Add conditional edges from orchestrator to specialist agents
        workflow.add_conditional_edges(
            AgentRoutes.ORCHESTRATOR,
            self._route_after_orchestrator,
            {
                AgentRoutes.GENERIC_AGENT: AgentRoutes.GENERIC_AGENT,
            },
        )

        # Generic agent ends execution
        workflow.add_edge(AgentRoutes.GENERIC_AGENT, END)

        # Compile graph with checkpointing for multi-turn support
        checkpointer = MemorySaver()
        graph = workflow.compile(checkpointer=checkpointer)

        logger.info("LangGraph orchestration initialized successfully")
        return graph

    async def execute(
        self, prompt: str, session_id: str, invocation_id: UUID, correlation_id: str | None = None
    ) -> dict[str, Any]:
        """Execute agent orchestration through LangGraph.

        Args:
            prompt: User's prompt to process
            session_id: Session identifier for multi-turn tracking
            invocation_id: Invocation UUID
            correlation_id: Optional correlation ID for distributed tracing

        Returns:
            Agent execution result with context enhancement metadata

        """
        logger.info("Executing orchestration for invocation %s", invocation_id)

        # Create initial state
        initial_state = AgentStateFactory.create_initial_state(
            prompt=prompt, session_id=session_id, invocation_id=invocation_id, correlation_id=correlation_id
        )

        try:
            # Execute graph with session-based checkpointing
            config = {"configurable": {"thread_id": session_id}}

            result = await self.graph.ainvoke(initial_state, config=cast("Any", config))

            logger.info("Orchestration completed for invocation %s", invocation_id)

            # Ensure we return the result as expected dict[str, Any]
            if isinstance(result, dict) and "result" in result:
                return cast("dict[str, Any]", result["result"])
            return cast("dict[str, Any]", result)

        except Exception:
            logger.exception("Orchestration failed for invocation %s", invocation_id)
            raise

    async def _orchestrator_node(self, state: AgentState) -> AgentState:
        """Execute orchestrator agent node.

        Args:
            state: Current graph state

        Returns:
            Updated state with context integration and routing

        """
        orchestrator = OrchestratorAgent(self.context_manager)
        return await orchestrator.execute(state)

    async def _generic_agent_node(self, state: AgentState) -> AgentState:
        """Execute generic agent node.

        Args:
            state: Current graph state

        Returns:
            State with generic agent result

        """
        # Use direct import
        agent_class = GenericAgent

        logger.info("Executing GenericAgent for invocation %s", state["invocation_id"])

        agent = agent_class(self.llm)
        result = await agent.execute_as_node(state)

        # Enhance result with context metadata if available
        enhanced_result = self._enhance_result_with_context(result, state)

        updated_state = copy.deepcopy(state)
        updated_state["result"] = enhanced_result

        return updated_state

    def _route_after_orchestrator(self, state: AgentState) -> str:
        """Determine routing after orchestrator execution.

        Args:
            state: Current graph state after orchestrator

        Returns:
            Target agent route

        """
        return state["current_agent"]

    def _enhance_result_with_context(self, base_result: dict[str, Any], state: AgentState) -> dict[str, Any]:
        """Enhance agent result with context metadata.

        Based on PR 168 enhanced response format.

        Args:
            base_result: Base result from agent execution
            state: Current state with context information

        Returns:
            Enhanced result with context metadata

        """
        enhanced_result = base_result.copy()

        # Add context enhancement metadata if available
        context_package = state.get("context_package")
        if context_package:
            # Use correlation_id from context package when context is applied
            enhanced_result["correlation_id"] = context_package["correlation_id"]
            enhanced_result["grounding_score"] = context_package["grounding_score"]
            enhanced_result["context_enhancement"] = {
                "turn_id": context_package["package_id"],  # Use turn_id as per API schema
                "citations": context_package["citations"],
                "context_applied": context_package["context_applied"],
            }
        else:
            # Use correlation_id from state when no context is applied
            enhanced_result["correlation_id"] = state["correlation_id"]

        return enhanced_result
