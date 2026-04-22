"""Project API endpoints.

CRUD for projects and project-scoped role assignment management.
Authorization is enforced via PermissionChecker dependency on each endpoint.
"""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Query, Request, status
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.approvals.models.approval_request import ApprovalListResponse
from nexus.approvals.models.query_params import ApprovalListParams
from nexus.approvals.services.approval_service import ApprovalService
from nexus.auth import get_current_user
from nexus.authz.dependencies import PermissionChecker, ProjectScopeFilter
from nexus.authz.engine import AllowedProjectsResult
from nexus.core.database.session import get_db
from nexus.core.models import User
from nexus.core.nexus_router import NO_PERMISSION, NexusRouter
from nexus.projects.schemas import (
    ProjectCreate,
    ProjectGroupRoleAssignmentCreate,
    ProjectGroupRoleAssignmentRead,
    ProjectRead,
    ProjectRoleAssignmentCreate,
    ProjectRoleAssignmentRead,
    ProjectUpdate,
)
from nexus.projects.service import ProjectService
from nexus.workflows.models import WorkflowListParams
from nexus.workflows.models.workflow import WorkflowListResponse
from nexus.workflows.services import WorkflowService

router = NexusRouter(prefix="/projects", tags=["Projects"])

_ALL_ROLES = ["admin", "auditor", "user", "project-admin", "project-user", "project-auditor"]
_perm_project_read = PermissionChecker("project", "read", roles=_ALL_ROLES, project_param="project_id")
_perm_project_update = PermissionChecker(
    "project", "update", roles=["admin", "project-admin"], project_param="project_id"
)
_perm_project_delete = PermissionChecker(
    "project", "delete", roles=["admin", "project-admin"], project_param="project_id"
)
_perm_workflow_read = PermissionChecker("workflow", "read", roles=_ALL_ROLES, project_param="project_id")
_perm_approval_read = PermissionChecker("approval", "read", roles=_ALL_ROLES, project_param="project_id")
_perm_project_role_assign = PermissionChecker(
    "project-role", "assign", roles=["admin", "project-admin"], project_param="project_id"
)
_perm_project_role_revoke = PermissionChecker(
    "project-role", "revoke", roles=["admin", "project-admin"], project_param="project_id"
)


def get_project_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ProjectService:
    """Dependency provider for ProjectService."""
    return ProjectService(db, current_user)


# ============================================================================
# Project CRUD
# ============================================================================


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(PermissionChecker("project", "create", roles=["admin", "user", "default"]))],
    operation_id="create_project",
    response_description="Project created",
)
async def create_project(
    body: ProjectCreate,
    service: Annotated[ProjectService, Depends(get_project_service)],
) -> ProjectRead:
    """Create a new project.

    The creator is automatically assigned the project-admin role.
    Requires: project:create permission.
    """
    project = await service.create_project(
        name=body.name,
        description=body.description,
        labels=body.labels,
    )
    return ProjectRead.model_validate(project)


@router.get("", operation_id="list_projects", response_description="List of accessible projects")
async def list_projects(
    service: Annotated[ProjectService, Depends(get_project_service)],
    allowed_projects: Annotated[AllowedProjectsResult, Depends(ProjectScopeFilter("project", "read"))],
) -> list[ProjectRead]:
    """List projects the current user has read access to."""
    projects = await service.list_projects(allowed_projects=allowed_projects)
    return [ProjectRead.model_validate(p) for p in projects]


@router.get(
    "/{project_id}",
    dependencies=[Depends(_perm_project_read)],
    operation_id="get_project",
    response_description="Project details",
)
async def get_project(
    project_id: UUID,
    service: Annotated[ProjectService, Depends(get_project_service)],
) -> ProjectRead:
    """Get a project by ID."""
    project = await service.get_project(project_id)
    return ProjectRead.model_validate(project)


async def _do_update_project(
    project_id: UUID,
    body: ProjectUpdate,
    service: ProjectService,
) -> ProjectRead:
    """Shared implementation for PATCH and PUT project updates."""
    project = await service.update_project(
        project_id=project_id,
        name=body.name,
        description=body.description,
        labels=body.labels,
    )
    return ProjectRead.model_validate(project)


