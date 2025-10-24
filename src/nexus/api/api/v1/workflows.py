"""Workflow API endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.api.api.v1.utils import deserialize_workflow_version
from nexus.api.auth import get_current_user
from nexus.api.db import get_db
from nexus.api.validators import ValidationError
from nexus.core.models import User
from nexus.core.models.base import ResourcesResponse
from nexus.core.utils.pagination import generate_response
from nexus.workflows.models.workflow import (
    Workflow,
    WorkflowCreate,
    WorkflowRead,
    WorkflowReadWithVersion,
    WorkflowUpdate,
)
from nexus.workflows.services import WorkflowService
from nexus.workflows.services.workflow_service import (
    WorkflowNameConflictError,
    WorkflowNotFoundError,
    WorkflowVersionNotFoundError,
    parse_labels_query,
)

router = APIRouter(prefix="/workflows", tags=["workflows"])


@router.post("", response_model=WorkflowRead, status_code=status.HTTP_201_CREATED)
async def create_workflow(
    request: WorkflowCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Workflow:
    """Create a new workflow with initial version.

    Args:
        request: Workflow creation request
        db: Database session
        current_user: Current authenticated user

    Returns:
        Created workflow

    Raises:
        HTTPException: 400 if validation fails or name already exists

    """
    service = WorkflowService(db)

    try:
        workflow, _ = await service.create_workflow(
            name=request.name,
            description=request.description,
            labels=request.labels,
            workflow_definition=request.workflow_definition,
            is_enabled=request.is_enabled,
            created_by=current_user.id,
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
    db: Annotated[AsyncSession, Depends(get_db)],
    created_by: Annotated[UUID | None, Query(description="Filter by creator user ID")] = None,
    is_enabled: Annotated[bool | None, Query(description="Filter by enabled status")] = None,
    labels: Annotated[str | None, Query(description="Filter by labels (key=value pairs)")] = None,
    limit: Annotated[int, Query(ge=1, le=100, description="Maximum number of results")] = 20,
    cursor: Annotated[str | None, Query(description="Pagination cursor")] = None,
    include_total: Annotated[bool, Query(description="Include total count in response")] = False,  # noqa: FBT002
) -> ResourcesResponse[WorkflowRead]:
    """List workflows with cursor-based pagination (spec 006 compliant).

    Uses cursor-based pagination for scalability and consistency.
    Response follows spec 006 ResourcesResponse format with camelCase fields.

    Args:
        created_by: Filter by creator user ID
        is_enabled: Filter by enabled status
        labels: Filter by labels (e.g., "env=prod,team=data")
        limit: Maximum results per page (default 20, max 100)
        cursor: Base64-encoded pagination cursor from previous response
        include_total: Whether to include total count (default false, expensive)
        db: Database session

    Returns:
        ResourcesResponse with workflows, next/prev cursors, and optional total

    """
    service = WorkflowService(db)

    # Parse labels filter if provided
    labels_filter = parse_labels_query(labels) if labels else None

    # Get workflows using cursor-based pagination
    workflows = await service.list_workflows_cursor(
        created_by=created_by,
        is_enabled=is_enabled,
        labels_filter=labels_filter,
        limit=limit,
        cursor=cursor,
    )

    # Optionally compute total count (only when requested)
    total = None
    if include_total:
        total = await service.count_workflows(
            created_by=created_by,
            is_enabled=is_enabled,
            labels_filter=labels_filter,
        )

    # Generate pagination metadata (next/prev cursors)
    pagination = generate_response(
        items=workflows,
        limit=limit,
        cursor=cursor,
        include_total=include_total,
        total_count=total,
    )

    return ResourcesResponse[WorkflowRead](
        resources=workflows,
        next=pagination["next"],
        prev=pagination["prev"],
        total=pagination["total"],
    )


@router.get("/{workflow_id}")
async def get_workflow(
    workflow_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WorkflowReadWithVersion:
    """Get a workflow by ID including its current active version.

    Args:
        workflow_id: Workflow UUID
        db: Database session

    Returns:
        Workflow with current version data

    Raises:
        HTTPException: 404 if workflow not found or deleted

    """
    service = WorkflowService(db)

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
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> WorkflowReadWithVersion:
    """Update workflow.

    Supports both metadata-only updates and workflow definition updates:
    - Metadata only (name, description, is_enabled, labels): Updates without creating new version
    - With workflow_definition: Validates definition, compares with current version, creates new WorkflowVersion
      only if definition differs (change detection optimization)

    Args:
        workflow_id: Workflow UUID
        request: Update request
        db: Database session
        current_user: Current user

    Returns:
        Updated workflow with current version data

    Raises:
        HTTPException: 404 if workflow not found, 400 for validation errors

    """
    service = WorkflowService(db)

    try:
        workflow, current_version = await service.update_workflow(
            workflow_id=workflow_id,
            name=request.name,
            description=request.description,
            labels=request.labels,
            is_enabled=request.is_enabled,
            workflow_definition=request.workflow_definition,
            change_description=request.change_description,
            updated_by=current_user.id,
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
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    """Soft delete a workflow.

    Args:
        workflow_id: Workflow UUID
        db: Database session
        current_user: Current user

    Raises:
        HTTPException: 404 if workflow not found

    """
    service = WorkflowService(db)

    try:
        await service.delete_workflow(workflow_id, current_user.id)
    except WorkflowNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found",
        ) from e
