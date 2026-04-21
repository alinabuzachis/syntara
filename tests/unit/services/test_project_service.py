"""Unit tests for ProjectService.

Tests cover:
- Project CRUD operations (create, get, list, update, delete)
- User role assignment and revocation within projects
- Group role assignment and revocation within projects
- Listing role assignments
- Invalid role name handling
- Auto-assignment of project-admin on create
"""

from uuid import uuid4

import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.authz.engine import AllowedProjectsResult
from nexus.authz.exceptions import ProjectNotFoundError
from nexus.authz.seed import seed_authz_data
from nexus.core.exceptions import SafeValueError
from nexus.core.models import User
from nexus.core.models.group import Group
from nexus.projects.service import ProjectService


@pytest.fixture
async def seeded_db(test_db_session: AsyncSession) -> AsyncSession:
    """Seed authz data and return the session."""
    await seed_authz_data(test_db_session)
    return test_db_session


# ============================================================================
# Project CRUD
# ============================================================================


@pytest.mark.asyncio
async def test_create_project(seeded_db: AsyncSession, test_user: User) -> None:
    """Create a project and auto-assign creator as project-admin."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(
        name="test-project",
        description="A test project",
        labels={"env": "dev"},
    )
    assert project.name == "test-project"
    assert project.description == "A test project"
    assert project.labels == {"env": "dev"}
    assert project.deleted_at is None

    # Creator should be assigned project-admin
    assignments = await svc.list_role_assignments(project.id)
    assert len(assignments) == 1
    roles = {a["role_name"] for a in assignments}
    assert "project-admin" in roles
    assert all(a["user_id"] == test_user.id for a in assignments)


@pytest.mark.asyncio
async def test_create_project_defaults(seeded_db: AsyncSession, test_user: User) -> None:
    """Create a project with only the required name."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="minimal-project")
    assert project.name == "minimal-project"
    assert project.description is None
    assert project.labels == {}


@pytest.mark.asyncio
async def test_get_project(seeded_db: AsyncSession, test_user: User) -> None:
    """Get a project by ID."""
    svc = ProjectService(seeded_db, test_user)
    created = await svc.create_project(name="get-project")
    fetched = await svc.get_project(created.id)
    assert fetched.id == created.id
    assert fetched.name == "get-project"


@pytest.mark.asyncio
async def test_get_project_not_found(seeded_db: AsyncSession, test_user: User) -> None:
    """Getting a non-existent project raises SafeValueError."""
    svc = ProjectService(seeded_db, test_user)
    with pytest.raises(ProjectNotFoundError, match="not found"):
        await svc.get_project(uuid4())


@pytest.mark.asyncio
async def test_get_deleted_project_not_found(seeded_db: AsyncSession, test_user: User) -> None:
    """Getting a soft-deleted project raises SafeValueError."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="deleted-project")
    await svc.delete_project(project.id)
    with pytest.raises(ProjectNotFoundError, match="not found"):
        await svc.get_project(project.id)


@pytest.mark.asyncio
async def test_list_projects_no_filter(seeded_db: AsyncSession, test_user: User) -> None:
    """List all non-deleted projects."""
    svc = ProjectService(seeded_db, test_user)
    await svc.create_project(name="list-p1")
    await svc.create_project(name="list-p2")
    projects = await svc.list_projects()
    names = [p.name for p in projects]
    assert "list-p1" in names
    assert "list-p2" in names


@pytest.mark.asyncio
async def test_list_projects_with_allowed_all(seeded_db: AsyncSession, test_user: User) -> None:
    """List with all_projects=True returns everything."""
    svc = ProjectService(seeded_db, test_user)
    await svc.create_project(name="all-p1")
    allowed = AllowedProjectsResult(all_projects=True, project_ids=[])
    projects = await svc.list_projects(allowed_projects=allowed)
    names = [p.name for p in projects]
    assert "all-p1" in names


@pytest.mark.asyncio
async def test_list_projects_with_allowed_specific(seeded_db: AsyncSession, test_user: User) -> None:
    """List with specific project IDs only returns those projects."""
    svc = ProjectService(seeded_db, test_user)
    p1 = await svc.create_project(name="allowed-p1")
    await svc.create_project(name="not-allowed-p2")
    allowed = AllowedProjectsResult(all_projects=False, project_ids=[p1.id])
    projects = await svc.list_projects(allowed_projects=allowed)
    names = [p.name for p in projects]
    assert "allowed-p1" in names
    assert "not-allowed-p2" not in names


@pytest.mark.asyncio
async def test_list_projects_with_allowed_empty(seeded_db: AsyncSession, test_user: User) -> None:
    """List with empty project IDs returns nothing."""
    svc = ProjectService(seeded_db, test_user)
    await svc.create_project(name="empty-filter-p1")
    allowed = AllowedProjectsResult(all_projects=False, project_ids=[])
    projects = await svc.list_projects(allowed_projects=allowed)
    assert projects == []


@pytest.mark.asyncio
async def test_update_project(seeded_db: AsyncSession, test_user: User) -> None:
    """Update project name, description, and labels."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="update-me", description="original")
    updated = await svc.update_project(
        project.id,
        name="renamed",
        description="updated",
        labels={"version": "2"},
    )
    assert updated.name == "renamed"
    assert updated.description == "updated"
    assert updated.labels == {"version": "2"}


@pytest.mark.asyncio
async def test_update_project_partial(seeded_db: AsyncSession, test_user: User) -> None:
    """Partial update only changes provided fields."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="partial-update", description="original")
    updated = await svc.update_project(project.id, description="only desc changed")
    assert updated.name == "partial-update"
    assert updated.description == "only desc changed"


@pytest.mark.asyncio
async def test_delete_project(seeded_db: AsyncSession, test_user: User) -> None:
    """Soft-delete a project."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="delete-me")
    await svc.delete_project(project.id)
    # Should not appear in list
    projects = await svc.list_projects()
    assert not any(p.name == "delete-me" for p in projects)


