"""OrchestrationService for LangGraph-based agent coordination.

This service manages the LangGraph state machine that coordinates
multiple specialized agents with context integration and checkpointing.
"""

import asyncio
import logging
from collections.abc import Callable, Coroutine
from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID

import httpx
from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import BaseTool
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph
from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import ToolNode

from nexus.agent_orchestrator.agents.generic_agent import GenericAgent
from nexus.agent_orchestrator.agents.orchestrator_agent import OrchestratorAgent
from nexus.agent_orchestrator.constants import AgentRoutes
from nexus.agent_orchestrator.context_manager.planner import ContextManagerPlanner
from nexus.agent_orchestrator.models.agent_response import GenericAgentResponse
from nexus.agent_orchestrator.models.agent_state import AgentState, AgentStateFactory
from nexus.agent_orchestrator.models.streaming_events import (
    CompletionEventData,
    DeltaEventData,
    ToolCallEventData,
    ToolResultEventData,
)
from nexus.agent_orchestrator.services.error_handler import classify_streaming_error
from nexus.agent_orchestrator.services.streaming_service import get_invocation_stream_id
from nexus.agent_orchestrator.tool_manager import ToolSynchronizer
from nexus.agent_orchestrator.tool_manager.execution_failure_handler import (
    create_tool_awrapper,
    create_tool_wrapper,
)
from nexus.agent_orchestrator.utils.workflow_signal_client import WorkflowSignalClient
from nexus.core.cache.stream import StreamClient

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

    async def _setup_graph(self, state: AgentState) -> CompiledStateGraph[AgentState, None, Any, Any]:
        """Set up the LangGraph state machine with ToolNode integration.

        Returns:
            Compiled LangGraph state machine

        """
        logger.info("Initializing LangGraph orchestration with ToolNode support")

        # Create state graph
        workflow = StateGraph(AgentState)

        # Add agent nodes
        invocation_id: UUID = UUID(state["invocation_id"])
        available_tools: list[BaseTool] = await self._get_tools(invocation_id)

        workflow.add_node(AgentRoutes.ORCHESTRATOR, self._create_orchestrator_node())
        workflow.add_node(AgentRoutes.GENERIC_AGENT, self._create_generic_agent_node(available_tools))
        workflow.add_node(
            AgentRoutes.TOOLS,
            self._create_tool_node(available_tools),
        )

        # Set entry point to ToolNode
        workflow.set_entry_point(AgentRoutes.ORCHESTRATOR)

        # Add conditional edges from orchestrator to specialist agents
        workflow.add_conditional_edges(
            AgentRoutes.ORCHESTRATOR,
            self._route_after_orchestrator,
            {
                AgentRoutes.GENERIC_AGENT: AgentRoutes.GENERIC_AGENT,
            },
        )

        # Add conditional edges from GenericAgent to Tools
        workflow.add_conditional_edges(AgentRoutes.GENERIC_AGENT, self._should_call_tools, [AgentRoutes.TOOLS, END])

        # Tools to GenericAgent route
        workflow.add_edge(AgentRoutes.TOOLS, AgentRoutes.GENERIC_AGENT)

        # Compile graph with checkpointing for multi-turn support
        checkpointer = MemorySaver()
        graph = workflow.compile(checkpointer=checkpointer)

        logger.info("LangGraph orchestration with ToolNode initialized successfully")
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
        self,
        prompt: str,
        session_id: str,
        invocation_id: UUID,
        correlation_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Execute agent orchestration with LLM streaming through LangGraph.

        Uses LangGraph's astream_events() to capture LLM streaming deltas and publish
        them to Valkey for WebSocket clients to consume.

        Args:
            prompt: User's prompt to process
            session_id: Session identifier for multi-turn tracking
            invocation_id: Invocation UUID
            correlation_id: Optional correlation ID for distributed tracing
            metadata: Optional metadata from invocation context_data (e.g., callback_url)

        Returns:
            Agent execution result with context enhancement metadata (dict format for DB storage)

        Raises:
            Any exceptions from LLM API or streaming infrastructure

        """
        logger.info("Executing streaming orchestration for invocation %s", invocation_id)

        stream_id = get_invocation_stream_id(invocation_id)

        # Create initial state
        initial_state = AgentStateFactory.create_initial_state(
            prompt=prompt,
            session_id=session_id,
            invocation_id=invocation_id,
            correlation_id=correlation_id,
            metadata=metadata,
        )

        graph: CompiledStateGraph[AgentState, None, Any, Any] = await self._setup_graph(initial_state)

        async with StreamClient() as client:
            try:
                # Execute graph with streaming events
                config: RunnableConfig = cast("RunnableConfig", {"configurable": {"thread_id": session_id}})
                final_state = await self._execute_graph_streaming(
                    graph, initial_state, config, invocation_id, stream_id, client
                )

                # Publish completion event
                await self._publish_completion_event(invocation_id, stream_id, client)

                # Handle completion callback
                await self._handle_completion_callback(final_state, invocation_id)

                logger.info("Streaming orchestration completed (invocation_id=%s)", invocation_id)

                # Build response with streaming metadata and context enhancement
                return self._build_streaming_result(invocation_id, stream_id, final_state)

            except Exception as e:
                # Handle streaming errors
                logger.exception(
                    "Exception in orchestration service (invocation_id=%s, error_type=%s)",
                    invocation_id,
                    type(e).__name__,
                )
                await self._handle_streaming_error(e, invocation_id, stream_id, client)

                # Send failure signal to workflow if callback_url is present
                callback_url = metadata.get("callback_url") if metadata else None
                await WorkflowSignalClient.send_failure_signal(callback_url, invocation_id, e)

                raise

    async def _execute_graph_streaming(
        self,
        graph: CompiledStateGraph[AgentState, None, Any, Any],
        initial_state: AgentState,
        config: RunnableConfig,
        invocation_id: UUID,
        stream_id: str,
        client: StreamClient,
    ) -> AgentState | None:
        """Execute graph with streaming and capture final state.

        Args:
            graph: Compiled LangGraph state machine
            initial_state: Initial agent state
            config: Runnable config with thread_id
            invocation_id: Invocation UUID
            stream_id: Valkey stream ID
            client: StreamClient for publishing events

        Returns:
            Final agent state or None if not captured

        """
        final_state: AgentState | None = None

        # Stream events from LangGraph
        async for event in graph.astream_events(initial_state, config, version="v2"):
            # Process streaming events (event is StandardStreamEvent | CustomStreamEvent)
            event_dict = cast("dict[str, Any]", event)
            await self._process_streaming_event(event_dict, invocation_id, stream_id, client)

            # Capture final state from graph end events
            final_state = self._extract_final_state(event_dict, final_state)

        return final_state

    def _extract_final_state(
        self, event_dict: dict[str, Any], current_final_state: AgentState | None
    ) -> AgentState | None:
        """Extract final state from graph end event.

        Args:
            event_dict: Event dictionary from astream_events
            current_final_state: Current captured final state

        Returns:
            Updated final state or current state if not a graph end event

        """
        if event_dict.get("event") == "on_chain_end" and event_dict.get("name") == "LangGraph":
            data = event_dict.get("data")
            if isinstance(data, dict):
                return cast("AgentState | None", data.get("output"))

        return current_final_state

    async def _handle_completion_callback(self, final_state: AgentState | None, invocation_id: UUID) -> None:
        """Handle completion callback with error handling.

        Args:
            final_state: Final agent state with callback metadata
            invocation_id: Invocation UUID for logging

        """
        logger.info(
            "Checking for completion callback (invocation_id=%s, has_final_state=%s)",
            invocation_id,
            final_state is not None,
        )

        if not final_state:
            logger.warning("No final_state available for callback (invocation_id=%s)", invocation_id)
            return

        try:
            await self._send_completion_callback(final_state, invocation_id)
        except (httpx.RequestError, httpx.HTTPStatusError, httpx.TimeoutException):
            logger.exception("Activity signal failed for invocation %s", invocation_id)
            # Continue without failing - notification is not critical
        except Exception:
            logger.exception("Unexpected error during activity signal for invocation %s", invocation_id)
            # Continue without failing - notification is not critical

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
        event_type = event.get("event")

        # Handle LLM streaming events
        if event_type == "on_chat_model_stream":
            await self._process_chat_stream_event(event, invocation_id, stream_id, client)

        # Handle tool start events
        elif event_type == "on_tool_start":
            await self._process_tool_start_event(event, invocation_id, stream_id, client)

        # Handle tool end events
        elif event_type == "on_tool_end":
            await self._process_tool_end_event(event, invocation_id, stream_id, client)

    async def _process_chat_stream_event(
        self, event: dict[str, Any], invocation_id: UUID, stream_id: str, client: StreamClient
    ) -> None:
        """Process LLM chat model streaming event.

        Args:
            event: Event dictionary from astream_events()
            invocation_id: Invocation UUID
            stream_id: Valkey stream ID
            client: StreamClient for publishing events

        """
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

    async def _process_tool_start_event(
        self, event: dict[str, Any], invocation_id: UUID, stream_id: str, client: StreamClient
    ) -> None:
        """Process tool execution start event.

        Args:
            event: Event dictionary from astream_events()
            invocation_id: Invocation UUID
            stream_id: Valkey stream ID
            client: StreamClient for publishing events

        """
        tool_name = event.get("name", "unknown")
        data = event.get("data", {})
        tool_input = data.get("input", {}) if isinstance(data, dict) else {}

        logger.info("Tool call started: %s (invocation_id=%s)", tool_name, invocation_id)

        tool_call_data = ToolCallEventData(tool_name=tool_name, tool_input=tool_input)
        tool_call_event = {
            "event_type": "tool_call",
            "invocation_id": str(invocation_id),
            "timestamp": datetime.now(UTC).isoformat(),
            "data": tool_call_data.to_dict(),
        }
        await client.publish(stream_id, tool_call_event)

    async def _process_tool_end_event(
        self, event: dict[str, Any], invocation_id: UUID, stream_id: str, client: StreamClient
    ) -> None:
        """Process tool execution end event.

        Args:
            event: Event dictionary from astream_events()
            invocation_id: Invocation UUID
            stream_id: Valkey stream ID
            client: StreamClient for publishing events

        """
        tool_name = event.get("name", "unknown")
        data = event.get("data", {})

        # Extract tool output - handle both raw strings and ToolMessage objects
        raw_output = data.get("output", "") if isinstance(data, dict) else ""
        tool_output = str(raw_output.content) if hasattr(raw_output, "content") else str(raw_output)

        logger.info("Tool call completed: %s (invocation_id=%s)", tool_name, invocation_id)

        tool_result_data = ToolResultEventData(tool_name=tool_name, tool_output=tool_output)
        tool_result_event = {
            "event_type": "tool_result",
            "invocation_id": str(invocation_id),
            "timestamp": datetime.now(UTC).isoformat(),
            "data": tool_result_data.to_dict(),
        }
        await client.publish(stream_id, tool_result_event)

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

    async def _send_completion_callback(self, final_state: AgentState, invocation_id: UUID) -> None:
        """Send completion callback to workflow after agent execution.

        Sends HTTP callback to workflow when agent completes, replicating the functionality
        previously handled by NotificationNode.

        Args:
            final_state: Final state containing agent result and metadata
            invocation_id: Invocation UUID for logging

        """
        logger.info(
            "CALLBACK CHECK: Checking completion callback for invocation %s (final_state_keys=%s)",
            invocation_id,
            list(final_state.keys()) if final_state else None,
        )

        # Extract callback URL from metadata
        metadata = final_state.get("metadata") or {}
        callback_url = metadata.get("callback_url")

        logger.info(
            "CALLBACK CHECK: callback_url=%s, has_metadata=%s (invocation %s)",
            callback_url,
            metadata is not None,
            invocation_id,
        )

        if not callback_url:
            logger.warning(
                "No callback_url found in metadata for invocation %s, skipping callback (metadata=%s)",
                invocation_id,
                metadata,
            )
            return

        # Extract agent result
        result = final_state.get("result")
        if not result:
            logger.warning("No result found in final_state for callback (invocation %s)", invocation_id)
            return

        logger.info("CALLBACK: Sending activity signal to %s (invocation %s)", callback_url, invocation_id)
        # Send the activity signal
        await WorkflowSignalClient.send_success_signal(callback_url, invocation_id, result)

    # ===============================
    # Nodes
    # -------------------------------

    def _create_orchestrator_node(self) -> Callable[..., Coroutine[Any, Any, AgentState]]:
        async def _orchestrator_node(state: AgentState) -> AgentState:
            """Execute orchestrator agent node.

            Args:
                state: Current graph state

            Returns:
                Updated state with context integration and routing

            """
            orchestrator = OrchestratorAgent(self.context_manager)
            return await orchestrator.execute(state)

        return _orchestrator_node

    def _create_generic_agent_node(
        self, available_tools: list[BaseTool]
    ) -> Callable[..., Coroutine[Any, Any, AgentState]]:
        async def _generic_agent_node(state: AgentState) -> AgentState:
            """Execute generic agent node.

            Args:
                state: Current graph state

            Returns:
                State with generic agent result

            """
            # Use direct import
            agent_class = GenericAgent

            logger.info("Executing GenericAgent for invocation %s", state["invocation_id"])

            agent = agent_class(llm=self.llm, available_tools=available_tools)
            updated_state = await agent.execute_as_node(state)

            # Enhance result with context metadata if available
            self._enhance_result_with_context_metadata(updated_state)

            return updated_state

        return _generic_agent_node

    def _create_tool_node(self, tools: list[BaseTool]) -> ToolNode:
        """Create ToolNode with retry error handling for both sync and async tools."""
        # Get the current event loop to pass to sync wrapper for reliable tool disable operations
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        # Create ToolNode with both sync and async wrappers for comprehensive failure handling
        return ToolNode(
            tools,
            awrap_tool_call=create_tool_awrapper(),  # For async tool execution
            wrap_tool_call=create_tool_wrapper(loop),  # For sync tool execution
        )

    # ===============================

    # ===============================
    # Conditional routing
    # -------------------------------

    def _route_after_orchestrator(self, state: AgentState) -> str:
        """Determine routing after orchestrator execution.

        Args:
            state: Current graph state after orchestrator

        Returns:
            Target agent route

        """
        return state["current_agent"]

    def _should_call_tools(self, state: AgentState) -> str:
        """Decide if we should continue the loop or stop based upon whether the LLM requires a tool call."""
        messages = state["messages"]
        last_message = messages[-1]

        # If the LLM needs a tool call, then route to our ToolNode
        if isinstance(last_message, AIMessage) and last_message.tool_calls:
            return AgentRoutes.TOOLS

        # Otherwise, we stop (reply to the user)
        return END

    # ===============================

    def _enhance_result_with_context_metadata(self, state: AgentState) -> None:
        """Enhance AgentState with context metadata.

        Args:
            state: Current state with context information

        """
        # Add context enhancement metadata if available
        result = state.get("result")
        context_package = state.get("context_package")
        if result is not None and context_package is not None:
            # Use correlation_id from context package when context is applied
            result["correlation_id"] = context_package["correlation_id"]
            result["grounding_score"] = context_package["grounding_score"]
            result["context_enhancement"] = {
                "turn_id": context_package["package_id"],  # Use turn_id as per API schema
                "citations": context_package["citations"],
                "context_applied": context_package["context_applied"],
            }
        elif result is not None:
            # Use correlation_id from state when no context is applied
            result["correlation_id"] = state.get("correlation_id")
