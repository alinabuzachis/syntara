"""Authorization engine: combines policy resolution and OPA evaluation."""

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

import structlog
from cachetools import TTLCache
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

# ---------------------------------------------------------------------------
# In-process TTL cache for OPA evaluation results
# ---------------------------------------------------------------------------
# Keyed by SHA-256 of the canonical OPA input.  Because the key includes
# effective_policies and groups (resolved fresh from the DB on every
# request), a permission change produces a different hash and automatically
# misses the cache — no explicit invalidation is needed.

_opa_cache: TTLCache[str, dict[str, Any]] | None = None


def init_opa_cache(*, enabled: bool = True, ttl_seconds: int = 300, maxsize: int = 2048) -> None:
    """Initialize the OPA result cache.  Called once at app startup."""
    global _opa_cache  # noqa: PLW0603
    if enabled:
        _opa_cache = TTLCache(maxsize=maxsize, ttl=ttl_seconds)
        logger.info("OPA result cache initialized", ttl_seconds=ttl_seconds, maxsize=maxsize)
    else:
        _opa_cache = None
        logger.info("OPA result cache disabled")


def clear_opa_cache() -> None:
    """Clear the OPA result cache."""
    if _opa_cache is not None:
        _opa_cache.clear()


def _hash_opa_input(opa_input: dict[str, Any]) -> str:
    """Produce a stable hash key for an OPA input dict.

    Lists inside the input (e.g. effective_policies, groups) are sorted
    before serialisation so that key stability does not depend on DB query
    ordering.
    """
    stabilised = _sort_lists(opa_input)
    canonical = json.dumps(stabilised, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def _sort_lists(obj: object) -> object:
    """Recursively sort lists so JSON serialisation is order-independent."""
    if isinstance(obj, dict):
        return {k: _sort_lists(v) for k, v in obj.items()}
    if isinstance(obj, list):
        sorted_items = [_sort_lists(i) for i in obj]
        try:
            return sorted(sorted_items, key=lambda x: json.dumps(x, sort_keys=True))
        except TypeError:
            return sorted_items
    return obj


async def _evaluate_opa(
    opa_client: OPAClient,
    opa_input: dict[str, Any],
) -> dict[str, Any]:
    """Evaluate OPA input, using the cache when available."""
    if _opa_cache is not None:
        key = _hash_opa_input(opa_input)
        cached = _opa_cache.get(key)
        if cached is not None:
            return dict(cached)
        result = await opa_client.evaluate(opa_input)
        _opa_cache[key] = result
        return result
    return await opa_client.evaluate(opa_input)


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

    opa_result = await _evaluate_opa(opa_client, opa_input)

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

    opa_result = await _evaluate_opa(opa_client, opa_input)
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
    readable_project_ids: set[UUID] | None = None

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


async def resolve_readable_project_ids(
    db: AsyncSession,
    opa_client: OPAClient,
    user_id: UUID,
    effective: list[dict[str, Any]],
    groups: list[dict[str, Any]],
    user_labels: dict[str, str] | None = None,
    user_metadata: dict[str, Any] | None = None,
) -> set[UUID] | None:
    """Resolve which projects' names the user may see (project:read).

    Accepts pre-fetched effective policies and groups to avoid redundant
    DB queries when the caller already has them.

    Returns None when the user can read all projects.
    """
    opa_input: dict[str, Any] = {
        "user": {"id": str(user_id), "metadata": user_metadata or {}, "labels": user_labels or {}},
        "action": "read",
        "resource": {"type": "project", "id": "", "project": "", "metadata": {}, "labels": {}},
        "groups": groups,
        "effective_policies": effective,
    }
    opa_result = await _evaluate_opa(opa_client, opa_input)
    readable_names: list[str] = list(opa_result.get("allowed_projects", []))

    if "*" in readable_names:
        return None

    return set(await _resolve_project_ids(db, readable_names))


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
        return VisibilityResult(
            unrestricted=True,
            readable_project_ids=await resolve_readable_project_ids(
                db,
                opa_client,
                user_id,
                effective,
                groups,
                user_labels,
                user_metadata,
            ),
        )

    project_ids = await _resolve_project_ids(db, allowed_projects)

    action_str = f"{resource_type}:{action}"
    has_self = any(
        p.get("scope") == "self" and action_str in p.get("actions", []) for p in effective if p.get("effect") == "allow"
    )

    group_ids: list[UUID] = []
    if has_self:
        group_ids = [UUID(g["id"]) for g in groups if g.get("id")]

    readable: set[UUID] | None
    if resource_type == "project" and action == "read":
        readable = set(project_ids)
    else:
        readable = await resolve_readable_project_ids(
            db,
            opa_client,
            user_id,
            effective,
            groups,
            user_labels,
            user_metadata,
        )

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
        readable_project_ids=readable,
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
