"""Workflow API endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, Query, Request, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.auth import get_current_user
from nexus.authz.dependencies import PermissionChecker, ProjectScopeFilter
from nexus.authz.engine import AllowedProjectsResult
from nexus.core.database.session import get_db
from nexus.core.models import User
from nexus.core.nexus_router import NexusRouter
from nexus.workflows.models import WorkflowListParams
from nexus.workflows.models.workflow import (
    Workflow,
    WorkflowCreate,
    WorkflowListResponse,
    WorkflowRead,
    WorkflowReadWithVersion,
    WorkflowUpdate,
)
from nexus.workflows.models.workflow_version import (
    WorkflowVersion,
    WorkflowVersionListResponse,
    WorkflowVersionRead,
)
from nexus.workflows.services import WorkflowService
from nexus.workflows.utils.serialization import deserialize_workflow_version

router = NexusRouter(prefix="/workflows", tags=["workflows", "workflow-versions"])

_wf_perm_read = PermissionChecker(
    "workflow",
    "read",
    roles=["admin", "auditor", "user", "project-admin", "project-user", "project-auditor"],
    resource_model=Workflow,
    resource_id_param="workflow_id",
)
_wf_perm_update = PermissionChecker(
    "workflow",
    "update",
    roles=["admin", "user", "project-admin", "project-user"],
    resource_model=Workflow,
    resource_id_param="workflow_id",
)
_wf_perm_delete = PermissionChecker(
    "workflow",
    "delete",
    roles=["admin", "user", "project-admin", "project-user"],
    resource_model=Workflow,
    resource_id_param="workflow_id",
)
_wf_perm_create = PermissionChecker(
    "workflow",
    "create",
    roles=["admin", "user", "project-admin", "project-user"],
    body_project_field="project_id",
)

WORKFLOW_NOT_FOUND: str = "Workflow not found"

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


# ============================================================================
# Workflow endpoints
# ============================================================================


@router.post(
    "",
    response_model=WorkflowRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_wf_perm_create)],
)
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
    workflow, _ = await service.create_workflow(
        name=request.name,
        description=request.description,
        labels=request.labels,
        workflow_definition=request.workflow_definition,
        is_enabled=request.is_enabled,
        project_id=request.project_id,
    )
    return workflow


@router.get("")
async def list_workflows(
    request: Request,
    service: Annotated[WorkflowService, Depends(get_workflow_service)],
    params: Annotated[WorkflowListParams, Query()],
    allowed_projects: Annotated[AllowedProjectsResult, Depends(ProjectScopeFilter("workflow", "read"))],
) -> WorkflowListResponse:
    """List workflows the current user has read access to.

    Supports filtering using query parameters with standard operators:
    - created_by: Filter by creator user ID (created_by=uuid)
    - is_enabled: Filter by enabled status (is_enabled=true|false)
    - labels: Filter by labels using bracket notation (labels[environment]=production)

    Uses cursor-based pagination for scalability and consistency.

    Args:
        request: FastAPI request object containing query parameters
        service: Workflow service
        params: Query parameters for pagination and filtering
        allowed_projects: Resolved project access for the current user

    Returns:
        WorkflowListResponse with workflows, pagination metadata, and optional total

    """
    return await service.list_workflows_cursor(
        limit=params.limit,
        cursor=params.cursor,
        sort=params.sort,
        query_params_items=request.query_params.items(),
        include_total=params.include_total,
        allowed_projects=allowed_projects,
    )


@router.get(
    "/{workflow_id}",
    dependencies=[Depends(_wf_perm_read)],
)
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
    workflow, current_version = await service.get_workflow_with_version(workflow_id)

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


@router.patch(
    "/{workflow_id}",
    dependencies=[Depends(_wf_perm_update)],
)
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
    workflow, current_version = await service.update_workflow(
        workflow_id=workflow_id,
        name=request.name,
        description=request.description,
        labels=request.labels,
        is_enabled=request.is_enabled,
        workflow_definition=request.workflow_definition,
        change_description=request.change_description,
    )

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


@router.delete(
    "/{workflow_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(_wf_perm_delete)],
)
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
    await service.delete_workflow(workflow_id)


# ============================================================================
# Workflow version endpoints
# ----------------------------------------------------------------------------
# NOTE: WorkflowVersion entities are READ-ONLY and system-managed.
# Versions are created automatically via PATCH /workflows/{id} with workflow_definition.
# No POST endpoint for manual version creation - this ensures version integrity.
# ============================================================================


@router.get(
    "/{workflow_id}/versions",
    dependencies=[Depends(_wf_perm_read)],
)
async def list_workflow_versions(
    workflow_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WorkflowVersionListResponse:
    """List all versions for a workflow.

    Args:
        workflow_id: Workflow UUID
        db: Database session

    Returns:
        List of versions ordered by version DESC

    Raises:
        HTTPException: 404 if workflow not found

    """
    # Verify workflow exists
    workflow_result = await db.exec(
        select(Workflow).filter(Workflow.id == workflow_id, Workflow.deleted_at.is_(None))  # type: ignore[arg-type,union-attr]
    )
    workflow = workflow_result.one_or_none()

    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=WORKFLOW_NOT_FOUND,
        )

    # Get versions
    result = await db.exec(
        select(WorkflowVersion)
        .filter(
            WorkflowVersion.workflow_id == workflow_id,  # type: ignore[arg-type]
            WorkflowVersion.deleted_at.is_(None),  # type: ignore[union-attr]
        )
        .order_by(WorkflowVersion.version.desc())  # type: ignore[attr-defined]
    )
    versions = list(result.all())

    # Deserialize workflow_definition from JSON strings to dicts
    version_dicts = [deserialize_workflow_version(v) for v in versions]

    # Manually construct response with deserialized versions
    return WorkflowVersionListResponse(versions=[WorkflowVersionRead.model_validate(v) for v in version_dicts])


@router.get(
    "/{workflow_id}/versions/{version}",
    dependencies=[Depends(_wf_perm_read)],
)
async def get_workflow_version(
    workflow_id: UUID,
    version: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WorkflowVersionRead:
    """Get a specific workflow version.

    Args:
        workflow_id: Workflow UUID
        version: Version number
        db: Database session

    Returns:
        Workflow version

    Raises:
        HTTPException: 404 if workflow or version not found

    """
    # Verify workflow exists
    workflow_result = await db.exec(
        select(Workflow).filter(Workflow.id == workflow_id, Workflow.deleted_at.is_(None))  # type: ignore[arg-type,union-attr]
    )
    workflow = workflow_result.one_or_none()

    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=WORKFLOW_NOT_FOUND,
        )

    # Get version
    result = await db.exec(
        select(WorkflowVersion).filter(
            WorkflowVersion.workflow_id == workflow_id,  # type: ignore[arg-type]
            WorkflowVersion.version == version,  # type: ignore[arg-type]
            WorkflowVersion.deleted_at.is_(None),  # type: ignore[union-attr]
        )
    )
    workflow_version = result.one_or_none()

    if not workflow_version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Version {version} not found for this workflow",
        )

    # Deserialize workflow_definition from JSON string to dict and return
    return WorkflowVersionRead.model_validate(deserialize_workflow_version(workflow_version))
