"""Seed built-in authz data (groups, default project, admin user).

Built-in roles and policies are no longer stored in the database — they
live in ``role_conventions.py`` and are resolved at runtime.  This seeder
only creates groups, the default project, the admin user, and role
assignments (which reference roles by name).
"""

from pathlib import Path
from uuid import uuid4

import structlog
from sqlalchemy import insert
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.authz.models import RoleAssignment
from nexus.authz.models.assignments import PrincipalType
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
    auth_group, admin_group, default_project = await _seed_groups_and_project(session)
    await session.flush()
    await _seed_assignments_and_admin(session, auth_group, admin_group, default_project)
    await session.commit()


async def seed_authz_data(session: AsyncSession) -> None:
    """Seed all built-in authz data into the database.

    This is the entry point used by tests after table truncation.
    """
    auth_group, admin_group, default_project = await _seed_groups_and_project(session)
    await session.flush()
    await _seed_assignments_and_admin(session, auth_group, admin_group, default_project)
    await session.commit()


async def _seed_groups_and_project(session: AsyncSession) -> tuple[Group, Group, Project]:
    """Seed default project, authenticated group, and admin group.

    Returns (auth_group, admin_group, default_project).
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
    auth_group: Group,
    admin_group: Group,
    default_project: Project,
) -> None:
    """Seed group-role assignments and bootstrap admin user."""
    # Assign "default" role to the "authenticated" group (global)
    existing_auth_assignment = await session.exec(
        select(RoleAssignment).where(
            RoleAssignment.principal_type == PrincipalType.GROUP,
            RoleAssignment.principal_id == auth_group.id,
            RoleAssignment.role_name == "default",
            RoleAssignment.project_id.is_(None),  # type: ignore[union-attr]
        )
    )
    if not existing_auth_assignment.one_or_none():
        session.add(
            RoleAssignment(
                id=uuid4(),
                principal_type=PrincipalType.GROUP,
                principal_id=auth_group.id,
                role_name="default",
                labels={},
            )
        )

    # Assign "admin" role to the "admins" group (global)
    existing_admin_assignment = await session.exec(
        select(RoleAssignment).where(
            RoleAssignment.principal_type == PrincipalType.GROUP,
            RoleAssignment.principal_id == admin_group.id,
            RoleAssignment.role_name == "admin",
            RoleAssignment.project_id.is_(None),  # type: ignore[union-attr]
        )
    )
    if not existing_admin_assignment.one_or_none():
        session.add(
            RoleAssignment(
                id=uuid4(),
                principal_type=PrincipalType.GROUP,
                principal_id=admin_group.id,
                role_name="admin",
                labels={},
            )
        )

    # Assign "project-user" role to "authenticated" group on the default project
    existing_default_assignment = await session.exec(
        select(RoleAssignment).where(
            RoleAssignment.principal_type == PrincipalType.GROUP,
            RoleAssignment.principal_id == auth_group.id,
            RoleAssignment.project_id == default_project.id,
            RoleAssignment.role_name == "project-user",
        )
    )
    if not existing_default_assignment.one_or_none():
        session.add(
            RoleAssignment(
                id=uuid4(),
                principal_type=PrincipalType.GROUP,
                principal_id=auth_group.id,
                project_id=default_project.id,
                role_name="project-user",
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
            email="admin@example.com",
            full_name="Administrator",
            is_enabled=True,
            is_builtin=True,
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
