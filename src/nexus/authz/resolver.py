"""Policy resolver: loads user's effective policies from the database.

Resolution chain: user → groups (GroupMembership) → role assignments
→ role names → policies (builtins from code, custom from DB).
"""

from typing import Any
from uuid import UUID

import structlog
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.authz.models.assignments import PrincipalType, RoleAssignment
from nexus.authz.models.policy import Policy
from nexus.authz.models.project import Project
from nexus.authz.models.role import Role
from nexus.authz.role_conventions import (
    get_builtin_role,
    is_builtin_policy,
    resolve_builtin_policy_statements,
)
from nexus.core.models.group import Group, user_groups

logger = structlog.stdlib.get_logger(__name__)

AUTHENTICATED_GROUP_NAME = "authenticated"


async def _resolve_roles_to_policies(
    db: AsyncSession,
    role_names: list[str],
    seen: set[str],
    result: list[dict[str, Any]],
    project: str = "",
) -> None:
    """Resolve role names to policy statements and add to result.

    Built-in roles are resolved entirely from code (zero DB queries).
    Custom roles are resolved via the roles table + role_policies join.
    """
    if not role_names:
        return

    custom_role_names: list[str] = []
    for rn in role_names:
        builtin = get_builtin_role(rn)
        if builtin:
            _add_builtin_role_statements(rn, seen, result, project)
        else:
            custom_role_names.append(rn)

    if custom_role_names:
        await _resolve_custom_roles(db, custom_role_names, seen, result, project)


def _add_builtin_role_statements(
    role_name: str,
    seen: set[str],
    result: list[dict[str, Any]],
    project: str,
) -> None:
    """Add statements for a built-in role from code registry."""
    from nexus.authz.role_conventions import builtin_role_policy_names  # noqa: PLC0415

    for policy_name in builtin_role_policy_names(role_name):
        for stmt in resolve_builtin_policy_statements(policy_name):
            entry = {**stmt, "name": policy_name}
            name = policy_name
            if project:
                entry = {**entry, "scope": "project", "project": project}
                name = f"{name}@{project}"
            if name not in seen:
                seen.add(name)
                result.append(entry)


async def _resolve_custom_roles(
    db: AsyncSession,
    role_names: list[str],
    seen: set[str],
    result: list[dict[str, Any]],
    project: str,
) -> None:
    """Resolve custom (non-builtin) roles via DB.

    Reads ``policy_names`` from each Role, then resolves each name
    against builtins first, falling back to the policies table.
    """
    roles_result = await db.exec(select(Role).where(Role.name.in_(role_names)))  # type: ignore[attr-defined]
    roles = list(roles_result.all())
    if not roles:
        return

    all_policy_names: set[str] = set()
    for role in roles:
        all_policy_names.update(role.policy_names)

    custom_policy_names = [n for n in all_policy_names if not is_builtin_policy(n)]
    custom_policies: dict[str, Policy] = {}
    if custom_policy_names:
        policies_result = await db.exec(
            select(Policy).where(Policy.name.in_(custom_policy_names))  # type: ignore[attr-defined]
        )
        custom_policies = {p.name: p for p in policies_result.all()}

    for role in roles:
        for pn in role.policy_names:
            if is_builtin_policy(pn):
                for stmt in resolve_builtin_policy_statements(pn):
                    _add_stmt(stmt, pn, seen, result, project)
            elif pn in custom_policies:
                for stmt in custom_policies[pn].to_statement_dicts():
                    _add_stmt(stmt, "", seen, result, project)


def _add_stmt(
    stmt: dict[str, Any],
    fallback_name: str,
    seen: set[str],
    result: list[dict[str, Any]],
    project: str,
) -> None:
    name = stmt.get("name", fallback_name)
    entry = stmt
    if project:
        entry = {**stmt, "scope": "project", "project": project}
        name = f"{name}@{project}"
    if name not in seen:
        seen.add(name)
        result.append(entry)


async def get_user_group_ids(db: AsyncSession, user_id: UUID) -> list[UUID]:
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
    """
    seen: set[str] = set()
    result: list[dict[str, Any]] = []

    group_ids = await get_user_group_ids(db, user_id)

    global_group_role_names: list[str] = []
    project_role_names: dict[UUID, list[str]] = {}

    if group_ids:
        group_assignments = await db.exec(
            select(RoleAssignment).where(
                RoleAssignment.principal_type == PrincipalType.GROUP,
                RoleAssignment.principal_id.in_(group_ids),  # type: ignore[attr-defined]
            )
        )
        for ga in group_assignments.all():
            if ga.project_id is None:
                global_group_role_names.append(ga.role_name)
            else:
                project_role_names.setdefault(ga.project_id, []).append(ga.role_name)

    await _resolve_roles_to_policies(db, global_group_role_names, seen, result)

    user_assignments = await db.exec(
        select(RoleAssignment).where(
            RoleAssignment.principal_type == PrincipalType.USER,
            RoleAssignment.principal_id == user_id,
        )
    )
    direct_global_role_names: list[str] = []
    for ua in user_assignments.all():
        if ua.project_id is None:
            direct_global_role_names.append(ua.role_name)
        else:
            project_role_names.setdefault(ua.project_id, []).append(ua.role_name)

    await _resolve_roles_to_policies(db, direct_global_role_names, seen, result)

    if project_role_names:
        projects_result = await db.exec(
            select(Project).where(
                Project.id.in_(list(project_role_names.keys())),  # type: ignore[attr-defined]
                Project.deleted_at.is_(None),  # type: ignore[union-attr]
            )
        )
        project_map = {p.id: p.name for p in projects_result.all()}

        for project_id, names in project_role_names.items():
            project_name = project_map.get(project_id, str(project_id))
            await _resolve_roles_to_policies(db, names, seen, result, project=project_name)

    return result


async def resolve_user_groups(
    db: AsyncSession,
    user_id: UUID,
) -> list[dict[str, Any]]:
    """Resolve group memberships for a user.

    Returns group info in the format expected by OPA:
    [{"name": "group-name", "labels": {"key": "value"}}]
    """
    group_ids = await get_user_group_ids(db, user_id)

    if not group_ids:
        return []

    groups_result = await db.exec(
        select(Group).where(
            Group.id.in_(group_ids),  # type: ignore[attr-defined]
            Group.deleted_at.is_(None),  # type: ignore[union-attr]
        )
    )
    return [{"name": g.name, "labels": g.labels} for g in groups_result.all()]
