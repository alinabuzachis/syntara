"""Files API endpoints for v1.

This module provides the standalone file upload endpoint that creates
FileMetadata records in the database for later use in agent invocations.

Document conversion is triggered automatically for each uploaded file
as a background task (AAP-60780 decoupling).
"""

import logging
from typing import Annotated

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from pydantic import BaseModel, Field
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.api.auth import get_current_user
from nexus.core.database.session import get_db
from nexus.core.models import User
from nexus.core.utils.session_factory import create_session_factory_from_request
from nexus.files import FileManager, get_file_manager
from nexus.files.document_conversion.tasks import DocumentConversionTask
from nexus.files.validators import ValidationError as FileValidationError

router = APIRouter(prefix="/files", tags=["Files"])
logger = logging.getLogger(__name__)


# ============================================================================
# Dependency Injection Providers
# ============================================================================


def get_document_conversion_task(
    request: Request,
) -> DocumentConversionTask:
    """Dependency provider for DocumentConversionTask.

    Args:
        request: FastAPI request object (contains app with dependency overrides)

    Returns:
        DocumentConversionTask configured with appropriate session factory

    """
    session_factory = create_session_factory_from_request(request)
    return DocumentConversionTask(session_factory=session_factory)


class FileUploadInfo(BaseModel):
    """Response model for individual file upload information.

    Security Note:
        file_path is intentionally excluded from this model to prevent
        exposing internal filesystem paths in API responses.
    """

    file_id: str = Field(description="Unique file identifier (UUID)")
    filename: str = Field(description="Original filename")
    size_bytes: int = Field(description="File size in bytes")
    mime_type: str = Field(description="Detected MIME type")
    status: str = Field(description="Processing status (pending_conversion)")


class FileUploadResponse(BaseModel):
    """Response model for POST /api/v1/files endpoint."""

    file_ids: list[str] = Field(description="List of file IDs for later reference")
    files: list[FileUploadInfo] = Field(description="Metadata for each uploaded file")


@router.post(
    "",
    status_code=status.HTTP_200_OK,
    summary="Upload Files (Design Time)",
    description="Upload files independently of invocations for later use in agent execution. "
    "Returns file_ids that can be stored in workflow configuration and passed to invocations. "
    "Files are validated, stored, and queued for document conversion.",
)
async def upload_files(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],  # noqa: ARG001 - required for authentication
    file_manager: Annotated[FileManager, Depends(get_file_manager)],
    background_tasks: BackgroundTasks,
    document_conversion_task: Annotated[DocumentConversionTask, Depends(get_document_conversion_task)],
    files: Annotated[list[UploadFile], File(description="Files to upload (1-10 files, max 10MB each)")],
) -> FileUploadResponse:
    """Upload files for later use in agent invocations.

    This endpoint allows uploading files at workflow design time. Files are:
    1. Validated (size, type, count)
    2. Stored on the filesystem
    3. Registered in the FileMetadata database table
    4. Queued for document conversion (background task)

    The returned file_ids can be stored in workflow configuration and passed
    to invocations via context_data.file_ids. Pre-converted files enable
    immediate invocation execution without conversion delay.

    Args:
        db: Database session (dependency injected)
        current_user: Current authenticated user
        file_manager: FileManager instance (dependency injected)
        background_tasks: FastAPI background tasks for scheduling conversion
        document_conversion_task: DocumentConversionTask with session factory
        files: List of files to upload (multipart/form-data)

    Returns:
        FileUploadResponse with file_ids and file metadata

    Raises:
        HTTPException: 400 for validation errors, 500 for storage failures

    """
    # Validate at least one file is provided
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one file must be provided",
        )

    try:
        # Validate and save files (returns in-memory FileMetadata objects)
        file_metadata_list = await file_manager.validate_and_save_files(files)

        # Persist FileMetadata records to database
        for metadata in file_metadata_list:
            db.add(metadata)

        await db.commit()

        # Refresh to get database-assigned values
        for metadata in file_metadata_list:
            await db.refresh(metadata)

        # Schedule document conversion for each file as a background task (AAP-60780)
        # This enables pre-conversion so files are ready when attached to invocations
        for metadata in file_metadata_list:
            logger.info(
                "Scheduling document conversion for standalone file upload (file_id=%s)",
                metadata.id,
            )
            background_tasks.add_task(document_conversion_task.convert, metadata.id)

        # Build response (exclude file_path for security)
        file_upload_infos = [
            FileUploadInfo(
                file_id=str(metadata.id),
                filename=metadata.filename,
                size_bytes=metadata.size_bytes,
                mime_type=metadata.mime_type,
                status=metadata.status.value,
            )
            for metadata in file_metadata_list
        ]

        return FileUploadResponse(
            file_ids=[str(m.id) for m in file_metadata_list],
            files=file_upload_infos,
        )

    except FileValidationError as e:
        logger.warning("File validation error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e
    except OSError as e:
        # Storage failures (disk full, permission denied, I/O errors) - 500 Internal Server Error
        logger.exception("File storage error during upload")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process file upload",
        ) from e
    except Exception as e:
        logger.exception("Unexpected error during file upload")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        ) from e
