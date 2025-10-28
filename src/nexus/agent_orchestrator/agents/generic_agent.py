"""GenericAgent implementation using LangChain.

Handles information queries and questions using LLM via OpenRouter.
"""

import logging
from uuid import UUID

from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI

from nexus.agent_orchestrator.models.agent_response import GenericAgentResponse

logger = logging.getLogger(__name__)


class GenericAgent:
    """Agent for answering information queries using LangChain LLM.

    Uses LangChain with OpenRouter to provide natural language answers
    to user questions about tools, services, and capabilities.
    """

    def __init__(self, llm: ChatOpenAI) -> None:
        """Initialize GenericAgent with LangChain LLM.

        Args:
            llm: Configured ChatOpenAI instance (from openrouter_config)

        """
        self.llm = llm

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

    async def execute(
        self,
        prompt: str,
        invocation_id: UUID,
    ) -> GenericAgentResponse:
        """Execute information query using LLM.

        Args:
            prompt: User's question or information query
            invocation_id: Unique identifier for this invocation

        Returns:
            GenericAgentResponse with LLM-generated answer

        """
        logger.info(
            "GenericAgent executing query (invocation_id=%s)",
            invocation_id,
        )

        try:
            # Format prompt using template
            messages = self.prompt_template.format_messages(query=prompt)

            # Query LLM via LangChain (async)
            response = await self.llm.ainvoke(messages)

            # Extract content from response
            answer_content = response.content if hasattr(response, "content") else str(response)

            # Ensure answer is a string (LangChain might return list)
            if isinstance(answer_content, list):
                answer = " ".join(str(item) for item in answer_content)
            else:
                answer = str(answer_content)

            # Handle empty response
            if not answer or not answer.strip():
                logger.warning("Empty LLM response for query (invocation_id=%s)", invocation_id)
                answer = (
                    "I apologize, but I couldn't generate an answer to your question. "
                    "Please try rephrasing or providing more details."
                )

            logger.info("GenericAgent completed successfully (invocation_id=%s)", invocation_id)

            # Safely extract model name (avoid AsyncMock in metadata for JSON serialization)
            model_name = "unknown"
            if hasattr(self.llm, "model_name"):
                try:
                    model_name = str(self.llm.model_name)
                except (AttributeError, TypeError, ValueError):
                    model_name = "unknown"

            return GenericAgentResponse(
                type="answer",
                content=answer,
                response_metadata={
                    "model": model_name,
                },
            )

        except TimeoutError:
            logger.exception("LLM timeout (invocation_id=%s)", invocation_id)
            return GenericAgentResponse(
                type="answer",
                content="I apologize, but the request timed out. Please try again.",
                response_metadata={"error": "timeout"},
            )

        except Exception as e:
            # Log the full exception with stack trace (exception details included automatically)
            logger.exception("LLM error (invocation_id=%s)", invocation_id)
            error_msg = str(e).lower()

            # Provide user-friendly error messages
            if "rate limit" in error_msg:
                content = "I apologize, but the system is experiencing high demand. Please try again in a moment."
            elif "invalid" in error_msg and "key" in error_msg:
                content = "I apologize, but there's a configuration issue. Please contact support."
            else:
                content = f"I apologize, but I encountered an error processing your query: {e!s}"

            return GenericAgentResponse(
                type="answer",
                content=content,
                response_metadata={"error": str(e)},
            )
