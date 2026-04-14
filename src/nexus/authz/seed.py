"""Seed built-in authz data (policies, roles, groups, default project, admin user).

Used by tests to re-seed after table truncation.

Policies and roles are replayed from the migration POLICY_OPS / ROLE_OPS lists
via apply_policy_ops / apply_role_ops — the same ops the migrations run —
so there is no separate reimplementation of what the migrations do.
"""

from pathlib import Path
from uuid import uuid4

import structlog
from sqlalchemy import insert
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.auth.passwords import hash_password
from nexus.authz.migration_ops import apply_policy_ops, apply_role_ops
from nexus.authz.migration_scanner import scan_migrations, scan_role_migrations
from nexus.authz.models import GroupRoleAssignment, Project, Role
from nexus.core.config.base import get_settings
from nexus.core.models import User
from nexus.core.models.group import Group, user_groups

logger = structlog.stdlib.get_logger(__name__)


async def seed_groups_project_admin(session: AsyncSession) -> None:
    """Seed built-in groups, default project, and admin user.

    Unlike seed_authz_data, this does NOT replay role/policy migration ops
    (which require a sync connection). Use this at application startup where
    migrations have already been applied via ``alembic upgrade head``.

    If the roles table is empty (e.g. tables were truncated in tests),
    groups and project are still created but role assignments are skipped.
    """
    role_result = await session.exec(select(Role))
    role_map = {r.name: r for r in role_result.all()}

    required_roles = {"default", "admin", "project-user"}
    missing = required_roles - role_map.keys()
    if missing:
        logger.warning(
            "Skipping authz seed: required roles not found (run 'alembic upgrade head' first)",
            missing_roles=sorted(missing),
        )
        return

    auth_group, admin_group, default_project = await _seed_groups_and_project(session)
    await session.flush()

    required_roles = {"default", "admin", "project-user"}
    if required_roles.issubset(role_map):
        await _seed_assignments_and_admin(session, role_map, auth_group, admin_group, default_project)
    else:
        missing = required_roles - set(role_map)
        logger.warning("Skipping role assignments: required roles not found", missing_roles=missing)
    await session.commit()


async def seed_authz_data(session: AsyncSession) -> None:
    """Seed all built-in authz data into the database.

    Replays ROLE_OPS and POLICY_OPS from all existing migrations, then seeds
    groups, the default project, and the admin user.

    Args:
        session: Database session.

    """
    # Run sync migration ops inside a greenlet via run_sync, since the asyncpg
    # driver requires a greenlet context even for the sync_connection wrapper.
    role_ops = scan_role_migrations()
    policy_ops = scan_migrations()
    async_conn = await session.connection()
    await async_conn.run_sync(lambda sync_conn: apply_role_ops(role_ops, conn=sync_conn))
    await async_conn.run_sync(lambda sync_conn: apply_policy_ops(policy_ops, conn=sync_conn))

    # Build role_map from the rows now in the DB.
    role_result = await session.exec(select(Role))
    role_map = {r.name: r for r in role_result.all()}

    auth_group, admin_group, default_project = await _seed_groups_and_project(session)
    await session.flush()
    await _seed_assignments_and_admin(session, role_map, auth_group, admin_group, default_project)
    await session.commit()


async def _seed_groups_and_project(session: AsyncSession) -> tuple[Group, Group, Project]:
    """Seed default project, authenticated group, and admin group.

    Returns (auth_group, admin_group, default_project).
    """
    # Default project (only consider non-deleted)
    existing_proj = await session.exec(
        select(Project).where(
            Project.name == "default",
            Project.deleted_at.is_(None),  # type: ignore[union-attr]
        )
    )
    default_project = existing_proj.one_or_none()
    if not default_project:
        default_project = Project(id=uuid4(), name="default", description="Default project", is_default=True, labels={})
        session.add(default_project)

    # Authenticated group
    existing_auth = await session.exec(select(Group).where(Group.name == "authenticated"))
    auth_group = existing_auth.one_or_none()
    if not auth_group:
        auth_group = Group(
            id=uuid4(),
            name="authenticated",
            description="Implicit group for all authenticated users.",
            is_builtin=True,
            labels={},
        )
        session.add(auth_group)

    # Admin group
    existing_admins = await session.exec(select(Group).where(Group.name == "admins"))
    admin_group = existing_admins.one_or_none()
    if not admin_group:
        admin_group = Group(
            id=uuid4(),
            name="admins",
            description="System administrators.",
            is_builtin=True,
            labels={},
        )
        session.add(admin_group)

    return auth_group, admin_group, default_project


