"""Workflow API endpoints."""

from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from nexus_api.auth import get_current_user
from nexus_api.db import get_db
from nexus_api.models import User, Workflow, WorkflowVersion
from nexus_api.schemas import (
    CreateWorkflowRequest,
    UpdateWorkflowRequest,
    WorkflowListResponse,
    WorkflowResponse,
    WorkflowWithVersionResponse,
)
from nexus_api.validators import ValidationError, WorkflowYAMLValidator

router = APIRouter(prefix="/workflows", tags=["workflows"])


def _is_duplicate_name_error(e: IntegrityError) -> bool:
    """Check if IntegrityError is due to duplicate workflow name.

    Args:
        e: The IntegrityError to check

    Returns:
        True if error is due to duplicate workflow name constraint

    """
    error_str = str(e)
    return (
        "ix_workflows_name_unique" in error_str or "workflows.name" in error_str or "duplicate key" in error_str.lower()
    )


async def _commit_with_duplicate_check(db: AsyncSession, workflow_name: str) -> None:
    """Commit database transaction with duplicate name error handling.

    Args:
        db: Database session
        workflow_name: Name of workflow being created/updated

    Raises:
        HTTPException: 400 if duplicate name constraint violated
        IntegrityError: For other integrity constraint violations

    """
    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        if _is_duplicate_name_error(e):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Workflow with name '{workflow_name}' already exists",
            ) from e
        raise


def parse_labels_query(labels: str) -> dict[str, str]:
    """Parse labels query parameter from key-value format.

    Supports two formats:
    - "key=value,key2=value2" - filters by key-value pairs
    - "key,key2" - filters by key existence

    Args:
        labels: Labels query string

    Returns:
        Dictionary of label filters

    Examples:
        >>> parse_labels_query("environment=production,team=data")
        {"environment": "production", "team": "data"}
        >>> parse_labels_query("environment,team")
        {"environment": "", "team": ""}

    """
    result: dict[str, str] = {}
    if not labels:
        return result

    for pair_raw in labels.split(","):
        pair = pair_raw.strip()
        if "=" in pair:
            key, value = pair.split("=", 1)
            result[key.strip()] = value.strip()
        else:
            # Key existence check - use empty string as placeholder
            result[pair] = ""

    return result


@router.post("", response_model=WorkflowResponse, status_code=status.HTTP_201_CREATED)
async def create_workflow(
    request: CreateWorkflowRequest,
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
    # Validate YAML definition
    try:
        _, schema_version = WorkflowYAMLValidator.validate(request.yaml_definition)
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.message,
        ) from e

    # Create workflow
    workflow = Workflow(
        id=uuid4(),
        name=request.name,
        description=request.description,
        labels=request.labels,
        current_version=1,
        created_by=current_user.id,
        is_enabled=request.is_enabled,
    )

    # Create initial version
    version = WorkflowVersion(
        id=uuid4(),
        workflow_id=workflow.id,
        version=1,
        schema_version=schema_version,
        yaml_definition=request.yaml_definition,
        created_by=current_user.id,
        change_description="Initial version",
    )

    db.add(workflow)
    db.add(version)

    # Commit changes with duplicate name check
    await _commit_with_duplicate_check(db, request.name)
    await db.refresh(workflow)

    return workflow


@router.get("")
async def list_workflows(
    db: Annotated[AsyncSession, Depends(get_db)],
    created_by: Annotated[UUID | None, Query(description="Filter by creator user ID")] = None,
    is_enabled: Annotated[bool | None, Query(description="Filter by enabled status")] = None,
    labels: Annotated[str | None, Query(description="Filter by labels (JSON string)")] = None,
    limit: Annotated[int, Query(ge=1, le=100, description="Maximum number of results")] = 20,
    offset: Annotated[int, Query(ge=0, description="Number of results to skip")] = 0,
) -> WorkflowListResponse:
    """List workflows with optional filtering and pagination.

    Args:
        created_by: Filter by creator (FastAPI validates UUID format)
        is_enabled: Filter by enabled status
        labels: Filter by labels (JSON)
        limit: Maximum results (default 20, max 100)
        offset: Pagination offset
        db: Database session

    Returns:
        Paginated list of workflows

    """
    # Build query
    query = select(Workflow).filter(Workflow.deleted_at.is_(None))

    if created_by:
        query = query.filter(Workflow.created_by == created_by)

    if is_enabled is not None:
        query = query.filter(Workflow.is_enabled == is_enabled)

    if labels:
        # Parse labels from key-value format (e.g., "environment=production,team=data")
        labels_dict = parse_labels_query(labels)
        if labels_dict:
            # For key existence checks (empty value), use has_key operator
            # For key-value pairs, use containment operator
            for key, value in labels_dict.items():
                if value:
                    # Filter by exact key-value match
                    query = query.filter(Workflow.labels[key].astext == value)
                else:
                    # Filter by key existence
                    query = query.filter(Workflow.labels.has_key(key))

    # Count total before pagination
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Apply pagination
    query = query.limit(limit).offset(offset)

    # Execute query
    result = await db.execute(query)
    workflows = list(result.scalars().all())

    # Return ORM objects - FastAPI auto-converts to WorkflowResponse list
    # Pydantic's from_attributes=True handles ORM → Pydantic conversion
    return WorkflowListResponse(
        workflows=workflows,  # type: ignore[arg-type]
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{workflow_id}")
async def get_workflow(
    workflow_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WorkflowWithVersionResponse:
    """Get a workflow by ID including its current active version.

    Args:
        workflow_id: Workflow UUID
        db: Database session

    Returns:
        Workflow with current version data

    Raises:
        HTTPException: 404 if workflow not found or deleted

    """
    # Get workflow
    result = await db.execute(select(Workflow).filter(Workflow.id == workflow_id, Workflow.deleted_at.is_(None)))
    workflow = result.scalar_one_or_none()

    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found",
        )

    # Get current version
    version_result = await db.execute(
        select(WorkflowVersion).filter(
            WorkflowVersion.workflow_id == workflow_id,
            WorkflowVersion.version == workflow.current_version,
            WorkflowVersion.deleted_at.is_(None),
        )
    )
    current_version = version_result.scalar_one_or_none()

    if not current_version:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Current version {workflow.current_version} not found",
        )

    # Return workflow with version data
    # Use model_validate to convert ORM objects to Pydantic models
    return WorkflowWithVersionResponse.model_validate(
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
            "version": current_version,
        }
    )


