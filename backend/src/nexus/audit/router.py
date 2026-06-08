"""Audit events API endpoints."""

from typing import Annotated

from fastapi import Depends, Query, Request
from sqlmodel.ext.asyncio.session import AsyncSession

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
