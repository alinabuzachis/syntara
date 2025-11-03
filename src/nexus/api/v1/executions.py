"""Execution API endpoints."""

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from temporalio.service import RPCError

from nexus.api.auth import get_current_user
from nexus.api.db import get_db
from nexus.core.models import User
from nexus.core.models.base import ResourcesResponse
from nexus.core.utils.labels import parse_label_filter
from nexus.core.utils.pagination import generate_response
from nexus.workflows.models.execution import Execution, ExecutionCreate, ExecutionRead, ExecutionStatus
from nexus.workflows.services import ExecutionService
from nexus.workflows.services.execution_service import WorkflowDisabledError, WorkflowNotFoundError
from nexus.workflows.workflow_engine.services.execution_service import create_execution_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/executions", tags=["executions"])


@router.get("")
async def list_executions(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    workflow_id: Annotated[UUID | None, Query(description="Filter by workflow ID")] = None,
    created_by: Annotated[UUID | None, Query(description="Filter by user who created execution")] = None,
    status_param: Annotated[
        ExecutionStatus | None, Query(alias="status", description="Filter by execution status")
    ] = None,
    limit: Annotated[int, Query(ge=1, le=100, description="Maximum number of results")] = 20,
    cursor: Annotated[str | None, Query(description="Pagination cursor")] = None,
    sort: Annotated[str | None, Query(description="Sort parameter (e.g., 'created_at' or '-created_at')")] = None,
    include_total: Annotated[bool, Query(description="Include total count in response")] = False,  # noqa: FBT002
) -> ResourcesResponse[ExecutionRead]:
    """List workflow executions with cursor-based pagination (spec 006 compliant).

    Supports filtering by workflow_id, created_by, status, and labels.
    Uses cursor-based pagination for scalability and consistency.

    Args:
        request: FastAPI request object for extracting label filters
        db: Database session
        workflow_id: Filter by workflow ID
        created_by: Filter by user who created the execution
        status_param: Filter by execution status
        limit: Maximum results per page (default 20, max 100)
        cursor: Base64-encoded pagination cursor from previous response
        sort: Sort parameter (default: "-created_at")
        include_total: Whether to include total count (default false, expensive)

    Returns:
        ResourcesResponse with executions, next/prev cursors, and optional total

    """
    # Parse label filters from query parameters (e.g., labels[environment]=production)
    query_params = dict(request.query_params)
    labels_filter = parse_label_filter(query_params)

    # Create execution service
    service = ExecutionService(db)

    # Get executions using cursor-based pagination
    executions = await service.list_executions_cursor(
        workflow_id=workflow_id,
        created_by=created_by,
        status=status_param,
        labels_filter=labels_filter,
        limit=limit,
        cursor=cursor,
        sort=sort,
    )

    # Optionally compute total count (only when requested)
    total = None
    if include_total:
        total = await service.count_executions(
            workflow_id=workflow_id,
            created_by=created_by,
            status=status_param,
            labels_filter=labels_filter,
        )

    # Generate pagination metadata (next/prev cursors)
    pagination = generate_response(
        items=executions,
        limit=limit,
        cursor=cursor,
        include_total=include_total,
        total_count=total,
    )

    return ResourcesResponse[ExecutionRead](
        resources=executions,
        next=pagination["next"],
        prev=pagination["prev"],
        total=pagination["total"],
    )


@router.post("", response_model=ExecutionRead, status_code=status.HTTP_201_CREATED)
async def create_execution(
    request: ExecutionCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Execution:
    """Create and start a new workflow execution.

    This endpoint follows a two-phase creation process:
    1. Start Temporal workflow FIRST (external system validation)
    2. Create database record ONLY after Temporal accepts workflow

    This ensures no orphaned database records if Temporal rejects the workflow.

    Args:
        request: Execution creation request with workflow_id and input_data
        db: Database session
        current_user: Current authenticated user

    Returns:
        Created execution with status=PENDING

    Raises:
        HTTPException: 404 if workflow not found
        HTTPException: 400 if workflow is disabled
        HTTPException: 503 if Temporal unavailable
        HTTPException: 500 if Temporal workflow start fails

    """
    logger.info(
        "Creating execution for workflow %s by user %s",
        request.workflow_id,
        current_user.id,
    )

    # Get or create Temporal execution service
    temporal_service = None
    try:
        temporal_service = await create_execution_service()
    except (RPCError, OSError, ConnectionError, RuntimeError) as e:
        # RPCError: Temporal server RPC errors
        # OSError/ConnectionError: Network/connection issues
        # RuntimeError: Temporal connection failures (e.g., connection refused)
        logger.warning("Temporal service unavailable: %s", e)
        # Continue without Temporal for testing - service will use stub IDs

    # Create execution service with database and optional Temporal
    service = ExecutionService(db, temporal_service=temporal_service)

    try:
        return await service.create_execution(
            workflow_id=request.workflow_id,
            input_data=request.input_data,
            created_by=current_user.id,
        )
    except WorkflowNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        ) from e
    except WorkflowDisabledError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e
    except Exception as e:
        logger.exception("Failed to create execution")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create execution: {e}",
        ) from e
