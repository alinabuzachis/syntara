"""Unit tests for RoleService CRUD operations.

Tests cover:
- Create, read, list, update, delete operations
- Policy name validation on create/update
- Builtin protection
- Name conflict handling
- Join table (RolePolicyLink) management
"""

from uuid import uuid4

import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.authz.exceptions import BuiltinProtectionError, RoleNameConflictError, RoleNotFoundError
from nexus.authz.models.policy import Policy
from nexus.authz.models.role import Role
from nexus.authz.services.role_service import RoleService
from nexus.core.exceptions import SafeValueError
from nexus.core.models import User


async def _create_test_policies(session: AsyncSession) -> list[Policy]:
    """Create test policies for role tests."""
    policies = []
    for name in ("test:read:any", "test:write:any", "test:delete:any"):
        p = Policy(
            name=name,
            statements=[{"effect": "allow", "actions": [name.split(":")[1]], "scope": "any"}],
            is_builtin=False,
            labels={},
        )
        session.add(p)
        policies.append(p)
    await session.commit()
    for p in policies:
        await session.refresh(p)
    return policies


@pytest.mark.asyncio
async def test_create_role(test_db_session: AsyncSession, test_user: User) -> None:
    """Create a custom role linked to policies."""
    await _create_test_policies(test_db_session)
    svc = RoleService(test_db_session, test_user)
    role = await svc.create_role(
        name="reviewer",
        policies=["test:read:any", "test:write:any"],
        description="Review role",
        labels={"team": "qa"},
    )
    assert role.name == "reviewer"
    assert role.description == "Review role"
    assert role.is_builtin is False
    assert role.labels == {"team": "qa"}

    # Verify policy links via to_role_read
    role_read = await svc.to_role_read(role)
    assert set(role_read.policies) == {"test:read:any", "test:write:any"}


@pytest.mark.asyncio
async def test_create_role_with_unknown_policy(test_db_session: AsyncSession, test_user: User) -> None:
    """Creating a role with non-existent policy names raises SafeValueError."""
    svc = RoleService(test_db_session, test_user)
    with pytest.raises(SafeValueError, match="Unknown policies"):
        await svc.create_role(name="bad-role", policies=["nonexistent:policy"])


@pytest.mark.asyncio
async def test_create_role_name_conflict(test_db_session: AsyncSession, test_user: User) -> None:
    """Duplicate name in the same scope raises RoleNameConflictError."""
    await _create_test_policies(test_db_session)
    svc = RoleService(test_db_session, test_user)
    await svc.create_role(name="dup-role", policies=["test:read:any"])
    with pytest.raises(RoleNameConflictError):
        await svc.create_role(name="dup-role", policies=["test:read:any"])


@pytest.mark.asyncio
async def test_get_role(test_db_session: AsyncSession, test_user: User) -> None:
    """Get a role by ID."""
    await _create_test_policies(test_db_session)
    svc = RoleService(test_db_session, test_user)
    created = await svc.create_role(name="get-role", policies=["test:read:any"])
    fetched = await svc.get_role(created.id)
    assert fetched.id == created.id
    assert fetched.name == "get-role"


@pytest.mark.asyncio
async def test_get_role_not_found(test_db_session: AsyncSession, test_user: User) -> None:
    """Getting a non-existent role raises RoleNotFoundError."""
    svc = RoleService(test_db_session, test_user)
    with pytest.raises(RoleNotFoundError):
        await svc.get_role(uuid4())


@pytest.mark.asyncio
async def test_list_roles(test_db_session: AsyncSession, test_user: User) -> None:
    """List roles returns created roles with resolved policies."""
    await _create_test_policies(test_db_session)
    svc = RoleService(test_db_session, test_user)
    await svc.create_role(name="list-r1", policies=["test:read:any"])
    await svc.create_role(name="list-r2", policies=["test:write:any"])
    result = await svc.list_roles(limit=100, include_total=True)
    names = [r.name for r in result.resources]
    assert "list-r1" in names
    assert "list-r2" in names
    # Verify policies are resolved
    r1 = next(r for r in result.resources if r.name == "list-r1")
    assert "test:read:any" in r1.policies


