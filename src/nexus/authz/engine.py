"""Authorization engine: combines policy resolution and OPA evaluation."""

from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

import structlog
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.authz.models.assignments import PrincipalType, RoleAssignment
from nexus.authz.models.project import Project
from nexus.authz.opa_client import OPAClient
from nexus.authz.resolver import resolve_effective_policies, resolve_user_groups
from nexus.core.models.group import Group

logger = structlog.stdlib.get_logger(__name__)

PROJECT_ADMIN_ROLE_NAME = "project-admin"
PROJECT_USER_ROLE_NAME = "project-user"
AUTHENTICATED_GROUP_NAME = "authenticated"


@dataclass
class AuthzRequest:
    """Authorization request to evaluate."""

    user_id: UUID
    action: str
    resource_type: str
    resource_id: str
    resource_labels: dict[str, str] = field(default_factory=dict)
    resource_metadata: dict[str, Any] = field(default_factory=dict)
    user_labels: dict[str, str] = field(default_factory=dict)
    user_metadata: dict[str, Any] = field(default_factory=dict)
    groups: list[dict[str, Any]] | None = None
    resource_project: str = ""


@dataclass
class AuthzResult:
    """Authorization decision from OPA."""

    allowed: bool
    denied: bool
    matched_policy: str
    denial_reason: str
    denied_by: str
    effective_policies: list[dict[str, Any]]


async def authorize(
    db: AsyncSession,
    opa_client: OPAClient,
    request: AuthzRequest,
) -> AuthzResult:
    """Evaluate an authorization request.

    1. Resolves effective policies from the database
    2. Optionally resolves group memberships
    3. Sends input to OPA for evaluation

    Args:
        db: Database session.
        opa_client: OPA client for policy evaluation.
        request: The authorization request.

    Returns:
        Authorization result with allow/deny decision.

    """
    effective = await resolve_effective_policies(db, request.user_id)

    groups = request.groups
    if groups is None:
        groups = await resolve_user_groups(db, request.user_id)

    opa_input: dict[str, Any] = {
        "user": {
            "id": str(request.user_id),
            "metadata": request.user_metadata,
            "labels": request.user_labels,
        },
        "action": request.action,
        "resource": {
            "type": request.resource_type,
            "id": request.resource_id,
            "project": request.resource_project,
            "metadata": request.resource_metadata,
            "labels": request.resource_labels,
        },
        "groups": groups,
        "effective_policies": effective,
    }

    opa_result = await opa_client.evaluate(opa_input)

    result = AuthzResult(
        allowed=opa_result.get("allow", False),
        denied=opa_result.get("deny", False),
        matched_policy=opa_result.get("matched_policy", ""),
        denial_reason=opa_result.get("denial_reason", ""),
        denied_by=opa_result.get("denied_by", ""),
        effective_policies=effective,
    )

    logger.debug(
        "Authorization decision",
        user_id=str(request.user_id),
        action=request.action,
        resource_type=request.resource_type,
        resource_id=request.resource_id,
        allowed=result.allowed,
        denied=result.denied,
        matched_policy=result.matched_policy,
        denied_by=result.denied_by,
    )

    return result


@dataclass
class AllowedProjectsResult:
    """Result of resolving which projects a user can access."""

    all_projects: bool
    project_ids: list[UUID]


async def _evaluate_list_scope(
    db: AsyncSession,
    opa_client: OPAClient,
    user_id: UUID,
    resource_type: str,
    action: str,
    user_labels: dict[str, str] | None = None,
    user_metadata: dict[str, Any] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str]]:
    """Shared OPA evaluation for list-scope resolution.

    Returns (effective_policies, groups, allowed_project_names).
    """
    effective = await resolve_effective_policies(db, user_id)
    groups = await resolve_user_groups(db, user_id)

    opa_input: dict[str, Any] = {
        "user": {
            "id": str(user_id),
            "metadata": user_metadata or {},
            "labels": user_labels or {},
        },
        "action": action,
        "resource": {
            "type": resource_type,
            "id": "",
            "project": "",
            "metadata": {},
            "labels": {},
        },
        "groups": groups,
        "effective_policies": effective,
    }

    opa_result = await opa_client.evaluate(opa_input)
    allowed_projects: list[str] = list(opa_result.get("allowed_projects", []))
    return effective, groups, allowed_projects


async def _resolve_project_ids(db: AsyncSession, project_names: list[str]) -> list[UUID]:
    """Map project names to IDs, excluding soft-deleted projects."""
    if not project_names:
        return []
    projects_result = await db.exec(
        select(Project).where(
            Project.name.in_(project_names),  # type: ignore[attr-defined]
            Project.deleted_at.is_(None),  # type: ignore[union-attr]
        )
    )
    return [p.id for p in projects_result.all()]


