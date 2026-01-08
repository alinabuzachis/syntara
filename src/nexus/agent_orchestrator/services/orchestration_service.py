"""OrchestrationService for LangGraph-based agent coordination.

This service manages the LangGraph state machine that coordinates
multiple specialized agents with context integration and checkpointing.
"""

import copy
import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any, cast
from uuid import UUID

from langchain_core.tools import BaseTool
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph
from langgraph.graph.state import CompiledStateGraph

if TYPE_CHECKING:
    from langchain_core.runnables import RunnableConfig

from nexus.agent_orchestrator.agents.generic_agent import GenericAgent
from nexus.agent_orchestrator.agents.orchestrator_agent import OrchestratorAgent
from nexus.agent_orchestrator.constants import AgentRoutes
from nexus.agent_orchestrator.context_manager.planner import ContextManagerPlanner
from nexus.agent_orchestrator.models.agent_response import GenericAgentResponse
from nexus.agent_orchestrator.models.agent_state import AgentState, AgentStateFactory
from nexus.agent_orchestrator.models.streaming_events import CompletionEventData, DeltaEventData
from nexus.agent_orchestrator.services.error_handler import classify_streaming_error
from nexus.agent_orchestrator.services.streaming_service import get_invocation_stream_id
from nexus.agent_orchestrator.tool_manager import ToolSynchronizer
from nexus.core.valkey.stream import StreamClient

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

    async def _get_tools(self, invocation_id: UUID) -> list[BaseTool]:
        """Get available tools for the agent execution.

        Performs tool discovery and synchronization to ensure all available
        tools are properly registered and accessible for the current invocation.

        Args:
            invocation_id: Unique identifier for the current invocation

        Returns:
            List of synchronized BaseTool instances available for agent use

        """
        synchronizer = ToolSynchronizer(invocation_id)
        return await synchronizer.synchronize_tools()

    async def execute(
        self, prompt: str, session_id: str, invocation_id: UUID, correlation_id: str | None = None
    ) -> dict[str, Any]:
        """Execute agent orchestration with LLM streaming through LangGraph.

        Uses LangGraph's astream_events() to capture LLM streaming deltas and publish
        them to Valkey for WebSocket clients to consume.

        Args:
            prompt: User's prompt to process
            session_id: Session identifier for multi-turn tracking
            invocation_id: Invocation UUID
            correlation_id: Optional correlation ID for distributed tracing

        Returns:
            Agent execution result with context enhancement metadata (dict format for DB storage)

        Raises:
            Any exceptions from LLM API or streaming infrastructure

        """
        logger.info("Executing streaming orchestration for invocation %s", invocation_id)

        stream_id = get_invocation_stream_id(invocation_id)

        # Create initial state
        initial_state = AgentStateFactory.create_initial_state(
            prompt=prompt, session_id=session_id, invocation_id=invocation_id, correlation_id=correlation_id
        )

        async with StreamClient() as client:
            try:
                # Execute graph with streaming events
                config: RunnableConfig = cast("RunnableConfig", {"configurable": {"thread_id": session_id}})

                # Track final state to capture context metadata
                final_state: AgentState | None = None

                # Stream events from LangGraph
                async for event in self.graph.astream_events(initial_state, config, version="v2"):
                    # Process streaming events (event is StandardStreamEvent | CustomStreamEvent)
                    event_dict = cast("dict[str, Any]", event)
                    await self._process_streaming_event(event_dict, invocation_id, stream_id, client)

                    # Capture final state from graph end events
                    if event_dict.get("event") == "on_chain_end" and event_dict.get("name") == "LangGraph":
                        data = event_dict.get("data")
                        if isinstance(data, dict):
                            final_state = cast("AgentState | None", data.get("output"))

                # Publish completion event
                await self._publish_completion_event(invocation_id, stream_id, client)

                logger.info("Streaming orchestration completed (invocation_id=%s)", invocation_id)

                # Build response with streaming metadata and context enhancement
                return self._build_streaming_result(invocation_id, stream_id, final_state)

            except Exception as e:
                # Handle streaming errors
                await self._handle_streaming_error(e, invocation_id, stream_id, client)
                raise

    async def _process_streaming_event(
        self, event: dict[str, Any], invocation_id: UUID, stream_id: str, client: StreamClient
    ) -> None:
        """Process a single streaming event from LangGraph.

        Args:
            event: Event dictionary from astream_events()
            invocation_id: Invocation UUID
            stream_id: Valkey stream ID
            client: StreamClient for publishing events

        """
        # Filter for LLM streaming events
        event_type = event.get("event")
        if event_type == "on_chat_model_stream":
            data = event.get("data")
            if isinstance(data, dict):
                chunk = data.get("chunk")
                if chunk is not None:
                    content = chunk.content if hasattr(chunk, "content") else None

                    if content:
                        # Publish delta event to Valkey
                        delta_data = DeltaEventData(delta=content)
                        delta_event = {
                            "event_type": "delta",
                            "invocation_id": str(invocation_id),
                            "timestamp": datetime.now(UTC).isoformat(),
                            "data": delta_data.to_dict(),
                        }
                        await client.publish(stream_id, delta_event)
                        logger.debug("Published delta event (invocation_id=%s)", invocation_id)

    async def _publish_completion_event(self, invocation_id: UUID, stream_id: str, client: StreamClient) -> None:
        """Publish completion event to Valkey.

        Args:
            invocation_id: Invocation UUID
            stream_id: Valkey stream ID
            client: StreamClient for publishing

        """
        completion_data = CompletionEventData()
        completion_event = {
            "event_type": "completion",
            "invocation_id": str(invocation_id),
            "timestamp": datetime.now(UTC).isoformat(),
            "data": completion_data.to_dict(),
        }
        await client.publish(stream_id, completion_event)

    async def _handle_streaming_error(
        self,
        exception: Exception,
        invocation_id: UUID,
        stream_id: str,
        client: StreamClient,
    ) -> None:
        """Handle streaming error with logging and event publishing.

        Args:
            exception: The exception that occurred
            invocation_id: Invocation UUID
            stream_id: Valkey stream ID
            client: StreamClient for publishing events

        """
        logger.exception("Streaming orchestration failed (invocation_id=%s)", invocation_id)

        # Publish error event with RFC 9457 classification
        error_data = classify_streaming_error(exception, invocation_id=invocation_id)
        error_event = {
            "event_type": "error",
            "invocation_id": str(invocation_id),
            "timestamp": datetime.now(UTC).isoformat(),
            "data": error_data.to_dict(),
        }
        await client.publish(stream_id, error_event)

    def _build_streaming_result(
        self, invocation_id: UUID, stream_id: str, final_state: AgentState | None = None
    ) -> dict[str, Any]:
        """Build result dictionary with streaming metadata and context enhancement.

        Args:
            invocation_id: Invocation UUID
            stream_id: Valkey stream ID
            final_state: Final LangGraph state containing context metadata and result

        Returns:
            Result dictionary for database storage with context enhancement metadata

        """
        # If we have final state with result, use that as the base (includes actual LLM response)
        if final_state and final_state.get("result"):
            enhanced_result = final_state["result"]
            if isinstance(enhanced_result, dict):
                return self._enhance_result_with_streaming_metadata(enhanced_result, stream_id)

        # Fallback: Build placeholder response if no final state available
        return self._build_fallback_response(invocation_id, stream_id)

    def _get_model_name(self) -> str:
        """Safely extract model name from LLM instance.

        Returns:
            Model name string, or "unknown" if unavailable

        """
        if hasattr(self.llm, "model_name"):
            try:
                return str(self.llm.model_name)
            except (AttributeError, TypeError, ValueError):
                return "unknown"
        return "unknown"

    def _enhance_result_with_streaming_metadata(self, result: dict[str, Any], stream_id: str) -> dict[str, Any]:
        """Enhance result with streaming metadata.

        Args:
            result: Result dictionary to enhance
            stream_id: Valkey stream ID

        Returns:
            Enhanced result with streaming metadata

        """
        enhanced = result.copy()

        # Add streaming metadata to response_metadata
        if "response_metadata" not in enhanced:
            enhanced["response_metadata"] = {}

        enhanced["response_metadata"]["source"] = "streaming"
        enhanced["response_metadata"]["stream_id"] = stream_id
        enhanced["response_metadata"]["orchestration"] = "langgraph"
        enhanced["response_metadata"]["model"] = self._get_model_name()

        return enhanced

    def _build_fallback_response(self, invocation_id: UUID, stream_id: str) -> dict[str, Any]:
        """Build fallback response when final state is unavailable.

        Args:
            invocation_id: Invocation UUID
            stream_id: Valkey stream ID

        Returns:
            Fallback response dictionary

        """
        ws_endpoint = f"/ws/agent_orchestrator/v1/invocations/{invocation_id}"
        content_msg = f"Response streamed successfully. Connect to WebSocket endpoint {ws_endpoint} to view events."

        response = GenericAgentResponse(
            type="answer",
            content=content_msg,
            response_metadata={
                "source": "streaming",
                "stream_id": stream_id,
                "model": self._get_model_name(),
                "orchestration": "langgraph",
            },
        )

        return response.model_dump()

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
