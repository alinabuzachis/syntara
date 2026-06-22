"""Shared fixtures for integration API tests.

Provides automatic OPA CLI-based evaluation and authz data seeding so that
all API tests work with authorization always enabled, using the real rego
policy instead of a Python reimplementation.
"""

import json
import shutil
import subprocess
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import insert
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.api.main import app
from nexus.auth.dependencies import get_current_user
from nexus.authz.dependencies import get_opa_client
from nexus.authz.models import Project, RoleAssignment, RolePrincipalType
from nexus.authz.seed import seed_authz_data
from nexus.core.models import User
from nexus.core.models.group import Group, user_groups

# Name for the test group that grants the 'user' role
_TEST_GROUP_NAME = "test-users"

# Path to the rego policy file (relative to project root)
_REGO_POLICY_PATH = Path(__file__).resolve().parents[3] / "src" / "nexus" / "authz" / "rego" / "authz.rego"

# Fields we care about from OPA evaluation
_OPA_RESULT_FIELDS = {"allow", "deny", "matched_policy", "denial_reason", "denied_by", "allowed_projects"}


def _opa_evaluate_cli(opa_input: dict[str, Any]) -> dict[str, Any]:
    """Evaluate authz using the OPA CLI against the real rego policy.

    Shells out to ``opa eval`` so the integration tests exercise the actual
    rego rules rather than a Python approximation.
    """
    result = subprocess.run(  # noqa: S603
        [  # noqa: S607
            "opa",
            "eval",
            "-d",
            str(_REGO_POLICY_PATH),
            "-I",
            "--format",
            "json",
            "data.nexus.authz",
        ],
        input=json.dumps(opa_input),
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        msg = f"opa eval failed (rc={result.returncode}): {result.stderr}"
        raise RuntimeError(msg)

    raw = json.loads(result.stdout)
    value: dict[str, Any] = raw["result"][0]["expressions"][0]["value"]
    # Strip internal fields (prefixed with _) that aren't part of the public API
    return {k: v for k, v in value.items() if k in _OPA_RESULT_FIELDS}


@pytest.fixture(autouse=True)
async def _seed_authz(test_db_session: AsyncSession) -> None:
    """Re-seed built-in authz data and set up default permissions for tests.

    Creates:
    - Built-in policies, roles, groups, and default project
    - A 'test-users' group bound to the 'user' role
    - A dev-user in that group (for unauthenticated base_client requests)
    """
    await seed_authz_data(test_db_session)

    from nexus.workflows.seed_builtin import seed_builtin_workflows

    await seed_builtin_workflows(test_db_session)

    # Create a group with the 'admin' role for test users (functional tests need
    # broad permissions; authz-specific tests create their own limited-role users)
    test_group = Group(id=uuid4(), name=_TEST_GROUP_NAME, description="Test users group", is_builtin=False, labels={})
    test_db_session.add(test_group)
    await test_db_session.flush()
    test_db_session.add(
        RoleAssignment(
            id=uuid4(),
            principal_type=RolePrincipalType.GROUP,
            principal_id=test_group.id,
            role_name="admin",
        )
    )

    # Create dev-user and add to the group
    dev_user = User(
        id=uuid4(),
        username="dev-user",
        email="dev@example.com",
        first_name="Development",
        last_name="User",
        password_hash="$argon2id$test",  # noqa: S106
        is_enabled=True,
    )
    test_db_session.add(dev_user)
    await test_db_session.flush()
    await test_db_session.exec(insert(user_groups).values(user_id=dev_user.id, group_id=test_group.id))

    await test_db_session.commit()


@pytest_asyncio.fixture
async def test_user(
    user_factory: Callable[..., Awaitable[User]],
    test_db_session: AsyncSession,
) -> User:
    """Create test user and add to the test-users group for authorization.

    Overrides the root conftest test_user to also grant the 'user' role.
    """
    user = await user_factory()

    test_group = (await test_db_session.exec(select(Group).where(Group.name == _TEST_GROUP_NAME))).first()
    if test_group:
        await test_db_session.exec(insert(user_groups).values(user_id=user.id, group_id=test_group.id))
        await test_db_session.commit()

    return user


@pytest_asyncio.fixture
async def admin_user(
    user_factory: Callable[..., Awaitable[User]],
    test_db_session: AsyncSession,
) -> User:
    """Create a test user with admin role for user/group/idp management tests."""
    user = await user_factory(username="admin-test", email="admin-test@example.com", is_builtin=True)
    await make_admin(test_db_session, user)
    return user


@pytest_asyncio.fixture
async def admin_client(base_client: AsyncClient, admin_user: User) -> AsyncClient:
    """Authenticated client with admin permissions."""

    async def override() -> User:
        return admin_user

    app.dependency_overrides[get_current_user] = override
    return base_client


@pytest.fixture
def auth_as() -> Callable[[User], None]:
    """Return a callable that overrides the current user dependency.

    Usage:
        auth_as(some_user)  # switches auth to some_user
    """

    def _do_auth_as(user: User) -> None:
        async def override() -> User:
            return user

        app.dependency_overrides[get_current_user] = override

    return _do_auth_as


async def _make_role_assignment(
    session: AsyncSession,
    user: User,
    role_name: str,
) -> None:
    """Assign a named role to a user via a dedicated group."""
    group = Group(name=f"{role_name}-grp-{uuid4()}", description="", labels={})
    session.add(group)
    await session.flush()
    session.add(
        RoleAssignment(
            principal_type=RolePrincipalType.GROUP,
            principal_id=group.id,
            role_name=role_name,
        )
    )
    await session.exec(insert(user_groups).values(user_id=user.id, group_id=group.id))
    await session.commit()


async def make_admin(session: AsyncSession, user: User) -> None:
    """Assign the admin role to a user via a dedicated group."""
    await _make_role_assignment(session, user, "admin")


async def make_auditor(session: AsyncSession, user: User) -> None:
    """Assign the auditor role to a user via a dedicated group."""
    await _make_role_assignment(session, user, "auditor")


async def make_user_role(session: AsyncSession, user: User) -> None:
    """Assign the user role to a user via a dedicated group."""
    await _make_role_assignment(session, user, "user")


async def make_project_user(
    session: AsyncSession,
    user: User,
    project: "Project",
) -> RoleAssignment:
    """Assign project-user role to a user for a specific project."""
    assignment = RoleAssignment(
        principal_type=RolePrincipalType.USER,
        principal_id=user.id,
        project_id=project.id,
        role_name="project-user",
    )
    session.add(assignment)
    await session.commit()
    return assignment


async def make_project_admin(
    session: AsyncSession,
    user: User,
    project: "Project",
) -> RoleAssignment:
    """Assign project-admin role to a user for a specific project."""
    assignment = RoleAssignment(
        principal_type=RolePrincipalType.USER,
        principal_id=user.id,
        project_id=project.id,
        role_name="project-admin",
    )
    session.add(assignment)
    await session.commit()
    return assignment


@pytest_asyncio.fixture
async def test_project_id(test_db_session: AsyncSession) -> str:
    """Create a test project and return its ID as a string."""
    project = Project(name=f"test-project-{uuid4().hex[:8]}", description="Test project for API tests")
    test_db_session.add(project)
    await test_db_session.commit()
    await test_db_session.refresh(project)
    return str(project.id)


@pytest.fixture(autouse=True)
def _mock_opa(monkeypatch: pytest.MonkeyPatch) -> None:
    """Replace OPA client with one that uses the OPA CLI.

    Instead of hitting an OPA server over HTTP, this evaluates the real
    authz.rego policy via ``opa eval`` so that integration tests exercise
    the actual rego rules.

    Patches every module that has imported ``get_opa_client`` so that
    the mock is used regardless of how the function was resolved.
    """
    if not shutil.which("opa"):
        pytest.skip("opa CLI not found on PATH")

    mock_opa = AsyncMock()
    mock_opa.evaluate = AsyncMock(side_effect=_opa_evaluate_cli)

    def _mock_getter(request: Any = None) -> AsyncMock:  # noqa: ANN401
        return mock_opa

    monkeypatch.setattr("nexus.authz.dependencies.get_opa_client", _mock_getter)
    monkeypatch.setattr("nexus.authz.router.get_opa_client", _mock_getter)
    monkeypatch.setattr("nexus.authz.role_assignment_router.get_opa_client", _mock_getter)
    monkeypatch.setattr("nexus.workflows.executions_router.get_opa_client", _mock_getter)

    # Also override via FastAPI dependency_overrides so Depends(get_opa_client) resolves correctly
    app.dependency_overrides[get_opa_client] = lambda: mock_opa
