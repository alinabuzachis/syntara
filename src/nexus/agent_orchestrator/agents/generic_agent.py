"""GenericAgent implementation using LangChain.

Handles information queries and questions using LLM via OpenRouter.
"""

import logging

from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI

from nexus.agent_orchestrator.agents.base_agent import BaseAgent
from nexus.agent_orchestrator.models.agent_response import GenericAgentResponse
from nexus.agent_orchestrator.models.agent_state import AgentState
from nexus.agent_orchestrator.utils.retry import retry_with_backoff

logger = logging.getLogger(__name__)


class GenericAgent(BaseAgent):
    """Agent for answering information queries using LangChain LLM.

    Uses LangChain with OpenRouter to provide natural language answers
    to user questions about tools, services, and capabilities.
    """

    def __init__(self, llm: ChatOpenAI) -> None:
        """Initialize GenericAgent with LangChain LLM.

        Args:
            llm: Configured ChatOpenAI instance (from openrouter_config)

        """
        super().__init__()
        self.llm: ChatOpenAI = llm

        # Create prompt template for information queries
        self.prompt_template = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "You are an information assistant for the Nexus automation system. "
                    "Answer user questions concisely and accurately. "
                    "Focus on providing helpful, direct answers about tools, services, and capabilities.",
                ),
                ("human", "{query}"),
            ]
        )

    @retry_with_backoff
    async def _execute(self, state: AgentState) -> GenericAgentResponse:
        """Execute GenericAgent-specific logic: query LLM for answer.

        Args:
            state: LangGraph state containing enhanced prompt and metadata

        Returns:
            GenericAgentResponse SQLModel instance with LLM-generated answer

        """
        # Use the enhanced prompt from orchestrator (includes context)
        enhanced_prompt = state["prompt"]

        # Format prompt using template
        messages = self.prompt_template.format_messages(query=enhanced_prompt)

        # Query LLM via LangChain (async)
        response = await self.llm.ainvoke(messages)

        # Extract content from response as a string
        answer = str(response.text)

        # Handle empty response
        if not answer or not answer.strip():
            return self._handle_empty_response(
                state["invocation_id"],
                response.response_metadata,
                message=None,
            )

        # Return GenericAgentResponse SQLModel instance
        return GenericAgentResponse(
            content=answer,
            response_metadata=response.response_metadata,
        )
