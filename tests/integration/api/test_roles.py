"""Integration tests for the roles CRUD API.

Covers:
- Full CRUD lifecycle (create, read, list, update, delete)
- Policy name validation on create/update
- Builtin protection (cannot update or delete builtins)
- Name conflict handling (409)
- Authorization enforcement (403 for unauthorized users)
"""

from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import insert
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.authz.models import GroupRoleAssignment, Role
from nexus.core.models import User
from nexus.core.models.group import Group, user_groups


async def _make_admin(session: AsyncSession, user: User) -> None:
    """Assign the admin role to a user via a dedicated group."""
    admin_role = (await session.exec(select(Role).where(Role.name == "admin"))).first()
    assert admin_role is not None
    group = Group(name=f"admin-grp-{uuid4()}", description="", labels={})
    session.add(group)
    await session.flush()
    session.add(GroupRoleAssignment(group_id=group.id, role_id=admin_role.id, labels={}))
    await session.execute(insert(user_groups).values(user_id=user.id, group_id=group.id))
    await session.commit()


# ============================================================================
# CRUD Lifecycle
# ============================================================================


@pytest.mark.asyncio
async def test_role_crud_lifecycle(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    """Full CRUD lifecycle: create, read, list, update, delete."""
    await _make_admin(test_db_session, test_user)

    # Create
    response = await auth_client.post(
        "/api/v1/roles",
        json={
            "name": "custom-reviewer",
            "description": "Code reviewer role",
            "policies": ["workflow:read:any", "execution:read:any"],
            "labels": {"team": "platform"},
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "custom-reviewer"
    assert data["description"] == "Code reviewer role"
    assert data["is_builtin"] is False
    assert "workflow:read:any" in data["policies"]
    assert data["labels"] == {"team": "platform"}
    role_id = data["id"]

    # Read
    response = await auth_client.get(f"/api/v1/roles/{role_id}")
    assert response.status_code == 200
    assert response.json()["name"] == "custom-reviewer"

    # List
    response = await auth_client.get("/api/v1/roles")
    assert response.status_code == 200
    body = response.json()
    names = [r["name"] for r in body["resources"]]
    assert "custom-reviewer" in names

    # Update
    response = await auth_client.patch(
        f"/api/v1/roles/{role_id}",
        json={"description": "Updated reviewer role"},
    )
    assert response.status_code == 200
    assert response.json()["description"] == "Updated reviewer role"

    # Delete
    response = await auth_client.delete(f"/api/v1/roles/{role_id}")
    assert response.status_code == 204

    # Verify gone
    response = await auth_client.get(f"/api/v1/roles/{role_id}")
    assert response.status_code == 404


# ============================================================================
# Policy Validation
# ============================================================================


@pytest.mark.asyncio
async def test_create_role_with_unknown_policy_fails(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    """Creating a role that references non-existent policies returns an error."""
    await _make_admin(test_db_session, test_user)

    response = await auth_client.post(
        "/api/v1/roles",
        json={
            "name": "bad-role",
            "policies": ["workflow:read:any", "nonexistent:policy"],
        },
    )
    assert response.status_code == 422
    assert "nonexistent:policy" in response.json()["detail"]


@pytest.mark.asyncio
async def test_update_role_with_unknown_policy_fails(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    """Updating a role with a non-existent policy returns an error."""
    await _make_admin(test_db_session, test_user)

    response = await auth_client.post(
        "/api/v1/roles",
        json={
            "name": "updatable-role",
            "policies": ["workflow:read:any"],
        },
    )
    assert response.status_code == 201
    role_id = response.json()["id"]

    response = await auth_client.patch(
        f"/api/v1/roles/{role_id}",
        json={"policies": ["nonexistent:policy"]},
    )
    assert response.status_code == 422


# ============================================================================
# Builtin Protection
# ============================================================================


@pytest.mark.asyncio
async def test_cannot_update_builtin_role(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    """Builtin roles cannot be modified."""
    await _make_admin(test_db_session, test_user)

    response = await auth_client.get("/api/v1/roles?is_builtin=true")
    assert response.status_code == 200
    builtins = response.json()["resources"]
    assert len(builtins) > 0
    builtin_id = builtins[0]["id"]

    response = await auth_client.patch(
        f"/api/v1/roles/{builtin_id}",
        json={"description": "hacked"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_cannot_delete_builtin_role(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    """Builtin roles cannot be deleted."""
    await _make_admin(test_db_session, test_user)

    response = await auth_client.get("/api/v1/roles?is_builtin=true")
    assert response.status_code == 200
    builtin_id = response.json()["resources"][0]["id"]

    response = await auth_client.delete(f"/api/v1/roles/{builtin_id}")
    assert response.status_code == 403


# ============================================================================
# Name Conflict
# ============================================================================


@pytest.mark.asyncio
async def test_duplicate_role_name_returns_409(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    """Creating a role with a duplicate name in the same scope returns 409."""
    await _make_admin(test_db_session, test_user)

    body = {
        "name": "unique-role",
        "policies": ["workflow:read:any"],
    }

    response = await auth_client.post("/api/v1/roles", json=body)
    assert response.status_code == 201

    response = await auth_client.post("/api/v1/roles", json=body)
    assert response.status_code == 409


# ============================================================================
# Authorization Enforcement
# ============================================================================


@pytest.mark.asyncio
async def test_regular_user_cannot_create_role(
    auth_client: AsyncClient,
    test_user: User,
) -> None:
    """A user with only the 'user' role cannot create roles (403)."""
    response = await auth_client.post(
        "/api/v1/roles",
        json={
            "name": "forbidden-role",
            "policies": ["workflow:read:any"],
        },
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_regular_user_cannot_delete_role(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    """A user with only the 'user' role cannot delete roles (403).

    Insert a custom role directly to have a target for the DELETE attempt.
    """
    role = Role(
        name="delete-target-role",
        policies=["workflow:read:any"],
        is_builtin=False,
        labels={},
    )
    test_db_session.add(role)
    await test_db_session.commit()
    await test_db_session.refresh(role)

    response = await auth_client.delete(f"/api/v1/roles/{role.id}")
    assert response.status_code == 403


# ============================================================================
# Not Found
# ============================================================================


@pytest.mark.asyncio
async def test_get_nonexistent_role_returns_404(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    """Getting a role that doesn't exist returns 404."""
    await _make_admin(test_db_session, test_user)
    response = await auth_client.get(f"/api/v1/roles/{uuid4()}")
    assert response.status_code == 404
