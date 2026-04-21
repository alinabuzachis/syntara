"""Policy resolver: loads user's effective policies from the database.

Resolution chain: user → groups (GroupMembership) → roles (GroupRoleAssignment)
→ role_policies → policies.
"""

from typing import Any
from uuid import UUID

import structlog
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.authz.models.assignments import (
    GroupRoleAssignment,
    UserRoleAssignment,
)
from nexus.authz.models.policy import Policy
from nexus.authz.models.project import Project
from nexus.authz.models.role import RolePolicyLink
from nexus.core.models.group import Group, user_groups

logger = structlog.stdlib.get_logger(__name__)

AUTHENTICATED_GROUP_NAME = "authenticated"


async def _resolve_roles_to_policies(
    db: AsyncSession,
    role_ids: list[UUID],
    seen: set[str],
    result: list[dict[str, Any]],
    project: str = "",
) -> None:
    """Load policies linked to roles via role_policies and add statements to result.

    Args:
        db: Database session.
        role_ids: Role IDs to resolve.
        seen: Set of already-seen statement names (for dedup).
        result: Accumulator for statement dicts.
        project: If set, inject project into each statement for project scoping.

    """
    if not role_ids:
        return

    # Single JOIN: role_policies → policies
    policies_result = await db.exec(
        select(Policy)
        .join(RolePolicyLink, RolePolicyLink.policy_id == Policy.id)  # type: ignore[arg-type]
        .where(RolePolicyLink.role_id.in_(role_ids))  # type: ignore[attr-defined]
    )
    for policy in policies_result.all():
        for stmt in policy.to_statement_dicts():
            name = stmt.get("name", "")
            entry = stmt
            if project:
                entry = {**stmt, "scope": "project", "project": project}
                name = f"{name}@{project}"
            if name not in seen:
                seen.add(name)
                result.append(entry)


async def _get_user_group_ids(db: AsyncSession, user_id: UUID) -> list[UUID]:
    """Return group IDs for a user, including the implicit 'authenticated' group."""
    result = await db.exec(
        select(user_groups.c.group_id)
        .join(Group, Group.id == user_groups.c.group_id)  # type: ignore[arg-type]
        .where(
            user_groups.c.user_id == user_id,
            Group.deleted_at.is_(None),  # type: ignore[union-attr]
        )
    )
    group_ids = list(result.all())

    auth_group_result = await db.exec(
        select(Group).where(
            Group.name == AUTHENTICATED_GROUP_NAME,
            Group.deleted_at.is_(None),  # type: ignore[union-attr]
        )
    )
    auth_group = auth_group_result.first()
    if auth_group and auth_group.id not in group_ids:
        group_ids.append(auth_group.id)

    return group_ids


async def resolve_effective_policies(
    db: AsyncSession,
    user_id: UUID,
) -> list[dict[str, Any]]:
    """Resolve all effective policies for a user.

    Resolution order:
    1. Global: user → groups (+ implicit "authenticated") → roles → policies
    2. Global: user → direct role assignments → policies
    3. Project-scoped: user + group assignments with project_id set → policies

    Args:
        db: Database session.
        user_id: The user to resolve policies for.

    Returns:
        List of flat statement dicts for OPA consumption.

    """
    seen: set[str] = set()
    result: list[dict[str, Any]] = []

    group_ids = await _get_user_group_ids(db, user_id)

    # --- All group role assignments (global + project-scoped) ---
    global_group_role_ids: list[UUID] = []
    project_role_ids: dict[UUID, list[UUID]] = {}

    if group_ids:
        group_assignments = await db.exec(
            select(GroupRoleAssignment).where(
                GroupRoleAssignment.group_id.in_(group_ids)  # type: ignore[attr-defined]
            )
        )
        for ga in group_assignments.all():
            if ga.project_id is None:
                global_group_role_ids.append(ga.role_id)
            else:
                project_role_ids.setdefault(ga.project_id, []).append(ga.role_id)

    # Resolve global group roles
    await _resolve_roles_to_policies(db, global_group_role_ids, seen, result)

    # --- All user role assignments (global + project-scoped) ---
    user_assignments = await db.exec(select(UserRoleAssignment).where(UserRoleAssignment.user_id == user_id))
    direct_global_role_ids: list[UUID] = []
    for ua in user_assignments.all():
        if ua.project_id is None:
            direct_global_role_ids.append(ua.role_id)
        else:
            project_role_ids.setdefault(ua.project_id, []).append(ua.role_id)

    # Resolve direct global roles
    await _resolve_roles_to_policies(db, direct_global_role_ids, seen, result)

    # --- Resolve all project-scoped role IDs to policies ---
    if project_role_ids:
        projects_result = await db.exec(
            select(Project).where(
                Project.id.in_(list(project_role_ids.keys())),  # type: ignore[attr-defined]
                Project.deleted_at.is_(None),  # type: ignore[union-attr]
            )
        )
        project_map = {p.id: p.name for p in projects_result.all()}

        for project_id, role_ids in project_role_ids.items():
            project_name = project_map.get(project_id, str(project_id))
            await _resolve_roles_to_policies(db, role_ids, seen, result, project=project_name)

    return result


async def resolve_user_groups(
    db: AsyncSession,
    user_id: UUID,
) -> list[dict[str, Any]]:
    """Resolve group memberships for a user.

    Returns group info in the format expected by OPA:
    [{"name": "group-name", "labels": {"key": "value"}}]

    Args:
        db: Database session.
        user_id: The user to resolve groups for.

    Returns:
        List of group dicts with name and labels.

    """
    group_ids = await _get_user_group_ids(db, user_id)

    if not group_ids:
        return []

    groups_result = await db.exec(
        select(Group).where(
            Group.id.in_(group_ids),  # type: ignore[attr-defined]
            Group.deleted_at.is_(None),  # type: ignore[union-attr]
        )
    )
    return [{"name": g.name, "labels": g.labels} for g in groups_result.all()]
