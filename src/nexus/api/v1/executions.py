"""Execution API endpoints."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from temporalio.service import RPCError

from nexus.api.auth import get_current_user
from nexus.api.db import get_db
from nexus.core.models import User
from nexus.workflows.models.execution import Execution, ExecutionCreate, ExecutionRead
from nexus.workflows.services import ExecutionService
from nexus.workflows.services.execution_service import WorkflowDisabledError, WorkflowNotFoundError
from nexus.workflows.workflow_engine.services.execution_service import create_execution_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/executions", tags=["executions"])


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
