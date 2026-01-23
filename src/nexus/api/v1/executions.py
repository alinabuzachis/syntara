"""Execution API endpoints."""

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlmodel.ext.asyncio.session import AsyncSession
from temporalio.service import RPCError

from nexus.api.auth import get_current_user
from nexus.core.database.session import get_db
from nexus.core.models import User
from nexus.workflows.exceptions import (
    ExecutionNotFoundError,
    TemporalUnavailableError,
    WorkflowDisabledError,
    WorkflowNotFoundError,
)
from nexus.workflows.models import ActivitySignalPayload, ExecutionListParams, SignalResponse
from nexus.workflows.models.activity_execution import ActivityExecution
from nexus.workflows.models.execution import (
    ExecutionCreate,
    ExecutionListResponse,
    ExecutionRead,
)
from nexus.workflows.models.query_params import ExecutionIncludeParams
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


def get_execution_service(
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
    params: Annotated[ExecutionListParams, Query()],
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
        params: Query parameters for pagination and filtering

    Returns:
        ExecutionListResponse with executions, pagination metadata, and optional total

    """
    # Use unified list method with query parameters
    try:
        return await service.list_executions(
            limit=params.limit,
            cursor=params.cursor,
            sort=params.sort,
            query_params_items=request.query_params.items(),
            include_total=params.include_total,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(e),
        ) from e


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_execution(
    request: ExecutionCreate,
    service: Annotated[ExecutionService, Depends(get_execution_service)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ExecutionRead:
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
        execution: ExecutionRead = await service.create_execution(
            workflow_id=request.workflow_id,
            input_data=request.input_data,
        )
        return execution

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


@router.get("/{execution_id}")
async def get_execution(
    execution_id: UUID,
    include_params: Annotated[ExecutionIncludeParams, Query()],
    service: Annotated[ExecutionService, Depends(get_execution_service)],
) -> ExecutionRead:
    """Get an execution by ID.

    Args:
        execution_id: Execution ID
        include_params: Include parameters (validated by Pydantic)
        service: Execution service (injected by FastAPI)

    Returns:
        Execution details with current status, timestamps, and error details if failed

    Raises:
        HTTPException: 404 if execution not found

    """
    try:
        include_set = include_params.get_include_set()
        return await service.get_execution(execution_id, include=include_set)

    except ExecutionNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        ) from e


@router.get("/{execution_id}/activities")
async def list_execution_activities(
    execution_id: UUID,
    service: Annotated[ExecutionService, Depends(get_execution_service)],
) -> list[ActivityExecution]:
    """List all activities for a workflow execution.

    Returns persisted activity data from database. Activities are synced from Temporal
    and stored to enable querying after Temporal's retention period expires.

    Args:
        execution_id: Execution ID
        service: Execution service (injected by FastAPI)

    Returns:
        List of activity executions

    Raises:
        HTTPException: 404 if execution not found
        HTTPException: 500 if Temporal query fails

    """
    logger.info("Listing activities for execution %s", execution_id)

    try:
        return await service.get_execution_activities(execution_id)
    except ExecutionNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        ) from e
    except Exception as e:
        logger.exception("Failed to list activities for execution %s", execution_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list activities: {e}",
        ) from e


@router.post("/{execution_id}/activities/{activity_id}/signal")
async def signal_activity(
    execution_id: UUID,
    activity_id: str,
    payload: ActivitySignalPayload,
    service: Annotated[ExecutionService, Depends(get_execution_service)],
) -> SignalResponse:
    """Send a signal to a specific activity in a workflow execution.

    This endpoint allows external systems to send arbitrary signals to
    activities that are waiting for external events. The activity must be
    designed to handle signals via the workflow's signal handler.

    Args:
        execution_id: Execution ID
        activity_id: Activity ID from workflow definition
        payload: Signal payload containing signal_data
        service: Execution service (injected by FastAPI)

    Returns:
        Signal response confirming delivery

    Raises:
        HTTPException: 404 if execution not found
        HTTPException: 503 if Temporal unavailable
        HTTPException: 500 if signal fails

    """
    logger.info(
        "Sending signal to activity %s in execution %s",
        activity_id,
        execution_id,
    )

    try:
        await service.send_activity_signal(
            execution_id=execution_id,
            activity_id=activity_id,
            signal_data=payload.signal_data,
        )
        return SignalResponse(
            status="signal_sent",
            message=f"Signal sent to activity {activity_id}",
        )
    except ExecutionNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        ) from e
    except TemporalUnavailableError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        ) from e
    except Exception as e:
        logger.exception(
            "Failed to send signal to activity %s in execution %s",
            activity_id,
            execution_id,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send signal: {e}",
        ) from e
