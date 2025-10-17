"""ReAct Agent Implementation with Nexus Metadata Support.

General-purpose conversational agent using ReAct pattern with tool calling capabilities.
Supports dynamic configuration via nexus:agentConfig metadata.

Agent Card: examples/agent_cards/react_agent.json
Port: 8001
Protocol: A2A
"""

import ast
import logging
import operator
from collections.abc import AsyncGenerator, Callable
from typing import TYPE_CHECKING, Any, cast

from langchain_community.tools import DuckDuckGoSearchRun  # type: ignore[import-not-found]
from langchain_core.tools import BaseTool, tool  # type: ignore[import-not-found]
from langchain_openai import ChatOpenAI  # type: ignore[import-not-found]
from langgraph.prebuilt import create_react_agent  # type: ignore[import-not-found]

# Use relative imports due to module execution pattern (python -m src.nexus_agents)
# When running as a module, PYTHONPATH is /app and module is src.nexus_agents
# Absolute imports like 'from nexus_agents.core' would fail with ModuleNotFoundError
from ..core.base_agent import AgentConfig, AgentDefaults, BaseAgentWithMetadata  # noqa: TID252

if TYPE_CHECKING:
    from a2a.server.request_handlers import DefaultRequestHandler

logger = logging.getLogger(__name__)


def _safe_eval_expression(expression: str) -> float | int:  # noqa: C901
    """Safely evaluate a mathematical expression using AST.

    This function parses the expression into an AST and evaluates it
    without using eval(), preventing code injection attacks.

    Complexity is justified: each node type requires explicit validation
    for security (preventing code injection in calculator tool).

    Args:
        expression: Mathematical expression to evaluate (e.g., "2 + 2 * 3")

    Returns:
        Result of the calculation

    Raises:
        ValueError: If expression contains unsafe operations
        SyntaxError: If expression is not valid Python syntax
        TypeError: If expression contains invalid types

    """
    # Define safe operations with proper types
    safe_operators: dict[type[ast.operator | ast.unaryop], Callable[..., Any]] = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
        ast.FloorDiv: operator.floordiv,
        ast.Mod: operator.mod,
        ast.Pow: operator.pow,
        ast.USub: operator.neg,
        ast.UAdd: operator.pos,
    }

    # Define safe functions with proper types
    safe_functions: dict[str, Callable[..., Any]] = {
        "abs": abs,
        "round": round,
        "min": min,
        "max": max,
        "sum": sum,
        "pow": pow,
    }

    def eval_node(node: ast.expr) -> float | int:
        """Recursively evaluate an AST node."""
        if isinstance(node, ast.Constant):  # Numbers
            if not isinstance(node.value, int | float):
                msg = f"Only numeric constants allowed, got {type(node.value).__name__}"
                raise TypeError(msg)
            # node.value is confirmed to be int | float by the check above
            return node.value
        if isinstance(node, ast.BinOp):  # Binary operations: +, -, *, /, etc.
            left = eval_node(node.left)
            right = eval_node(node.right)
            bin_op_type = type(node.op)
            if bin_op_type not in safe_operators:
                msg = f"Unsupported operator: {bin_op_type.__name__}"
                raise ValueError(msg)
            return cast("float | int", safe_operators[bin_op_type](left, right))
        if isinstance(node, ast.UnaryOp):  # Unary operations: -, +
            operand = eval_node(node.operand)
            unary_op_type = type(node.op)
            if unary_op_type not in safe_operators:
                msg = f"Unsupported unary operator: {unary_op_type.__name__}"
                raise ValueError(msg)
            return cast("float | int", safe_operators[unary_op_type](operand))
        if isinstance(node, ast.Call):  # Function calls: abs(), min(), etc.
            if not isinstance(node.func, ast.Name):
                msg = "Only simple function calls allowed"
                raise TypeError(msg)
            func_name = node.func.id
            if func_name not in safe_functions:
                msg = f"Unsupported function: {func_name}"
                raise ValueError(msg)
            args = [eval_node(arg) for arg in node.args]
            return cast("float | int", safe_functions[func_name](*args))
        msg = f"Unsupported expression type: {type(node).__name__}"
        raise ValueError(msg)

    # Parse and evaluate
    tree = ast.parse(expression, mode="eval")
    return eval_node(tree.body)


