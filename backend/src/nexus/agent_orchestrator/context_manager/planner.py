"""Context Manager Planner orchestration.

Main orchestrator for the Context Manager that coordinates retrieval,
compression, and assembly phases to produce final context packages.
"""

import contextlib
import time
from collections.abc import AsyncGenerator, Callable
from uuid import UUID

import structlog
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.agent_orchestrator.audit.context_planning import (
    CancellationEvent,
    ContextPlanningEvent,
    ContextPlanningPhase,
    ContextPlanningStatus,
)
from nexus.agent_orchestrator.exceptions import InvocationCancelledError
from nexus.agent_orchestrator.models import Invocation, InvocationStatus, LLMCredentialConfig
from nexus.agent_orchestrator.token_manager import TokenValidationService
from nexus.audit.dispatcher import AuditEventDispatcher
from nexus.core.database.session import get_db
from nexus.settings.cache.settings_cache import get_runtime_settings

from .assembler_service import AssemblerService
from .compressor import CompressorService
from .models import ContextPackage
from .retriever_service.services import RetrieverService, get_retriever_service

logger = structlog.stdlib.get_logger(__name__)


class ContextManagerPlanner:
    """Main planner that orchestrates context management workflow.

    Coordinates the retrieve → compress → assemble sequence and
    handles errors gracefully.
    """

    def __init__(
        self,
        *,
        compressor_service_factory: Callable[[], CompressorService],
        session_factory: Callable[[], AsyncGenerator[AsyncSession, None]] = get_db,
        retriever_service_factory: Callable[
            [Callable[[], AsyncGenerator[AsyncSession, None]]], RetrieverService
        ] = get_retriever_service,
        llm_credential_config: LLMCredentialConfig | None = None,
    ) -> None:
        """Initialize the context manager planner.

        Args:
            compressor_service_factory: Factory function for creating CompressorService (required)
            session_factory: Session factory for cancellation checks. Defaults to get_db.
            retriever_service_factory: Factory function for creating RetrieverService
            llm_credential_config: Credential config for downstream LLM services (relevancy checker)

        """
        self.settings = get_runtime_settings()
        self.session_factory = session_factory
        self.get_async_session_context = contextlib.asynccontextmanager(session_factory)
        self.retriever_service_factory = retriever_service_factory
        self.compressor_service_factory = compressor_service_factory
        self.llm_credential_config = llm_credential_config

    async def _check_cancellation(
        self,
        session_id: str,
        invocation_id: UUID,
        phase: ContextPlanningPhase,
        execution_id: UUID | None = None,
        request_id: UUID | None = None,
    ) -> None:
        """Check if invocation has been cancelled.

        Args:
            session_id: Session identifier for multi-tenant isolation
            invocation_id: UUID of the invocation to check
            phase: Current execution phase for error reporting
            execution_id: Optional Workflow Execution ID
            request_id: Optional X-Request-Id from the originating HTTP request.

        Raises:
            InvocationCancelledError: If invocation has been cancelled

        """
        try:
            # Create a short-lived session for the cancellation check
            async with self.get_async_session_context() as session:
                invocation = await session.get(Invocation, invocation_id)
                if invocation and invocation.status == InvocationStatus.CANCELLED:
                    logger.info("Invocation cancelled during phase", phase=phase, invocation_id=invocation_id)

                    # Emit cancellation detected event
                    AuditEventDispatcher.dispatch(
                        CancellationEvent(
                            phase=phase,
                            session_id=session_id,
                            invocation_id=invocation_id,
                            execution_id=execution_id,
                            request_id=request_id,
                        )
                    )

                    raise InvocationCancelledError(str(invocation_id), phase.value)
        except (SQLAlchemyError, OSError) as e:
            # Log but don't fail on database errors - graceful degradation
            logger.warning(
                "Failed to check cancellation status for invocation, continuing execution",
                invocation_id=invocation_id,
                error=str(e),
                exc_info=True,
            )

    async def plan_request(
        self,
        session_id: str,
        query: str,
        invocation_id: UUID,
        execution_id: UUID | None = None,
        request_id: UUID | None = None,
        user_id: UUID | None = None,
    ) -> ContextPackage:
        """Plan and execute a context request.

        Orchestrates the full context management workflow:
        1. Retrieval: Find relevant documents
        2. Assembly: Create final context package (with internal compression retry loop)

        Args:
            session_id: Session identifier for multi-tenant isolation
            query: User query string for context retrieval
            invocation_id: Invocation ID for cancellation checking
            execution_id: Optional Workflow Execution ID
            request_id: Optional X-Request-Id from the originating HTTP request.
            user_id: Optional UUID of the user making the request (for context assembly)

        Returns:
            ContextPackage: Assembled context ready for LLM consumption

        Raises:
            InvocationCancelledError: If invocation has been cancelled

        """
        start_time = time.time()

        logger.info("Starting context planning")
        logger.debug("Context planning", tenant=session_id, query=query)

        # Initialize timing metadata
        timing_data = {}

        # Phase 1: Retrieval
        # Check for cancellation before starting retrieval
        await self._check_cancellation(
            session_id, invocation_id, ContextPlanningPhase.RETRIEVAL, execution_id=execution_id, request_id=request_id
        )

        # Emit STARTED event for retrieval phase
        AuditEventDispatcher.dispatch(
            ContextPlanningEvent(
                phase=ContextPlanningPhase.RETRIEVAL,
                status=ContextPlanningStatus.STARTED,
                session_id=session_id,
                invocation_id=invocation_id,
                execution_id=execution_id,
                request_id=request_id,
            )
        )

        retrieved_docs = []
        retrieval_start = time.time()
        try:
            retriever = self.retriever_service_factory(self.session_factory)
            retrieved_docs = await retriever.retrieve_relevant_documents(
                invocation_id, query, llm_credential_config=self.llm_credential_config
            )
            timing_data["retrieval_time_ms"] = int((time.time() - retrieval_start) * 1000)
            logger.info(
                "Retrieval phase completed",
                retrieval_time_ms=timing_data["retrieval_time_ms"],
                document_count=len(retrieved_docs),
            )

            # Emit COMPLETED event for retrieval phase
            AuditEventDispatcher.dispatch(
                ContextPlanningEvent(
                    phase=ContextPlanningPhase.RETRIEVAL,
                    status=ContextPlanningStatus.COMPLETED,
                    session_id=session_id,
                    invocation_id=invocation_id,
                    execution_id=execution_id,
                    request_id=request_id,
                    document_count=len(retrieved_docs),
                )
            )
        except Exception as e:
            timing_data["retrieval_time_ms"] = int((time.time() - retrieval_start) * 1000)
            logger.exception("Retrieval phase failed")

            # Emit FAILED event for retrieval phase
            AuditEventDispatcher.dispatch(
                ContextPlanningEvent(
                    phase=ContextPlanningPhase.RETRIEVAL,
                    status=ContextPlanningStatus.FAILED,
                    session_id=session_id,
                    invocation_id=invocation_id,
                    execution_id=execution_id,
                    request_id=request_id,
                    error_type=type(e).__name__,
                )
            )
            retrieved_docs = []

        # Phase 2: Assembly
        # Check for cancellation before starting assembly
        await self._check_cancellation(
            session_id, invocation_id, ContextPlanningPhase.ASSEMBLY, execution_id=execution_id, request_id=request_id
        )

        # Emit STARTED event for assembly phase
        AuditEventDispatcher.dispatch(
            ContextPlanningEvent(
                phase=ContextPlanningPhase.ASSEMBLY,
                status=ContextPlanningStatus.STARTED,
                session_id=session_id,
                invocation_id=invocation_id,
                execution_id=execution_id,
                request_id=request_id,
                document_count=len(retrieved_docs),
            )
        )

        assembly_start = time.time()
        try:
            # Get configuration parameters from runtime settings
            max_tokens = await self.settings.get_int("context_manager.max_total_tokens")
            compression_loop = await self.settings.get_int("context_manager.compression_loop")

            # Get database session for context assembly
            async with self.get_async_session_context() as session:
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
                    max_tokens=max_tokens,
                    compression_loop=compression_loop,
                    invocation_id=invocation_id,
                    user_id=user_id,
                    session=session,
                )

            timing_data["assembly_time_ms"] = int((time.time() - assembly_start) * 1000)
            logger.info("Assembly phase completed", assembly_time_ms=timing_data["assembly_time_ms"])

            # Emit COMPLETED event for assembly phase
            AuditEventDispatcher.dispatch(
                ContextPlanningEvent(
                    phase=ContextPlanningPhase.ASSEMBLY,
                    status=ContextPlanningStatus.COMPLETED,
                    session_id=session_id,
                    invocation_id=invocation_id,
                    execution_id=execution_id,
                    request_id=request_id,
                )
            )

        except Exception as e:
            timing_data["assembly_time_ms"] = int((time.time() - assembly_start) * 1000)
            logger.exception("Assembly phase failed")

            # Emit FAILED event for assembly phase
            AuditEventDispatcher.dispatch(
                ContextPlanningEvent(
                    phase=ContextPlanningPhase.ASSEMBLY,
                    status=ContextPlanningStatus.FAILED,
                    session_id=session_id,
                    invocation_id=invocation_id,
                    execution_id=execution_id,
                    request_id=request_id,
                    error_type=type(e).__name__,
                )
            )
            raise

        # Calculate total execution time
        total_time_ms = int((time.time() - start_time) * 1000)
        timing_data["total_time_ms"] = total_time_ms

        logger.info("Context planning completed", total_time_ms=total_time_ms)
        logger.debug(
            "Context Package created", package_id=context_package.id, grounding_score=context_package.grounding_score
        )

        return context_package
