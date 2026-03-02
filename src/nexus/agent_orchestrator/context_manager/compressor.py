"""Compressor service for the Context Manager.

Handles content compression and summarization to fit token budgets using
a simplified RH1 approach with binary decision making (pass-through or
compress entire collection).
"""

from typing import Literal

import structlog
from langchain_openai import ChatOpenAI

from nexus.agent_orchestrator.clients.openrouter_config import get_openrouter_llm
from nexus.agent_orchestrator.token_manager.services import TokenCalculator
from nexus.core.config.base import get_settings

logger = structlog.stdlib.get_logger(__name__)


class CompressorService:
    """Service for compressing document content to fit token constraints.

    RH1 simplified implementation that uses binary decision making:
    - If documents fit within token budget: pass through unchanged
    - If documents exceed budget: compress entire collection with LLM summarization

    This approach prioritizes simplicity and consistent output over complex ranking.
    """

    def __init__(self, token_calculator: TokenCalculator | None = None, llm: ChatOpenAI | None = None) -> None:
        """Initialize the compressor service.

        Args:
            token_calculator: Service for counting tokens (creates default if None)
            llm: LangChain LLM instance (creates OpenRouter default if None)

        """
        settings = get_settings()
        self.token_calculator = token_calculator or TokenCalculator()
        self.llm = llm or get_openrouter_llm(
            temperature=settings.context_manager_compression_temperature,
            max_tokens=settings.context_manager_compression_max_tokens,
        )
        # Extract model name from LLM for consistent token counting
        self.model = self.llm.model_name

    async def compress(
        self,
        data: list[str] | str,
        max_tokens: int,
        strategy: Literal["greedy"] = "greedy",
        goal: str | None = None,
        correlation_id: str = "unknown",
    ) -> str:
        """Compress data to fit within token budget using specified strategy.

        Args:
            data: Documents to potentially compress (list of strings or single string)
            max_tokens: Maximum tokens allowed in output
            strategy: Compression strategy to use (currently only "greedy" supported)
            goal: Optional context for LLM summarization to focus on specific aspects
            correlation_id: Correlation identifier for distributed tracing

        Returns:
            String content: Either original content or compressed summary

        """
        logger.debug(
            "CompressorService.compress called",
            correlation_id=correlation_id,
            strategy=strategy,
            max_tokens=max_tokens,
        )

        # Normalize input data to consistent format
        documents = self._normalize_input(data)

        logger.debug("Compression input", correlation_id=correlation_id, doc_count=len(documents))

        # Execute compression strategy
        return await self._greedy_strategy(documents, max_tokens, goal, correlation_id)

    def _normalize_input(self, data: list[str] | str) -> list[str]:
        """Convert input data to normalized list format.

        Args:
            data: Input data as string or list of strings

        Returns:
            List of document strings

        """
        if isinstance(data, str):
            return [data]
        return data

    async def _greedy_strategy(
        self, documents: list[str], max_tokens: int, goal: str | None, correlation_id: str
    ) -> str:
        """Execute greedy compression strategy (binary decision).

        Args:
            documents: List of document strings
            max_tokens: Maximum tokens allowed in output
            goal: Optional goal for summarization
            correlation_id: Correlation identifier for logging

        Returns:
            Either concatenated content or compressed summary

        """
        # Step 1: Format all documents (single docs pass through without prefix)
        concatenated_content = self._format_documents(documents)

        # Step 2: Calculate total token count
        total_tokens = self.token_calculator.count_tokens(concatenated_content, model_name=self.model)

        logger.debug(
            "Token analysis",
            correlation_id=correlation_id,
            total_tokens=total_tokens,
            max_tokens=max_tokens,
        )

        # Step 3: Binary decision - pass through or compress entire collection
        if total_tokens <= max_tokens:
            # Documents fit within budget - pass through unchanged
            logger.info(
                "No compression needed",
                correlation_id=correlation_id,
                tokens_used=total_tokens,
                max_tokens=max_tokens,
            )
            return concatenated_content
        # Documents exceed budget - compress entire collection
        logger.info(
            "Compression required",
            correlation_id=correlation_id,
            tokens_before=total_tokens,
            target=max_tokens,
        )
        return await self._compress_with_llm(documents, max_tokens, goal, correlation_id)

    def _format_documents(self, documents: list[str], *, always_prefix: bool = False) -> str:
        """Format documents with clear separators and optional document identifiers.

        Args:
            documents: List of document strings
            always_prefix: If True, always add "Document N:" prefix even for single documents.
                          If False, single documents are returned as-is without prefix.

        Returns:
            Formatted string content

        """
        if len(documents) == 1 and not always_prefix:
            return documents[0]

        formatted_docs = []
        for i, doc in enumerate(documents, 1):
            formatted_docs.append(f"Document {i}:\n{doc}")

        return "\n\n".join(formatted_docs)

    async def _compress_with_llm(
        self, documents: list[str], max_tokens: int, goal: str | None, correlation_id: str
    ) -> str:
        """Compress documents using LLM summarization with structured citations.

        Args:
            documents: List of document strings to compress
            max_tokens: Maximum tokens allowed in output
            goal: Optional context for summarization focus
            correlation_id: Correlation identifier for logging

        Returns:
            Compressed content with structured citations

        """
        # Re-format with always_prefix=True for LLM citation context
        # (differs from pass-through format which omits prefix for single documents)
        documents_text = self._format_documents(documents, always_prefix=True)
        goal_text = goal or "summarize the key information"

        prompt = f"""Summarize the following documents with respect to the stated goal.

Requirements:
- The summary MUST be under {max_tokens} tokens
- Preserve the most relevant information for the stated goal
- Maintain factual accuracy from all documents
- Include key details that directly support the goal
- Use structured citations like "According to Document 1..." or "[Doc1, Doc2]" to indicate sources

Documents:
{documents_text}

Goal: {goal_text}"""

        # Get LLM response
        response = await self.llm.ainvoke([{"role": "user", "content": prompt}])
        compressed_content = str(response.content).strip()

        # Verify token count of compressed content
        compressed_tokens = self.token_calculator.count_tokens(compressed_content, model_name=self.model)

        if compressed_tokens > max_tokens:
            logger.warning(
                "Compressed output exceeds target",
                correlation_id=correlation_id,
                tokens_after=compressed_tokens,
                target=max_tokens,
            )
        else:
            logger.info(
                "Compression completed",
                correlation_id=correlation_id,
                tokens_after=compressed_tokens,
                target=max_tokens,
                ratio=compressed_tokens / max_tokens,
            )

        return compressed_content


# ===================================================
# Generator for dependency injection
# ---------------------------------------------------
def get_compressor_service() -> CompressorService:
    """Get CompressorService instance for dependency injection.

    Returns:
        CompressorService instance for dependency injection

    """
    return CompressorService()


# ===================================================
