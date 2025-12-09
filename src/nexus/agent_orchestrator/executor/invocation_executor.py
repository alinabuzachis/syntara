"""Service for executing invocations decoupled from creation."""

import contextlib
import logging
from collections.abc import AsyncGenerator, Callable
from datetime import UTC, datetime
from uuid import UUID

from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.agent_orchestrator import ContextManagerPlanner
from nexus.agent_orchestrator.clients.openrouter_config import get_openrouter_llm
from nexus.agent_orchestrator.exceptions import InvocationCancelledError, LLMConfigurationError
from nexus.agent_orchestrator.models import Invocation, InvocationStatus
from nexus.api.db.session import get_db
from nexus.core.constants import CONTEXT_KEY_FILE_METADATA

logger = logging.getLogger(__name__)


class InvocationExecutor:
    """Service for executing invocations independently of creation.

    This service is designed to be called by background tasks after
    document conversion is complete, allowing for decoupled execution.
    """

    def __init__(self, session_factory: Callable[[], AsyncGenerator[AsyncSession, None]] = get_db) -> None:
        """Initialize execution service with database session factory.

        Args:
            session_factory: Factory function for creating database sessions

        """
        self.session_factory = session_factory
        # Create async context manager from the session factory
        self.get_async_session_context = contextlib.asynccontextmanager(session_factory)

    async def execute_invocation(self, invocation_id: UUID) -> None:
        """Execute invocation by ID, loading fresh data from database.

        This method loads the invocation from the database to get the latest
        FileMetadata status updates from background tasks.

        Args:
            invocation_id: UUID of the invocation to execute

        Returns:
            True if execution completed (success or permanent failure),
            False if execution was gated and should be retried later

        """
        async with self.get_async_session_context() as session:
            # Load fresh invocation from database to get latest FileMetadata status
            invocation: Invocation | None = await session.get(Invocation, invocation_id)
            if not invocation:
                logger.error("Invocation not found for execution (invocation_id=%s)", invocation_id)
                return

            # Check if invocation was cancelled before execution
            if invocation.status == InvocationStatus.CANCELLED:
                logger.info("Invocation was cancelled before execution (invocation_id=%s)", invocation_id)
                return

            logger.info(
                "Executing invocation (invocation_id=%s)",
                invocation.id,
            )

            # Log conversion failures but allow execution to proceed (FR-020)
            self._log_conversion_failures(invocation)

            # Initialize OrchestrationService - fail immediately if LLM not configured
            try:
                # Import here to avoid circular dependency
                from nexus.agent_orchestrator.services.orchestration_service import (  # noqa: PLC0415
                    OrchestrationService,
                )

                llm = get_openrouter_llm()
                context_manager_planner = ContextManagerPlanner(session_factory=self.session_factory)
                orchestration_service = OrchestrationService(llm=llm, context_manager_planner=context_manager_planner)
            except LLMConfigurationError as e:
                # Mark invocation as failed
                now = datetime.now(UTC)
                invocation.started_at = now  # Set started_at to indicate when failure was detected
                invocation.status = InvocationStatus.FAILED
                invocation.error_message = str(e)
                invocation.completed_at = now
                await session.commit()
                logger.exception("Invocation failed (invocation_id=%s): %s", invocation.id, invocation.error_message)
                return

            # Store ID for logging in case of session errors
            exec_invocation_id = invocation.id

            try:
                # Mark invocation as started
                invocation.started_at = datetime.now(UTC)
                invocation.status = InvocationStatus.RUNNING
                await session.commit()

                # Execute through OrchestrationService (which handles context enhancement internally)
                logger.info(
                    "Executing through OrchestrationService (invocation_id=%s): %s",
                    invocation.id,
                    invocation.prompt,
                )

                # Execute through orchestration service
                correlation_id = str(invocation.context_data.get("correlation_id", exec_invocation_id))
                result_dict = await orchestration_service.execute(
                    prompt=invocation.prompt,
                    session_id=invocation.session_id,
                    invocation_id=exec_invocation_id,
                    correlation_id=correlation_id,
                )

                # Check if invocation was cancelled during execution (fix race condition)
                # Refresh the current invocation to get latest status from database
                await session.refresh(invocation)

                if invocation.status == InvocationStatus.CANCELLED:
                    logger.info(
                        "Invocation was cancelled during execution, skipping completion (invocation_id=%s)",
                        exec_invocation_id,
                    )
                    return  # Don't override the CANCELLED status

                # Store result and mark as completed (after cancellation check)
                invocation.result = result_dict
                invocation.status = InvocationStatus.COMPLETED
                invocation.completed_at = datetime.now(UTC)
                await session.commit()

            except InvocationCancelledError:
                # Invocation was cancelled during execution - this is expected behavior
                # Don't mark as failed since cancellation is already handled
                logger.info("Invocation cancelled during execution (invocation_id=%s)", exec_invocation_id)
            except Exception as e:  # noqa: BLE001 - Need to catch all exceptions for graceful error handling
                await self._handle_execution_error(e, exec_invocation_id, session)

    async def _handle_execution_error(self, error: Exception, invocation_id: UUID, session: AsyncSession) -> None:
        """Handle execution errors by marking invocation as failed.

        Args:
            error: The exception that occurred
            invocation_id: ID of the invocation that failed
            session: Database session

        """
        logger.exception(
            "Invocation execution failed (invocation_id=%s)",
            invocation_id,
        )
        # Rollback session to clear any pending changes from the error
        await session.rollback()

        # Re-fetch invocation to get fresh instance attached to session
        fresh_invocation = await session.get(Invocation, invocation_id)
        if fresh_invocation:
            # Mark invocation as failed
            now = datetime.now(UTC)
            # Set started_at if not already set (failure before execution started)
            if fresh_invocation.started_at is None:
                fresh_invocation.started_at = now
            fresh_invocation.status = InvocationStatus.FAILED
            fresh_invocation.error_message = str(error)
            fresh_invocation.completed_at = now
            await session.commit()

    def _log_conversion_failures(self, invocation: Invocation) -> None:
        """Log conversion failures but allow execution to proceed (FR-020).

        Args:
            invocation: The invocation to check for conversion failures

        """
        if CONTEXT_KEY_FILE_METADATA not in invocation.context_data:
            return
        file_metadata_obj = invocation.context_data[CONTEXT_KEY_FILE_METADATA]
        if not file_metadata_obj or not isinstance(file_metadata_obj, list):
            return
        failed_conversions = [
            fm for fm in file_metadata_obj if isinstance(fm, dict) and fm.get("status") == "conversion_failed"
        ]
        if failed_conversions:
            logger.warning(
                "Proceeding with invocation despite %d failed conversions (invocation_id=%s)",
                len(failed_conversions),
                invocation.id,
            )


# ===================================================
# Factory function for dependency injection
# ---------------------------------------------------


def get_invocation_executor(
    session_factory: Callable[[], AsyncGenerator[AsyncSession, None]],
) -> InvocationExecutor:
    """Create a InvocationExecutor instance with fresh dependencies.

    Returns:
        InvocationExecutor: Fresh InvocationExecutor instance

    Example:
        invocation_executor = get_invocation_executor()
        await invocation_executor.execute_invocation(invocation_id)

    """
    return InvocationExecutor(session_factory)


# ===================================================
