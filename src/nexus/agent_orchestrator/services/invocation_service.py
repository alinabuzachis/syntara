"""Service layer for invocation business logic."""

import logging
from collections.abc import AsyncGenerator, Callable, Iterable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from fastapi import BackgroundTasks, UploadFile
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.agent_orchestrator.models import Invocation, InvocationListResponse, InvocationStatus
from nexus.agent_orchestrator.models.request import CancellationResult
from nexus.core.constants import CONTEXT_KEY, CONTEXT_KEY_FILE_METADATA
from nexus.core.models import User
from nexus.core.services import BaseService
from nexus.core.services.extensions import ConvertResourceMixin
from nexus.files import FileManager, FileMetadata, get_file_manager
from nexus.files import utils as file_utils
from nexus.files.document_conversion.tasks import (
    DocumentConversionTask,
    get_document_conversion_task,
)

logger = logging.getLogger(__name__)


class InvocationServiceConvertResourceMixin(ConvertResourceMixin):
    """Mixin for cleaning Invocation metadata before returning from API."""

    def convert_resource(self, resource: Invocation) -> Invocation:  # type: ignore[override]
        """Clean Invocation metadata."""
        invocation_dict: dict[str, Any] = resource.model_dump()
        # Exclude internal filesystem paths for security - never expose in API
        for fm in invocation_dict[CONTEXT_KEY][CONTEXT_KEY_FILE_METADATA]:
            fm.pop("file_path", None)
            fm.pop("converted_content_path", None)

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
        document_conversion_task_factory: Callable[
            [Callable[[], AsyncGenerator[AsyncSession, None]] | None], DocumentConversionTask
        ] = get_document_conversion_task,
        file_manager_factory: Callable[[], FileManager] = get_file_manager,
    ) -> None:
        """Initialize service with database session.

        Args:
            session: Database session for queries
            user: Current authenticated user
            background_tasks: Optional FastAPI background tasks for document conversion
            session_factory: Optional session factory for DocumentConversionTask (defaults to get_db)
            document_conversion_task_factory: Factory function for creating a DocumentConversionTask
            file_manager_factory: Factory function for creating FileManager

        """
        super().__init__(session, user, convert_resource_mixin=InvocationServiceConvertResourceMixin())
        self.file_manager = file_manager_factory()
        self.background_tasks = background_tasks
        self.session_factory = session_factory
        self.document_conversion_task = document_conversion_task_factory(session_factory)

    async def _handle_file_uploads(self, files: list[UploadFile]) -> list[FileMetadata]:
        if not files:
            return []

        # Validate and save files (may raise ValidationError or OSError)
        # FileManager handles cleanup if validation/storage fails
        return await self.file_manager.validate_and_save_files(files=files)

    def _schedule_background_tasks(self, invocation_id: UUID) -> None:
        # Schedule background task for document conversion if provided
        if not self.background_tasks:
            return

        logger.info(
            "Scheduling document conversion background task (invocation_id=%s)",
            invocation_id,
        )

        # Schedule the actual document conversion background task
        self.background_tasks.add_task(self.document_conversion_task.convert, invocation_id)

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
        file_metadata_list: list[FileMetadata] = await self._handle_file_uploads(files or [])

        # Build file_metadata array for context_data
        # Use mode="json" to serialize UUIDs and enums properly for JSONB storage
        final_context_data[CONTEXT_KEY_FILE_METADATA] = [fm.model_dump(mode="json") for fm in file_metadata_list]

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

    async def cancel_invocation(self, invocation_id: UUID, reason: str = "User cancelled") -> CancellationResult:
        """Cancel a running invocation.

        Args:
            invocation_id: UUID of the invocation to cancel
            reason: Reason for cancellation

        Returns:
            CancellationResult enum indicating the outcome of the cancellation attempt

        """
        invocation = await self.session.get(Invocation, invocation_id)

        if not invocation:
            logger.warning("Cancellation failed: Invocation not found (invocation_id=%s)", invocation_id)
            return CancellationResult.NOT_FOUND

        # Check if invocation is in a cancellable state
        if invocation.status not in (InvocationStatus.CREATED, InvocationStatus.RUNNING):
            logger.warning(
                "Cancellation failed: Invocation not in cancellable state (invocation_id=%s, status=%s)",
                invocation_id,
                invocation.status.value,
            )
            return CancellationResult.NOT_CANCELLABLE

        # Update invocation with cancellation details using existing fields
        invocation.status = InvocationStatus.CANCELLED
        invocation.error_message = f"User cancelled: {reason}"
        invocation.completed_at = datetime.now(UTC)

        # Store cancellation metadata in checkpoint_data for debugging
        cancellation_data: dict[str, object] = {
            "cancelled_at": invocation.completed_at.isoformat(),
            "cancelled_by": str(self.user.id),
            "reason": reason,
        }

        # Merge with existing checkpoint_data if it exists
        if invocation.checkpoint_data:
            invocation.checkpoint_data.update(cancellation_data)
        else:
            invocation.checkpoint_data = cancellation_data

        # Clean up uploaded and converted files associated with this invocation
        await self._cleanup_invocation_files(invocation)

        # Note: Background document conversion tasks cannot be cancelled directly due to
        # FastAPI BackgroundTasks limitations. However, conversion tasks are typically
        # short-lived and will complete harmlessly even for cancelled invocations.

        await self.session.commit()

        logger.info("Invocation cancelled successfully (invocation_id=%s, reason=%s)", invocation_id, reason)
        return CancellationResult.SUCCESS

    async def _cleanup_invocation_files(self, invocation: Invocation) -> None:
        """Clean up uploaded and converted files associated with an invocation.

        This method extracts file paths from the invocation's context_data and
        attempts to delete them from storage. It handles both:
        - Original uploaded files (file_path)
        - Converted files (conversion.output_path)

        Args:
            invocation: The invocation whose files should be cleaned up

        Note:
            This is a best-effort cleanup that won't raise exceptions if
            file deletion fails. Errors are logged for debugging.

        """
        if not invocation.context_data or CONTEXT_KEY_FILE_METADATA not in invocation.context_data:
            logger.debug("No files to clean up for invocation %s", invocation.id)
            return

        file_metadata_list = invocation.context_data[CONTEXT_KEY_FILE_METADATA]
        if not file_metadata_list:
            logger.debug("Empty file metadata list for invocation %s", invocation.id)
            return

        # Type guard: ensure file_metadata_list is actually a list
        if not isinstance(file_metadata_list, list):
            logger.warning("file_metadata is not a list for invocation %s", invocation.id)
            return

        files_to_cleanup: list[str] = []

        # Collect file paths that need cleanup
        for file_metadata in file_metadata_list:
            # Type check: ensure we have a dict-like object
            if not isinstance(file_metadata, dict):
                logger.warning("Skipping non-dict file metadata for invocation %s", invocation.id)
                continue
            # Add original uploaded file
            if "file_path" in file_metadata:
                files_to_cleanup.append(file_metadata["file_path"])

            # Add converted file if it exists
            if file_metadata.get("converted_content_path"):
                files_to_cleanup.append(file_metadata["converted_content_path"])

        if files_to_cleanup:
            logger.info("Cleaning up %d files for cancelled invocation %s", len(files_to_cleanup), invocation.id)
            try:
                await file_utils.cleanup_files(files_to_cleanup, context="after invocation cancellation")
            except Exception:
                # File cleanup should not prevent successful cancellation
                # This is a best-effort cleanup - log the error but continue
                logger.exception(
                    "File cleanup failed for cancelled invocation %s, but cancellation will proceed", invocation.id
                )
        else:
            logger.debug("No file paths found to clean up for invocation %s", invocation.id)

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
