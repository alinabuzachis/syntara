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

    logger.debug(
        "Resolved allowed projects",
        user_id=str(user_id),
        resource_type=resource_type,
        action=action,
        allowed_projects=allowed_projects,
    )

    # If "*" is in the set, user has global access — no filtering needed
    if "*" in allowed_projects:
        return AllowedProjectsResult(all_projects=True, project_ids=[])

    # Map project names to project IDs
    if not allowed_projects:
        return AllowedProjectsResult(all_projects=False, project_ids=[])

    projects_result = await db.exec(
        select(Project).where(
            Project.name.in_(allowed_projects),  # type: ignore[attr-defined]
            Project.deleted_at.is_(None),  # type: ignore[union-attr]
        )
    )
    project_ids = [p.id for p in projects_result.all()]

    return AllowedProjectsResult(all_projects=False, project_ids=project_ids)


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
