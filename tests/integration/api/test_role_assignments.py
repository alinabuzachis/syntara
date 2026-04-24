"""Integration tests for user and group role assignment sub-resource endpoints.

Covers:
- POST /api/v1/users/{user_id}/role-assignments
- GET  /api/v1/users/{user_id}/role-assignments
- DELETE /api/v1/users/{user_id}/role-assignments/{assignment_id}
- POST /api/v1/groups/{group_id}/role-assignments
- GET  /api/v1/groups/{group_id}/role-assignments
- DELETE /api/v1/groups/{group_id}/role-assignments/{assignment_id}
"""

from collections.abc import Awaitable, Callable

import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.authz.models.assignments import PrincipalType
from nexus.core.models import User
from nexus.core.models.group import Group

USERS_URL = "/api/v1/users"
GROUPS_URL = "/api/v1/groups"


# ============================================================================
# User role assignment tests
# ============================================================================


@pytest.mark.asyncio
async def test_create_user_role_assignment(
    admin_client: AsyncClient,
    test_db_session: AsyncSession,
    user_factory: Callable[..., Awaitable[User]],
) -> None:
    """POST /users/{user_id}/role-assignments creates an assignment and returns 201."""
    target_user = await user_factory(username="assign-target", email="assign-target@example.com")

    response = await admin_client.post(
        f"{USERS_URL}/{target_user.id}/role-assignments",
        json={"role_name": "auditor"},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["principal_id"] == str(target_user.id)
    assert data["principal_type"] == PrincipalType.USER.value
    assert data["role_name"] == "auditor"
    assert data["principal_name"] == "assign-target"
    assert "id" in data
    assert "created_at" in data


@pytest.mark.asyncio
async def test_list_user_role_assignments(
    admin_client: AsyncClient,
    test_db_session: AsyncSession,
    user_factory: Callable[..., Awaitable[User]],
) -> None:
    """GET /users/{user_id}/role-assignments lists assignments for a user."""
    target_user = await user_factory(username="list-target", email="list-target@example.com")

    # Create two role assignments for the user
    response = await admin_client.post(
        f"{USERS_URL}/{target_user.id}/role-assignments",
        json={"role_name": "auditor"},
    )
    assert response.status_code == 201

    response = await admin_client.post(
        f"{USERS_URL}/{target_user.id}/role-assignments",
        json={"role_name": "user"},
    )
    assert response.status_code == 201

    # List the assignments
    response = await admin_client.get(f"{USERS_URL}/{target_user.id}/role-assignments")

    assert response.status_code == 200
    data = response.json()
    resources = data["resources"]
    assert len(resources) == 2

    role_names = {r["role_name"] for r in resources}
    assert role_names == {"auditor", "user"}

    # All assignments should be for the target user
    for r in resources:
        assert r["principal_id"] == str(target_user.id)
        assert r["principal_type"] == PrincipalType.USER.value


@pytest.mark.asyncio
async def test_list_user_role_assignments_filter_by_role_name(
    admin_client: AsyncClient,
    test_db_session: AsyncSession,
    user_factory: Callable[..., Awaitable[User]],
) -> None:
    """GET /users/{user_id}/role-assignments?role_name=... filters correctly."""
    target_user = await user_factory(username="filter-target", email="filter-target@example.com")

    # Create two assignments
    await admin_client.post(
        f"{USERS_URL}/{target_user.id}/role-assignments",
        json={"role_name": "auditor"},
    )
    await admin_client.post(
        f"{USERS_URL}/{target_user.id}/role-assignments",
        json={"role_name": "user"},
    )

    # Filter by role_name
    response = await admin_client.get(
        f"{USERS_URL}/{target_user.id}/role-assignments",
        params={"role_name": "auditor"},
    )

    assert response.status_code == 200
    resources = response.json()["resources"]
    assert len(resources) == 1
    assert resources[0]["role_name"] == "auditor"


@pytest.mark.asyncio
async def test_delete_user_role_assignment(
    admin_client: AsyncClient,
    test_db_session: AsyncSession,
    user_factory: Callable[..., Awaitable[User]],
) -> None:
    """DELETE /users/{user_id}/role-assignments/{id} revokes and returns 204."""
    target_user = await user_factory(username="delete-target", email="delete-target@example.com")

    # Create an assignment
    response = await admin_client.post(
        f"{USERS_URL}/{target_user.id}/role-assignments",
        json={"role_name": "auditor"},
    )
    assert response.status_code == 201
    assignment_id = response.json()["id"]

    # Delete it
    response = await admin_client.delete(
        f"{USERS_URL}/{target_user.id}/role-assignments/{assignment_id}",
    )
    assert response.status_code == 204

    # Verify it is gone
    response = await admin_client.get(f"{USERS_URL}/{target_user.id}/role-assignments")
    assert response.status_code == 200
    resources = response.json()["resources"]
    assignment_ids = [r["id"] for r in resources]
    assert assignment_id not in assignment_ids


@pytest.mark.asyncio
async def test_delete_user_role_assignment_idor_protection(
    admin_client: AsyncClient,
    test_db_session: AsyncSession,
    user_factory: Callable[..., Awaitable[User]],
) -> None:
    """DELETE /users/{user_id}/role-assignments/{id} rejects cross-principal deletion.

    An assignment belonging to user_a cannot be deleted via user_b's URL.
    """
    user_a = await user_factory(username="idor-user-a", email="idor-a@example.com")
    user_b = await user_factory(username="idor-user-b", email="idor-b@example.com")

    # Create an assignment for user_a
    response = await admin_client.post(
        f"{USERS_URL}/{user_a.id}/role-assignments",
        json={"role_name": "auditor"},
    )
    assert response.status_code == 201
    assignment_id = response.json()["id"]

    # Try to delete user_a's assignment via user_b's URL
    response = await admin_client.delete(
        f"{USERS_URL}/{user_b.id}/role-assignments/{assignment_id}",
    )
    # The endpoint validates that the assignment belongs to the URL principal
    assert response.status_code == 422

    # Verify user_a's assignment still exists
    response = await admin_client.get(f"{USERS_URL}/{user_a.id}/role-assignments")
    assert response.status_code == 200
    assignment_ids = [r["id"] for r in response.json()["resources"]]
    assert assignment_id in assignment_ids


# ============================================================================
# Group role assignment tests
# ============================================================================


@pytest.mark.asyncio
async def test_create_group_role_assignment(
    admin_client: AsyncClient,
    test_db_session: AsyncSession,
) -> None:
    """POST /groups/{group_id}/role-assignments creates an assignment and returns 201."""
    group = Group(name="role-assign-group", description="Test group for role assignments", labels={})
    test_db_session.add(group)
    await test_db_session.flush()
    await test_db_session.commit()
    await test_db_session.refresh(group)

    response = await admin_client.post(
        f"{GROUPS_URL}/{group.id}/role-assignments",
        json={"role_name": "user"},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["principal_id"] == str(group.id)
    assert data["principal_type"] == PrincipalType.GROUP.value
    assert data["role_name"] == "user"
    assert data["principal_name"] == "role-assign-group"
    assert "id" in data
    assert "created_at" in data


@pytest.mark.asyncio
async def test_list_group_role_assignments(
    admin_client: AsyncClient,
    test_db_session: AsyncSession,
) -> None:
    """GET /groups/{group_id}/role-assignments lists assignments for a group."""
    group = Group(name="list-assign-group", description="Test group", labels={})
    test_db_session.add(group)
    await test_db_session.flush()
    await test_db_session.commit()
    await test_db_session.refresh(group)

    # Create two role assignments for the group
    response = await admin_client.post(
        f"{GROUPS_URL}/{group.id}/role-assignments",
        json={"role_name": "user"},
    )
    assert response.status_code == 201

    response = await admin_client.post(
        f"{GROUPS_URL}/{group.id}/role-assignments",
        json={"role_name": "auditor"},
    )
    assert response.status_code == 201

    # List the assignments
    response = await admin_client.get(f"{GROUPS_URL}/{group.id}/role-assignments")

    assert response.status_code == 200
    data = response.json()
    resources = data["resources"]
    assert len(resources) == 2

    role_names = {r["role_name"] for r in resources}
    assert role_names == {"user", "auditor"}

    # All assignments should be for the group
    for r in resources:
        assert r["principal_id"] == str(group.id)
        assert r["principal_type"] == PrincipalType.GROUP.value


@pytest.mark.asyncio
async def test_delete_group_role_assignment(
    admin_client: AsyncClient,
    test_db_session: AsyncSession,
) -> None:
    """DELETE /groups/{group_id}/role-assignments/{id} revokes and returns 204."""
    group = Group(name="delete-assign-group", description="Test group", labels={})
    test_db_session.add(group)
    await test_db_session.flush()
    await test_db_session.commit()
    await test_db_session.refresh(group)

    # Create an assignment
    response = await admin_client.post(
        f"{GROUPS_URL}/{group.id}/role-assignments",
        json={"role_name": "user"},
    )
    assert response.status_code == 201
    assignment_id = response.json()["id"]

    # Delete it
    response = await admin_client.delete(
        f"{GROUPS_URL}/{group.id}/role-assignments/{assignment_id}",
    )
    assert response.status_code == 204

    # Verify it is gone
    response = await admin_client.get(f"{GROUPS_URL}/{group.id}/role-assignments")
    assert response.status_code == 200
    resources = response.json()["resources"]
    assignment_ids = [r["id"] for r in resources]
    assert assignment_id not in assignment_ids


@pytest.mark.asyncio
async def test_delete_group_role_assignment_idor_protection(
    admin_client: AsyncClient,
    test_db_session: AsyncSession,
    user_factory: Callable[..., Awaitable[User]],
) -> None:
    """DELETE /groups/{group_id}/role-assignments/{id} rejects cross-principal deletion.

    A user-scoped assignment cannot be deleted via a group's URL.
    """
    target_user = await user_factory(username="idor-group-user", email="idor-group@example.com")

    group = Group(name="idor-group", description="Test group", labels={})
    test_db_session.add(group)
    await test_db_session.flush()
    await test_db_session.commit()
    await test_db_session.refresh(group)

    # Create a USER-scoped assignment
    response = await admin_client.post(
        f"{USERS_URL}/{target_user.id}/role-assignments",
        json={"role_name": "auditor"},
    )
    assert response.status_code == 201
    user_assignment_id = response.json()["id"]

    # Try to delete the user assignment via the group's URL
    response = await admin_client.delete(
        f"{GROUPS_URL}/{group.id}/role-assignments/{user_assignment_id}",
    )
    # The endpoint validates principal_type and principal_id match
    assert response.status_code == 422

    # Verify the user assignment still exists
    response = await admin_client.get(f"{USERS_URL}/{target_user.id}/role-assignments")
    assert response.status_code == 200
    assignment_ids = [r["id"] for r in response.json()["resources"]]
    assert user_assignment_id in assignment_ids