async def _seed_assignments_and_admin(
    session: AsyncSession,
    role_map: dict[str, Role],
    auth_group: Group,
    admin_group: Group,
    default_project: Project,
) -> None:
    """Seed group-role assignments and bootstrap admin user."""
    # Assign "default" role to the "authenticated" group (global)
    existing_auth_assignment = await session.exec(
        select(GroupRoleAssignment).where(
            GroupRoleAssignment.group_id == auth_group.id,
            GroupRoleAssignment.role_id == role_map["default"].id,
            GroupRoleAssignment.project_id.is_(None),  # type: ignore[union-attr]
        )
    )
    if not existing_auth_assignment.one_or_none():
        session.add(GroupRoleAssignment(id=uuid4(), group_id=auth_group.id, role_id=role_map["default"].id, labels={}))

    # Assign "admin" role to the "admins" group (global)
    existing_admin_assignment = await session.exec(
        select(GroupRoleAssignment).where(
            GroupRoleAssignment.group_id == admin_group.id,
            GroupRoleAssignment.role_id == role_map["admin"].id,
            GroupRoleAssignment.project_id.is_(None),  # type: ignore[union-attr]
        )
    )
    if not existing_admin_assignment.one_or_none():
        session.add(GroupRoleAssignment(id=uuid4(), group_id=admin_group.id, role_id=role_map["admin"].id, labels={}))

    # Assign "project-user" role to "authenticated" group on the default project
    existing_default_assignment = await session.exec(
        select(GroupRoleAssignment).where(
            GroupRoleAssignment.group_id == auth_group.id,
            GroupRoleAssignment.project_id == default_project.id,
            GroupRoleAssignment.role_id == role_map["project-user"].id,
        )
    )
    if not existing_default_assignment.one_or_none():
        session.add(
            GroupRoleAssignment(
                id=uuid4(),
                group_id=auth_group.id,
                project_id=default_project.id,
                role_id=role_map["project-user"].id,
                labels={},
            )
        )

    # Bootstrap admin user
    existing_admin_user = await session.exec(select(User).where(User.username == "admin"))
    admin_user = existing_admin_user.one_or_none()
    if not admin_user:
        password_hash = _read_admin_password_hash()
        admin_user = User(
            id=uuid4(),
            username="admin",
            email="admin@nexus.local",
            full_name="Administrator",
            is_active=True,
            password_hash=password_hash,
        )
        session.add(admin_user)
        await session.flush()
        logger.info("Bootstrap admin user created", user_id=str(admin_user.id))

    # Add admin to admins group (authenticated group is implicit for all users)
    existing_membership = await session.exec(
        select(user_groups.c.user_id).where(
            user_groups.c.user_id == admin_user.id,
            user_groups.c.group_id == admin_group.id,
        )
    )
    if not existing_membership.one_or_none():
        await session.exec(insert(user_groups).values(user_id=admin_user.id, group_id=admin_group.id))

    await session.commit()


def _read_admin_password_hash() -> str | None:
    """Read the admin password from the configured file and return its hash.

    Returns ``None`` (with a warning) if the path is not configured or the
    file is empty, so that the application can still start without a
    password file — the admin user just won't be able to log in locally.
    """
    settings = get_settings()
    password_path = settings.admin_password_path
    if not password_path:
        logger.warning(
            "APP_ADMIN_PASSWORD_PATH not set — admin user will have no password. "
            "Run 'make secrets-generate' to create one."
        )
        return None

    path = Path(password_path)
    if not path.exists():
        logger.warning("Admin password file not found", path=password_path)
        return None

    password = path.read_text().strip()
    if not password:
        logger.warning("Admin password file is empty", path=password_path)
        return None

    return hash_password(password)
