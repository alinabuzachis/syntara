"""Unit tests for the authorization engine.

Tests cover:
- authorize() with mocked OPA client
- resolve_allowed_projects() for global and project-scoped access
- assign_project_admin() helper
- assign_authenticated_group_project_user() helper
"""

from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.authz.engine import (
    AuthzRequest,
    assign_authenticated_group_project_user,
    assign_project_admin,
    authorize,
    resolve_allowed_projects,
)
from nexus.authz.models.assignments import PrincipalType
from nexus.authz.models.project import Project
from nexus.authz.seed import seed_authz_data
from nexus.core.models import User
from nexus.core.models.group import Group


@pytest.fixture
async def seeded_db(test_db_session: AsyncSession) -> AsyncSession:
    """Seed authz data and return the session."""
    await seed_authz_data(test_db_session)
    return test_db_session


@pytest.fixture
def mock_opa() -> AsyncMock:
    """Create a mock OPA client."""
    opa = AsyncMock()
    opa.evaluate = AsyncMock(
        return_value={
            "allow": True,
            "deny": False,
            "matched_policy": "test-allow",
            "denial_reason": "",
            "denied_by": "",
            "allowed_projects": ["*"],
        }
    )
    return opa


@pytest.mark.asyncio
async def test_authorize_allowed(
    seeded_db: AsyncSession,
    test_user: User,
    mock_opa: AsyncMock,
) -> None:
    """authorize() returns allowed=True when OPA allows."""
    request = AuthzRequest(
        user_id=test_user.id,
        action="read",
        resource_type="workflow",
        resource_id="wf-1",
    )
    result = await authorize(seeded_db, mock_opa, request)
    assert result.allowed is True
    assert result.denied is False
    assert result.matched_policy == "test-allow"
    mock_opa.evaluate.assert_awaited_once()


@pytest.mark.asyncio
async def test_authorize_denied(
    seeded_db: AsyncSession,
    test_user: User,
    mock_opa: AsyncMock,
) -> None:
    """authorize() returns denied=True when OPA denies."""
    mock_opa.evaluate.return_value = {
        "allow": False,
        "deny": True,
        "matched_policy": "",
        "denial_reason": "no matching policy",
        "denied_by": "deny-all",
    }
    request = AuthzRequest(
        user_id=test_user.id,
        action="delete",
        resource_type="workflow",
        resource_id="wf-1",
    )
    result = await authorize(seeded_db, mock_opa, request)
    assert result.allowed is False
    assert result.denied is True
    assert result.denial_reason == "no matching policy"


@pytest.mark.asyncio
async def test_authorize_with_preresolved_groups(
    seeded_db: AsyncSession,
    test_user: User,
    mock_opa: AsyncMock,
) -> None:
    """authorize() uses pre-resolved groups when provided."""
    groups = [{"name": "custom-group", "labels": {}}]
    request = AuthzRequest(
        user_id=test_user.id,
        action="read",
        resource_type="workflow",
        resource_id="wf-1",
        groups=groups,
    )
    result = await authorize(seeded_db, mock_opa, request)
    assert result.allowed is True
    # Verify groups were passed to OPA
    call_args = mock_opa.evaluate.call_args[0][0]
    assert call_args["groups"] == groups


@pytest.mark.asyncio
async def test_resolve_allowed_projects_global(
    seeded_db: AsyncSession,
    test_user: User,
    mock_opa: AsyncMock,
) -> None:
    """resolve_allowed_projects() with '*' returns all_projects=True."""
    result = await resolve_allowed_projects(seeded_db, mock_opa, test_user.id, "workflow", "read")
    assert result.all_projects is True
    assert result.project_ids == []


@pytest.mark.asyncio
async def test_resolve_allowed_projects_specific(
    seeded_db: AsyncSession,
    test_user: User,
    mock_opa: AsyncMock,
) -> None:
    """resolve_allowed_projects() maps project names to IDs."""
    # Get the default project name
    result = await seeded_db.exec(select(Project).where(Project.name == "default"))
    default_project = result.first()
    assert default_project is not None

    mock_opa.evaluate.return_value = {
        "allow": True,
        "deny": False,
        "matched_policy": "test",
        "allowed_projects": ["default"],
    }
    allowed = await resolve_allowed_projects(seeded_db, mock_opa, test_user.id, "workflow", "read")
    assert allowed.all_projects is False
    assert default_project.id in allowed.project_ids


@pytest.mark.asyncio
async def test_resolve_allowed_projects_empty(
    seeded_db: AsyncSession,
    test_user: User,
    mock_opa: AsyncMock,
) -> None:
    """resolve_allowed_projects() with empty list returns no project IDs."""
    mock_opa.evaluate.return_value = {
        "allow": False,
        "deny": False,
        "matched_policy": "",
        "allowed_projects": [],
    }
    allowed = await resolve_allowed_projects(seeded_db, mock_opa, test_user.id, "workflow", "read")
    assert allowed.all_projects is False
    assert allowed.project_ids == []


@pytest.mark.asyncio
async def test_assign_project_admin(seeded_db: AsyncSession, test_user: User) -> None:
    """assign_project_admin() creates a project-scoped user role assignment."""
    project = Project(name="admin-test-project", labels={})
    seeded_db.add(project)
    await seeded_db.flush()

    assignment = await assign_project_admin(seeded_db, test_user.id, project.id)
    assert assignment.principal_type == PrincipalType.USER
    assert assignment.principal_id == test_user.id
    assert assignment.project_id == project.id
    assert assignment.role_name == "project-admin"


@pytest.mark.asyncio
async def test_assign_authenticated_group_project_user(
    seeded_db: AsyncSession,
) -> None:
    """assign_authenticated_group_project_user() creates group role assignment."""
    project = Project(name="auth-group-test", labels={})
    seeded_db.add(project)
    await seeded_db.flush()

    assignment = await assign_authenticated_group_project_user(seeded_db, project.id)
    assert assignment is not None
    assert assignment.project_id == project.id
    assert assignment.role_name == "project-user"

    # Verify group is "authenticated"
    assert assignment.principal_type == PrincipalType.GROUP
    group = await seeded_db.get(Group, assignment.principal_id)
    assert group is not None
    assert group.name == "authenticated"


@pytest.mark.asyncio
async def test_assign_authenticated_group_missing(test_db_session: AsyncSession) -> None:
    """assign_authenticated_group_project_user() returns None when group missing."""
    # No authz data seeded
    result = await assign_authenticated_group_project_user(test_db_session, uuid4())
    assert result is None
