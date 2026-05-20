"""Service layer for invocation business logic.

The InvocationService orchestrates:
- File validation and storage via FileManager
- Document conversion scheduling
- Invocation creation and management

Key design decisions:
- Uses FileManager for all file operations (encapsulation principle)
- Stores file_ids in context_data, not full file_metadata
- Orchestrates conversion and execution flow:
  * file_ids only (pre-converted): validate via FileManager, execute directly
  * Files uploaded at runtime: create FileMetadata, convert, then execute
  * Both file_ids AND uploads: validate file_ids, convert new files, execute with all
"""

from collections.abc import AsyncGenerator, Callable, Iterable
from datetime import UTC, datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

import structlog
from fastapi import BackgroundTasks, UploadFile
from sqlmodel.ext.asyncio.session import AsyncSession

if TYPE_CHECKING:
    from nexus.agent_orchestrator.executor import InvocationExecutor

from nexus.agent_orchestrator.models import (
    Invocation,
    InvocationContextData,
    InvocationListResponse,
    InvocationStatus,
)
from nexus.agent_orchestrator.models.request import CancellationResult
from nexus.audit.dispatcher import AuditEventDispatcher
from nexus.core.constants import CONTEXT_KEY_FILE_IDS
from nexus.core.database.session import get_db
from nexus.core.exceptions import SafeValueError
from nexus.core.models import User
from nexus.core.services import BaseService
from nexus.files import utils as file_utils
from nexus.files.document_conversion.tasks import (
    DocumentConversionTask,
    get_document_conversion_task,
)
from nexus.files.file_manager import FileManager, get_file_manager
from nexus.files.models import FileMetadata
from nexus.invocations.audit.invocation_cancelled import InvocationCancellationResult, InvocationCancelledEvent
from nexus.invocations.audit.invocation_created import InvocationCreatedEvent

