"""Context Manager Planner orchestration.

Main orchestrator for the Context Manager that coordinates retrieval,
compression, and assembly phases to produce final context packages.
"""

import contextlib
import logging
import time
from collections.abc import AsyncGenerator, Callable
from uuid import UUID

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.agent_orchestrator.exceptions import InvocationCancelledError
from nexus.agent_orchestrator.models import Invocation, InvocationStatus
from nexus.api.db.session import get_db
from nexus.core.config import get_settings

from .assembler import AssemblerService
from .compressor import CompressorService
from .models import ContextPackage
from .retriever import RetrieverService

logger = logging.getLogger(__name__)


class ContextManagerPlanner:
    """Main planner that orchestrates context management workflow.

    Coordinates the retrieve → compress → assemble sequence and
    handles errors gracefully while maintaining correlation_id tracing.
    """

    def __init__(self, session_factory: Callable[[], AsyncGenerator[AsyncSession, None]] = get_db) -> None:
        """Initialize the context manager planner.

        Args:
            session_factory: Session factory for cancellation checks. Defaults to get_db.

        """
        self.settings = get_settings()
        self.session_factory = session_factory
        self.get_async_session_context = contextlib.asynccontextmanager(session_factory)

    async def _check_cancellation(self, invocation_id: UUID, phase: str) -> None:
        """Check if invocation has been cancelled.

        Args:
            invocation_id: UUID of the invocation to check
            phase: Current execution phase for error reporting

        Raises:
            InvocationCancelledError: If invocation has been cancelled

        """
        try:
            # Create a short-lived session for the cancellation check
            async with self.get_async_session_context() as session:
                invocation = await session.get(Invocation, invocation_id)
                if invocation and invocation.status == InvocationStatus.CANCELLED:
                    logger.info("Invocation cancelled during %s phase (invocation_id=%s)", phase, invocation_id)
                    raise InvocationCancelledError(invocation_id, phase)
        except (SQLAlchemyError, OSError) as e:
            # Log but don't fail on database errors - graceful degradation
            logger.warning(
                "Failed to check cancellation status for invocation_id=%s, continuing execution: %s",
                invocation_id,
                e,
                exc_info=True,
            )

    async def plan_request(
        self,
        correlation_id: str,
        session_id: str,
        query: str,
        invocation_id: UUID | None = None,
    ) -> ContextPackage:
        """Plan and execute a context request.

        Orchestrates the full context management workflow:
        1. Retrieval: Find relevant documents
        2. Compression: Reduce content to fit token budget
        3. Assembly: Create final context package

        Args:
            correlation_id: Correlation identifier for distributed tracing
            session_id: Session identifier for grouping related invocations
            query: User query string for context retrieval
            invocation_id: Optional invocation ID for cancellation checking

        Returns:
            ContextPackage: Assembled context ready for LLM consumption

        Raises:
            InvocationCancelledError: If invocation has been cancelled

        """
        start_time = time.time()

        logger.info("Starting context planning for correlation_id: %s", correlation_id)
        logger.debug("Context planning - Tenant: %s, Query: %s", session_id, query)

        # Initialize timing metadata
        timing_data = {}

        # Phase 1: Retrieval
        # Check for cancellation before starting retrieval
        if invocation_id:
            await self._check_cancellation(invocation_id, "retrieval")

        retrieval_start = time.time()
        try:
            retriever = RetrieverService()
            retriever.retrieve(query, correlation_id)  # Returns None in MVP stub
            retrieved_docs = None  # MVP: always None
            timing_data["retrieval_time_ms"] = int((time.time() - retrieval_start) * 1000)
            logger.info("Retrieval phase completed in %sms", timing_data["retrieval_time_ms"])
        except Exception:
            timing_data["retrieval_time_ms"] = int((time.time() - retrieval_start) * 1000)
            logger.exception("Retrieval phase failed")
            retrieved_docs = None

        # Phase 2: Compression
        # Check for cancellation before starting compression
        if invocation_id:
            await self._check_cancellation(invocation_id, "compression")

        compression_start = time.time()
        try:
            compressor = CompressorService()
            compressor.compress(retrieved_docs, correlation_id)  # Returns None in MVP stub
            compressed_sections = None  # MVP: always None
            timing_data["compression_time_ms"] = int((time.time() - compression_start) * 1000)
            logger.info("Compression phase completed in %sms", timing_data["compression_time_ms"])
        except Exception:
            timing_data["compression_time_ms"] = int((time.time() - compression_start) * 1000)
            logger.exception("Compression phase failed")
            compressed_sections = None

        # Phase 3: Assembly
        # Check for cancellation before starting assembly
        if invocation_id:
            await self._check_cancellation(invocation_id, "assembly")

        assembly_start = time.time()
        try:
            assembler = AssemblerService()
            assembler.assemble(compressed_sections, correlation_id)
            timing_data["assembly_time_ms"] = int((time.time() - assembly_start) * 1000)
            logger.info("Assembly phase completed in %sms", timing_data["assembly_time_ms"])
        except Exception:
            timing_data["assembly_time_ms"] = int((time.time() - assembly_start) * 1000)
            logger.exception("Assembly phase failed")

        # Calculate total execution time
        total_time_ms = int((time.time() - start_time) * 1000)
        timing_data["total_time_ms"] = total_time_ms

        # Create metadata
        package_metadata = {
            "session_id": session_id,
            "sections": [],  # Empty for MVP
            "token_count": 0,  # Zero for MVP
            **timing_data,
            "query": query,
            "config_used": {
                "required_grounding_score": self.settings.context_manager_required_grounding_score,
                "max_total_tokens": self.settings.context_manager_max_total_tokens,
            },
        }

        # Create the final ContextPackage
        context_package = ContextPackage(
            correlation_id=correlation_id,
            payload={},  # Empty payload for MVP
            grounding_score=0.0,  # Default score for MVP
            citations=[],  # Empty citations for MVP
            package_metadata=package_metadata,
        )

        logger.info("Context planning completed for correlation_id: %s in %sms", correlation_id, total_time_ms)
        logger.debug("Context Package ID: %s, Grounding Score: %s", context_package.id, context_package.grounding_score)

        return context_package
