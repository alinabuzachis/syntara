"""Main RetrieverService for document retrieval and relevancy checking.

This module provides the primary RetrieverService class that orchestrates
document retrieval from multiple storage backends and applies relevancy
checking with fallback mechanisms.
"""

import asyncio
import contextlib
import logging
from collections.abc import AsyncGenerator, Callable
from typing import Any
from uuid import UUID

from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.agent_orchestrator.context_manager.retriever_service.exceptions import RetrieverServiceError
from nexus.agent_orchestrator.context_manager.retriever_service.interfaces import RelevancyChecker
from nexus.agent_orchestrator.context_manager.retriever_service.models.relevancy_configuration import (
    RelevancyConfiguration,
)
from nexus.agent_orchestrator.context_manager.retriever_service.models.relevant_document import RelevantDocument
from nexus.agent_orchestrator.context_manager.retriever_service.registries.relevancy_registry import (
    RelevancyRegistry,
    get_relevancy_registry,
)
from nexus.agent_orchestrator.context_manager.retriever_service.registries.retriever_registry import (
    RetrieverRegistry,
    get_retriever_registry,
)
from nexus.agent_orchestrator.models import Invocation
from nexus.api.db.session import get_db
from nexus.core.constants import RetrieverServiceDefaults

logger = logging.getLogger(__name__)


