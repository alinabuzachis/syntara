"""Service layer for invocation business logic."""

import logging
from collections.abc import AsyncGenerator, Callable, Iterable
from typing import Any
from uuid import UUID, uuid4

from fastapi import BackgroundTasks, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.agent_orchestrator.context_manager.file_manager import FileManager, FileMetadata, create_file_manager
from nexus.agent_orchestrator.context_manager.file_manager import utils as file_utils
from nexus.agent_orchestrator.context_manager.file_manager.document_conversion.services import create_conversion_task
from nexus.agent_orchestrator.models import Invocation, InvocationListResponse, InvocationStatus
from nexus.core.constants import CONTEXT_KEY, CONTEXT_KEY_FILE_METADATA, CONTEXT_KEY_FILE_METADATA_CONVERSION
from nexus.core.models import User
from nexus.core.services import BaseService
from nexus.core.services.extensions import ConvertResourceMixin

logger = logging.getLogger(__name__)


class InvocationServiceConvertResourceMixin(ConvertResourceMixin):
    """Mixin for cleaning Invocation metadata before returning from API."""

    def convert_resource(self, resource: Invocation) -> Invocation:  # type: ignore[override]
        """Clean Invocation metadata."""
        invocation_dict: dict[str, Any] = resource.model_dump()
        # Exclude file_path and output_path for security - never expose internal filesystem paths in API
        for fm in invocation_dict[CONTEXT_KEY][CONTEXT_KEY_FILE_METADATA]:
            fm.pop("file_path")
            if CONTEXT_KEY_FILE_METADATA_CONVERSION in fm:
                conversion = fm[CONTEXT_KEY_FILE_METADATA_CONVERSION]
                if conversion and "output_path" in conversion:
                    conversion.pop("output_path")

        return Invocation.model_validate(invocation_dict)


class InvocationService(BaseService):
    """Service for managing invocations.

    This service encapsulates business logic for invocations,
    separating it from HTTP/API concerns.
    """

    def __init__(
        self,
        session: AsyncSession,
        user: User,
        background_tasks: BackgroundTasks | None = None,
        session_factory: Callable[[], AsyncGenerator[AsyncSession, None]] | None = None,
        file_manager_factory: Callable[[], FileManager] = create_file_manager,
    ) -> None:
        """Initialize service with database session.

        Args:
            session: Database session for queries
            user: Current authenticated user
            background_tasks: Optional FastAPI background tasks for document conversion
            session_factory: Optional session factory for DocumentConversionTask (defaults to get_db)
            file_manager_factory: Factory function for creating FileManager

        """
        super().__init__(session, user, convert_resource_mixin=InvocationServiceConvertResourceMixin())
        self.file_manager = file_manager_factory()
        self.background_tasks = background_tasks
        self.session_factory = session_factory

    async def _handle_file_uploads(self, invocation_id: UUID, files: list[UploadFile]) -> list[FileMetadata]:
        if not files:
            return []

        # Validate and save files (may raise ValidationError or OSError)
        # This happens BEFORE creating the invocation in DB
        # FileManager handles cleanup if validation/storage fails
        return await self.file_manager.validate_and_save_files(
            files=files,
            invocation_id=str(invocation_id),
        )

    def _schedule_background_tasks(self, invocation_id: UUID) -> None:
        # Schedule background task for document conversion if provided
        if not self.background_tasks:
            return

        logger.info(
            "Scheduling document conversion background task (invocation_id=%s)",
            invocation_id,
        )

        # Schedule the actual document conversion background task
        task = create_conversion_task(session_factory=self.session_factory)
        self.background_tasks.add_task(task.convert, invocation_id)

        logger.info(
            "Document conversion background task scheduled (invocation_id=%s)",
            invocation_id,
        )

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
        file_metadata_list: list[FileMetadata] = await self._handle_file_uploads(invocation_id, files or [])

        # Build file_metadata array for context_data
        final_context_data[CONTEXT_KEY_FILE_METADATA] = [fm.model_dump() for fm in file_metadata_list]

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

            logger.info(
                "Invocation created successfully (invocation_id=%s)",
                invocation_id,
            )

        except Exception:
            # Database commit failed - cleanup saved files if any
            if len(file_metadata_list):
                logger.warning(
                    "Invocation creation failed, cleaning up %d saved files",
                    len(file_metadata_list),
                )
                saved_file_paths = [fm.file_path for fm in file_metadata_list]
                await file_utils.cleanup_files(saved_file_paths, context="after DB failure")
            raise

        finally:
            # Invocation created successfully
            # Execution will be handled by InvocationExecutionService via background tasks
            self._schedule_background_tasks(invocation_id)

        return InvocationServiceConvertResourceMixin().convert_resource(invocation)

    async def get_invocation(self, invocation_id: UUID) -> Invocation | None:
        """Get invocation by ID including result.

        NOTE: This method is primarily for TESTING and DEBUGGING purposes.
        Use this to inspect the actual agent responses during development.

        Args:
            invocation_id: UUID of the invocation

        Returns:
            Invocation with result data if found, None otherwise

        """
        invocation: Invocation | None = await self.session.get(Invocation, invocation_id)
        return InvocationServiceConvertResourceMixin().convert_resource(invocation) if invocation else None

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
