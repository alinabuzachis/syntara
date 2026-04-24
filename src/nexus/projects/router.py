"""Project API endpoints.

CRUD for projects and project-scoped role assignment management.
Authorization is enforced via PermissionChecker dependency on each endpoint.
"""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Path, Query, Request, status
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.approvals.models.approval_request import ApprovalListResponse
from nexus.approvals.models.query_params import ApprovalListParams
from nexus.approvals.services.approval_service import ApprovalService
from nexus.auth import get_current_user
from nexus.authz.all_role_assignment_router import (
    AllRoleAssignmentListParams,
    AllRoleAssignmentListResponse,
    AllRoleAssignmentRead,
    _resolve_visibility,
)
from nexus.authz.dependencies import PermissionChecker, ProjectScopeFilter, get_opa_client
from nexus.authz.engine import AllowedProjectsResult, AuthzRequest, authorize
from nexus.authz.exceptions import PolicyNotFoundError, RoleNotFoundError
from nexus.authz.resolver import get_user_group_ids
from nexus.authz.schemas import (
    PolicyListParams,
    PolicyListResponse,
    PolicyRead,
    PolicyUpdate,
    RoleListParams,
    RoleListResponse,
    RoleRead,
    RoleUpdate,
)
from nexus.authz.services.all_role_assignment_service import AllRoleAssignmentService
from nexus.authz.services.policy_service import PolicyService
from nexus.authz.services.role_service import RoleService
from nexus.core.database.session import get_db
from nexus.core.models import User
from nexus.core.nexus_router import NO_PERMISSION, NexusRouter
from nexus.projects.schemas import (
    ProjectCreate,
    ProjectGroupRoleAssignmentCreate,
    ProjectGroupRoleAssignmentRead,
    ProjectPolicyCreate,
    ProjectRead,
    ProjectRoleAssignmentCreate,
    ProjectRoleAssignmentRead,
    ProjectRoleCreate,
    ProjectUpdate,
)
from nexus.projects.service import ProjectService
from nexus.workflows.models import WorkflowListParams
from nexus.workflows.models.workflow import WorkflowListResponse
from nexus.workflows.services import WorkflowService

router = NexusRouter(prefix="/projects", tags=["Projects"])

_perm_project_read = PermissionChecker("project", "read", project_param="project_id")
_perm_project_update = PermissionChecker("project", "update", project_param="project_id")
_perm_project_delete = PermissionChecker("project", "delete", project_param="project_id")
_perm_workflow_read = PermissionChecker("workflow", "read", project_param="project_id")
_perm_approval_read = PermissionChecker("approval", "read", project_param="project_id")
_perm_project_role_assign = PermissionChecker("project-role", "assign", project_param="project_id")
_perm_project_role_revoke = PermissionChecker("project-role", "revoke", project_param="project_id")
_perm_role_create = PermissionChecker("role", "create", project_param="project_id")
_perm_role_read = PermissionChecker("role", "read", project_param="project_id")
_perm_role_update = PermissionChecker("role", "update", project_param="project_id")
_perm_role_delete = PermissionChecker("role", "delete", project_param="project_id")
_perm_policy_create = PermissionChecker("policy", "create", project_param="project_id")
_perm_policy_read = PermissionChecker("policy", "read", project_param="project_id")
_perm_policy_update = PermissionChecker("policy", "update", project_param="project_id")
_perm_policy_delete = PermissionChecker("policy", "delete", project_param="project_id")


def get_project_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ProjectService:
    """Dependency provider for ProjectService."""
    return ProjectService(db, current_user)


def get_role_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> RoleService:
    """Dependency provider for RoleService."""
    return RoleService(db, current_user)


def get_policy_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PolicyService:
    """Dependency provider for PolicyService."""
    return PolicyService(db, current_user)


# ============================================================================
# Project CRUD
# ============================================================================


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(PermissionChecker("project", "create"))],
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
    "/{project_id}/role-assignments",
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
        role_name=assignment.role_name,
        created_at=assignment.created_at,
    )


