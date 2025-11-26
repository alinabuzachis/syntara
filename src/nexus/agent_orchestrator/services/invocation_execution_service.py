"""Service for executing invocations decoupled from creation."""

import contextlib
import hashlib
import logging
from collections.abc import AsyncGenerator, Callable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from nexus.agent_orchestrator import ContextManagerPlanner
from nexus.agent_orchestrator.agents import GenericAgent
from nexus.agent_orchestrator.clients.openrouter_config import get_openrouter_llm
from nexus.agent_orchestrator.context_manager.models import ContextPackage
from nexus.agent_orchestrator.models import Invocation, InvocationStatus
from nexus.agent_orchestrator.models.agent_response import GenericAgentResponse
from nexus.api.db.session import get_db
from nexus.core.constants import CONTEXT_KEY_FILE_METADATA

logger = logging.getLogger(__name__)


class InvocationExecutionService:
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

        # Initialize GenericAgent for handling information queries
        try:
            llm = get_openrouter_llm()
            self.generic_agent: GenericAgent | None = GenericAgent(llm=llm)
        except ValueError as e:
            # If OPENROUTER_API_KEY not set, log warning but continue
            logger.warning(
                "OpenRouter LLM not configured: %s. GenericAgent will fail at runtime.",
                e,
            )
            self.generic_agent = None

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

            # Hash prompt to protect sensitive information in logs
            prompt_hash = hashlib.sha256(invocation.prompt.encode()).hexdigest()[:16]
            logger.info(
                "Executing invocation (invocation_id=%s, prompt_hash=%s)",
                invocation.id,
                prompt_hash,
            )

            # Log conversion failures but allow execution to proceed (FR-020)
            self._log_conversion_failures(invocation)

            # Check if GenericAgent is configured before starting execution
            if await self._validate_generic_agent_config(invocation, session):
                return

            # Store ID for logging in case of session errors
            exec_invocation_id = invocation.id

            try:
                # Mark invocation as started
                invocation.started_at = datetime.now(UTC)
                invocation.status = InvocationStatus.RUNNING
                await session.commit()

                # Attempt context enhancement with graceful fallback
                context_package, enhanced_prompt = self._enhance_prompt_with_context(invocation)

                # Execute GenericAgent (with enhanced or original prompt)
                logger.info(
                    "Sending prompt to LLM (invocation_id=%s): %s",
                    invocation.id,
                    enhanced_prompt,
                )
                # We already validated that generic_agent is not None above
                if self.generic_agent is None:
                    msg = "GenericAgent unexpectedly None after validation"
                    raise RuntimeError(msg)  # noqa: TRY301 - Simple guard clause
                response = await self.generic_agent.execute(
                    prompt=enhanced_prompt,
                    invocation_id=exec_invocation_id,
                )

                # Build result with optional context enhancement
                result_dict = self._build_result_with_context(response, context_package, invocation)

                # Store result and mark as completed
                invocation.result = result_dict
                invocation.status = InvocationStatus.COMPLETED
                invocation.completed_at = datetime.now(UTC)
                await session.commit()

            except Exception as e:  # noqa: BLE001 - Need to catch all exceptions for graceful error handling
                await self._handle_execution_error(e, exec_invocation_id, session)

    async def _validate_generic_agent_config(self, invocation: Invocation, session: AsyncSession) -> bool:
        """Validate GenericAgent configuration and fail invocation if not configured.

        Args:
            invocation: The invocation to validate
            session: Database session

        Returns:
            True if validation failed and invocation was marked as failed, False if valid

        """
        if self.generic_agent is not None:
            return False
        msg = (
            "GenericAgent not configured. Set OPENROUTER_API_KEY environment variable. "
            "Get your API key from https://openrouter.ai/keys"
        )
        # Mark invocation as failed
        invocation.status = InvocationStatus.FAILED
        invocation.error_message = msg
        invocation.completed_at = datetime.now(UTC)
        await session.commit()
        logger.error("Invocation failed (invocation_id=%s): %s", invocation.id, msg)
        return True

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
            fresh_invocation.status = InvocationStatus.FAILED
            fresh_invocation.error_message = str(error)
            fresh_invocation.completed_at = datetime.now(UTC)
            await session.commit()

    def _build_result_with_context(
        self, response: GenericAgentResponse, context_package: ContextPackage | None, invocation: Invocation
    ) -> dict[str, Any]:
        """Build result dictionary with optional context enhancement.

        Args:
            response: The agent response
            context_package: Optional context package from ContextManagerPlanner
            invocation: The invocation being processed

        Returns:
            Result dictionary with optional context metadata

        """
        result_dict = response.model_dump(by_alias=True)

        # Add context metadata only if context processing succeeded
        if context_package is not None:
            result_dict.update(
                {
                    "correlation_id": context_package.correlation_id,
                    "grounding_score": context_package.grounding_score,
                }
            )

            # Add context_enhancement if context was populated
            if context_package.payload or context_package.citations:
                result_dict["context_enhancement"] = {
                    "turn_id": context_package.id,
                    "citations": context_package.citations,
                    "context_applied": True,
                }

            logger.info(
                "Invocation completed successfully with context enhancement(invocation_id=%s, correlation_id=%s)",
                invocation.id,
                context_package.correlation_id,
            )
        else:
            # Context enhancement failed, but invocation succeeded
            logger.info(
                "Invocation completed successfully without context enhancement (invocation_id=%s)",
                invocation.id,
            )

        return result_dict

    def _enhance_prompt_with_context(self, invocation: Invocation) -> tuple[ContextPackage | None, str]:
        """Enhance prompt with context using ContextManagerPlanner.

        Args:
            invocation: The invocation to enhance

        Returns:
            Tuple of (context_package, enhanced_prompt)

        """
        context_package: ContextPackage | None = None
        enhanced_prompt = invocation.prompt

        try:
            # Initiate context building through Context Manager
            # Extract correlation_id from workflow context, fallback to invocation_id
            correlation_id = str(invocation.context_data.get("correlation_id", invocation.id))

            context_planner = ContextManagerPlanner()
            context_package = context_planner.plan_request(
                correlation_id=correlation_id, session_id=invocation.session_id, query=invocation.prompt
            )

            logger.info(
                "Context package created (invocation_id=%s, correlation_id=%s, grounding_score=%f)",
                invocation.id,
                correlation_id,
                context_package.grounding_score,
            )

            # Format context for prompt enhancement - always include delimiters for observability
            context_content = self._format_context_for_prompt(context_package.payload)
            enhanced_prompt = f"""{invocation.prompt}

        --- CONTEXT ---
        {context_content}
        --- END CONTEXT ---"""

            logger.debug(
                "Prompt enhanced with context (invocation_id=%s, original_length=%d, enhanced_length=%d)",
                invocation.id,
                len(invocation.prompt),
                len(enhanced_prompt),
            )

        except Exception as context_error:  # noqa: BLE001 - Need to catch all exceptions for graceful fallback
            # Log context error but continue with original prompt (graceful fallback)
            logger.warning(
                "Context Manager failed, proceeding with original prompt (invocation_id=%s): %s",
                invocation.id,
                str(context_error),
                exc_info=context_error,
            )
            # enhanced_prompt remains as original invocation.prompt
            # context_package remains None

        return context_package, enhanced_prompt

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

    def _format_context_for_prompt(self, payload: dict[str, Any]) -> str:
        """Format context payload for LLM consumption.

        Args:
            payload: Context data from ContextPackage

        Returns:
            Formatted string ready for prompt enhancement

        """
        if not payload:
            return "(no additional context available)"

        sections = []
        for key, value in payload.items():
            # Format each key-value pair as a section
            sections.append(f"## {key}\n{value}")

        return "\n\n".join(sections)
