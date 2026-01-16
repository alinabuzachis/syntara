"""Workflow API endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.api.auth import get_current_user
from nexus.api.db import get_db
from nexus.api.v1.utils import deserialize_workflow_version
from nexus.api.validators import ValidationError
from nexus.core.models import User
from nexus.workflows.exceptions import (
    WorkflowNameConflictError,
    WorkflowNotFoundError,
    WorkflowVersionNotFoundError,
)
from nexus.workflows.models import WorkflowListParams
from nexus.workflows.models.workflow import (
    Workflow,
    WorkflowCreate,
    WorkflowListResponse,
    WorkflowRead,
    WorkflowReadWithVersion,
    WorkflowUpdate,
)
from nexus.workflows.services import WorkflowService

router = APIRouter(prefix="/workflows", tags=["workflows"])


# ============================================================================
# Dependency Injection Providers
# ============================================================================


def get_workflow_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> WorkflowService:
    """Dependency provider for WorkflowService.

    FastAPI will call this function automatically, injecting all dependencies.
    This centralizes WorkflowService creation across all endpoints.

    Args:
        db: Database session
        current_user: Current authenticated user

    Returns:
        WorkflowService configured with database session and user

    """
    return WorkflowService(db, current_user)


@router.post("", response_model=WorkflowRead, status_code=status.HTTP_201_CREATED)
async def create_workflow(
    request: WorkflowCreate,
    service: Annotated[WorkflowService, Depends(get_workflow_service)],
) -> Workflow:
    """Create a new workflow with initial version.

    Args:
        request: Workflow creation request
        service: Workflow service

    Returns:
        Created workflow

    Raises:
        HTTPException: 400 if validation fails or name already exists

    """
    try:
        workflow, _ = await service.create_workflow(
            name=request.name,
            description=request.description,
            labels=request.labels,
            workflow_definition=request.workflow_definition,
            is_enabled=request.is_enabled,
        )
        return workflow
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.message,
        ) from e
    except WorkflowNameConflictError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e


@router.get("")
async def list_workflows(
    request: Request,
    service: Annotated[WorkflowService, Depends(get_workflow_service)],
    params: Annotated[WorkflowListParams, Query()],
) -> WorkflowListResponse:
    """List workflows with filtering, sorting, and pagination.

    Supports filtering using query parameters with standard operators:
    - created_by: Filter by creator user ID (created_by=uuid)
    - is_enabled: Filter by enabled status (is_enabled=true|false)
    - labels: Filter by labels using bracket notation (labels[environment]=production)

    Uses cursor-based pagination for scalability and consistency.

    Args:
        request: FastAPI request object containing query parameters
        service: Workflow service
        params: Query parameters for pagination and filtering

    Returns:
        WorkflowListResponse with workflows, pagination metadata, and optional total

    """
    try:
        return await service.list_workflows_cursor(
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


@router.get("/{workflow_id}")
async def get_workflow(
    workflow_id: UUID,
    service: Annotated[WorkflowService, Depends(get_workflow_service)],
) -> WorkflowReadWithVersion:
    """Get a workflow by ID including its current active version.

    Args:
        workflow_id: Workflow UUID
        service: Workflow service

    Returns:
        Workflow with current version data

    Raises:
        HTTPException: 404 if workflow not found or deleted

    """
    try:
        workflow, current_version = await service.get_workflow_with_version(workflow_id)
    except WorkflowNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found",
        ) from e
    except WorkflowVersionNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Current version {e.version} not found",
        ) from e

    # Return workflow with version data - deserialize workflow_definition from JSON
    return WorkflowReadWithVersion.model_validate(
        {
            "id": workflow.id,
            "name": workflow.name,
            "description": workflow.description,
            "labels": workflow.labels,
            "current_version": workflow.current_version,
            "is_enabled": workflow.is_enabled,
            "created_by": workflow.created_by,
            "created_at": workflow.created_at,
            "updated_at": workflow.updated_at,
            "deleted_at": workflow.deleted_at,
            "deleted_by": workflow.deleted_by,
            "version": deserialize_workflow_version(current_version),
        }
    )


@router.patch("/{workflow_id}")
async def update_workflow(
    workflow_id: UUID,
    request: WorkflowUpdate,
    service: Annotated[WorkflowService, Depends(get_workflow_service)],
) -> WorkflowReadWithVersion:
    """Update workflow.

    Supports both metadata-only updates and workflow definition updates:
    - Metadata only (name, description, is_enabled, labels): Updates without creating new version
    - With workflow_definition: Validates definition, compares with current version, creates new WorkflowVersion
      only if definition differs (change detection optimization)

    Args:
        workflow_id: Workflow UUID
        request: Update request
        service: Workflow service

    Returns:
        Updated workflow with current version data

    Raises:
        HTTPException: 404 if workflow not found, 400 for validation errors

    """
    try:
        workflow, current_version = await service.update_workflow(
            workflow_id=workflow_id,
            name=request.name,
            description=request.description,
            labels=request.labels,
            is_enabled=request.is_enabled,
            workflow_definition=request.workflow_definition,
            change_description=request.change_description,
        )
    except WorkflowNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found",
        ) from e
    except WorkflowNameConflictError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.message,
        ) from e
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e

    # Return workflow with version data - deserialize workflow_definition from JSON
    return WorkflowReadWithVersion.model_validate(
        {
            "id": workflow.id,
            "name": workflow.name,
            "description": workflow.description,
            "labels": workflow.labels,
            "current_version": workflow.current_version,
            "is_enabled": workflow.is_enabled,
            "created_by": workflow.created_by,
            "created_at": workflow.created_at,
            "updated_at": workflow.updated_at,
            "deleted_at": workflow.deleted_at,
            "deleted_by": workflow.deleted_by,
            "version": deserialize_workflow_version(current_version),
        }
    )


@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workflow(
    workflow_id: UUID,
    service: Annotated[WorkflowService, Depends(get_workflow_service)],
) -> None:
    """Soft delete a workflow.

    Args:
        workflow_id: Workflow UUID
        service: Workflow service

    Raises:
        HTTPException: 404 if workflow not found

    """
    try:
        await service.delete_workflow(workflow_id)
    except WorkflowNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found",
        ) from e