@router.patch(
    "/{project_id}",
    dependencies=[Depends(_perm_project_update)],
    operation_id="update_project",
    response_description="Updated project",
)
async def update_project(
    project_id: UUID,
    body: ProjectUpdate,
    service: Annotated[ProjectService, Depends(get_project_service)],
) -> ProjectRead:
    """Patch a project. Requires: project:update permission scoped to this project."""
    return await _do_update_project(project_id, body, service)


@router.put(
    "/{project_id}",
    dependencies=[Depends(_perm_project_update)],
    operation_id="replace_project",
    response_description="Updated project",
)
async def replace_project(
    project_id: UUID,
    body: ProjectUpdate,
    service: Annotated[ProjectService, Depends(get_project_service)],
) -> ProjectRead:
    """Replace a project. Requires: project:update permission scoped to this project."""
    return await _do_update_project(project_id, body, service)


@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(_perm_project_delete)],
    operation_id="delete_project",
    response_description="Project deleted",
)
async def delete_project(
    project_id: UUID,
    service: Annotated[ProjectService, Depends(get_project_service)],
) -> None:
    """Delete a project (soft-delete). Requires: project:delete permission scoped to this project."""
    await service.delete_project(project_id)


# ============================================================================
# Project Workflows
# ============================================================================


def get_workflow_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> WorkflowService:
    """Dependency provider for WorkflowService."""
    return WorkflowService(db, current_user)


@router.get(
    "/{project_id}/workflows",
    dependencies=[Depends(_perm_workflow_read)],
    operation_id="list_project_workflows",
    response_description="Paginated list of workflows in the project",
)
async def list_project_workflows(
    project_id: UUID,
    request: Request,
    service: Annotated[WorkflowService, Depends(get_workflow_service)],
    params: Annotated[WorkflowListParams, Query()],
) -> WorkflowListResponse:
    """List workflows belonging to a specific project.

    Returns only workflows with project_id matching the given project.
    Requires: workflow:read permission scoped to this project.
    """
    allowed = AllowedProjectsResult(all_projects=False, project_ids=[project_id])
    return await service.list_workflows_cursor(
        limit=params.limit,
        cursor=params.cursor,
        sort=params.sort,
        query_params_items=request.query_params.items(),
        include_total=params.include_total,
        allowed_projects=allowed,
    )


# ============================================================================
# Project Approvals
# ============================================================================


def get_approval_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ApprovalService:
    """Dependency provider for ApprovalService."""
    return ApprovalService(db, current_user)


@router.get(
    "/{project_id}/approvals",
    dependencies=[Depends(_perm_approval_read)],
    operation_id="list_project_approvals",
    response_description="Paginated list of approvals in the project",
)
async def list_project_approvals(
    project_id: UUID,
    request: Request,
    service: Annotated[ApprovalService, Depends(get_approval_service)],
    params: Annotated[ApprovalListParams, Depends()],
) -> ApprovalListResponse:
    """List approval requests belonging to a specific project.

    Returns only approvals with project_id matching the given project.
    Requires: approval:read permission scoped to this project.
    """
    allowed = AllowedProjectsResult(all_projects=False, project_ids=[project_id])
    return await service.list(
        limit=params.limit,
        cursor=params.cursor,
        sort=params.sort,
        query_params_items=request.query_params.items(),
        include_total=params.include_total,
        allowed_projects=allowed,
    )


# ============================================================================
# Project Role Assignments
# ============================================================================


