"""Document conversion service for managing conversion operations.

This module provides the main service for coordinating document conversion
operations with file manager integration and status management.
"""

import contextlib
import logging
from collections.abc import AsyncGenerator, Awaitable, Callable, Generator
from datetime import UTC, datetime
from typing import cast
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from nexus.agent_orchestrator.context_manager.file_manager import FileMetadata
from nexus.agent_orchestrator.context_manager.file_manager.document_conversion import DocumentConversionService
from nexus.agent_orchestrator.context_manager.file_manager.document_conversion.services import get_conversion_service
from nexus.agent_orchestrator.context_manager.file_manager.document_conversion.services.types import ConversionState
from nexus.agent_orchestrator.models.invocation import Invocation
from nexus.agent_orchestrator.services.invocation_execution_service import InvocationExecutionService
from nexus.api.db.session import get_db
from nexus.core.constants import CONTEXT_KEY_FILE_METADATA

logger = logging.getLogger(__name__)


class DocumentConversionTask:
    """Task handler for document conversion background processing.

    Manages the conversion of uploaded files to markdown format as part of
    the invocation workflow. Handles database updates and error management.
    """

    def __init__(
        self,
        session_factory: Callable[[], AsyncGenerator[AsyncSession, None]] = get_db,
        service_factory: Callable[[], Generator[DocumentConversionService, None]] = get_conversion_service,
    ) -> None:
        """Initialize the document conversion task.

        Args:
            session_factory: Factory function for creating database sessions
            service_factory: Factory function for creating DocumentConversionService

        """
        self.session_factory = session_factory
        self.service = next(service_factory())
        # Create async context managers from factories
        self.get_async_session_context = contextlib.asynccontextmanager(session_factory)

    async def _load_invocation(self, invocation_id: UUID) -> Invocation | None:
        """Load invocation and extract file metadata for processing.

        Args:
            invocation_id: ID of the invocation to load

        Returns:
            Invocation object

        Raises:
            ValueError: If invocation not found

        """
        async with self.get_async_session_context() as session:
            invocation: Invocation | None = await session.get(Invocation, invocation_id)
            if not invocation:
                logger.error("Invocation not found (invocation_id=%s)", invocation_id)
                msg = f"Invocation not found: {invocation_id}"
                raise ValueError(msg)

            return invocation

    def _get_metadata_updater(self, invocation_id: UUID) -> Callable[[FileMetadata], Awaitable[None]]:
        """Create a metadata updater function for the given invocation.

        Args:
            invocation_id: ID of the invocation to update

        Returns:
            Async function that updates file metadata in the database

        """

        async def update_metadata(updated_metadata: FileMetadata) -> None:
            async with self.get_async_session_context() as session:
                # Load current invocation
                invocation = await self._load_invocation(invocation_id)
                if not invocation:
                    return

                # Update the specific FileMetadata in context_data
                context_data = dict(invocation.context_data or {})
                file_metadata_list = cast("list[dict[str, object]]", context_data.get(CONTEXT_KEY_FILE_METADATA, []))

                # Find and update the specific file metadata
                for i, fm_dict in enumerate(file_metadata_list):
                    if fm_dict.get("file_id") == updated_metadata.file_id:
                        file_metadata_list[i] = updated_metadata.model_dump()
                        break

                # Save updated context_data
                context_data[CONTEXT_KEY_FILE_METADATA] = file_metadata_list
                invocation.context_data = context_data
                # Notify SQLAlchemy that the JSON field has been updated. Otherwise, changes are not persisted.
                # See https://stackoverflow.com/questions/42559434/updates-to-json-field-dont-persist-to-db
                flag_modified(invocation, "context_data")

                session.add(invocation)
                await session.commit()
                await session.flush()

        return update_metadata

    @staticmethod
    async def _load_invocation_file_metadata(invocation: Invocation | None) -> list[dict[str, object]]:
        files_metadata: list[dict[str, object]] = []
        if not invocation:
            return files_metadata

        context_data = invocation.context_data or {}
        return cast("list[dict[str, object]]", context_data.get(CONTEXT_KEY_FILE_METADATA, []))

    async def _convert_single_document(
        self, invocation_id: UUID, file_metadata_dict: dict[str, object]
    ) -> ConversionState:
        # Create FileMetadata object from dict
        try:
            file_metadata = FileMetadata.model_validate(file_metadata_dict)
        except ValidationError:
            logger.exception(
                "Invalid file metadata in invocation (invocation_id=%s, metadata=%s)",
                invocation_id,
                file_metadata_dict,
            )
            return ConversionState.FAILED

        # Skip if not pending conversion
        if file_metadata.status != "pending_parse":
            logger.info(
                "Skipping file not pending conversion (invocation_id=%s, filename=%s, status=%s)",
                invocation_id,
                file_metadata.filename,
                file_metadata.status,
            )
            return ConversionState.SKIPPED

        try:
            logger.info(
                "Converting file (invocation_id=%s, filename=%s, mime_type=%s)",
                invocation_id,
                file_metadata.filename,
                file_metadata.mime_type,
            )

            # Convert the file
            status_updater = self._get_metadata_updater(invocation_id)
            return await self.service.convert_file(file_metadata, status_updater=status_updater)

        except Exception as e:
            logger.exception(
                "Error converting file (invocation_id=%s, filename=%s)",
                invocation_id,
                file_metadata.filename,
            )

            # Create failure result
            file_metadata.status = "conversion_failed"
            file_metadata.conversion = {
                "error_message": f"Conversion failed with error: {e!s}",
                "error_type": "unexpected_error",
                "failed_at": datetime.now(UTC).isoformat(),
                "exception_type": type(e).__name__,
            }

            # Update database with failure
            updater = self._get_metadata_updater(invocation_id)
            await updater(file_metadata)

        return ConversionState.FAILED

    async def _process_conversions(
        self, invocation_id: UUID, files_to_convert: list[dict[str, object]]
    ) -> tuple[int, int, int]:
        """Process all file conversions and return conversion counts.

        Args:
            invocation_id: ID of the invocation to process
            files_to_convert: List of file metadata dictionaries to convert

        Returns:
            Tuple of (successful_conversions, failed_conversions, skipped_conversions)

        """
        successful_conversions = 0
        failed_conversions = 0
        skipped_conversions = 0

        for file_metadata in files_to_convert:
            try:
                conversion_state: ConversionState = await self._convert_single_document(invocation_id, file_metadata)

                match conversion_state:
                    case ConversionState.SUCCESS:
                        successful_conversions += 1
                    case ConversionState.FAILED:
                        failed_conversions += 1
                    case ConversionState.SKIPPED:
                        skipped_conversions += 1

            except Exception:
                logger.exception(
                    "Failed to convert document (invocation_id=%s, filename=%s)",
                    invocation_id,
                    file_metadata.get("filename", "unknown"),
                )
                failed_conversions += 1

        return successful_conversions, failed_conversions, skipped_conversions

    async def _execute_invocation_after_conversion(self, invocation_id: UUID) -> None:
        """Execute the invocation after all conversions are complete.

        Args:
            invocation_id: ID of the invocation to execute

        """
        try:
            execution_service = InvocationExecutionService(session_factory=self.session_factory)
            await execution_service.execute_invocation(invocation_id)
        except Exception:
            logger.exception(
                "Failed to execute invocation after conversion (invocation_id=%s)",
                invocation_id,
            )

    async def convert(self, invocation_id: UUID) -> None:
        """Background task to process document conversions for an invocation.

        This method:
        1. Loads the invocation and extracts FileMetadata
        2. Processes each document in its own database transaction
        3. Provides incremental updates and better error isolation

        Args:
            invocation_id: ID of the invocation to process

        """
        try:
            # Load invocation data
            invocation: Invocation | None = await self._load_invocation(invocation_id)
            if not invocation:
                return
            files_metadata: list[dict[str, object]] = await DocumentConversionTask._load_invocation_file_metadata(
                invocation
            )

            if not files_metadata:
                logger.info("No file metadata found in invocation (invocation_id=%s)", invocation_id)
                return

            # Filter files that need conversion
            files_to_convert = [
                file_metadata for file_metadata in files_metadata if file_metadata.get("status") == "pending_parse"
            ]

            if not files_to_convert:
                logger.info(
                    "No files need conversion (invocation_id=%s)",
                    invocation_id,
                )
                return

            logger.info(
                "Starting document conversion background task (invocation_id=%s, files_to_convert=%d)",
                invocation_id,
                len(files_to_convert),
            )

            # Process each file independently
            successful_conversions, failed_conversions, skipped_conversions = await self._process_conversions(
                invocation_id, files_to_convert
            )

            logger.info(
                "Document conversion background task completed "
                "(invocation_id=%s, successful=%d, failed=%d, skipped=%d)",
                invocation_id,
                successful_conversions,
                failed_conversions,
                skipped_conversions,
            )

        except Exception:
            logger.exception(
                "Critical error in document conversion background task (invocation_id=%s)",
                invocation_id,
            )

        finally:
            # All conversions are complete, now execute the invocation
            await self._execute_invocation_after_conversion(invocation_id)
