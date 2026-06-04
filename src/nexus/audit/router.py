"""Audit events API endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import Body, Depends, Query, Request, Response
from fastapi.responses import FileResponse
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.audit.export.models import AuditExportCreate, AuditExportRead
from nexus.audit.models.audit_event_record import AuditEventRecord
from nexus.audit.models.schemas import AuditEventListParams, AuditEventListResponse
from nexus.audit.services.audit_event_service import AuditEventService
from nexus.auth import get_current_user
from nexus.authz.dependencies import PermissionChecker
from nexus.core.database.audit_session import get_audit_db
from nexus.core.models import User
from nexus.core.nexus_router import NexusRouter

router = NexusRouter(prefix="/audit", tags=["Audit Events"])

_audit_perm_read = PermissionChecker(
    "audit",
    "read",
)

# ============================================================================
# Dependency Injection Providers
# ============================================================================


def get_audit_event_service(
    db: Annotated[AsyncSession, Depends(get_audit_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> AuditEventService:
    """Dependency provider for AuditEventService."""
    return AuditEventService(db, current_user)


# ============================================================================
# Audit event endpoints
# ============================================================================


@router.get(
    "",
    dependencies=[Depends(_audit_perm_read)],
    operation_id="list_audit_events",
    response_model=AuditEventListResponse,
    response_description="Paginated list of audit events",
)
async def list_audit_events(
    request: Request,
    service: Annotated[AuditEventService, Depends(get_audit_event_service)],
    params: Annotated[AuditEventListParams, Query()],
) -> AuditEventListResponse:
    """Retrieve a paginated list of audit events with optional filtering.

    Use this endpoint to:
    - Review system activity for a specific actor
    - Trace operations within a workflow or execution
    - Investigate events within a date range
    - Filter by actor type (user, system, service)
    """
    return await service.list_resources(
        model=AuditEventRecord,
        response_type=AuditEventListResponse,
        limit=params.limit,
        cursor=params.cursor,
        sort=params.sort,
        query_params_items=request.query_params.items(),
        include_total=params.include_total,
    )


# ============================================================================
# Audit export endpoints
# ============================================================================


@router.post(
    "/exports",
    dependencies=[Depends(_audit_perm_read)],
    operation_id="start_audit_export",
    response_model=AuditExportRead,
    status_code=202,
    response_description="Export job accepted",
)
async def start_audit_export(
    service: Annotated[AuditEventService, Depends(get_audit_event_service)],
    body: Annotated[AuditExportCreate | None, Body()] = None,
) -> AuditExportRead:
    """Start an asynchronous audit event export.

    Returns immediately with an export ID that can be used to poll for
    status and download the result once complete.
    """
    return await service.start_export(body if body is not None else AuditExportCreate())


@router.get(
    "/exports/{export_id}",
    dependencies=[Depends(_audit_perm_read)],
    operation_id="get_audit_export_status",
    response_model=AuditExportRead,
    response_description="Export job status",
)
async def get_audit_export_status(
    export_id: UUID,
    service: Annotated[AuditEventService, Depends(get_audit_event_service)],
) -> AuditExportRead:
    """Check the status of an audit export job."""
    return await service.get_export_status(export_id)


@router.get(
    "/exports/{export_id}/download",
    dependencies=[Depends(_audit_perm_read)],
    operation_id="download_audit_export",
    response_class=Response,
    responses={
        200: {
            "content": {"text/csv": {"schema": {"type": "string", "format": "binary"}}},
            "description": "Exported audit data file",
        },
    },
)
async def download_audit_export(
    export_id: UUID,
    service: Annotated[AuditEventService, Depends(get_audit_event_service)],
) -> FileResponse:
    """Download the result of a completed audit export."""
    file_path = await service.get_export_file_path(export_id)
    return FileResponse(
        path=file_path,
        filename=file_path.name,
        media_type="text/csv",
    )