@router.get(
    "/{project_id}/role-assignments",
    dependencies=[NO_PERMISSION],
    operation_id="list_project_role_assignments",
    response_description="List of role assignments",
)
async def list_project_role_assignments(
    project_id: UUID,
    request: Request,
    service: Annotated[ProjectService, Depends(get_project_service)],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ProjectRoleAssignmentRead]:
    """List role assignments for a project.

    Admin/auditor/project-admin see all assignments; other users see only their own.
    """
    project_name = (await service.get_project(project_id)).name
    opa_client = get_opa_client(request)
    authz_result = await authorize(
        db,
        opa_client,
        AuthzRequest(
            user_id=current_user.id,
            action="read",
            resource_type="project-role",
            resource_id="",
            resource_project=project_name,
            user_labels=current_user.labels,
            user_metadata=current_user.authz_metadata,
        ),
    )
    user_id = None if authz_result.allowed else current_user.id
    assignments = await service.list_role_assignments(project_id, user_id=user_id)
    return [ProjectRoleAssignmentRead.model_validate(a) for a in assignments]


@router.delete(
    "/{project_id}/role-assignments/{assignment_id}",
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
    "/{project_id}/group-role-assignments",
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
        role_name=assignment.role_name,
        created_at=assignment.created_at,
    )


@router.get(
    "/{project_id}/group-role-assignments",
    dependencies=[NO_PERMISSION],
    operation_id="list_project_group_role_assignments",
    response_description="List of group role assignments",
)
async def list_project_group_role_assignments(
    project_id: UUID,
    request: Request,
    service: Annotated[ProjectService, Depends(get_project_service)],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ProjectGroupRoleAssignmentRead]:
    """List group role assignments for a project.

    Admin/auditor/project-admin see all assignments; other users see only
    assignments for groups they belong to.
    """
    project_name = (await service.get_project(project_id)).name
    opa_client = get_opa_client(request)
    authz_result = await authorize(
        db,
        opa_client,
        AuthzRequest(
            user_id=current_user.id,
            action="read",
            resource_type="project-role",
            resource_id="",
            resource_project=project_name,
            user_labels=current_user.labels,
            user_metadata=current_user.authz_metadata,
        ),
    )
    group_ids = None
    if not authz_result.allowed:
        group_ids = await get_user_group_ids(db, current_user.id)
    assignments = await service.list_group_role_assignments(project_id, group_ids=group_ids)
    return [ProjectGroupRoleAssignmentRead.model_validate(a) for a in assignments]


@router.delete(
    "/{project_id}/group-role-assignments/{assignment_id}",
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


# ============================================================================
# Project-scoped Roles (CRUD)
# ============================================================================


@router.post(
    "/{project_id}/roles",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_perm_role_create)],
    operation_id="create_project_role",
)
async def create_project_role(
    project_id: UUID,
    body: ProjectRoleCreate,
    service: Annotated[RoleService, Depends(get_role_service)],
) -> RoleRead:
    """Create a role scoped to this project. Requires: role:create permission."""
    role = await service.create_role(
        name=body.name,
        description=body.description,
        policies=body.policies,
        labels=body.labels,
        project_id=project_id,
    )
    return await service.to_role_read(role)


@router.get(
    "/{project_id}/roles",
    dependencies=[Depends(_perm_role_read)],
    operation_id="list_project_roles",
)
async def list_project_roles(
    project_id: Annotated[UUID, Path(description="Project UUID")],
    request: Request,
    params: Annotated[RoleListParams, Depends()],
    service: Annotated[RoleService, Depends(get_role_service)],
) -> RoleListResponse:
    """List roles visible within this project.

    Includes project-owned roles and global roles with scope "project".
    """
    return await service.list_project_roles(
        project_id=project_id,
        limit=params.limit,
        cursor=params.cursor,
        sort=params.sort,
        query_params_items=request.query_params.items(),
        include_total=params.include_total,
    )


@router.get(
    "/{project_id}/roles/{role_id}",
    dependencies=[Depends(_perm_role_read)],
    operation_id="get_project_role",
)
async def get_project_role(
    project_id: UUID,
    role_id: UUID,
    service: Annotated[RoleService, Depends(get_role_service)],
) -> RoleRead:
    """Get a single role, verifying it belongs to this project."""
    role = await service.get_role(role_id)
    if role.project_id != project_id:
        msg = f"Role {role_id} not found in project {project_id}"
        raise RoleNotFoundError(msg)
    return await service.to_role_read(role)


