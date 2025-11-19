"""Service layer for invocation business logic."""

import hashlib
import logging
from collections.abc import Iterable
from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.agent_orchestrator.agents import GenericAgent
from nexus.agent_orchestrator.clients.openrouter_config import get_openrouter_llm
from nexus.agent_orchestrator.context_manager.file_manager import FileManager
from nexus.agent_orchestrator.context_manager.file_manager import utils as file_utils
from nexus.agent_orchestrator.models import Invocation, InvocationListResponse, InvocationStatus
from nexus.core.constants import CONTEXT_KEY_FILE_METADATA
from nexus.core.models import User
from nexus.core.services import BaseService

logger = logging.getLogger(__name__)


class InvocationService(BaseService):
    """Service for managing invocations.

    This service encapsulates business logic for invocations,
    separating it from HTTP/API concerns.
    """

    def __init__(self, session: AsyncSession, user: User) -> None:
        """Initialize service with database session.

        Args:
            session: Database session for queries
            user: Current authenticated user

        """
        super().__init__(session, user)

        # Initialize GenericAgent for handling information queries
        # GenericAgent uses LangChain LLM via OpenRouter
        try:
            llm = get_openrouter_llm()
            self.generic_agent: GenericAgent | None = GenericAgent(llm=llm)
        except ValueError as e:
            # If OPENROUTER_API_KEY not set, log warning but continue
            # This allows tests and development without OpenRouter configured
            logger.warning(
                "OpenRouter LLM not configured: %s. GenericAgent will fail at runtime.",
                e,
            )
            self.generic_agent = None

    async def create_invocation(
        self,
        prompt: str,
        session_id: str,
        context_data: dict[str, object] | None = None,
        files: list[UploadFile] | None = None,
    ) -> Invocation:
        """Create a new invocation.

        Args:
            prompt: Natural language prompt
            session_id: Session identifier
            context_data: Optional context data
            files: Optional list of file uploads

        Returns:
            Created invocation

        Raises:
            ValidationError: If file validation fails (count, size, MIME type)
            OSError: If file storage fails (disk full, permission denied, I/O error)

        """
        # Generate invocation ID upfront for file naming
        invocation_id = uuid4()

        # Process files if provided - validate BEFORE creating invocation
        final_context_data = context_data or {}
        saved_file_paths: list[str] = []

        if files:
            # Create FileManager
            # FileManager internally gets settings and selects retriever
            file_manager = FileManager()

            # Validate and save files (may raise ValidationError or OSError)
            # This happens BEFORE creating the invocation in DB
            # FileManager handles cleanup if validation/storage fails
            file_metadata_list = await file_manager.validate_and_save_files(
                files=files,
                invocation_id=str(invocation_id),
            )

            # Build file_metadata array for context_data
            # Exclude file_path for security - never expose internal filesystem paths in API
            # Structure: {"file_metadata": [{"file_id": str, "filename": str, ...}, ...]}
            final_context_data[CONTEXT_KEY_FILE_METADATA] = [
                fm.model_dump(exclude={"file_path"}) for fm in file_metadata_list
            ]

            # Track file paths for cleanup on DB failure
            saved_file_paths = [fm.file_path for fm in file_metadata_list]

        # Create invocation (single code path for both file and non-file cases)
        try:
            invocation = Invocation(
                id=invocation_id,
                prompt=prompt,
                created_by=self.user.id,
                session_id=session_id,
                status=InvocationStatus.CREATED,
                context_data=final_context_data,
            )
            self.session.add(invocation)
            await self.session.commit()
            await self.session.refresh(invocation)

        except Exception:
            # Database commit failed - cleanup saved files if any
            if saved_file_paths:
                logger.warning(
                    "Invocation creation failed, cleaning up %d saved files",
                    len(saved_file_paths),
                )
                await file_utils.cleanup_files(saved_file_paths, context="after DB failure")
            raise

        # Execute invocation with routing and agent selection
        # Background execution - don't await to keep 202 response fast
        # In production, this would be a background task (Celery, Temporal, etc.)
        # For now, we'll execute synchronously but could spawn task later
        # Store ID before execution to avoid accessing detached object on error
        invocation_id = invocation.id
        try:
            await self._execute_invocation(invocation)
        except Exception:
            logger.exception(
                "Error executing invocation (invocation_id=%s)",
                invocation_id,
            )
            # Don't fail the create_invocation - invocation was created successfully
            # Error will be stored in invocation.error_message

        return invocation

    async def _execute_invocation(self, invocation: Invocation) -> None:
        """Execute invocation by routing to appropriate agent.

        Args:
            invocation: Invocation to execute

        """
        # Hash prompt to protect sensitive information in logs
        prompt_hash = hashlib.sha256(invocation.prompt.encode()).hexdigest()[:16]
        logger.info(
            "Executing invocation (invocation_id=%s, prompt_hash=%s)",
            invocation.id,
            prompt_hash,
        )

        # Check if GenericAgent is configured before starting execution
        if self.generic_agent is None:
            msg = (
                "GenericAgent not configured. Set OPENROUTER_API_KEY environment variable. "
                "Get your API key from https://openrouter.ai/keys"
            )
            # Mark invocation as failed
            invocation.status = InvocationStatus.FAILED
            invocation.error_message = msg
            invocation.completed_at = datetime.now(UTC)
            await self.session.commit()
            logger.error("Invocation failed (invocation_id=%s): %s", invocation.id, msg)
            return

        # Store ID for logging in case of session errors
        exec_invocation_id = invocation.id

        try:
            # Mark invocation as started
            invocation.started_at = datetime.now(UTC)
            invocation.status = InvocationStatus.RUNNING
            await self.session.commit()

            # Execute GenericAgent (only agent implemented in NEXUS-002-4)
            response = await self.generic_agent.execute(
                prompt=invocation.prompt,
                invocation_id=exec_invocation_id,
            )

            # Store result and mark as completed
            invocation.result = response.model_dump(by_alias=True)
            invocation.status = InvocationStatus.COMPLETED
            invocation.completed_at = datetime.now(UTC)
            await self.session.commit()

            logger.info(
                "Invocation completed successfully (invocation_id=%s)",
                exec_invocation_id,
            )

        except Exception as e:
            logger.exception(
                "Invocation execution failed (invocation_id=%s)",
                exec_invocation_id,
            )
            # Rollback session to clear any pending changes from the error
            await self.session.rollback()

            # Re-fetch invocation to get fresh instance attached to session
            fresh_invocation = await self.session.get(Invocation, exec_invocation_id)
            if fresh_invocation:
                # Mark invocation as failed
                fresh_invocation.status = InvocationStatus.FAILED
                fresh_invocation.error_message = str(e)
                fresh_invocation.completed_at = datetime.now(UTC)
                await self.session.commit()

    async def get_invocation(self, invocation_id: UUID) -> Invocation | None:
        """Get invocation by ID including result.

        NOTE: This method is primarily for TESTING and DEBUGGING purposes.
        Use this to inspect the actual agent responses during development.

        Args:
            invocation_id: UUID of the invocation

        Returns:
            Invocation with result data if found, None otherwise

        """
        return await self.session.get(Invocation, invocation_id)

    async def list_invocations(
        self,
        limit: int = 20,
        cursor: str | None = None,
        sort: str | None = None,
        query_params_items: Iterable[tuple[str, str]] | None = None,
        *,
        include_total: bool = False,
    ) -> "InvocationListResponse":
        """List invocations with filtering, sorting, and pagination.

        Args:
            limit: Maximum number of invocations to return (default 20)
            cursor: Cursor token for pagination
            sort: Sort parameter (e.g., "created_at", "-started_at")
            query_params_items: Raw query parameter items from request (for filtering)
            include_total: Whether to include total count in response

        Returns:
            InvocationListResponse with invocations, pagination metadata, and optional total

        """
        # Use unified list_resources method (fields read from model automatically)
        return await self.list_resources(
            model=Invocation,
            response_type=InvocationListResponse,
            limit=limit,
            cursor=cursor,
            sort=sort or "-created_at",  # Default DESC sort if none provided
            query_params_items=query_params_items,
            include_total=include_total,
        )
