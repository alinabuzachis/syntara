"""Approvals API endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Request, status
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.approvals.models import ApprovalRequestRead
from nexus.approvals.models.api_models import (
    ApprovalCreateRequest,
    ApprovalDecisionRequest,
    BatchApprovalRequest,
)
from nexus.approvals.models.approval_request import ApprovalListResponse
from nexus.approvals.models.batch_response import BatchApprovalResponse
from nexus.approvals.models.query_params import ApprovalListParams
from nexus.approvals.services.approval_service import ApprovalService
from nexus.auth import get_current_user
from nexus.core.database.session import get_db
from nexus.core.models import User

router = APIRouter(prefix="/approvals", tags=["approvals"])

# Exception handlers are registered globally in main.py via the exception registry
# Domain exceptions raised by services automatically bubble up to global handlers


# ============================================================================
# Dependency Injection Providers
# ============================================================================


def get_approval_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ApprovalService:
    """Dependency provider for ApprovalService.

    FastAPI will call this function automatically, injecting all dependencies.
    This centralizes ApprovalService creation across all endpoints.

    Args:
        db: Database session
        current_user: Current authenticated user

    Returns:
        ApprovalService configured with database session and user

    """
    return ApprovalService(db, current_user)


# ============================================================================
# Approvals endpoints
# ============================================================================


@router.get("")
async def list_approvals(
    request: Request,
    service: Annotated[ApprovalService, Depends(get_approval_service)],
    params: Annotated[ApprovalListParams, Depends()],
) -> ApprovalListResponse:
    """List approval requests with filtering, sorting, and pagination.

    Supports filtering using query parameters with standard operators:
    - status: Filter by approval status (status=pending)
    - execution_id: Filter by parent execution ID (execution_id=uuid)

    Uses cursor-based pagination for scalability and consistency.

    Args:
        request: FastAPI request object containing query parameters
        service: Approval service
        params: Query parameters for pagination and filtering

    Returns:
        ApprovalListResponse with approvals, pagination metadata, and optional total

    """
    return await service.list(
        limit=params.limit,
        cursor=params.cursor,
        sort=params.sort,
        query_params_items=request.query_params.items(),
        include_total=params.include_total,
    )


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_approval(
    request: ApprovalCreateRequest,
    service: Annotated[ApprovalService, Depends(get_approval_service)],
) -> ApprovalRequestRead:
    """Create a new approval request.

    This is an internal endpoint called by the Workflows component when
    a workflow execution reaches an approval node. It should not be called
    directly by end users.

    Args:
        request: Approval creation request
        service: Approval service

    Returns:
        Created approval request

    """
    return await service.create(request)


@router.get("/{approval_id}")
async def get_approval(
    approval_id: UUID,
    service: Annotated[ApprovalService, Depends(get_approval_service)],
) -> ApprovalRequestRead:
    """Get an approval request by ID.

    The response includes:
    - Full request context (workflow inputs, completed step outputs)
    - Next steps for both approval and rejection paths
    - Decision history if already decided

    Args:
        approval_id: Approval request UUID
        service: Approval service

    Returns:
        Approval request details

    """
    return await service.get(approval_id)


@router.patch("/{approval_id}")
async def decide_approval(
    approval_id: UUID,
    request: ApprovalDecisionRequest,
    service: Annotated[ApprovalService, Depends(get_approval_service)],
) -> ApprovalRequestRead:
    """Submit an approval decision (approve or reject).

    Only pending approval requests can be decided. Attempting to modify an approval
    that is already approved, rejected, expired, or cancelled will return an error.

    When a decision is submitted:
    1. The approval request status is updated
    2. The decided_by, decided_at, and decision_notes fields are populated
    3. A signal is sent to the workflow to resume execution on the appropriate path

    Args:
        approval_id: Approval request UUID
        request: Decision request with status and notes
        service: Approval service

    Returns:
        Updated approval request

    """
    return await service.decide(approval_id, request)


@router.post("/batch")
async def batch_decide_approvals(
    request: BatchApprovalRequest,
    service: Annotated[ApprovalService, Depends(get_approval_service)],
) -> BatchApprovalResponse:
    """Submit decisions for multiple approval requests at once.

    This endpoint processes each decision independently. If some decisions fail,
    the successful ones are still recorded. The response includes detailed results
    for each decision.

    Use cases:
    - Approving multiple related requests at once
    - Bulk rejection of stale or irrelevant requests

    Args:
        request: Batch approval request with multiple decisions
        service: Approval service

    Returns:
        Batch response with individual results and summary counts

    """
    return await service.batch_decide(request)