class RetrieverService:
    """Main service for document retrieval and relevancy checking.

    This service orchestrates the complete document retrieval process:
    1. Load invocation context from database
    2. Use ALL registered DocumentRetrievers to collect documents from all sources
    3. Apply relevancy checking with fallback logic (LLM -> keyword)
    4. Rank documents by relevancy scores
    5. Apply configuration filters (thresholds, max_results)
    6. Return ranked relevant documents

    The service follows dependency injection patterns and uses registry
    patterns for extensibility without code changes.

    Key Features:
    - Multi-backend document retrieval via registries
    - Primary/fallback relevancy checking (LLM -> keyword)
    - Configurable filtering and ranking
    - Graceful error handling and logging
    - Async/await throughout for performance

    Example Usage:
        ```python
        service = RetrieverService(
            session=session,
            retriever_registry=retriever_registry,
            relevancy_registry=relevancy_registry
        )

        documents = await service.retrieve_relevant_documents(
            invocation_id=UUID("..."),
            prompt="machine learning algorithms"
        )

        for document in documents:
            print(f"Retrieved: {document.file_metadata.filename} (score: {document.relevancy_score})")
        ```
    """

    def __init__(
        self,
        session_factory: Callable[[], AsyncGenerator[AsyncSession, None]] = get_db,
        retriever_registry_factory: Callable[[], RetrieverRegistry] = get_retriever_registry,
        relevancy_registry_factory: Callable[[], RelevancyRegistry] = get_relevancy_registry,
    ) -> None:
        """Initialize RetrieverService with dependency injection.

        Args:
            session_factory: Factory function for creating database sessions
            retriever_registry_factory: Factory function for creating RetrieverRegistry
            relevancy_registry_factory: Factory function for creating RelevancyRegistry

        """
        self.session_factory = session_factory
        self.get_async_session_context = contextlib.asynccontextmanager(session_factory)
        self.retriever_registry = retriever_registry_factory()
        self.relevancy_registry = relevancy_registry_factory()

        logger.debug(
            "Initialized RetrieverService with %d retrievers and %d relevancy checkers",
            len(self.retriever_registry.list_retrievers()),
            len(self.relevancy_registry.list_checkers()),
        )

    async def retrieve_relevant_documents(self, invocation_id: UUID | None, prompt: str) -> list[RelevantDocument]:
        """Retrieve and rank relevant documents for the given invocation and prompt.

        This is the main entry point for document retrieval. The method follows
        these steps with internal parallelization:

        1. Load invocation context from database
        2. Retrieve documents from ALL registered storage backends in parallel
        3. Apply relevancy checking in parallel as documents arrive
        4. Rank documents by relevancy scores
        5. Apply configuration filters
        6. Return ranked relevant documents

        Args:
            invocation_id: ID of the invocation to retrieve context for
            prompt: User prompt/query to match documents against

        Returns:
            List of RelevantDocument objects ranked by relevancy score (highest first).
            Returns empty list if no relevant documents found or errors occur.

        Raises:
            RetrieverServiceError: If critical failures occur during retrieval

        """
        try:
            logger.info(
                "Starting streaming document retrieval for invocation %s",
                invocation_id,
            )

            # Step 1: Load invocation context
            invocation_context: dict[str, Any] = {}
            if invocation_id:
                try:
                    async with self.get_async_session_context() as session:
                        invocation_context = await self._load_invocation_context(invocation_id, session)
                except Exception:
                    logger.exception("Failed to load invocation context for %s", invocation_id)
                    return []

            # Step 2-3: Retrieve and score documents from all backends with parallel processing
            try:
                scored_documents = []
                async for document in self._retrieve_and_score_streaming(invocation_context, prompt):
                    scored_documents.append(document)  # noqa: PERF401

                if not scored_documents:
                    logger.info("No documents found in any storage backend")
                    return []

                logger.info("Document retrieval completed: %d documents processed", len(scored_documents))

                # Step 4: Rank and filter documents
                try:
                    ranked_documents = self._rank_and_filter_documents(scored_documents)
                except Exception:
                    logger.exception("Failed to rank and filter documents")
                    # Return scored documents without filtering
                    ranked_documents = sorted(scored_documents, key=lambda doc: doc.relevancy_score, reverse=True)

                logger.info("Document retrieval completed: %d relevant documents returned", len(ranked_documents))
                return ranked_documents

            except Exception:
                logger.exception("Failed during document retrieval")
                return []

        except Exception as e:
            logger.exception("Critical failure in document retrieval for invocation %s", invocation_id)
            error_msg = f"Document retrieval failed for invocation {invocation_id}: {e!s}"
            raise RetrieverServiceError(error_msg) from e

    async def _load_invocation_context(self, invocation_id: UUID, session: AsyncSession) -> dict[str, Any]:
        """Load invocation context data from database.

        Args:
            invocation_id: Invocation ID to load context for
            session: Database session for queries

        Returns:
            Dictionary containing invocation context data

        Raises:
            RetrieverServiceError: If invocation cannot be found or loaded

        """
        try:
            # Load invocation from database
            result = await session.get(Invocation, invocation_id)

        except Exception as e:
            logger.exception("Failed to load invocation context for %s", invocation_id)
            error_msg = f"Cannot load invocation context: {e!s}"
            raise RetrieverServiceError(error_msg) from e

        if not result:
            error_msg = f"Invocation {invocation_id} not found"
            raise RetrieverServiceError(error_msg)

        # Extract context data (stored as JSONB)
        context_data = result.context_data or {}

        logger.debug("Loaded invocation context for %s: %d context keys", invocation_id, len(context_data.keys()))

        return context_data

    async def _retrieve_and_score_streaming(
        self, invocation_context: dict[str, Any], prompt: str
    ) -> AsyncGenerator[RelevantDocument, None]:
        """Stream documents from all backends with parallel relevancy checking.

        Args:
            invocation_context: Context data from invocation
            prompt: Query prompt for relevancy checking

        Yields:
            RelevantDocument objects with relevancy scores as they are processed

        """
        # Get relevancy checkers
        primary_result, fallback_result = self._get_relevancy_checkers()

        # Get all registered retrievers
        retriever_names = self.retriever_registry.list_retrievers()
        if not retriever_names:
            logger.warning("No document retrievers registered")
            return

        logger.debug("Starting parallel document retrieval from %d backends", len(retriever_names))

        # Use a semaphore to limit concurrent relevancy checks
        semaphore = asyncio.Semaphore(RetrieverServiceDefaults.CONCURRENT_RELEVANCY_CHECK_LIMIT)

        # Create and merge streams for all retrievers
        document_count = 0
        async for document in self._merge_retriever_streams(
            invocation_context, prompt, retriever_names, primary_result, fallback_result, semaphore
        ):
            document_count += 1
            yield document

        logger.info(
            "Streaming completed: %d documents processed across %d backends", document_count, len(retriever_names)
        )

    def _get_relevancy_checkers(
        self,
    ) -> tuple[
        tuple[RelevancyChecker, RelevancyConfiguration] | None, tuple[RelevancyChecker, RelevancyConfiguration] | None
    ]:
        """Get primary and fallback relevancy checkers."""
        primary_result = self.relevancy_registry.get_primary_checker()
        fallback_result = self.relevancy_registry.get_fallback_checker()

        if not primary_result and not fallback_result:
            logger.warning("No relevancy checkers available, using default scores")

        return primary_result, fallback_result

    async def _merge_retriever_streams(
        self,
        invocation_context: dict[str, Any],
        prompt: str,
        retriever_names: list[str],
        primary_result: tuple[RelevancyChecker, RelevancyConfiguration] | None,
        fallback_result: tuple[RelevancyChecker, RelevancyConfiguration] | None,
        semaphore: asyncio.Semaphore,
    ) -> AsyncGenerator[RelevantDocument, None]:
        """Merge documents from all retriever streams."""
        # Create streams for all retrievers
        retriever_streams = [
            self._process_retriever_stream(name, invocation_context, prompt, primary_result, fallback_result, semaphore)
            for name in retriever_names
        ]

        # Merge all streams and yield documents as they become available
        try:
            for stream in retriever_streams:
                async for document in stream:
                    yield document
        except Exception:
            logger.exception("Error in stream merging")

    async def _process_retriever_stream(
        self,
        retriever_name: str,
        invocation_context: dict[str, Any],
        prompt: str,
        primary_result: tuple[RelevancyChecker, RelevancyConfiguration] | None,
        fallback_result: tuple[RelevancyChecker, RelevancyConfiguration] | None,
        semaphore: asyncio.Semaphore,
    ) -> AsyncGenerator[RelevantDocument, None]:
        """Process documents from a single retriever with parallel scoring."""
        try:
            retriever = self.retriever_registry.get_retriever(retriever_name)
            logger.debug("Starting document stream from %s", retriever_name)

            document_count = 0
            async for document in retriever.retrieve_documents(invocation_context):
                document_count += 1

                # Apply relevancy checking with fallback and semaphore limiting
                try:
                    async with semaphore:
                        scored_document = await self._score_document_with_fallback(
                            document, prompt, primary_result, fallback_result
                        )
                    yield scored_document
                except Exception as e:
                    logger.exception(
                        "Failed to score document from %s: %s", retriever_name, document.file_metadata.filename
                    )
                    # Use default score and continue
                    document.relevancy_score = RetrieverServiceDefaults.DEFAULT_RELEVANCY_SCORE
                    document.retrieval_metadata.update({"relevancy_checker_error": str(e)})
                    yield document

            logger.debug("Completed stream from %s: %d documents processed", retriever_name, document_count)

        except Exception:
            logger.exception("Failed to process stream from %s", retriever_name)

    async def _score_document_with_fallback(
        self,
        document: RelevantDocument,
        prompt: str,
        primary_result: tuple[RelevancyChecker, RelevancyConfiguration] | None,
        fallback_result: tuple[RelevancyChecker, RelevancyConfiguration] | None,
    ) -> RelevantDocument:
        """Score a document using primary checker with fallback logic.

        Args:
            document: Document to score
            prompt: Query prompt to match against
            primary_result: Primary checker and config tuple
            fallback_result: Fallback checker and config tuple

        Returns:
            Document with updated relevancy score and metadata

        """
        # Try primary checker first
        if primary_result:
            primary_checker, primary_config = primary_result
            try:
                score = await primary_checker.check_relevancy(document, prompt, primary_config)
                document.relevancy_score = score
                self._update_metadata_for_primary(document, primary_config)
                return document

            except (RetrieverServiceError, ValueError, TypeError, RuntimeError) as e:
                logger.warning(
                    "Primary relevancy checker failed for %s, trying fallback",
                    document.file_metadata.filename,
                    exc_info=e,
                )

        # Try fallback checker
        if fallback_result:
            fallback_checker, fallback_config = fallback_result
            try:
                score = await fallback_checker.check_relevancy(document, prompt, fallback_config)
                document.relevancy_score = score
                self._update_metadata_for_fallback(document, fallback_config)
                return document

            except Exception:
                logger.exception("Fallback relevancy checker also failed for %s", document.file_metadata.filename)

        # If both checkers fail, use default score
        logger.warning(
            "Both relevancy checkers failed for %s, using default score %s",
            document.file_metadata.filename,
            RetrieverServiceDefaults.DEFAULT_RELEVANCY_SCORE,
        )
        document.relevancy_score = RetrieverServiceDefaults.DEFAULT_RELEVANCY_SCORE
        document.retrieval_metadata.update({"relevancy_checker_used": "default", "relevancy_checker_failed": True})
        return document

    def _update_metadata_for_primary(self, document: RelevantDocument, config: RelevancyConfiguration) -> None:
        """Update document metadata for primary checker usage."""
        document.retrieval_metadata.update(
            {"relevancy_checker_used": "primary", "relevancy_checker_type": config.checker_type}
        )

    def _update_metadata_for_fallback(self, document: RelevantDocument, config: RelevancyConfiguration) -> None:
        """Update document metadata for fallback checker usage."""
        document.retrieval_metadata.update(
            {
                "relevancy_checker_used": "fallback",
                "relevancy_checker_type": config.checker_type,
                "primary_checker_failed": True,
            }
        )

    def _rank_and_filter_documents(self, documents: list[RelevantDocument]) -> list[RelevantDocument]:
        """Rank documents by relevancy score and apply configuration filters.

        Args:
            documents: Documents with relevancy scores

        Returns:
            Ranked and filtered documents

        """
        if not documents:
            return []

        # Sort by relevancy score (highest first)
        ranked_documents = sorted(documents, key=lambda doc: doc.relevancy_score, reverse=True)

        # Apply configuration filters if available
        try:
            # Get configuration from primary checker for filtering
            primary_result = self.relevancy_registry.get_primary_checker()
            if primary_result:
                _, config = primary_result

                # Apply similarity threshold filter
                threshold = config.similarity_threshold
                filtered_documents = [doc for doc in ranked_documents if doc.relevancy_score >= threshold]

                # Apply max results limit
                max_results = config.max_results
                final_documents = filtered_documents[:max_results]

                logger.debug(
                    "Applied filters: threshold=%.2f (%d->%d docs), max_results=%d (%d->%d docs)",
                    threshold,
                    len(ranked_documents),
                    len(filtered_documents),
                    max_results,
                    len(filtered_documents),
                    len(final_documents),
                )

                return final_documents
            logger.debug("No configuration available for filtering, returning all ranked documents")
            return ranked_documents

        except (ValueError, TypeError, AttributeError, KeyError) as e:
            logger.warning("Failed to apply configuration filters, returning all ranked documents", exc_info=e)
            return ranked_documents


# ===================================================
# Generator for dependency injection
# ---------------------------------------------------
def get_retriever_service(
    session_factory: Callable[[], AsyncGenerator[AsyncSession, None]] = get_db,
) -> RetrieverService:
    """Get RetrieverService instance for dependency injection.

    Args:
        session_factory: Factory function for creating database sessions

    Returns:
        RetrieverService instance for dependency injection

    Example:
        from nexus.agent_orchestrator.context_manager.retriever_service.services.retriever_service import (
            get_retriever_service,
        )

        service = get_retriever_service()
        documents = await service.retrieve_relevant_documents(invocation_id, prompt)

    """
    return RetrieverService(
        session_factory=session_factory,
        retriever_registry_factory=get_retriever_registry,
        relevancy_registry_factory=get_relevancy_registry,
    )


# ===================================================
