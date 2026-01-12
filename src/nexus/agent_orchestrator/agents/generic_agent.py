"""GenericAgent implementation using LangChain.

Handles information queries and questions using LLM via OpenRouter.
"""

import logging
from typing import TYPE_CHECKING

from langchain_core.messages import SystemMessage
from langchain_core.tools import BaseTool
from langchain_openai import ChatOpenAI

from nexus.agent_orchestrator.agents.base_agent import BaseAgent
from nexus.agent_orchestrator.models import GenericAgentResponse
from nexus.agent_orchestrator.models.agent_state import AgentState
from nexus.agent_orchestrator.utils.retry import retry_with_backoff

if TYPE_CHECKING:
    from langchain.messages import AnyMessage

logger = logging.getLogger(__name__)


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
        result_message = await llm_with_tools.ainvoke(messages)

        # Update AgentState
        state["messages"] = [result_message]
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
