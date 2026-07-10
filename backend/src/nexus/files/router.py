"""Files API endpoints for v1.

This module provides the standalone file upload endpoint that creates
FileMetadata records in the database for later use in agent invocations.

Document conversion is triggered automatically for each uploaded file
via a builtin Temporal workflow.
"""

from io import BytesIO
from typing import Annotated
from uuid import UUID

import structlog
from fastapi import (
    Depends,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.audit.dispatcher import AuditEventDispatcher
from nexus.auth import get_current_user
from nexus.authz.dependencies import PermissionChecker, VisibilityFilter
from nexus.authz.engine import VisibilityResult
from nexus.core.database.session import get_db
from nexus.core.models import User
from nexus.core.nexus_router import NexusRouter
from nexus.files.audit.file_downloaded import FileDownloadedEvent
from nexus.files.file_manager import FileManager, get_file_manager
from nexus.files.models.file_metadata import FileMetadata, FileStatus
from nexus.files.storage import sanitize_filename
from nexus.workflows.executions_router import get_temporal_execution_service
from nexus.workflows.services.execution_service import ExecutionService
from nexus.workflows.workflow_engine.services.temporal_execution_service import TemporalExecutionService

router = NexusRouter(prefix="/files", tags=["Files"])
logger = structlog.stdlib.get_logger(__name__)

_files_perm_upload = PermissionChecker(
    "files",
    "upload",
    form_project_field="project_id",
)

# ============================================================================
# Dependency Injection Providers
# ============================================================================


class UploadFilesBody(BaseModel):
    """Request body for POST /files endpoint."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    files: list[UploadFile] = Field(description="Files to upload (1-10 files, max 10MB each)")
    project_id: UUID = Field(description="Project to associate files with")


class FileUploadInfo(BaseModel):
    """Response model for individual file upload information.

    Security Note:
        file_path is intentionally excluded from this model to prevent
        exposing internal filesystem paths in API responses.
    """

    file_id: UUID = Field(
        title="File ID", description="Unique file identifier (UUID)", examples=["550e8400-e29b-41d4-a716-446655440000"]
    )
    filename: str = Field(description="Original filename from upload", examples=["document.pdf"])
    size_bytes: int = Field(description="File size in bytes", examples=[524288])
    mime_type: str = Field(
        title="MIME Type", description="Detected MIME type of the file", examples=["application/pdf"]
    )
    status: FileStatus = Field(description="Processing status (pending_conversion)")


class FileUploadResponse(BaseModel):
    """Response model for POST /api/v1/files endpoint."""

    file_ids: list[UUID] = Field(
        title="File IDs",
        description="List of file IDs for later reference in invocations",
        examples=[["550e8400-e29b-41d4-a716-446655440000"]],
    )
    files: list[FileUploadInfo] = Field(description="Metadata for each uploaded file")


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="Upload Files (Design Time)",
    description="Upload files independently of invocations for later use in agent execution. "
    "Returns file_ids that can be stored in workflow configuration and passed to invocations. "
    "Files are validated, stored, and queued for document conversion.",
    dependencies=[Depends(_files_perm_upload)],
    operation_id="upload_files",
    response_description="Files uploaded successfully",
    openapi_extra={
        "responses": {
            "201": {
                "content": {
                    "application/json": {
                        "examples": {
                            "singleFile": {
                                "summary": "Single file upload",
                                "value": {
                                    "file_ids": ["550e8400-e29b-41d4-a716-446655440000"],
                                    "files": [
                                        {
                                            "file_id": "550e8400-e29b-41d4-a716-446655440000",
                                            "filename": "document.pdf",
                                            "size_bytes": 524288,
                                            "mime_type": "application/pdf",
                                            "status": "pending_conversion",
                                        }
                                    ],
                                },
                            }
                        }
                    }
                }
            }
        }
    },
)
async def upload_files(
    db: Annotated[AsyncSession, Depends(get_db)],
    file_manager: Annotated[FileManager, Depends(get_file_manager)],
    current_user: Annotated[User, Depends(get_current_user)],
    body: Annotated[UploadFilesBody, Form(media_type="multipart/form-data")],
    temporal_service: Annotated[TemporalExecutionService | None, Depends(get_temporal_execution_service)],
) -> FileUploadResponse:
    """Upload files for later use in agent invocations.

    This endpoint allows uploading files at workflow design time. Files are:
    1. Validated (size, type, count)
    2. Stored on the filesystem
    3. Registered in the FileMetadata database table
    4. Queued for document conversion (via builtin Temporal workflow)

    Args:
        db: Database session (dependency injected)
        file_manager: FileManager instance (dependency injected)
        current_user: Current authenticated user
        body: Upload body containing the list of files (multipart/form-data)
        temporal_service: Temporal execution service (injected by FastAPI)

    Returns:
        FileUploadResponse with file_ids and file metadata

    Raises:
        HTTPException: 400 for validation errors, 500 for storage failures

    """
    # Validate at least one file is provided
    if not body.files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one file must be provided",
        )

    # Validate and save files (returns in-memory FileMetadata objects)
    file_metadata_list = await file_manager.validate_and_save_files(body.files, body.project_id)

    for metadata in file_metadata_list:
        db.add(metadata)

    await db.commit()

    # Refresh to get database-assigned values
    for metadata in file_metadata_list:
        await db.refresh(metadata)

    # Start builtin document conversion workflows via Temporal (non-blocking RPC)
    if temporal_service:
        exec_service = ExecutionService(db, current_user, temporal_service=temporal_service)

        from nexus.workflows.constants import (  # noqa: PLC0415
            BUILTIN_PROJECT_NAME,
            BUILTIN_WORKFLOW_DOCUMENT_CONVERSION,
        )

        for metadata in file_metadata_list:
            try:
                await exec_service.create_execution_by_name(
                    workflow_name=BUILTIN_WORKFLOW_DOCUMENT_CONVERSION,
                    input_data={"file_id": str(metadata.id)},
                    project_name=BUILTIN_PROJECT_NAME,
                )
            except Exception:  # noqa: BLE001
                logger.warning(
                    "Document conversion dispatch failed, file uploaded but conversion skipped",
                    file_id=str(metadata.id),
                    exc_info=True,
                )

    # Build response (exclude file_path for security)
    file_upload_infos = [
        FileUploadInfo(
            file_id=metadata.id,
            filename=metadata.filename,
            size_bytes=metadata.size_bytes,
            mime_type=metadata.mime_type,
            status=metadata.status,
        )
        for metadata in file_metadata_list
    ]

    return FileUploadResponse(
        file_ids=[m.id for m in file_metadata_list],
        files=file_upload_infos,
    )


_files_perm_download = PermissionChecker(
    "files",
    "download",
    resource_model=FileMetadata,
    resource_id_param="file_id",
)


class FilesMetadataResponse(BaseModel):
    """Response model for GET /files/metadata endpoint."""

    files: list[FileUploadInfo] = Field(
        description="Metadata for each found file (missing IDs are silently omitted)",
    )


_files_visibility = VisibilityFilter("files", "download")


@router.get(
    "/metadata",
    summary="Get Files Metadata (Batch)",
    description="Retrieve metadata for one or more files by their IDs. "
    "Returns file information (filename, size, MIME type, status) without file content.",
    operation_id="get_files_metadata",
)
async def get_files_metadata(
    file_ids: Annotated[
        list[UUID],
        Query(min_length=1, max_length=10, title="File IDs", description="List of file IDs to retrieve metadata for"),
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
    file_manager: Annotated[FileManager, Depends(get_file_manager)],
    visibility: Annotated[VisibilityResult, Depends(_files_visibility)],
) -> FilesMetadataResponse:
    """Retrieve metadata for multiple files by their IDs."""
    metadata_list = await file_manager.get_files_metadata(
        file_ids,
        db,
        allowed_projects=visibility.to_allowed_projects(),
    )
    return FilesMetadataResponse(
        files=[
            FileUploadInfo(
                file_id=m.id,
                filename=m.filename,
                size_bytes=m.size_bytes,
                mime_type=m.mime_type,
                status=m.status,
            )
            for m in metadata_list
        ],
    )


@router.get(
    "/{file_id}/download",
    summary="Download File",
    description="Download a file by its ID. Serves the file from whichever storage backend it was uploaded to.",
    dependencies=[Depends(_files_perm_download)],
    operation_id="download_file",
    response_class=StreamingResponse,
    responses={
        200: {
            "description": "File content as binary stream",
            "content": {
                "application/octet-stream": {
                    "schema": {"type": "string", "contentMediaType": "application/octet-stream"},
                },
            },
        },
    },
)
async def download_file(
    file_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    file_manager: Annotated[FileManager, Depends(get_file_manager)],
) -> StreamingResponse:
    """Download a file by ID from S3 storage.

    Authorization is handled entirely by PermissionChecker (dependency),
    which verifies files:download permission via project-scoped Rego policies.

    Args:
        file_id: UUID of the file to download
        db: Database session
        file_manager: FileManager instance

    Returns:
        StreamingResponse with file content, MIME type, and Content-Disposition

    Raises:
        HTTPException: 404 if file not found

    """
    metadata = await file_manager.get_file_metadata(file_id, db)
    if metadata is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The requested file could not be found",
        )

    download_error: str | None = None
    try:
        content = await file_manager.load_file_with_integrity_check(metadata)
    except Exception as e:
        download_error = type(e).__name__
        raise
    finally:
        AuditEventDispatcher.dispatch(
            FileDownloadedEvent(
                file_id=metadata.id,
                filename=metadata.filename,
                mime_type=metadata.mime_type,
                size_bytes=metadata.size_bytes,
                storage_backend="s3",
                error_type=download_error,
            ),
        )

    safe_name = sanitize_filename(metadata.filename)
    return StreamingResponse(
        BytesIO(content),
        media_type=metadata.mime_type,
        headers={
            "content-disposition": f'attachment; filename="{safe_name}"',
            "x-content-type-options": "nosniff",
        },
    )
