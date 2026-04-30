"""GenericAgent implementation using LangChain.

Handles information queries and questions using LLM via OpenRouter.
"""

import json as _json
from typing import TYPE_CHECKING, Any

import structlog
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.tools import BaseTool
from langchain_openai import ChatOpenAI

from nexus.agent_orchestrator.agents.base_agent import BaseAgent
from nexus.agent_orchestrator.models import GenericAgentResponse
from nexus.agent_orchestrator.models.agent_state import AgentState
from nexus.core.utils.retry import retry_with_backoff
from nexus.metrics.dependencies import get_metrics_recorder
from nexus.metrics.instrumentation import record_llm_call

if TYPE_CHECKING:
    from langchain.messages import AnyMessage

logger = structlog.stdlib.get_logger(__name__)


class GenericAgent(BaseAgent):
    """Agent for answering information queries using LangChain LLM.

    Uses LangChain with OpenRouter to provide natural language answers
    to user questions about tools, services, and capabilities.
    """

    def __init__(self, llm: ChatOpenAI, available_tools: list[BaseTool]) -> None:
        """Initialize GenericAgent with LangChain LLM.

        Args:
            llm: Configured ChatOpenAI instance (from openrouter_config)
            available_tools: Tools that are available to the LLM

        """
        super().__init__()
        self.llm: ChatOpenAI = llm
        self.available_tools = available_tools

    @retry_with_backoff
    async def _execute(self, state: AgentState) -> AgentState:
        """Execute GenericAgent-specific logic: query LLM for answer.

        Args:
            state: LangGraph state containing enhanced prompt and metadata

        Returns:
            GenericAgentResponse SQLModel instance with LLM-generated answer

        """
        response_schema = state.get("response_schema")

        # Case B: Structured output with no tools - use .with_structured_output() directly
        if response_schema and not self.available_tools:
            return await self._execute_structured(state, response_schema)

        # Standard execution (with or without tools)
        state = await self._execute_standard(state)

        # Case A: Structured output with tools - run extraction step after tool loop
        if response_schema and self.available_tools:
            state = await self._extract_structured_output(state, response_schema)

        return state

    async def _execute_standard(self, state: AgentState) -> AgentState:
        """Execute standard LLM call with tools.

        Args:
            state: LangGraph state containing enhanced prompt and metadata

        Returns:
            Updated state with LLM response

        """
        # Query LLM via LangChain (async)
        llm_with_tools = self.llm.bind_tools(self.available_tools)
        messages: list[AnyMessage] = [
            SystemMessage(
                content="You are an information assistant for the Nexus automation system. "
                "Answer user questions concisely and accurately. "
                "Focus on providing helpful, direct answers about tools, services, and capabilities."
            )
        ] + state["messages"]
        result_message = await record_llm_call(
            get_metrics_recorder(),
            lambda: llm_with_tools.ainvoke(messages),
            model=getattr(self.llm, "model_name", None),
        )

        # Collect token usage from LLM response for post-LLM update
        token_entry = self._build_token_usage_entry(result_message)
        token_log: list[dict[str, Any]] = [token_entry] if token_entry is not None else []

        # Update AgentState
        state["messages"] = [result_message]
        state["llm_token_usage_log"] = token_log
        answer = str(result_message.text)
        response_metadata = result_message.response_metadata
        response_model: GenericAgentResponse = GenericAgentResponse(content=answer, response_metadata=response_metadata)

        # Handle empty responses
        if not answer or not answer.strip():
            response_model = self._handle_empty_response(
                state["invocation_id"],
                result_message.response_metadata,
                message=None,
            )

        state["result"] = response_model.model_dump(by_alias=True)

        return state

    async def _execute_structured(self, state: AgentState, response_schema: dict[str, Any]) -> AgentState:
        """Execute with structured output directly (no tools).

        Args:
            state: LangGraph state
            response_schema: JSON Schema for structured output

        Returns:
            Updated state with structured output

        """
        try:
            structured_llm = self.llm.with_structured_output(response_schema, method="json_mode")
            schema_str = _json.dumps(response_schema, indent=2)
            messages = [
                SystemMessage(
                    content="You are an information assistant for the Nexus automation system. "
                    "You MUST respond with ONLY a valid JSON object matching this exact schema:\n\n"
                    f"```json\n{schema_str}\n```\n\n"
                    "Use exactly the property names from the schema. "
                    "Do not include any text outside the JSON object."
                )
            ] + state["messages"]

            parsed_output = await record_llm_call(
                get_metrics_recorder(),
                lambda: structured_llm.ainvoke(messages),
                model=getattr(self.llm, "model_name", None),
            )

            # Token usage unavailable: json_mode returns a parsed dict, not an AIMessage
            state["llm_token_usage_log"] = []
            state["messages"] = []

            result_dict = GenericAgentResponse(
                content=parsed_output,
                response_metadata={},
            ).model_dump(by_alias=True)
            result_dict["structured_output_metadata"] = {"fallback_strategy_used": "native"}
            state["result"] = result_dict

            return state
        except Exception:  # noqa: BLE001
            logger.warning("Structured output failed, falling back to standard execution", exc_info=True)
            return await self._execute_standard(state)

    async def _extract_structured_output(self, state: AgentState, response_schema: dict[str, Any]) -> AgentState:
        """Post-tool-loop extraction: reformat result into schema.

        Args:
            state: State after tool execution
            response_schema: JSON Schema for structured output

        Returns:
            Updated state with structured content

        """
        try:
            result_dict = state.get("result")
            if not result_dict:
                return state

            current_answer = result_dict.get("content", "")
            if not current_answer:
                return state

            extraction_llm = self.llm.with_structured_output(response_schema, method="json_mode")
            schema_str = _json.dumps(response_schema, indent=2)
            extraction_messages = [
                SystemMessage(
                    content="Extract and format the following information into this exact JSON schema:\n\n"
                    f"```json\n{schema_str}\n```\n\n"
                    "Use exactly the property names from the schema. "
                    "Do not include any text outside the JSON object."
                ),
                HumanMessage(content=f"Extract from this text:\n\n{current_answer}"),
            ]

            parsed_output = await record_llm_call(
                get_metrics_recorder(),
                lambda: extraction_llm.ainvoke(extraction_messages),
                model=getattr(self.llm, "model_name", None),
            )

            result_dict["content"] = parsed_output
            result_dict["structured_output_metadata"] = {"fallback_strategy_used": "native"}
            return state
        except Exception:  # noqa: BLE001
            logger.warning("Structured output extraction failed, keeping raw text", exc_info=True)
            result_dict = state.get("result")
            if result_dict:
                result_dict["structured_output_metadata"] = {"fallback_strategy_used": "none"}
            return state

    @staticmethod
    def _build_token_usage_entry(result_message: AIMessage) -> dict[str, Any] | None:
        """Extract token usage data from an AIMessage response.

        Args:
            result_message: AIMessage from the LLM provider

        Returns:
            Dict with input_tokens, output_tokens, and usage_details,
            or None if no token metadata is available.

        """
        usage_meta = result_message.usage_metadata
        if usage_meta and isinstance(usage_meta, dict):
            input_tokens = usage_meta.get("input_tokens")
            if input_tokens is not None:
                return {
                    "input_tokens": input_tokens,
                    "output_tokens": usage_meta.get("output_tokens") or 0,
                    "usage_details": dict(usage_meta),
                }

        # Fallback path: response_metadata["token_usage"]
        response_meta = result_message.response_metadata
        if response_meta and isinstance(response_meta, dict):
            token_usage = response_meta.get("token_usage")
            if token_usage and isinstance(token_usage, dict):
                prompt_tokens = token_usage.get("prompt_tokens")
                if prompt_tokens is not None:
                    return {
                        "input_tokens": prompt_tokens,
                        "output_tokens": token_usage.get("completion_tokens") or 0,
                        "usage_details": dict(token_usage),
                    }

        return None
