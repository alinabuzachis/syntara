"""Integration tests for the authorization query endpoints.

Covers the can-i, who-can, and what-can-i endpoints defined in
``src/nexus/authz/router.py``.  These endpoints provide authorization
evaluation with full explainability (matched policy, denial reason, etc.).
"""

import json
import shutil
import subprocess
from collections.abc import Awaitable, Callable, Generator
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import insert
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.api.main import app
from nexus.auth.dependencies import get_current_user
from nexus.authz.dependencies import get_opa_client
from nexus.authz.models import RoleAssignment, RolePrincipalType
from nexus.authz.models.policy import Policy
from nexus.authz.models.role import Role
from nexus.core.models import User
from nexus.core.models.group import Group, user_groups
from tests.integration.api.conftest import make_admin, make_auditor, make_user_role

_REGO_POLICY_PATH = Path(__file__).resolve().parents[3] / "src" / "nexus" / "authz" / "rego" / "authz.rego"
_OPA_RESULT_FIELDS = {"allow", "deny", "matched_policy", "denial_reason", "denied_by", "allowed_projects"}


def _opa_evaluate_cli(opa_input: dict[str, Any]) -> dict[str, Any]:
    """Evaluate authz using the OPA CLI against the real rego policy."""
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
    return {k: v for k, v in value.items() if k in _OPA_RESULT_FIELDS}


@pytest.fixture(autouse=True)
def _override_opa_dependency() -> Generator[None, None, None]:
    """Override get_opa_client via app.dependency_overrides.

    The conftest _mock_opa uses monkeypatch.setattr which doesn't affect
    Depends(get_opa_client) in router.py (already imported reference).
    This fixture uses dependency_overrides which FastAPI resolves at call time.
    """
    if not shutil.which("opa"):
        pytest.skip("opa CLI not found on PATH")

    mock_opa = AsyncMock()
    mock_opa.evaluate = AsyncMock(side_effect=_opa_evaluate_cli)
    app.dependency_overrides[get_opa_client] = lambda: mock_opa
    yield
    app.dependency_overrides.pop(get_opa_client, None)


# ============================================================================
# Helpers
# ============================================================================


def _auth_as(user: User) -> None:
    """Override the current user dependency to act as a user."""

    async def override() -> User:
        return user

    app.dependency_overrides[get_current_user] = override


# ============================================================================
# POST /authz/can_i
# ============================================================================


