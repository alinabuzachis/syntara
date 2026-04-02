"""GenericAgent implementation using LangChain.

Handles information queries and questions using LLM via OpenRouter.
"""

from typing import TYPE_CHECKING, Any

import structlog
from langchain_core.messages import AIMessage, SystemMessage
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