logger = structlog.stdlib.get_logger(__name__)


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
        session_factory: Callable[[], AsyncGenerator[AsyncSession, None]] = get_db,
        document_conversion_task_factory: Callable[
            [Callable[[], AsyncGenerator[AsyncSession, None]]], DocumentConversionTask
        ] = get_document_conversion_task,
        file_manager_factory: Callable[[], FileManager] = get_file_manager,
        invocation_executor_factory: Callable[[Callable[[], AsyncGenerator[AsyncSession, None]]], "InvocationExecutor"]
        | None = None,
    ) -> None:
        """Initialize service with database session.

        Args:
            session: Database session for queries
            user: Current authenticated user
            background_tasks: Optional FastAPI background tasks for document conversion
            session_factory: Session factory for background tasks (defaults to get_db)
            document_conversion_task_factory: Factory function for creating a DocumentConversionTask
            file_manager_factory: Factory function for creating FileManager
            invocation_executor_factory: Factory function for creating InvocationExecutor

        """
        super().__init__(session, user)
        self.file_manager = file_manager_factory()
        self.background_tasks = background_tasks
        self.session_factory = session_factory
        self.document_conversion_task = document_conversion_task_factory(session_factory)
        if invocation_executor_factory is None:
            from nexus.agent_orchestrator.executor import get_invocation_executor  # noqa: PLC0415

            invocation_executor_factory = get_invocation_executor
        self.invocation_executor = invocation_executor_factory(session_factory)

    async def _handle_file_uploads(self, files: list[UploadFile]) -> list[FileMetadata]:
        if not files:
            return []

        # Validate and save files (may raise ValidationError or OSError)
        # FileManager handles cleanup if validation/storage fails
        return await self.file_manager.validate_and_save_files(files=files)

    async def _validate_file_ids(self, file_ids: list[str]) -> list[FileMetadata]:
        """Validate that file_ids reference existing FileMetadata records.

        Args:
            file_ids: List of file UUIDs (as strings) to validate

        Returns:
            List of FileMetadata records for the validated file_ids

        Raises:
            ValueError: If any file_ids are not found

        """
        if not file_ids:
            return []

        # Convert strings to UUIDs at the boundary
        uuid_ids = [UUID(fid) for fid in file_ids]
        existing_files = await self.file_manager.get_files_metadata(uuid_ids, self.session)
        found_ids = {str(f.id) for f in existing_files}
        missing = set(file_ids) - found_ids
        if missing:
            missing_ids = ", ".join(sorted(missing))
            msg = f"Files not found: {missing_ids}"
            raise SafeValueError(msg)

        return existing_files

    def _schedule_conversion_tasks(
        self,
        file_ids: list[str],
        invocation_id: UUID,
    ) -> None:
        """Schedule document conversion for files that need conversion.

        Args:
            file_ids: List of file UUIDs (as strings) to convert
            invocation_id: Invocation ID for logging

        """
        if not self.background_tasks or not file_ids:
            return

        for file_id_str in file_ids:
            file_id = UUID(file_id_str)
            logger.info(
                "Scheduling document conversion",
                file_id=file_id,
                invocation_id=invocation_id,
            )
            self.background_tasks.add_task(self.document_conversion_task.convert, file_id)

        logger.info(
            "Scheduled document conversion tasks",
            task_count=len(file_ids),
            invocation_id=invocation_id,
        )

    def _schedule_execution_task(self, invocation_id: UUID) -> None:
        """Schedule invocation execution as a background task.

        Args:
            invocation_id: ID of the invocation to execute

        """
        if not self.background_tasks:
            return

        logger.info("Scheduling invocation execution", invocation_id=invocation_id)
        self.background_tasks.add_task(self.invocation_executor.execute_invocation, invocation_id)

    async def create_invocation(
        self,
        prompt: str,
        session_id: str,
        context_data: dict[str, object] | None = None,
        files: list[UploadFile] | None = None,
    ) -> Invocation:
        """Create a new invocation.

        Orchestrates file handling and execution scheduling:
        - file_ids only (pre-converted): validate via FileManager, execute directly
        - Files uploaded at runtime: create FileMetadata, convert, then execute
        - Both file_ids AND uploads: validate file_ids, convert new files, execute with all
        - No files: execute directly

        Args:
            prompt: Natural language prompt
            session_id: Session identifier
            context_data: Optional context data (may contain file_ids)
            files: Optional list of file uploads (runtime upload)

        Returns:
            Created invocation

        Raises:
            ValidationError: If file validation fails (count, size, MIME type)
            ValueError: If file_ids reference non-existent files
            OSError: If file storage fails (disk full, permission denied, I/O error)

        """
        # Generate invocation ID upfront
        invocation_id = uuid4()

        # Parse context_data into typed model for validated access and audit.
        # The raw dict is kept for DB storage since model_dump() masks SecretStr
        # fields (callback_url, credential_id) which must be preserved in JSONB.
        final_context_data = dict(context_data or {})
        ctx = InvocationContextData.model_validate(final_context_data)

        # Validate existing file_ids reference real files
        if ctx.file_ids:
            await self._validate_file_ids(ctx.file_ids)
            logger.info(
                "Validated pre-uploaded files",
                file_count=len(ctx.file_ids),
                invocation_id=invocation_id,
            )

        # Process runtime file uploads
        new_file_metadata_list: list[FileMetadata] = await self._handle_file_uploads(files or [])
        new_file_ids: list[str] = [str(fm.id) for fm in new_file_metadata_list]

        # Persist new FileMetadata records to database (they need to exist before conversion)
        for metadata in new_file_metadata_list:
            self.session.add(metadata)

        # Merge all file_ids
        all_file_ids = ctx.file_ids + new_file_ids
        if all_file_ids:
            final_context_data[CONTEXT_KEY_FILE_IDS] = all_file_ids

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

            logger.info(
                "Invocation created successfully",
                invocation_id=invocation_id,
                file_count=len(all_file_ids),
            )

            # Dispatch success audit event
            AuditEventDispatcher.dispatch(
                InvocationCreatedEvent(
                    invocation_id=invocation_id,
                    session_id=session_id,
                    file_ids=all_file_ids,
                    agent=ctx.agent,
                    model=ctx.model,
                    metadata=ctx.audit_safe_metadata(),
                )
            )

        except Exception as e:
            # Database commit failed - cleanup saved files if any
            if new_file_metadata_list:
                logger.warning(
                    "Invocation creation failed, cleaning up saved files",
                    file_count=len(new_file_metadata_list),
                )
                saved_file_paths = [fm.file_path for fm in new_file_metadata_list]
                await file_utils.cleanup_files(saved_file_paths, context="after DB failure")

            # Dispatch failure audit event
            AuditEventDispatcher.dispatch(
                InvocationCreatedEvent(
                    invocation_id=invocation_id,
                    session_id=session_id,
                    file_ids=all_file_ids,
                    agent=ctx.agent,
                    model=ctx.model,
                    metadata=ctx.audit_safe_metadata(),
                    error_type=type(e).__name__,
                )
            )
            raise

        # Schedule background tasks AFTER successful commit
        # Orchestration logic:
        # - If new files uploaded: convert them, then execute
        # - If only pre-uploaded file_ids: execute directly (already converted)
        # - If no files: execute directly
        if new_file_ids:
            # Schedule conversion for new files
            # Note: Execution is triggered by conversion completion (not implemented here yet)
            # For now, we schedule execution after conversion tasks
            self._schedule_conversion_tasks(new_file_ids, invocation_id)
            # TODO(nexus): Implement conversion->execution chaining AAP-61184
            # For now, schedule execution as well (files may still be converting)
            self._schedule_execution_task(invocation_id)
        else:
            # No new uploads - execute directly
            self._schedule_execution_task(invocation_id)

        return invocation

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
            logger.warning("Cancellation failed: Invocation not found", invocation_id=invocation_id)

            # Dispatch NOT_FOUND audit event
            AuditEventDispatcher.dispatch(
                InvocationCancelledEvent(
                    invocation_id=invocation_id,
                    result=InvocationCancellationResult.NOT_FOUND,
                    reason=reason,
                )
            )
            return CancellationResult.NOT_FOUND

        # Check if invocation is in a cancellable state
        if invocation.status not in (InvocationStatus.CREATED, InvocationStatus.RUNNING):
            logger.warning(
                "Cancellation failed: Invocation not in cancellable state",
                invocation_id=invocation_id,
                status=invocation.status.value,
            )

            # Dispatch NOT_CANCELLABLE audit event
            AuditEventDispatcher.dispatch(
                InvocationCancelledEvent(
                    invocation_id=invocation_id,
                    result=InvocationCancellationResult.NOT_CANCELLABLE,
                    reason=reason,
                    current_status=invocation.status,
                )
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
        cleaned_file_ids = await self._cleanup_invocation_files(invocation)

        # Note: Background document conversion tasks cannot be cancelled directly due to
        # FastAPI BackgroundTasks limitations. However, conversion tasks are typically
        # short-lived and will complete harmlessly even for cancelled invocations.

        try:
            await self.session.commit()

            logger.info("Invocation cancelled successfully", invocation_id=invocation_id, reason=reason)

            # Dispatch success audit event
            AuditEventDispatcher.dispatch(
                InvocationCancelledEvent(
                    invocation_id=invocation_id,
                    result=InvocationCancellationResult.SUCCESS,
                    reason=reason,
                    files_cleaned=cleaned_file_ids,
                    current_status=InvocationStatus.CANCELLED,
                )
            )
            return CancellationResult.SUCCESS

        except Exception as e:
            # Dispatch failure audit event
            AuditEventDispatcher.dispatch(
                InvocationCancelledEvent(
                    invocation_id=invocation_id,
                    result=InvocationCancellationResult.SUCCESS,
                    reason=reason,
                    files_cleaned=cleaned_file_ids,
                    error_type=type(e).__name__,
                )
            )
            raise

    async def _cleanup_files_from_paths(self, files_to_cleanup: list[str], invocation_id: UUID) -> None:
        """Clean up files from given paths (best-effort)."""
        if not files_to_cleanup:
            logger.debug("No file paths found to clean up for invocation", invocation_id=invocation_id)
            return

        logger.info(
            "Cleaning up files for cancelled invocation",
            file_count=len(files_to_cleanup),
            invocation_id=invocation_id,
        )
        try:
            await file_utils.cleanup_files(files_to_cleanup, context="after invocation cancellation")
        except Exception:
            logger.exception(
                "File cleanup failed for cancelled invocation, but cancellation will proceed",
                invocation_id=invocation_id,
            )

    async def _cleanup_invocation_files(self, invocation: Invocation) -> list[UUID]:
        """Clean up uploaded and converted files associated with an invocation.

        This method extracts file_ids from the invocation's context_data,
        retrieves FileMetadata records from the database, and cleans up
        both original uploaded files and converted files.

        Args:
            invocation: The invocation whose files should be cleaned up

        Note:
            This is a best-effort cleanup that won't raise exceptions if
            file deletion fails. Errors are logged for debugging.

        """
        ctx = InvocationContextData.model_validate(invocation.context_data or {})
        if not ctx.file_ids:
            logger.debug("No files to clean up for invocation", invocation_id=invocation.id)
            return []

        # Convert strings to UUIDs at the boundary
        file_ids = [UUID(fid) for fid in ctx.file_ids]

        # Get file metadata from database via FileManager
        file_metadata_records = await self.file_manager.get_files_metadata(file_ids, self.session)
        if not file_metadata_records:
            logger.debug("No FileMetadata records found for invocation", invocation_id=invocation.id)
            return []

        files_to_cleanup: list[str] = []
        for metadata in file_metadata_records:
            if metadata.file_path:
                files_to_cleanup.append(metadata.file_path)
            if metadata.converted_content_path:
                files_to_cleanup.append(metadata.converted_content_path)

        await self._cleanup_files_from_paths(files_to_cleanup, invocation.id)

        return file_ids

    async def list_invocations(
        self,
        limit: int = 20,
        cursor: str | None = None,
        sort: str | None = None,
        query_params_items: Iterable[tuple[str, str]] | None = None,
        *,
        include_total: bool = False,
    ) -> InvocationListResponse:
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
