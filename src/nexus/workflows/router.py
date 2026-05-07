"""Workflow API endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, Query, Request, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.auth import get_current_user
from nexus.authz.dependencies import PermissionChecker, VisibilityFilter
from nexus.authz.engine import VisibilityResult
from nexus.core.database.session import get_db
from nexus.core.models import User
from nexus.core.nexus_router import NexusRouter
from nexus.workflows.executions_router import get_temporal_execution_service
from nexus.workflows.models import WorkflowListParams
from nexus.workflows.models.execution import ExecutionRead, TestExecutionCreate
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
from nexus.workflows.services import ExecutionService, WorkflowService
from nexus.workflows.utils.serialization import deserialize_workflow_version
from nexus.workflows.workflow_engine.services.temporal_execution_service import TemporalExecutionService

router = NexusRouter(prefix="/workflows", tags=["workflows"])

_wf_perm_read = PermissionChecker(
    "workflow",
    "read",
    resource_model=Workflow,
    resource_id_param="workflow_id",
)
_wf_perm_update = PermissionChecker(
    "workflow",
    "update",
    resource_model=Workflow,
    resource_id_param="workflow_id",
)
_wf_perm_delete = PermissionChecker(
    "workflow",
    "delete",
    resource_model=Workflow,
    resource_id_param="workflow_id",
)
_wf_perm_create = PermissionChecker(
    "workflow",
    "create",
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
    """
    return WorkflowService(db, current_user)


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
    """
    return ExecutionService(db, current_user, temporal_service=temporal_service)


# ============================================================================
# Workflow endpoints
# ============================================================================


@router.post(
    "",
    response_model=WorkflowRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_wf_perm_create)],
    operation_id="create_workflow",
    response_description="Workflow created",
)
async def create_workflow(
    request: WorkflowCreate,
    service: Annotated[WorkflowService, Depends(get_workflow_service)],
) -> Workflow:
    """Create a new workflow with initial version."""
    workflow, _ = await service.create_workflow(
        name=request.name,
        description=request.description,
        labels=request.labels,
        workflow_definition=request.workflow_definition,
        is_enabled=request.is_enabled,
        project_id=request.project_id,
    )
    return workflow


@router.get("", operation_id="list_workflows", response_description="List of workflows")
async def list_workflows(
    request: Request,
    service: Annotated[WorkflowService, Depends(get_workflow_service)],
    params: Annotated[WorkflowListParams, Query()],
    visibility: Annotated[VisibilityResult, Depends(VisibilityFilter("workflow", "read"))],
) -> WorkflowListResponse:
    """List workflows the current user has read access to.

    Supports filtering using query parameters with standard operators:
    - created_by: Filter by creator user ID (created_by=uuid)
    - is_enabled: Filter by enabled status (is_enabled=true|false)
    - labels: Filter by labels using bracket notation (labels[environment]=production)

    Uses cursor-based pagination for scalability and consistency.
    """
    return await service.list_workflows_cursor(
        limit=params.limit,
        cursor=params.cursor,
        sort=params.sort,
        query_params_items=request.query_params.items(),
        include_total=params.include_total,
        allowed_projects=visibility.to_allowed_projects(),
    )


@router.get(
    "/{workflow_id}",
    dependencies=[Depends(_wf_perm_read)],
    operation_id="get_workflow",
    response_description="Workflow details",
)
async def get_workflow(
    workflow_id: UUID,
    service: Annotated[WorkflowService, Depends(get_workflow_service)],
) -> WorkflowReadWithVersion:
    """Get a workflow by ID including its current active version."""
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
            "project_id": workflow.project_id,
            "version": deserialize_workflow_version(current_version),
        }
    )


@router.patch(
    "/{workflow_id}",
    dependencies=[Depends(_wf_perm_update)],
    operation_id="update_workflow",
    response_description="Updated workflow",
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
            "project_id": workflow.project_id,
            "version": deserialize_workflow_version(current_version),
        }
    )


@router.delete(
    "/{workflow_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(_wf_perm_delete)],
    operation_id="delete_workflow",
    response_description="Workflow deleted",
)
async def delete_workflow(
    workflow_id: UUID,
    service: Annotated[WorkflowService, Depends(get_workflow_service)],
) -> None:
    """Soft delete a workflow."""
    await service.delete_workflow(workflow_id)


@router.post(
    "/{workflow_id}/test",
    response_model=ExecutionRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_wf_perm_update)],
    operation_id="test_workflow_node",
    summary="Test a single node in a workflow",
    response_description="Test execution created",
)
async def test_workflow_node(
    workflow_id: UUID,
    request: TestExecutionCreate,
    execution_service: Annotated[ExecutionService, Depends(get_execution_service)],
) -> ExecutionRead:
    """Test a single node in a workflow with mocked predecessor outputs.

    Creates a test execution that:
    1. Uses mocked outputs for all nodes in pre_resolved_nodes
    2. Executes the target_node_id for real with actual logic
    3. Stops after the target node completes
    4. Returns results in the execution response

    This enables testing individual nodes in isolation without running the entire workflow.

    Args:
        workflow_id: Workflow ID to test
        request: Test execution request with target node and mocked outputs
        execution_service: Execution service (injected by FastAPI)

    Returns:
        Created test execution with mode=TEST and status=PENDING

    Raises:
        HTTPException: 404 if workflow not found
        HTTPException: 400 if target_node_id not found in workflow
        HTTPException: 503 if Temporal unavailable

    """
    return await execution_service.create_test_execution(
        workflow_id=workflow_id,
        target_node_id=request.target_node_id,
        pre_resolved_nodes=request.pre_resolved_nodes,
        trigger_inputs=request.trigger_inputs,
    )


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
    operation_id="list_workflow_versions",
    response_description="Workflow version history",
)
async def list_workflow_versions(
    workflow_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WorkflowVersionListResponse:
    """List all versions for a workflow."""
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
    operation_id="get_workflow_version",
    response_description="Workflow version details",
)
async def get_workflow_version(
    workflow_id: UUID,
    version: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WorkflowVersionRead:
    """Get a specific workflow version."""
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
