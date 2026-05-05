"""Execution API endpoints."""

from typing import Annotated
from uuid import UUID

import structlog
from fastapi import Depends, Query, Request, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from temporalio.service import RPCError

from nexus.auth import get_current_user
from nexus.authz.dependencies import PermissionChecker, ProjectScopeFilter, get_opa_client
from nexus.authz.engine import AllowedProjectsResult, AuthzRequest, authorize
from nexus.authz.exceptions import AuthorizationDeniedError
from nexus.authz.models.project import Project
from nexus.core.database.session import get_db
from nexus.core.models import User
from nexus.core.nexus_router import NO_PERMISSION, NexusRouter
from nexus.workflows.models import ActivitySignalPayload, ExecutionListParams, SignalResponse
from nexus.workflows.models.activity_execution import ActivityExecutionListResponse
from nexus.workflows.models.execution import (
    Execution,
    ExecutionCreate,
    ExecutionListResponse,
    ExecutionRead,
)
from nexus.workflows.models.query_params import ActivityListParams, ExecutionIncludeParams
from nexus.workflows.services import ExecutionService
from nexus.workflows.workflow_engine.services.temporal_execution_service import (
    TemporalExecutionService,
    create_temporal_execution_service,
)

logger = structlog.stdlib.get_logger(__name__)

router = NexusRouter(prefix="/executions", tags=["executions"])

_exec_perm_read = PermissionChecker(
    "execution",
    "read",
    resource_model=Execution,
    resource_id_param="execution_id",
)
_exec_perm_run = PermissionChecker(
    "execution",
    "run",
    resource_model=Execution,
    resource_id_param="execution_id",
)


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
    except (RPCError, OSError, RuntimeError) as e:
        logger.warning("Temporal service unavailable", error=str(e))
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


@router.get(
    "",
    operation_id="list_executions",
    summary="List executions",
    description="Retrieve executions with filtering, sorting, and cursor-based pagination.",
)
async def list_executions(
    request: Request,
    service: Annotated[ExecutionService, Depends(get_execution_service)],
    params: Annotated[ExecutionListParams, Query()],
    allowed_projects: Annotated[AllowedProjectsResult, Depends(ProjectScopeFilter("execution", "read"))],
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
        allowed_projects: Resolved project access for the current user

    Returns:
        ExecutionListResponse with executions, pagination metadata, and optional total

    """
    # Use unified list method with query parameters
    return await service.list_executions(
        limit=params.limit,
        cursor=params.cursor,
        sort=params.sort,
        query_params_items=request.query_params.items(),
        include_total=params.include_total,
        allowed_projects=allowed_projects,
    )


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    operation_id="create_execution",
    summary="Create execution",
    description="Start a new workflow execution.",
    dependencies=[NO_PERMISSION],
)
async def create_execution(
    request: ExecutionCreate,
    http_request: Request,
    service: Annotated[ExecutionService, Depends(get_execution_service)],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ExecutionRead:
    """Create and start a new workflow execution.

    This endpoint follows a two-phase creation process:
    1. Start Temporal workflow FIRST (external system validation)
    2. Create database record ONLY after Temporal accepts workflow

    This ensures no orphaned database records if Temporal rejects the workflow.

    Args:
        request: Execution creation request with workflow_id and input_data
        http_request: FastAPI request for OPA client access
        service: Execution service (injected by FastAPI)
        current_user: Current authenticated user
        db: Database session for permission checks

    Returns:
        Created execution with status=PENDING

    Raises:
        HTTPException: 404 if workflow not found
        HTTPException: 400 if workflow is disabled
        HTTPException: 503 if Temporal unavailable
        HTTPException: 500 if Temporal workflow start fails

    """
    # Check execution:run permission, using the workflow's project for scoping
    from nexus.workflows.models.workflow import Workflow  # noqa: PLC0415

    wf_result = await db.exec(select(Workflow.project_id).where(Workflow.id == request.workflow_id))
    wf_project_id = wf_result.first()
    resource_project = ""
    if wf_project_id:
        proj_result = await db.exec(
            select(Project.name).where(Project.id == wf_project_id, Project.deleted_at.is_(None))  # type: ignore[union-attr]
        )
        resource_project = proj_result.first() or ""

    opa_client = get_opa_client(http_request)
    authz_result = await authorize(
        db,
        opa_client,
        AuthzRequest(
            user_id=current_user.id,
            action="run",
            resource_type="execution",
            resource_id="",
            resource_project=resource_project,
            user_labels=current_user.labels,
            user_metadata=current_user.authz_metadata,
        ),
    )
    if not authz_result.allowed:
        logger.info(
            "Authorization denied",
            user_id=str(current_user.id),
            resource_type="execution",
            action="run",
            denied_by=authz_result.denied_by,
        )
        msg = "Not authorized to perform run on execution"
        raise AuthorizationDeniedError(msg)

    logger.info(
        "Creating execution for workflow",
        workflow_id=request.workflow_id,
        user_id=current_user.id,
    )

    execution: ExecutionRead = await service.create_execution(
        workflow_id=request.workflow_id,
        input_data=request.input_data,
        trigger_node_id=request.trigger_node_id,
    )
    return execution


@router.get(
    "/{execution_id}",
    operation_id="get_execution",
    summary="Get execution",
    description="Retrieve details of a specific execution with optional includes.",
    dependencies=[Depends(_exec_perm_read)],
)
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
    include_set = include_params.get_include_set()
    return await service.get_execution(execution_id, include=include_set)


@router.get(
    "/{execution_id}/activities",
    operation_id="list_execution_activities",
    summary="List activity executions",
    description="Retrieve activity executions for a workflow execution.",
    dependencies=[Depends(_exec_perm_read)],
)
async def list_execution_activities(
    request: Request,
    execution_id: UUID,
    service: Annotated[ExecutionService, Depends(get_execution_service)],
    params: Annotated[ActivityListParams, Query()],
) -> ActivityExecutionListResponse:
    """List activities for a workflow execution with cursor-based pagination.

    Returns persisted activity data from database. Activities are synced from Temporal
    and stored to enable querying after Temporal's retention period expires.

    Args:
        request: FastAPI request object containing query parameters
        execution_id: Execution ID
        service: Execution service (injected by FastAPI)
        params: Query parameters for pagination and filtering

    Returns:
        ActivityExecutionListResponse with activities and pagination metadata

    Raises:
        HTTPException: 404 if execution not found

    """
    logger.info("Listing activities for execution", execution_id=execution_id)

    return await service.list_execution_activities(
        execution_id=execution_id,
        limit=params.limit,
        cursor=params.cursor,
        sort=params.sort,
        query_params_items=request.query_params.items(),
        include_total=params.include_total,
    )


@router.post(
    "/{execution_id}/activities/{activity_id}/signal",
    operation_id="signal_activity",
    summary="Send signal to activity in workflow",
    description="Send a signal to a specific activity within a running workflow execution.",
    dependencies=[Depends(_exec_perm_run)],
)
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
        "Sending signal to activity in execution",
        activity_id=activity_id,
        execution_id=execution_id,
    )

    await service.send_activity_signal(
        execution_id=execution_id,
        activity_id=activity_id,
        signal_data=payload.signal_data,
    )
    return SignalResponse(
        status="signal_sent",
        message=f"Signal sent to activity {activity_id}",
    )
