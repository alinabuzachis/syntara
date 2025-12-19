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
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.agent_orchestrator.exceptions import InvocationCancelledError
from nexus.agent_orchestrator.models import Invocation, InvocationStatus
from nexus.agent_orchestrator.token_manager import TokenValidationService
from nexus.api.auth import get_current_user
from nexus.api.db.session import get_db
from nexus.core.config import get_settings

from .assembler_service import AssemblerService
from .compressor import CompressorService, get_compressor_service
from .models import ContextPackage
from .retriever_service.services import RetrieverService, get_retriever_service

logger = logging.getLogger(__name__)


class ContextManagerPlanner:
    """Main planner that orchestrates context management workflow.

    Coordinates the retrieve → compress → assemble sequence and
    handles errors gracefully while maintaining correlation_id tracing.
    """

    def __init__(
        self,
        session_factory: Callable[[], AsyncGenerator[AsyncSession, None]] = get_db,
        retriever_service_factory: Callable[
            [Callable[[], AsyncGenerator[AsyncSession, None]]], RetrieverService
        ] = get_retriever_service,
        compressor_service_factory: Callable[[], CompressorService] = get_compressor_service,
    ) -> None:
        """Initialize the context manager planner.

        Args:
            session_factory: Session factory for cancellation checks. Defaults to get_db.
            retriever_service_factory: Factory function for creating RetrieverService
            compressor_service_factory: Factory function for creating CompressorService

        """
        self.settings = get_settings()
        self.session_factory = session_factory
        self.get_async_session_context = contextlib.asynccontextmanager(session_factory)
        self.retriever_service_factory = retriever_service_factory
        self.compressor_service_factory = compressor_service_factory

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
        2. Assembly: Create final context package (with internal compression retry loop)

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
        retrieved_docs = []
        try:
            retriever = self.retriever_service_factory(self.session_factory)
            retrieved_docs = await retriever.retrieve_relevant_documents(invocation_id, query)
            timing_data["retrieval_time_ms"] = int((time.time() - retrieval_start) * 1000)
            logger.info(
                "Retrieval phase completed in %sms with %d documents",
                timing_data["retrieval_time_ms"],
                len(retrieved_docs),
            )
        except Exception:
            timing_data["retrieval_time_ms"] = int((time.time() - retrieval_start) * 1000)
            logger.exception("Retrieval phase failed")
            retrieved_docs = []

        # Phase 2: Assembly
        # Check for cancellation before starting assembly
        if invocation_id:
            await self._check_cancellation(invocation_id, "assembly")

        assembly_start = time.time()

        # Get configuration parameters
        max_tokens = self.settings.context_manager_max_total_tokens
        compression_loop = getattr(self.settings, "context_manager_compression_loop", 3)

        # Get database session and current user for token validation
        async with self.get_async_session_context() as session:
            user = await get_current_user(session)

            # Create assembler with injected dependencies
            token_service = TokenValidationService()
            compressor_service = self.compressor_service_factory()
            assembler = AssemblerService(
                token_service=token_service,
                compressor_service=compressor_service,
            )

            # Assemble context package (with internal compression retry loop)
            context_package = await assembler.assemble(
                documents=retrieved_docs,
                correlation_id=correlation_id,
                max_tokens=max_tokens,
                compression_loop=compression_loop,
                invocation_id=invocation_id,
                user_id=user.id,
                session=session,
            )

        timing_data["assembly_time_ms"] = int((time.time() - assembly_start) * 1000)
        logger.info("Assembly phase completed in %sms", timing_data["assembly_time_ms"])

        # Calculate total execution time
        total_time_ms = int((time.time() - start_time) * 1000)
        timing_data["total_time_ms"] = total_time_ms

        logger.info("Context planning completed for correlation_id: %s in %sms", correlation_id, total_time_ms)
        logger.debug("Context Package ID: %s, Grounding Score: %s", context_package.id, context_package.grounding_score)

        return context_package