@pytest.mark.asyncio
async def test_update_role(test_db_session: AsyncSession, test_user: User) -> None:
    """Update name, description, policies, and labels of a custom role."""
    await _create_test_policies(test_db_session)
    svc = RoleService(test_db_session, test_user)
    role = await svc.create_role(
        name="updatable-role",
        policies=["test:read:any"],
        description="original",
    )
    updated = await svc.update_role(
        role.id,
        name="renamed-role",
        description="updated desc",
        policies=["test:write:any", "test:delete:any"],
        labels={"updated": "true"},
    )
    assert updated.name == "renamed-role"
    assert updated.description == "updated desc"
    assert updated.labels == {"updated": "true"}

    # Verify policy links were replaced
    role_read = await svc.to_role_read(updated)
    assert set(role_read.policies) == {"test:write:any", "test:delete:any"}


@pytest.mark.asyncio
async def test_update_role_partial(test_db_session: AsyncSession, test_user: User) -> None:
    """Partial update only changes provided fields."""
    await _create_test_policies(test_db_session)
    svc = RoleService(test_db_session, test_user)
    role = await svc.create_role(name="partial-role", policies=["test:read:any"], description="original")
    updated = await svc.update_role(role.id, description="only desc changed")
    assert updated.name == "partial-role"
    assert updated.description == "only desc changed"
    # Policies should remain unchanged
    role_read = await svc.to_role_read(updated)
    assert "test:read:any" in role_read.policies


@pytest.mark.asyncio
async def test_update_builtin_role_rejected(test_db_session: AsyncSession, test_user: User) -> None:
    """Cannot update a builtin role."""
    builtin = Role(name="builtin-test-role", is_builtin=True, labels={})
    test_db_session.add(builtin)
    await test_db_session.commit()
    await test_db_session.refresh(builtin)

    svc = RoleService(test_db_session, test_user)
    with pytest.raises(BuiltinProtectionError):
        await svc.update_role(builtin.id, description="hacked")


@pytest.mark.asyncio
async def test_update_role_name_conflict(test_db_session: AsyncSession, test_user: User) -> None:
    """Renaming to an existing name raises RoleNameConflictError."""
    await _create_test_policies(test_db_session)
    svc = RoleService(test_db_session, test_user)
    await svc.create_role(name="existing-role", policies=["test:read:any"])
    r2 = await svc.create_role(name="other-role", policies=["test:read:any"])
    with pytest.raises(RoleNameConflictError):
        await svc.update_role(r2.id, name="existing-role")


@pytest.mark.asyncio
async def test_delete_role(test_db_session: AsyncSession, test_user: User) -> None:
    """Delete a custom role and its references."""
    await _create_test_policies(test_db_session)
    svc = RoleService(test_db_session, test_user)
    role = await svc.create_role(name="deletable-role", policies=["test:read:any"])
    await svc.delete_role(role.id)
    with pytest.raises(RoleNotFoundError):
        await svc.get_role(role.id)


@pytest.mark.asyncio
async def test_delete_builtin_role_rejected(test_db_session: AsyncSession, test_user: User) -> None:
    """Cannot delete a builtin role."""
    builtin = Role(name="builtin-del-role", is_builtin=True, labels={})
    test_db_session.add(builtin)
    await test_db_session.commit()
    await test_db_session.refresh(builtin)

    svc = RoleService(test_db_session, test_user)
    with pytest.raises(BuiltinProtectionError):
        await svc.delete_role(builtin.id)


@pytest.mark.asyncio
async def test_create_role_empty_policies(test_db_session: AsyncSession, test_user: User) -> None:
    """Create a role with no policies."""
    svc = RoleService(test_db_session, test_user)
    role = await svc.create_role(name="empty-role", policies=[])
    assert role.name == "empty-role"
    role_read = await svc.to_role_read(role)
    assert role_read.policies == []


@pytest.mark.asyncio
async def test_name_conflict_scoped_to_project(test_db_session: AsyncSession, test_user: User) -> None:
    """Same name in different project scopes is allowed."""
    from nexus.authz.models.project import Project

    project = Project(name="role-scope-proj", labels={})
    test_db_session.add(project)
    await test_db_session.commit()
    await test_db_session.refresh(project)

    await _create_test_policies(test_db_session)
    svc = RoleService(test_db_session, test_user)
    await svc.create_role(name="scoped-role", policies=["test:read:any"], project_id=project.id)
    # Same name but global scope -- should succeed
    global_role = await svc.create_role(name="scoped-role", policies=["test:read:any"])
    assert global_role.name == "scoped-role"
    assert global_role.project_id is None