async def _do_update_project_role(
    project_id: UUID,
    role_id: UUID,
    body: RoleUpdate,
    service: RoleService,
) -> RoleRead:
    """Shared implementation for PATCH and PUT project role updates."""
    role = await service.get_role(role_id)
    if role.project_id != project_id:
        msg = f"Role {role_id} not found in project {project_id}"
        raise RoleNotFoundError(msg)
    role = await service.update_role(
        role_id=role_id,
        name=body.name,
        description=body.description,
        policies=body.policies,
        labels=body.labels,
    )
    return await service.to_role_read(role)


@router.patch(
    "/{project_id}/roles/{role_id}",
    dependencies=[Depends(_perm_role_update)],
    operation_id="update_project_role",
)
async def update_project_role(
    project_id: UUID,
    role_id: UUID,
    body: RoleUpdate,
    service: Annotated[RoleService, Depends(get_role_service)],
) -> RoleRead:
    """Patch a project role. Builtin roles cannot be modified."""
    return await _do_update_project_role(project_id, role_id, body, service)


@router.put(
    "/{project_id}/roles/{role_id}",
    dependencies=[Depends(_perm_role_update)],
    operation_id="replace_project_role",
)
async def replace_project_role(
    project_id: UUID,
    role_id: UUID,
    body: RoleUpdate,
    service: Annotated[RoleService, Depends(get_role_service)],
) -> RoleRead:
    """Replace a project role. Builtin roles cannot be modified."""
    return await _do_update_project_role(project_id, role_id, body, service)


@router.delete(
    "/{project_id}/roles/{role_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(_perm_role_delete)],
    operation_id="delete_project_role",
)
async def delete_project_role(
    project_id: UUID,
    role_id: UUID,
    service: Annotated[RoleService, Depends(get_role_service)],
) -> None:
    """Delete a project role. Builtin roles cannot be deleted."""
    role = await service.get_role(role_id)
    if role.project_id != project_id:
        msg = f"Role {role_id} not found in project {project_id}"
        raise RoleNotFoundError(msg)
    await service.delete_role(role_id)


# ============================================================================
# Project-scoped Policies (CRUD)
# ============================================================================


def _is_global_project_scoped(policy_read: PolicyRead) -> bool:
    """Check if a policy is a global policy with project scope in its statements."""
    if policy_read.project_id is not None:
        return False
    return any(stmt.get("scope") == "project" for stmt in policy_read.statements)


@router.post(
    "/{project_id}/policies",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_perm_policy_create)],
    operation_id="create_project_policy",
)
async def create_project_policy(
    project_id: UUID,
    body: ProjectPolicyCreate,
    service: Annotated[PolicyService, Depends(get_policy_service)],
) -> PolicyRead:
    """Create a policy scoped to this project. Requires: policy:create permission."""
    policy = await service.create_policy(
        name=body.name,
        description=body.description,
        statements=[s.model_dump(exclude_none=True) for s in body.statements],
        labels=body.labels,
        project_id=project_id,
    )
    return PolicyRead.model_validate(policy)


@router.get(
    "/{project_id}/policies",
    dependencies=[Depends(_perm_policy_read)],
    operation_id="list_project_policies",
)
async def list_project_policies(
    project_id: Annotated[UUID, Path(description="Project UUID")],
    request: Request,
    params: Annotated[PolicyListParams, Depends()],
    service: Annotated[PolicyService, Depends(get_policy_service)],
) -> PolicyListResponse:
    """List policies visible within this project.

    Includes project-owned policies and global policies with scope "project".
    """
    return await service.list_project_policies(
        project_id=project_id,
        limit=params.limit,
        cursor=params.cursor,
        sort=params.sort,
        query_params_items=request.query_params.items(),
        include_total=params.include_total,
    )


@router.get(
    "/{project_id}/policies/{policy_id}",
    dependencies=[Depends(_perm_policy_read)],
    operation_id="get_project_policy",
)
async def get_project_policy(
    project_id: UUID,
    policy_id: UUID,
    service: Annotated[PolicyService, Depends(get_policy_service)],
) -> PolicyRead:
    """Get a single policy, if it belongs to this project or is a global project-scoped policy."""
    policy = await service.get_policy(policy_id)
    policy_read = PolicyRead.model_validate(policy)
    if policy.project_id == project_id or _is_global_project_scoped(policy_read):
        return policy_read
    msg = f"Policy {policy_id} not found in project {project_id}"
    raise PolicyNotFoundError(msg)