async def _update_metadata(workflow: Workflow, request: UpdateWorkflowRequest) -> None:
    """Update workflow metadata fields.

    Args:
        workflow: Workflow to update
        request: Update request with new metadata

    Raises:
        HTTPException: 400 if name is empty

    Note:
        Duplicate name validation is handled at commit time via database constraint.

    """
    if request.name is not None:
        if not request.name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Workflow name cannot be empty",
            )
        workflow.name = request.name

    if request.description is not None:
        workflow.description = request.description

    if request.labels is not None:
        workflow.labels = request.labels

    if request.is_enabled is not None:
        workflow.is_enabled = request.is_enabled


async def _create_new_version(
    workflow: Workflow,
    request: UpdateWorkflowRequest,
    current_user: User,
    db: AsyncSession,
) -> bool:
    """Create new workflow version from yaml_definition.

    Returns:
        True if new version was created, False if YAML unchanged (no-op)

    """
    # Validate YAML
    if not request.yaml_definition:
        return False

    try:
        _, schema_version = WorkflowYAMLValidator.validate(request.yaml_definition)
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.message,
        ) from e

    # Fetch current version to compare YAML
    current_version_result = await db.execute(
        select(WorkflowVersion).filter(
            WorkflowVersion.workflow_id == workflow.id,
            WorkflowVersion.version == workflow.current_version,
            WorkflowVersion.deleted_at.is_(None),
        )
    )
    current_version = current_version_result.scalar_one_or_none()

    # Compare YAML definitions (change detection - exact match required)
    if current_version and current_version.yaml_definition == request.yaml_definition:
        # No change detected - skip version creation
        return False

    # Get next version number
    count_result = await db.execute(
        select(func.max(WorkflowVersion.version)).filter(WorkflowVersion.workflow_id == workflow.id)
    )
    max_version = count_result.scalar()
    next_version = (max_version or 0) + 1

    # Create new version
    new_version = WorkflowVersion(
        id=uuid4(),
        workflow_id=workflow.id,
        version=next_version,
        schema_version=schema_version,
        yaml_definition=request.yaml_definition,
        change_description=request.change_description or f"Update to version {next_version}",
        created_by=current_user.id,
    )

    # Update workflow's current version
    workflow.current_version = next_version
    db.add(new_version)

    return True


@router.patch("/{workflow_id}")
async def update_workflow(
    workflow_id: UUID,
    request: UpdateWorkflowRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> WorkflowWithVersionResponse:
    """Update workflow.

    Supports both metadata-only updates and workflow definition updates:
    - Metadata only (name, description, is_enabled, labels): Updates without creating new version
    - With yaml_definition: Validates YAML, compares with current version, creates new WorkflowVersion
      only if YAML differs (change detection optimization)

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
    # Get workflow
    result = await db.execute(select(Workflow).filter(Workflow.id == workflow_id, Workflow.deleted_at.is_(None)))
    workflow = result.scalar_one_or_none()

    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found",
        )

    # Update metadata fields
    await _update_metadata(workflow, request)

    # Handle yaml_definition - creates new version
    if request.yaml_definition is not None:
        await _create_new_version(workflow, request, current_user, db)

    # Commit changes with duplicate name check (use workflow.name since it's been updated)
    await _commit_with_duplicate_check(db, workflow.name)
    await db.refresh(workflow)

    # Get current version for response
    version_result = await db.execute(
        select(WorkflowVersion).filter(
            WorkflowVersion.workflow_id == workflow_id,
            WorkflowVersion.version == workflow.current_version,
            WorkflowVersion.deleted_at.is_(None),
        )
    )
    current_version = version_result.scalar_one_or_none()

    if not current_version:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Current version {workflow.current_version} not found",
        )

    # Return workflow with version data
    # Use model_validate to convert ORM objects to Pydantic models
    return WorkflowWithVersionResponse.model_validate(
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
            "version": current_version,
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
    result = await db.execute(select(Workflow).filter(Workflow.id == workflow_id, Workflow.deleted_at.is_(None)))
    workflow = result.scalar_one_or_none()

    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found",
        )

    # Soft delete
    workflow.soft_delete(current_user.id)
    await db.commit()