@router.post(
    "/{project_id}/roles",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_perm_project_role_assign)],
    operation_id="assign_project_role",
    response_description="Role assigned",
)
async def assign_project_role(
    project_id: UUID,
    body: ProjectRoleAssignmentCreate,
    service: Annotated[ProjectService, Depends(get_project_service)],
) -> ProjectRoleAssignmentRead:
    """Assign a role to a user within a project.

    Valid roles: project-admin, project-user, project-auditor.
    Requires: project-role:assign permission scoped to this project.
    """
    assignment = await service.assign_role(
        project_id=project_id,
        user_id=body.user_id,
        role_name=body.role_name,
    )
    # Re-fetch to resolve username via join
    assignments = await service.list_role_assignments(project_id)
    match = next((a for a in assignments if a["id"] == assignment.id), None)
    if match:
        return ProjectRoleAssignmentRead.model_validate(match)
    return ProjectRoleAssignmentRead(
        id=assignment.id,
        user_id=assignment.user_id,
        project_id=assignment.project_id,
        role_id=assignment.role_id,
        role_name=body.role_name,
        created_at=assignment.created_at,
    )


@router.get(
    "/{project_id}/roles",
    dependencies=[NO_PERMISSION],
    operation_id="list_project_roles",
    response_description="List of role assignments",
)
async def list_project_roles(
    project_id: UUID,
    service: Annotated[ProjectService, Depends(get_project_service)],
) -> list[ProjectRoleAssignmentRead]:
    """List all role assignments for a project."""
    assignments = await service.list_role_assignments(project_id)
    return [ProjectRoleAssignmentRead.model_validate(a) for a in assignments]


@router.delete(
    "/{project_id}/roles/{assignment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(_perm_project_role_revoke)],
    operation_id="revoke_project_role",
    response_description="Assignment removed",
)
async def revoke_project_role(
    project_id: UUID,
    assignment_id: UUID,
    service: Annotated[ProjectService, Depends(get_project_service)],
) -> None:
    """Remove a role assignment from a project. Requires: project-role:revoke permission."""
    await service.revoke_role(project_id, assignment_id)


# ============================================================================
# Project Group Role Assignments
# ============================================================================


@router.post(
    "/{project_id}/group-roles",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_perm_project_role_assign)],
    operation_id="assign_project_group_role",
    response_description="Role assigned to group",
)
async def assign_project_group_role(
    project_id: UUID,
    body: ProjectGroupRoleAssignmentCreate,
    service: Annotated[ProjectService, Depends(get_project_service)],
) -> ProjectGroupRoleAssignmentRead:
    """Assign a role to a group within a project.

    All members of the group inherit the role for this project.
    Valid roles: project-admin, project-user, project-auditor.
    Requires: project-role:assign permission scoped to this project.
    """
    assignment = await service.assign_group_role(
        project_id=project_id,
        group_id=body.group_id,
        role_name=body.role_name,
    )
    # Re-fetch to resolve group_name via join
    assignments = await service.list_group_role_assignments(project_id)
    match = next((a for a in assignments if a["id"] == assignment.id), None)
    if match:
        return ProjectGroupRoleAssignmentRead.model_validate(match)
    return ProjectGroupRoleAssignmentRead(
        id=assignment.id,
        group_id=assignment.group_id,
        project_id=assignment.project_id,
        role_id=assignment.role_id,
        role_name=body.role_name,
        created_at=assignment.created_at,
    )


@router.get(
    "/{project_id}/group-roles",
    dependencies=[NO_PERMISSION],
    operation_id="list_project_group_roles",
    response_description="List of group role assignments",
)
async def list_project_group_roles(
    project_id: UUID,
    service: Annotated[ProjectService, Depends(get_project_service)],
) -> list[ProjectGroupRoleAssignmentRead]:
    """List all group role assignments for a project."""
    assignments = await service.list_group_role_assignments(project_id)
    return [ProjectGroupRoleAssignmentRead.model_validate(a) for a in assignments]


@router.delete(
    "/{project_id}/group-roles/{assignment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(_perm_project_role_revoke)],
    operation_id="revoke_project_group_role",
    response_description="Assignment removed",
)
async def revoke_project_group_role(
    project_id: UUID,
    assignment_id: UUID,
    service: Annotated[ProjectService, Depends(get_project_service)],
) -> None:
    """Remove a group role assignment from a project. Requires: project-role:revoke permission."""
    await service.revoke_group_role(project_id, assignment_id)