@pytest.mark.asyncio
async def test_can_i_allowed_action(
    auth_client: AsyncClient,
    test_user: User,
) -> None:
    """CI-1: User with 'user' role can create projects (scope=any)."""
    response = await auth_client.post(
        "/api/v1/authz/can_i",
        json={"action": "create", "resource_type": "project"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["allowed"] is True
    assert data["denied"] is False
    assert data["matched_policy"] != ""


@pytest.mark.asyncio
async def test_can_i_denied_action(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    user_factory: Callable[..., Awaitable[User]],
) -> None:
    """CI-2: User with only 'user' role cannot create policies."""
    limited_user = await user_factory(username="limited-ci2", email="limited-ci2@test.com")
    await make_user_role(test_db_session, limited_user)
    _auth_as(limited_user)

    response = await auth_client.post(
        "/api/v1/authz/can_i",
        json={"action": "create", "resource_type": "policy"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["allowed"] is False
    assert data["matched_policy"] == ""


@pytest.mark.asyncio
async def test_can_i_admin_allowed(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    """CI-3: Admin user is allowed any action."""
    await make_admin(test_db_session, test_user)

    response = await auth_client.post(
        "/api/v1/authz/can_i",
        json={"action": "delete", "resource_type": "policy"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["allowed"] is True
    assert data["denied"] is False


@pytest.mark.asyncio
async def test_can_i_project_scoped(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
    user_factory: Callable[..., Awaitable[User]],
) -> None:
    """CI-4: Project-scoped permission grants access within that project only."""
    # test_user (with user role) creates a project, becoming project-admin
    response = await auth_client.post(
        "/api/v1/projects",
        json={"name": "can-i-proj-a"},
    )
    assert response.status_code == 201
    project_name = response.json()["name"]

    # Verify: test_user can read workflows in this project (project-admin has all perms)
    response = await auth_client.post(
        "/api/v1/authz/can_i",
        json={"action": "read", "resource_type": "workflow"},
    )
    assert response.status_code == 200
    assert response.json()["allowed"] is True

    # Verify: project-scoped policies appear in what-can-i
    response = await auth_client.post("/api/v1/authz/what_can_i")
    assert response.status_code == 200
    permissions = response.json()["permissions"]
    project_perms = [p for p in permissions if p["scope"] == "project" and p["project"] == project_name]
    assert len(project_perms) > 0


@pytest.mark.asyncio
async def test_can_i_self_scope(
    auth_client: AsyncClient,
    test_user: User,
) -> None:
    """CI-5: user:read:any is granted via user role."""
    # Should be allowed when resource_id matches user's own ID
    response = await auth_client.post(
        "/api/v1/authz/can_i",
        json={
            "action": "read",
            "resource_type": "user",
            "resource_id": str(test_user.id),
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["allowed"] is True

    # Should also be allowed for other users (user:read:any granted to user role)
    response = await auth_client.post(
        "/api/v1/authz/can_i",
        json={
            "action": "read",
            "resource_type": "user",
            "resource_id": str(uuid4()),
        },
    )
    assert response.status_code == 200
    assert response.json()["allowed"] is True


@pytest.mark.asyncio
async def test_can_i_wildcard_action(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    """CI-6: Wildcard action (e.g. workflow:*) matches any verb."""
    # Create a custom policy with wildcard action and assign to user
    wildcard_policy = Policy(
        id=uuid4(),
        name="test:wildcard:any",
        description="Wildcard test policy",
        statements=[{"effect": "allow", "actions": ["test-resource:*"], "scope": "any"}],
        is_builtin=False,
        labels={},
    )
    test_db_session.add(wildcard_policy)

    # Create a role with the policy in policy_names
    wildcard_role = Role(
        id=uuid4(),
        name="wildcard-test-role",
        description="Role with wildcard",
        is_builtin=False,
        policy_names=["test:wildcard:any"],
        labels={},
    )
    test_db_session.add(wildcard_role)
    await test_db_session.flush()

    # Create group and assign to user
    group = Group(name=f"wildcard-grp-{uuid4()}", description="", labels={})
    test_db_session.add(group)
    await test_db_session.flush()
    test_db_session.add(
        RoleAssignment(principal_type=RolePrincipalType.GROUP, principal_id=group.id, role_name="wildcard-test-role")
    )
    await test_db_session.exec(insert(user_groups).values(user_id=test_user.id, group_id=group.id))
    await test_db_session.commit()

    response = await auth_client.post(
        "/api/v1/authz/can_i",
        json={"action": "delete", "resource_type": "test-resource"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["allowed"] is True
    assert data["matched_policy"] == "test:wildcard:any"


@pytest.mark.asyncio
async def test_can_i_explicit_deny_overrides_allow(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    """CI-7: An explicit deny policy overrides an allow policy."""
    # Give test_user admin role which grants workflow:delete:any.
    await make_admin(test_db_session, test_user)
    # Create a deny policy that blocks workflow:delete.
    deny_policy = Policy(
        id=uuid4(),
        name="deny-workflow-delete",
        description="Deny workflow deletion",
        statements=[{"effect": "deny", "actions": ["workflow:delete"], "scope": "any"}],
        is_builtin=False,
        labels={},
    )
    test_db_session.add(deny_policy)

    deny_role = Role(
        id=uuid4(),
        name="deny-delete-role",
        description="Role with deny policy",
        is_builtin=False,
        policy_names=["deny-workflow-delete"],
        labels={},
    )
    test_db_session.add(deny_role)
    await test_db_session.flush()

    group = Group(name=f"deny-grp-{uuid4()}", description="", labels={})
    test_db_session.add(group)
    await test_db_session.flush()
    test_db_session.add(
        RoleAssignment(principal_type=RolePrincipalType.GROUP, principal_id=group.id, role_name="deny-delete-role")
    )
    await test_db_session.exec(insert(user_groups).values(user_id=test_user.id, group_id=group.id))
    await test_db_session.commit()

    response = await auth_client.post(
        "/api/v1/authz/can_i",
        json={"action": "delete", "resource_type": "workflow"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["allowed"] is False
    assert data["denied"] is True
    assert data["denied_by"] == "deny-workflow-delete"
    assert data["denial_reason"] == "policy_deny"


# ============================================================================
# POST /authz/who_can
# ============================================================================


@pytest.mark.asyncio
async def test_who_can_requires_admin(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    user_factory: Callable[..., Awaitable[User]],
) -> None:
    """WC-0: who-can is admin-only; non-admin gets 403."""
    limited_user = await user_factory(username="limited-wc0", email="limited-wc0@test.com")
    await make_user_role(test_db_session, limited_user)
    _auth_as(limited_user)

    response = await auth_client.post(
        "/api/v1/authz/who_can",
        json={"action": "read", "resource_type": "user"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_who_can_returns_authorized_users(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
    user_factory: Callable[..., Awaitable[User]],
) -> None:
    """WC-1: who-can returns all users authorized for the action."""
    await make_admin(test_db_session, test_user)

    # Create a second user also with the user role
    other = await user_factory(username="reader", email="reader@example.com", first_name="Reader")
    test_group = (await test_db_session.exec(select(Group).where(Group.name == "test-users"))).first()
    assert test_group is not None
    await test_db_session.exec(insert(user_groups).values(user_id=other.id, group_id=test_group.id))
    await test_db_session.commit()

    response = await auth_client.post(
        "/api/v1/authz/who_can",
        json={"action": "read", "resource_type": "user"},
    )
    assert response.status_code == 200
    data = response.json()
    usernames = {u["username"] for u in data["resources"]}
    assert test_user.username in usernames
    assert "reader" in usernames


@pytest.mark.asyncio
async def test_who_can_excludes_unauthorized_users(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
    user_factory: Callable[..., Awaitable[User]],
) -> None:
    """WC-2: who-can excludes users who lack the permission."""
    await make_admin(test_db_session, test_user)

    # Create an auditor who can read but not create workflows
    auditor = await user_factory(username="aud-user", email="aud@example.com", first_name="Auditor")
    await make_auditor(test_db_session, auditor)

    response = await auth_client.post(
        "/api/v1/authz/who_can",
        json={"action": "create", "resource_type": "workflow"},
    )
    assert response.status_code == 200
    data = response.json()
    usernames = {u["username"] for u in data["resources"]}
    # test_user (admin role) should be included — has workflow:create:any
    assert test_user.username in usernames
    # auditor should NOT be included — auditor role lacks workflow:create
    assert "aud-user" not in usernames


@pytest.mark.asyncio
async def test_who_can_empty_for_ungranted_action(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    """WC-3: who-can returns empty list for an action nobody has."""
    await make_admin(test_db_session, test_user)

    response = await auth_client.post(
        "/api/v1/authz/who_can",
        json={"action": "launch", "resource_type": "spaceship"},
    )
    assert response.status_code == 200
    assert response.json()["resources"] == []


@pytest.mark.asyncio
async def test_who_can_excludes_inactive_users(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
    user_factory: Callable[..., Awaitable[User]],
) -> None:
    """WC-4: Inactive users are not returned even if they have permissions."""
    await make_admin(test_db_session, test_user)

    inactive = await user_factory(username="inactive-user", email="inactive@example.com", first_name="Inactive")
    # Add to test-users group (grants user role with user:read)
    test_group = (await test_db_session.exec(select(Group).where(Group.name == "test-users"))).first()
    assert test_group is not None
    await test_db_session.exec(insert(user_groups).values(user_id=inactive.id, group_id=test_group.id))
    # Deactivate
    inactive.is_enabled = False
    test_db_session.add(inactive)
    await test_db_session.commit()

    response = await auth_client.post(
        "/api/v1/authz/who_can",
        json={"action": "read", "resource_type": "user"},
    )
    assert response.status_code == 200
    usernames = {u["username"] for u in response.json()["resources"]}
    assert "inactive-user" not in usernames


@pytest.mark.asyncio
async def test_who_can_pagination(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
    user_factory: Callable[..., Awaitable[User]],
) -> None:
    """WC-5: who-can paginates results with cursor."""
    await make_admin(test_db_session, test_user)

    # Create extra users with the user role so we have enough to paginate
    test_group = (await test_db_session.exec(select(Group).where(Group.name == "test-users"))).first()
    assert test_group is not None
    for i in range(3):
        u = await user_factory(username=f"page-user-{i}", email=f"page{i}@example.com", first_name=f"Page {i}")
        await test_db_session.exec(insert(user_groups).values(user_id=u.id, group_id=test_group.id))
    await test_db_session.commit()

    # Request page 1 with limit=2
    response = await auth_client.post(
        "/api/v1/authz/who_can",
        json={"action": "read", "resource_type": "user", "limit": 2},
    )
    assert response.status_code == 200
    page1 = response.json()
    assert len(page1["resources"]) == 2
    assert page1["next"] is not None

    # Request page 2 using cursor
    response = await auth_client.post(
        "/api/v1/authz/who_can",
        json={"action": "read", "resource_type": "user", "limit": 2, "cursor": page1["next"]},
    )
    assert response.status_code == 200
    page2 = response.json()
    assert len(page2["resources"]) > 0

    # No overlap between pages
    page1_ids = {u["id"] for u in page1["resources"]}
    page2_ids = {u["id"] for u in page2["resources"]}
    assert page1_ids.isdisjoint(page2_ids)


# ============================================================================
# POST /authz/what_can_i
# ============================================================================


@pytest.mark.asyncio
async def test_what_can_i_returns_effective_permissions(
    auth_client: AsyncClient,
    test_user: User,
) -> None:
    """WI-1: what-can-i returns all effective permissions for the user."""
    response = await auth_client.post("/api/v1/authz/what_can_i")
    assert response.status_code == 200
    data = response.json()
    permissions = data["permissions"]
    policy_names = {p["policy_name"] for p in permissions}
    # Admin role includes all policies
    assert "workflow:create:any" in policy_names
    assert "project:create:any" in policy_names
    assert "user:read:self" in policy_names


@pytest.mark.asyncio
async def test_what_can_i_includes_project_scoped_policies(
    auth_client: AsyncClient,
    test_user: User,
) -> None:
    """WI-2: what-can-i includes project-scoped policies with project name."""
    # Create a project — test_user gets project-admin
    response = await auth_client.post(
        "/api/v1/projects",
        json={"name": "what-can-i-proj"},
    )
    assert response.status_code == 201
    project_name = response.json()["name"]

    response = await auth_client.post("/api/v1/authz/what_can_i")
    assert response.status_code == 200
    permissions = response.json()["permissions"]

    # Should have project-scoped entries for the created project
    project_perms = [p for p in permissions if p["scope"] == "project" and p["project"] == project_name]
    assert len(project_perms) > 0
    project_actions = set()
    for p in project_perms:
        project_actions.update(p["actions"])
    assert "workflow:read" in project_actions


@pytest.mark.asyncio
async def test_what_can_i_admin_sees_all_policies(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    """WI-3: Admin user sees all built-in policies."""
    await make_admin(test_db_session, test_user)

    response = await auth_client.post("/api/v1/authz/what_can_i")
    assert response.status_code == 200
    permissions = response.json()["permissions"]
    policy_names = {p["policy_name"] for p in permissions}

    # Admin role includes all policies
    assert "policy:create:any" in policy_names
    assert "role:delete:any" in policy_names
    assert "project:delete:any" in policy_names


@pytest.mark.asyncio
async def test_what_can_i_multiple_groups_additive(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    """WI-4: Permissions from multiple groups are additive."""
    # test_user has admin role via test-users group.
    # Add auditor role via a second group.
    await make_auditor(test_db_session, test_user)

    response = await auth_client.post("/api/v1/authz/what_can_i")
    assert response.status_code == 200
    permissions = response.json()["permissions"]
    policy_names = {p["policy_name"] for p in permissions}

    # Should have policies from both user role and auditor role
    assert "project:create:any" in policy_names  # from user role
    assert "policy:read:any" in policy_names  # from auditor role


# ============================================================================
# GET /authz/resource_actions
# ============================================================================


@pytest.mark.asyncio
async def test_resource_actions_returns_catalog(
    auth_client: AsyncClient,
    test_user: User,
) -> None:
    """RA-1: resource_actions returns the full resource type → actions map."""
    response = await auth_client.get("/api/v1/authz/resource_actions")
    assert response.status_code == 200
    data = response.json()
    ra = data["resource_actions"]

    assert isinstance(ra, dict)
    assert "workflow" in ra
    assert "credential" in ra
    assert "project" in ra

    assert "read" in ra["workflow"]
    assert "create" in ra["workflow"]
    assert "delete" in ra["credential"]

    for actions in ra.values():
        assert len(actions) > 0