async def _do_update_project_policy(
    project_id: UUID,
    policy_id: UUID,
    body: PolicyUpdate,
    service: PolicyService,
) -> PolicyRead:
    """Shared implementation for PATCH and PUT project policy updates."""
    policy = await service.get_policy(policy_id)
    if policy.project_id != project_id:
        msg = f"Policy {policy_id} not found in project {project_id}"
        raise PolicyNotFoundError(msg)
    statements = None
    if body.statements is not None:
        statements = [s.model_dump(exclude_none=True) for s in body.statements]
    policy = await service.update_policy(
        policy_id=policy_id,
        name=body.name,
        description=body.description,
        statements=statements,
        labels=body.labels,
    )
    return PolicyRead.model_validate(policy)


@router.patch(
    "/{project_id}/policies/{policy_id}",
    dependencies=[Depends(_perm_policy_update)],
    operation_id="update_project_policy",
)
async def update_project_policy(
    project_id: UUID,
    policy_id: UUID,
    body: PolicyUpdate,
    service: Annotated[PolicyService, Depends(get_policy_service)],
) -> PolicyRead:
    """Patch a project policy. Only project-owned policies can be modified."""
    return await _do_update_project_policy(project_id, policy_id, body, service)


@router.put(
    "/{project_id}/policies/{policy_id}",
    dependencies=[Depends(_perm_policy_update)],
    operation_id="replace_project_policy",
)
async def replace_project_policy(
    project_id: UUID,
    policy_id: UUID,
    body: PolicyUpdate,
    service: Annotated[PolicyService, Depends(get_policy_service)],
) -> PolicyRead:
    """Replace a project policy. Only project-owned policies can be modified."""
    return await _do_update_project_policy(project_id, policy_id, body, service)


@router.delete(
    "/{project_id}/policies/{policy_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(_perm_policy_delete)],
    operation_id="delete_project_policy",
)
async def delete_project_policy(
    project_id: UUID,
    policy_id: UUID,
    service: Annotated[PolicyService, Depends(get_policy_service)],
) -> None:
    """Delete a project policy. Only project-owned policies can be deleted."""
    policy = await service.get_policy(policy_id)
    if policy.project_id != project_id:
        msg = f"Policy {policy_id} not found in project {project_id}"
        raise PolicyNotFoundError(msg)
    await service.delete_policy(policy_id)


# ============================================================================
# Project-scoped All Role Assignments (unified view)
# ============================================================================


def _get_all_role_assignment_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> AllRoleAssignmentService:
    return AllRoleAssignmentService(db, current_user)


@router.get(
    "/{project_id}/all-role-assignments", dependencies=[NO_PERMISSION], operation_id="list_project_all_role_assignments"
)
async def list_project_all_role_assignments(
    project_id: Annotated[UUID, Path(description="Project UUID")],
    request: Request,
    params: Annotated[AllRoleAssignmentListParams, Depends()],
    service: Annotated[AllRoleAssignmentService, Depends(_get_all_role_assignment_service)],
    project_service: Annotated[ProjectService, Depends(get_project_service)],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AllRoleAssignmentListResponse:
    """List all role assignments (user + group) scoped to a project."""
    project = await project_service.get_project(project_id)

    restrict_user_id, restrict_group_ids = await _resolve_visibility(
        db,
        request,
        current_user,
        resource_project=project.name,
    )

    result = await service.list_all(
        limit=params.limit,
        cursor=params.cursor,
        sort=params.sort,
        principal_type=params.principal_type,
        principal_name=params.principal_name,
        role_name=params.role_name,
        project_id=project_id,
        include_total=params.include_total,
        restrict_user_id=restrict_user_id,
        restrict_group_ids=restrict_group_ids,
    )
    return AllRoleAssignmentListResponse(
        resources=[AllRoleAssignmentRead(**r) for r in result["resources"]],
        next=result["next"],
        prev=result["prev"],
        total=result["total"],
    )