# ============================================================================
# User Role Assignment
# ============================================================================


@pytest.mark.asyncio
async def test_assign_user_role(seeded_db: AsyncSession, test_user: User) -> None:
    """Assign project-user role to a user in a project."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="role-assign-project")

    # Create another user
    other = User(id=uuid4(), username="other", email="other@test.com", full_name="Other")
    seeded_db.add(other)
    await seeded_db.commit()

    assignment = await svc.assign_role(project.id, other.id, "project-user")
    assert assignment.user_id == other.id
    assert assignment.project_id == project.id


@pytest.mark.asyncio
async def test_assign_invalid_role_name(seeded_db: AsyncSession, test_user: User) -> None:
    """Invalid role name raises SafeValueError."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="invalid-role-project")
    with pytest.raises(SafeValueError, match="Invalid project role"):
        await svc.assign_role(project.id, test_user.id, "superadmin")


@pytest.mark.asyncio
async def test_assign_role_project_not_found(seeded_db: AsyncSession, test_user: User) -> None:
    """Assigning a role to a non-existent project raises SafeValueError."""
    svc = ProjectService(seeded_db, test_user)
    with pytest.raises(ProjectNotFoundError, match="not found"):
        await svc.assign_role(uuid4(), test_user.id, "project-user")


@pytest.mark.asyncio
async def test_revoke_user_role(seeded_db: AsyncSession, test_user: User) -> None:
    """Revoke a user role assignment from a project."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="revoke-role-project")

    other = User(id=uuid4(), username="revokee", email="revokee@test.com", full_name="Revokee")
    seeded_db.add(other)
    await seeded_db.commit()

    assignment = await svc.assign_role(project.id, other.id, "project-user")
    await svc.revoke_role(project.id, assignment.id)

    assignments = await svc.list_role_assignments(project.id)
    user_ids = [a["user_id"] for a in assignments]
    assert other.id not in user_ids


@pytest.mark.asyncio
async def test_revoke_nonexistent_role(seeded_db: AsyncSession, test_user: User) -> None:
    """Revoking a non-existent assignment raises SafeValueError."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="revoke-missing-project")
    with pytest.raises(SafeValueError, match="not found"):
        await svc.revoke_role(project.id, uuid4())


@pytest.mark.asyncio
async def test_list_role_assignments(seeded_db: AsyncSession, test_user: User) -> None:
    """List user role assignments with resolved names."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="list-roles-project")

    other = User(id=uuid4(), username="listroles-user", email="lr@test.com", full_name="LR")
    seeded_db.add(other)
    await seeded_db.commit()

    await svc.assign_role(project.id, other.id, "project-user")
    assignments = await svc.list_role_assignments(project.id)
    # Should have project-admin (creator) + project-user (other)
    assert len(assignments) == 2
    roles = {a["role_name"] for a in assignments}
    assert "project-admin" in roles
    assert "project-user" in roles


# ============================================================================
# Group Role Assignment
# ============================================================================


@pytest.mark.asyncio
async def test_assign_group_role(seeded_db: AsyncSession, test_user: User) -> None:
    """Assign a project-scoped role to a group."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="grp-role-project")

    group = Group(id=uuid4(), name="proj-team", description="", labels={})
    seeded_db.add(group)
    await seeded_db.commit()

    assignment = await svc.assign_group_role(project.id, group.id, "project-user")
    assert assignment.group_id == group.id
    assert assignment.project_id == project.id


@pytest.mark.asyncio
async def test_assign_group_invalid_role(seeded_db: AsyncSession, test_user: User) -> None:
    """Invalid role name for group assignment raises SafeValueError."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="grp-invalid-role")
    with pytest.raises(SafeValueError, match="Invalid project role"):
        await svc.assign_group_role(project.id, uuid4(), "superadmin")


@pytest.mark.asyncio
async def test_revoke_group_role(seeded_db: AsyncSession, test_user: User) -> None:
    """Revoke a group role assignment from a project."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="revoke-grp-project")

    group = Group(id=uuid4(), name="revoke-grp", description="", labels={})
    seeded_db.add(group)
    await seeded_db.commit()

    assignment = await svc.assign_group_role(project.id, group.id, "project-user")
    await svc.revoke_group_role(project.id, assignment.id)

    assignments = await svc.list_group_role_assignments(project.id)
    assert not any(a["group_id"] == group.id for a in assignments)


@pytest.mark.asyncio
async def test_revoke_group_nonexistent(seeded_db: AsyncSession, test_user: User) -> None:
    """Revoking a non-existent group assignment raises SafeValueError."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="revoke-grp-missing")
    with pytest.raises(SafeValueError, match="not found"):
        await svc.revoke_group_role(project.id, uuid4())


@pytest.mark.asyncio
async def test_list_group_role_assignments(seeded_db: AsyncSession, test_user: User) -> None:
    """List group role assignments with resolved names."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="list-grp-roles")

    group = Group(id=uuid4(), name="listed-proj-grp", description="", labels={})
    seeded_db.add(group)
    await seeded_db.commit()

    await svc.assign_group_role(project.id, group.id, "project-user")
    assignments = await svc.list_group_role_assignments(project.id)
    assert len(assignments) >= 1
    match = [a for a in assignments if a["group_name"] == "listed-proj-grp"]
    assert len(match) == 1
    assert match[0]["role_name"] == "project-user"