class GenericAgent(BaseAgentWithMetadata):
    """ReAct Agent with metadata-based dynamic configuration.

    Capabilities:
    - Multi-turn conversational interaction
    - Tool discovery and use via MCP server
    - Step-by-step reasoning using ReAct pattern
    - Web search and calculations
    - Dynamic configuration via nexus:agentConfig
    """

    def __init__(self, checkpoint_uri: str) -> None:
        """Initialize ReAct agent with default configuration from agent card.

        Args:
            checkpoint_uri: PostgreSQL connection string for checkpointer

        """
        # Initialize base with defaults from react_agent.json
        defaults = AgentDefaults(
            agent_name="generic-agent",
            model="anthropic/claude-3.5-sonnet",
            temperature=0.7,
            max_tokens=4096,
            system_prompt=(
                "You are a helpful, harmless, and honest AI assistant. "
                "You use tools to answer questions accurately and provide "
                "step-by-step reasoning when solving problems."
            ),
            tools=["web_search", "calculator"],
        )
        super().__init__(defaults)

        # Setup PostgreSQL checkpointer
        self.checkpoint_uri = checkpoint_uri
        self.checkpointer = None  # Will be initialized in async context
        self._checkpointer_cm = None  # Context manager for checkpointer

        # Tool registry
        self.available_tools = {
            "web_search": self._create_web_search_tool(),
            "calculator": self._create_calculator_tool(),
        }

    def _create_web_search_tool(self) -> DuckDuckGoSearchRun:
        """Create web search tool."""
        return DuckDuckGoSearchRun(name="web_search")

    def _create_calculator_tool(self) -> BaseTool:
        """Create calculator tool."""

        @tool  # type: ignore[misc]
        def calculator(expression: str) -> str:
            """Evaluate a mathematical expression.

            Args:
                expression: Mathematical expression to evaluate (e.g., "2 + 2 * 3")

            Returns:
                Result of the calculation

            """
            try:
                # Safe evaluation using AST parsing (no eval())
                result = _safe_eval_expression(expression)
                return str(result)
            except (ValueError, SyntaxError, TypeError) as e:
                return f"Error evaluating expression: {e}"

        return calculator

    def load_tools(self, tool_names: list[str]) -> list[BaseTool]:
        """Load tools based on configuration.

        Args:
            tool_names: List of tool names to load

        Returns:
            List of LangChain tool objects

        """
        tools = []
        for tool_name in tool_names:
            if tool_name in self.available_tools:
                tools.append(self.available_tools[tool_name])
            else:
                logger.warning(
                    "Tool '%s' not available, skipping",
                    tool_name,
                )

        return tools

    async def execute(
        self,
        message: str,
        thread_id: str,
        configuration: dict[str, Any],
        user_id: str | None = None,
    ) -> AsyncGenerator[str, None]:
        """Execute ReAct agent with dynamic configuration.

        This is the main execution method that:
        1. Extracts configuration from A2A metadata
        2. Creates LLM with dynamic config
        3. Loads configured tools
        4. Executes ReAct agent with streaming

        Args:
            message: User message to process
            thread_id: Thread ID for conversation state (maps to A2A context)
            configuration: A2A configuration object with metadata
            user_id: Optional user ID for observability

        Yields:
            Streaming response chunks

        """
        # 1. Get effective configuration (metadata > defaults)
        config: AgentConfig = self.get_effective_config(configuration)

        # 2. Log configuration application
        self.log_config_application(config, thread_id, user_id)

        # 3. Create LLM with dynamic configuration
        llm = ChatOpenAI(
            model=config.model,
            temperature=config.temperature,
            max_tokens=config.max_tokens,
            top_p=config.top_p,
            frequency_penalty=config.frequency_penalty,
            presence_penalty=config.presence_penalty,
        )

        # 4. Load tools based on configuration
        tools = self.load_tools(config.tools)

        # 5. Initialize checkpointer if not already done
        if self.checkpointer is None and self.checkpoint_uri:
            try:
                # Lazy import to avoid loading PostgreSQL dependencies at module import time
                from langgraph.checkpoint.postgres.aio import (  # type: ignore[import-not-found]  # noqa: PLC0415
                    AsyncPostgresSaver,
                )

                # Enter the async context manager to get the real checkpointer
                self._checkpointer_cm = AsyncPostgresSaver.from_conn_string(self.checkpoint_uri)
                self.checkpointer = await self._checkpointer_cm.__aenter__()  # type: ignore[attr-defined]

                # Ensure required tables exist (idempotent)
                await self.checkpointer.setup()  # type: ignore[attr-defined]

                logger.info("PostgreSQL checkpointer initialized for %s", self.agent_name)
            except (ImportError, ConnectionError, OSError, AttributeError, RuntimeError) as e:
                logger.warning("Failed to initialize checkpointer: %s. Conversation history will not be saved.", e)
                self.checkpointer = None

        # 6. Create ReAct agent with checkpointer
        agent = create_react_agent(
            model=llm,
            tools=tools,
            checkpointer=self.checkpointer,
        )

        # 7. Execute agent with streaming
        agent_config = {
            "configurable": {
                "thread_id": thread_id,
            }
        }

        async for chunk in agent.astream(
            {"messages": [{"role": "user", "content": message}]},
            config=agent_config,
        ):
            # LangGraph returns chunks with node names as keys
            # The agent node contains messages
            for key in chunk.keys() if isinstance(chunk, dict) else []:
                node_data = chunk[key]

                # Check if this node has messages
                if isinstance(node_data, dict) and "messages" in node_data:
                    messages = node_data["messages"]

                    for msg in messages:
                        # Yield AI/assistant messages (not user messages)
                        if hasattr(msg, "content") and msg.content:
                            # Check if this is an AI/assistant message
                            msg_type = getattr(msg, "type", None) or type(msg).__name__
                            if "ai" in msg_type.lower() or "assistant" in msg_type.lower():
                                yield msg.content


