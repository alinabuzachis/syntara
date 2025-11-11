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
from nexus.workflows.exceptions import (
    ExecutionNotFoundError,
    WorkflowDisabledError,
    WorkflowNotFoundError,
)
from nexus.workflows.models.execution import Execution, ExecutionCreate, ExecutionListResponse, ExecutionRead
from nexus.workflows.services import ExecutionService
from nexus.workflows.workflow_engine.services.temporal_execution_service import (
    TemporalExecutionService,
    create_temporal_execution_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/executions", tags=["executions"])


# ============================================================================
# Dependency Injection Providers
# ============================================================================


async def get_temporal_execution_service() -> TemporalExecutionService | None:
    """Dependency provider for Temporal execution service.

    FastAPI will call this function automatically when a route depends on it.
    Returns None if Temporal is unavailable (graceful degradation for testing).

    Returns:
        TemporalExecutionService if available, None otherwise

    """
    try:
        return await create_temporal_execution_service()
    except (RPCError, OSError, ConnectionError, RuntimeError) as e:
        logger.warning("Temporal service unavailable: %s", e)
        return None


async def get_execution_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    temporal_service: Annotated[
        TemporalExecutionService | None,
        Depends(get_temporal_execution_service),
    ],
) -> ExecutionService:
    """Dependency provider for ExecutionService.

    FastAPI will call this function automatically, injecting all dependencies.
    This centralizes ExecutionService creation across all endpoints.

    Args:
        db: Database session (injected by FastAPI)
        current_user: Current authenticated user
        temporal_service: Temporal service (injected by FastAPI, may be None)

    Returns:
        ExecutionService configured with database and optional Temporal integration

    """
    return ExecutionService(db, current_user, temporal_service=temporal_service)


@router.get("")
async def list_executions(
    request: Request,
    service: Annotated[ExecutionService, Depends(get_execution_service)],
    limit: Annotated[int, Query(ge=1, le=100, description="Maximum number of results")] = 20,
    cursor: Annotated[str | None, Query(description="Pagination cursor")] = None,
    sort: Annotated[str | None, Query(description="Sort parameter (e.g., 'created_at' or '-created_at')")] = None,
    *,
    include_total: Annotated[bool, Query(description="Include total count in response")] = False,
) -> ExecutionListResponse:
    """List executions with filtering, sorting, and pagination.

    Supports filtering using query parameters with standard operators:
    - workflow_id: Filter by workflow ID (workflow_id=uuid)
    - created_by: Filter by creator user ID (created_by=uuid)
    - status: Filter by execution status (status=pending|running|completed|failed|cancelled)
    - labels: Filter by labels using bracket notation (labels[environment]=production)

    Uses cursor-based pagination for scalability and consistency.

    Args:
        request: FastAPI request object containing query parameters
        service: Execution service (injected by FastAPI)
        limit: Maximum results per page (default 20, max 100)
        cursor: Base64-encoded pagination cursor from previous response
        sort: Sort parameter (e.g., 'created_at', '-status')
        include_total: Whether to include total count (default false, expensive)

    Returns:
        ExecutionListResponse with executions, pagination metadata, and optional total

    """
    # Use unified list method with query parameters
    try:
        return await service.list_executions(
            limit=limit,
            cursor=cursor,
            sort=sort,
            query_params_items=request.query_params.items(),
            include_total=include_total,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        ) from e


@router.post("", response_model=ExecutionRead, status_code=status.HTTP_201_CREATED)
async def create_execution(
    request: ExecutionCreate,
    service: Annotated[ExecutionService, Depends(get_execution_service)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Execution:
    """Create and start a new workflow execution.

    This endpoint follows a two-phase creation process:
    1. Start Temporal workflow FIRST (external system validation)
    2. Create database record ONLY after Temporal accepts workflow

    This ensures no orphaned database records if Temporal rejects the workflow.

    Args:
        request: Execution creation request with workflow_id and input_data
        service: Execution service (injected by FastAPI)
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

    try:
        return await service.create_execution(
            workflow_id=request.workflow_id,
            input_data=request.input_data,
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


@router.get("/{execution_id}", response_model=ExecutionRead)
async def get_execution(
    execution_id: UUID,
    service: Annotated[ExecutionService, Depends(get_execution_service)],
) -> Execution:
    """Get an execution by ID.

    Args:
        execution_id: Execution ID
        service: Execution service (injected by FastAPI)

    Returns:
        Execution details with current status, timestamps, and error details if failed

    Raises:
        HTTPException: 404 if execution not found

    """
    try:
        return await service.get_execution(execution_id)
    except ExecutionNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        ) from e