async def resolve_allowed_projects(
    db: AsyncSession,
    opa_client: OPAClient,
    user_id: UUID,
    resource_type: str,
    action: str,
    user_labels: dict[str, str] | None = None,
    user_metadata: dict[str, Any] | None = None,
) -> AllowedProjectsResult:
    """Resolve which projects a user can access for a given resource type and action.

    Calls OPA once to get the set of allowed project names, then maps them to project IDs.
    If the user has a scope="any" policy, returns all_projects=True (no filtering needed).

    Args:
        db: Database session.
        opa_client: OPA client for policy evaluation.
        user_id: The user to resolve projects for.
        resource_type: The resource type (e.g., "credential", "workflow").
        action: The action (e.g., "read").
        user_labels: Optional user labels for condition matching.
        user_metadata: Optional user metadata for condition matching.

    Returns:
        AllowedProjectsResult with all_projects flag or list of project IDs.

    """
    _, _, allowed_projects = await _evaluate_list_scope(
        db,
        opa_client,
        user_id,
        resource_type,
        action,
        user_labels,
        user_metadata,
    )

    logger.debug(
        "Resolved allowed projects",
        user_id=str(user_id),
        resource_type=resource_type,
        action=action,
        allowed_projects=allowed_projects,
    )

    if "*" in allowed_projects:
        return AllowedProjectsResult(all_projects=True, project_ids=[])

    project_ids = await _resolve_project_ids(db, allowed_projects)
    return AllowedProjectsResult(all_projects=False, project_ids=project_ids)


@dataclass
class VisibilityResult:
    """Result of resolving what a user is allowed to see on a list endpoint."""

    unrestricted: bool = False
    allowed_project_ids: list[UUID] = field(default_factory=list)
    has_self_scope: bool = False
    self_user_id: UUID | None = None
    self_group_ids: list[UUID] = field(default_factory=list)

    def to_allowed_projects(self) -> AllowedProjectsResult:
        """Convert to AllowedProjectsResult for project-scoped resources."""
        return AllowedProjectsResult(self.unrestricted, self.allowed_project_ids)

    def to_id_restriction(self, *, use_group_ids: bool = False) -> list[UUID] | None:
        """Convert to id_restriction for system-scoped resources."""
        if self.unrestricted:
            return None
        if not self.has_self_scope:
            return []
        if use_group_ids:
            return list(self.self_group_ids)
        return [self.self_user_id] if self.self_user_id else []


async def resolve_visibility(
    db: AsyncSession,
    opa_client: OPAClient,
    user_id: UUID,
    resource_type: str,
    action: str,
    user_labels: dict[str, str] | None = None,
    user_metadata: dict[str, Any] | None = None,
) -> VisibilityResult:
    """Resolve what a user is allowed to see for a list endpoint."""
    effective, groups, allowed_projects = await _evaluate_list_scope(
        db,
        opa_client,
        user_id,
        resource_type,
        action,
        user_labels,
        user_metadata,
    )

    if "*" in allowed_projects:
        return VisibilityResult(unrestricted=True)

    project_ids = await _resolve_project_ids(db, allowed_projects)

    action_str = f"{resource_type}:{action}"
    has_self = any(
        p.get("scope") == "self" and action_str in p.get("actions", []) for p in effective if p.get("effect") == "allow"
    )

    group_ids: list[UUID] = []
    if has_self:
        group_ids = [UUID(g["id"]) for g in groups if g.get("id")]

    logger.debug(
        "Resolved visibility",
        user_id=str(user_id),
        resource_type=resource_type,
        action=action,
        unrestricted=False,
        allowed_projects=allowed_projects,
        has_self_scope=has_self,
    )

    return VisibilityResult(
        unrestricted=False,
        allowed_project_ids=project_ids,
        has_self_scope=has_self,
        self_user_id=user_id if has_self else None,
        self_group_ids=group_ids,
    )


async def assign_project_admin(
    db: AsyncSession,
    user_id: UUID,
    project_id: UUID,
) -> RoleAssignment:
    """Assign the project-admin role to a user for a project.

    Called automatically when a user creates a project.

    Args:
        db: Database session.
        user_id: The user to grant admin on the project.
        project_id: The project to grant admin for.

    Returns:
        The created RoleAssignment (project-scoped).

    Raises:
        ValueError: If the project-admin role does not exist.

    """
    assignment = RoleAssignment(
        principal_type=PrincipalType.USER,
        principal_id=user_id,
        project_id=project_id,
        role_name=PROJECT_ADMIN_ROLE_NAME,
    )
    db.add(assignment)
    await db.flush()

    logger.info(
        "Assigned project-admin role",
        user_id=str(user_id),
        project_id=str(project_id),
    )

    return assignment


async def assign_authenticated_group_project_user(
    db: AsyncSession,
    project_id: UUID,
) -> RoleAssignment | None:
    """Assign the project-user role to the authenticated group for a project.

    Called automatically when a default project is created so that all
    authenticated users have access.

    Args:
        db: Database session.
        project_id: The project to grant access to.

    Returns:
        The created RoleAssignment (project-scoped), or None if the
        authenticated group doesn't exist.

    """
    group_result = await db.exec(
        select(Group).where(
            Group.name == AUTHENTICATED_GROUP_NAME,
            Group.deleted_at.is_(None),  # type: ignore[union-attr]
        )
    )
    group = group_result.first()
    if not group:
        return None

    assignment = RoleAssignment(
        principal_type=PrincipalType.GROUP,
        principal_id=group.id,
        project_id=project_id,
        role_name=PROJECT_USER_ROLE_NAME,
    )
    db.add(assignment)
    await db.flush()

    logger.info(
        "Assigned project-user role to authenticated group",
        project_id=str(project_id),
        group_id=str(group.id),
    )

    return assignment