# A2A wrapper
class GenericAgentA2AServer:
    """A2A protocol wrapper for ReAct agent.

    Example Usage:
        # Standalone server
        server = GenericAgentA2AServer(
            checkpoint_uri="postgresql://postgres:postgres@localhost:5432/nexus"
        )

        # Get FastAPI app
        from a2a_sdk.server import create_fastapi_app
        app = create_fastapi_app(server.get_request_handler())

        # Or start directly
        import uvicorn
        uvicorn.run(app, host="0.0.0.0", port=8001)

        # With custom metadata configuration
        configuration = {
            "streaming": True,
            "context": "thread-123",
            "metadata": {
                "nexus:agentConfig": {
                    "model": "gpt-4o",
                    "temperature": 0.8,
                    "tools": ["web_search", "calculator"],
                    "systemPrompt": "Custom instructions...",
                    "maxTokens": 2048,
                },
                "nexus:security": {"userId": "user-456"},
            },
        }
    """

    def __init__(self, checkpoint_uri: str) -> None:
        """Initialize A2A server wrapper for GenericAgent.

        Args:
            checkpoint_uri: PostgreSQL connection string for checkpointer

        """
        self.agent = GenericAgent(checkpoint_uri)

        # Lazy imports to avoid loading A2A SDK at module import time (heavy dependencies)
        from a2a.server.request_handlers import DefaultRequestHandler  # noqa: PLC0415
        from a2a.server.tasks import InMemoryTaskStore  # noqa: PLC0415
        from a2a.types import (  # noqa: PLC0415
            AgentCapabilities,
            AgentCard,
            AgentSkill,
        )

        # Create agent card
        self.agent_card = AgentCard(
            name="generic-agent",
            description="General-purpose conversational agent using ReAct pattern",
            url="http://localhost:8001",
            version="1.0.0",
            protocol_version="0.3.0",
            default_input_modes=["text"],
            default_output_modes=["text"],
            capabilities=AgentCapabilities(streaming=True),
            skills=[
                AgentSkill(
                    id="conversation",
                    name="Conversational Interaction",
                    description="Multi-turn conversations with reasoning and tool use",
                    tags=["conversation", "reasoning", "general-purpose"],
                    examples=[
                        "What is the capital of France?",
                        "Calculate 15 * 23",
                        "Search for recent AI developments",
                    ],
                ),
            ],
        )

        # Lazy imports to avoid loading A2A SDK at module import time (heavy dependencies)
        from a2a.server.agent_execution import (  # noqa: PLC0415
            AgentExecutor,
            RequestContext,
        )
        from a2a.server.events import EventQueue  # noqa: PLC0415
        from a2a.server.tasks import TaskUpdater  # noqa: PLC0415
        from a2a.types import Part, TaskState, TextPart  # noqa: PLC0415
        from a2a.utils import new_agent_text_message, new_task  # noqa: PLC0415

        class ReactExecutor(AgentExecutor):
            def __init__(self, agent: GenericAgent) -> None:
                """Initialize executor with GenericAgent instance.

                Args:
                    agent: GenericAgent instance to execute

                """
                self.agent = agent
                self._cancelled = False

            async def cancel(self, _context: RequestContext, _event_queue: EventQueue) -> None:
                """Cancel the current execution.

                Args:
                    _context: Request context (unused but required by supertype)
                    _event_queue: Event queue (unused but required by supertype)

                """
                self._cancelled = True

            async def execute(self, context: RequestContext, event_queue: EventQueue) -> None:
                """Execute ReAct agent with proper A2A SDK TaskUpdater pattern.

                This follows the reference implementation pattern from A2A SDK v0.3.8
                to ensure events are delivered before the queue closes.
                """
                # 1. Extract message using RequestContext helper method
                text = context.get_user_input()

                # 2. Get or create task (required for TaskUpdater)
                task = context.current_task
                if not task:
                    if not context.message:
                        msg = "No message in context"
                        raise RuntimeError(msg)
                    task = new_task(context.message)
                    await event_queue.enqueue_event(task)

                # 3. Create TaskUpdater for proper event delivery
                updater = TaskUpdater(event_queue, task.id, task.context_id)

                # 4. Extract configuration and thread_id
                config = context.configuration
                metadata = context.metadata or {}

                # Extract thread_id for checkpointer (conversation history)
                # Use context.context_id which comes from message.contextId in A2A protocol
                # If not provided, A2A SDK generates one automatically
                thread_id: str = context.context_id or ""

                configuration = {
                    "streaming": getattr(config, "streaming", False) if config else False,
                    "context": thread_id,
                    "metadata": metadata,
                }

                # Extract user_id from metadata
                request_metadata = configuration.get("metadata", {})
                security = request_metadata.get("nexus:security", {}) if isinstance(request_metadata, dict) else {}
                user_id = security.get("userId") if isinstance(security, dict) else None

                try:
                    # 5. Send initial working status
                    await updater.update_status(
                        TaskState.working,
                        new_agent_text_message("Processing your request...", task.context_id, task.id),
                    )

                    # 6. Collect response chunks while still in execute() context
                    response_chunks = []
                    async for chunk in self.agent.execute(
                        message=text,
                        thread_id=thread_id,
                        configuration=configuration,
                        user_id=user_id,
                    ):
                        if self._cancelled:
                            await updater.update_status(
                                TaskState.canceled,
                                new_agent_text_message("Task canceled by user", task.context_id, task.id),
                                final=True,
                            )
                            return

                        response_chunks.append(chunk)

                    # 7. Add final artifact with complete response
                    if response_chunks:
                        full_response = "".join(response_chunks)
                        await updater.add_artifact(
                            [Part(root=TextPart(text=full_response))],
                            name="response",
                        )

                    # 8. Mark task complete BEFORE execute() returns
                    await updater.complete()

                except Exception as e:  # noqa: BLE001
                    # Top-level error handler: catch all execution errors and report via A2A protocol
                    # This includes LLM errors, network errors, tool errors, config errors, etc.
                    # We need broad exception handling here to ensure errors are always reported to user
                    await updater.update_status(
                        TaskState.failed,
                        new_agent_text_message(f"Error: {e!s}", task.context_id, task.id),
                        final=True,
                    )

        self.request_handler = DefaultRequestHandler(
            agent_executor=ReactExecutor(self.agent),
            task_store=InMemoryTaskStore(),
        )

    def get_request_handler(self) -> "DefaultRequestHandler":
        """Get the A2A request handler."""
        return self.request_handler
