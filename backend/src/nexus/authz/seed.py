"""Seed built-in authz data (groups, default project, admin user).

Built-in roles and policies are no longer stored in the database — they
live in ``role_conventions.py`` and are resolved at runtime.  This seeder
only creates groups, the default project, the admin user, and role
assignments (which reference roles by name).
"""

import secrets
from pathlib import Path
from uuid import UUID, uuid4

import structlog
from sqlalchemy import insert
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.authz.models import RoleAssignment
from nexus.authz.models.assignments import RolePrincipalType
from nexus.authz.models.project import Project
from nexus.core.config.base import get_settings
from nexus.core.models import User
from nexus.core.models.group import Group, user_groups

logger = structlog.stdlib.get_logger(__name__)


async def seed_groups_project_admin(session: AsyncSession) -> None:
    """Seed built-in groups, default project, and admin user.

    Role assignments reference roles by name — no role rows need to
    exist in the database.
    """
    (
        auth_group,
        admin_group,
        auditors_group,
        users_group,
        default_project,
        _system_project,
    ) = await _seed_groups_and_project(session)
    await session.flush()
    await _seed_assignments_and_admin(session, auth_group, admin_group, auditors_group, users_group, default_project)
    await session.commit()


async def seed_authz_data(session: AsyncSession) -> None:
    """Seed all built-in authz data into the database.

    This is the entry point used by tests after table truncation.
    """
    (
        auth_group,
        admin_group,
        auditors_group,
        users_group,
        default_project,
        _system_project,
    ) = await _seed_groups_and_project(session)
    await session.flush()
    await _seed_assignments_and_admin(session, auth_group, admin_group, auditors_group, users_group, default_project)
    await session.commit()


async def _seed_groups_and_project(
    session: AsyncSession,
) -> tuple[Group, Group, Group, Group, Project, Project]:
    """Seed default project, system project, and all built-in groups.

    Returns (auth_group, admin_group, auditors_group, users_group, default_project, system_project).
    """
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

    from nexus.workflows.constants import BUILTIN_PROJECT_NAME  # noqa: PLC0415

    existing_system = await session.exec(
        select(Project).where(
            Project.name == BUILTIN_PROJECT_NAME,
            Project.deleted_at.is_(None),  # type: ignore[union-attr]
        )
    )
    system_project = existing_system.one_or_none()
    if not system_project:
        system_project = Project(
            id=uuid4(),
            name=BUILTIN_PROJECT_NAME,
            description="Default project for built-in workflows",
            is_builtin=True,
            labels={},
        )
        session.add(system_project)

    existing_auth = await session.exec(select(Group).where(Group.name == "authenticated"))
    auth_group = existing_auth.one_or_none()
    if not auth_group:
        auth_group = Group(
            id=uuid4(),
            name="authenticated",
            description="All authenticated users.",
            is_builtin=True,
            labels={},
        )
        session.add(auth_group)

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

    existing_auditors = await session.exec(select(Group).where(Group.name == "auditors"))
    auditors_group = existing_auditors.one_or_none()
    if not auditors_group:
        auditors_group = Group(
            id=uuid4(),
            name="auditors",
            description="Read-only access with audit log visibility.",
            is_builtin=True,
            labels={},
        )
        session.add(auditors_group)

    existing_users = await session.exec(select(Group).where(Group.name == "users"))
    users_group = existing_users.one_or_none()
    if not users_group:
        users_group = Group(
            id=uuid4(),
            name="users",
            description="Default group for local users.",
            is_builtin=True,
            labels={},
        )
        session.add(users_group)

    return auth_group, admin_group, auditors_group, users_group, default_project, system_project


async def _ensure_role_assignment(
    session: AsyncSession,
    group: Group,
    role_name: str,
    *,
    is_builtin: bool = True,
    project_id: UUID | None = None,
) -> None:
    """Create a group role assignment if it doesn't already exist."""
    where_clauses = [
        RoleAssignment.principal_type == RolePrincipalType.GROUP,
        RoleAssignment.principal_id == group.id,
        RoleAssignment.role_name == role_name,
    ]
    if project_id is None:
        where_clauses.append(RoleAssignment.project_id.is_(None))  # type: ignore[union-attr]
    else:
        where_clauses.append(RoleAssignment.project_id == project_id)

    existing = await session.exec(select(RoleAssignment).where(*where_clauses))
    if not existing.one_or_none():
        session.add(
            RoleAssignment(
                id=uuid4(),
                principal_type=RolePrincipalType.GROUP,
                principal_id=group.id,
                role_name=role_name,
                project_id=project_id,
                is_builtin=is_builtin,
                labels={},
            )
        )


async def _ensure_group_membership(session: AsyncSession, user: User, group: Group) -> None:
    """Add a user to a group if not already a member."""
    existing = await session.exec(
        select(user_groups.c.user_id).where(
            user_groups.c.user_id == user.id,
            user_groups.c.group_id == group.id,
        )
    )
    if not existing.one_or_none():
        await session.exec(insert(user_groups).values(user_id=user.id, group_id=group.id))


async def _seed_assignments_and_admin(
    session: AsyncSession,
    auth_group: Group,
    admin_group: Group,
    auditors_group: Group,
    users_group: Group,
    default_project: Project,
) -> None:
    """Seed group-role assignments and bootstrap admin user."""
    await _ensure_role_assignment(session, auth_group, "authenticated")
    await _ensure_role_assignment(session, users_group, "user")
    await _ensure_role_assignment(session, admin_group, "admin")
    await _ensure_role_assignment(session, auditors_group, "auditor")
    await _ensure_role_assignment(session, users_group, "project-user", is_builtin=False, project_id=default_project.id)

    # Bootstrap system user (used by workflow engine for automated invocations)
    settings = get_settings()
    existing_system_user = await session.exec(select(User).where(User.id == settings.system_user_id))
    system_user = existing_system_user.one_or_none()
    if not system_user:
        from nexus.auth.passwords import hash_password  # noqa: PLC0415

        system_user = User(
            id=settings.system_user_id,
            username="system",
            email="system@nexus.local",
            first_name="System",
            is_active=True,
            is_builtin=False,
            password_hash=hash_password(secrets.token_hex(32)),
        )
        session.add(system_user)
        await session.flush()
        logger.info("Bootstrap system user created", user_id=str(system_user.id))

    # Bootstrap admin user
    existing_admin_user = await session.exec(select(User).where(User.username == "admin"))
    admin_user = existing_admin_user.one_or_none()
    if not admin_user:
        password_hash = _read_admin_password_hash()
        admin_user = User(
            id=uuid4(),
            username="admin",
            first_name="Administrator",
            is_enabled=True,
            is_builtin=True,
            password_hash=password_hash,
        )
        session.add(admin_user)
        await session.flush()
        logger.info("Bootstrap admin user created", user_id=str(admin_user.id))

    await _ensure_group_membership(session, system_user, auth_group)
    await _ensure_group_membership(session, system_user, admin_group)
    await _ensure_group_membership(session, system_user, users_group)
    await _ensure_group_membership(session, admin_user, auth_group)
    await _ensure_group_membership(session, admin_user, admin_group)
    await _ensure_group_membership(session, admin_user, users_group)

    await session.commit()


def _read_admin_password_hash() -> str | None:
    """Read the admin password from the configured file and return its hash.

    Returns ``None`` (with a warning) if the path is not configured or the
    file is empty, so that the application can still start without a
    password file — the admin user just won't be able to log in locally.
    """
    from nexus.auth.passwords import hash_password  # noqa: PLC0415

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
