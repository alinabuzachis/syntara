"""Unit tests for PolicyService CRUD operations.

Tests cover:
- Create, read, list, update, delete operations
- Name conflict detection
- Builtin protection
- Not-found error handling
"""

from uuid import uuid4

import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.authz.exceptions import BuiltinProtectionError, PolicyNameConflictError, PolicyNotFoundError
from nexus.authz.models.policy import Policy
from nexus.authz.services.policy_service import PolicyService
from nexus.core.models import User


@pytest.mark.asyncio
async def test_create_policy(test_db_session: AsyncSession, test_user: User) -> None:
    """Create a custom policy with statements."""
    svc = PolicyService(test_db_session, test_user)
    policy = await svc.create_policy(
        name="test-policy",
        statements=[{"effect": "allow", "actions": ["read"], "scope": "any"}],
        description="A test policy",
        labels={"env": "test"},
    )
    assert policy.name == "test-policy"
    assert policy.description == "A test policy"
    assert policy.is_builtin is False
    assert policy.labels == {"env": "test"}
    assert len(policy.statements) == 1


@pytest.mark.asyncio
async def test_create_policy_without_optional_fields(test_db_session: AsyncSession, test_user: User) -> None:
    """Create a policy with only required fields."""
    svc = PolicyService(test_db_session, test_user)
    policy = await svc.create_policy(
        name="minimal-policy",
        statements=[{"effect": "allow", "actions": ["read"], "scope": "any"}],
    )
    assert policy.name == "minimal-policy"
    assert policy.description is None
    assert policy.labels == {}


@pytest.mark.asyncio
async def test_create_policy_name_conflict(test_db_session: AsyncSession, test_user: User) -> None:
    """Duplicate name in the same scope raises PolicyNameConflictError."""
    svc = PolicyService(test_db_session, test_user)
    await svc.create_policy(
        name="dup-policy",
        statements=[{"effect": "allow", "actions": ["read"], "scope": "any"}],
    )
    with pytest.raises(PolicyNameConflictError):
        await svc.create_policy(
            name="dup-policy",
            statements=[{"effect": "allow", "actions": ["write"], "scope": "any"}],
        )


@pytest.mark.asyncio
async def test_get_policy(test_db_session: AsyncSession, test_user: User) -> None:
    """Get a policy by ID."""
    svc = PolicyService(test_db_session, test_user)
    created = await svc.create_policy(
        name="get-me",
        statements=[{"effect": "allow", "actions": ["read"], "scope": "any"}],
    )
    fetched = await svc.get_policy(created.id)
    assert fetched.id == created.id
    assert fetched.name == "get-me"


@pytest.mark.asyncio
async def test_get_policy_not_found(test_db_session: AsyncSession, test_user: User) -> None:
    """Getting a non-existent policy raises PolicyNotFoundError."""
    svc = PolicyService(test_db_session, test_user)
    with pytest.raises(PolicyNotFoundError):
        await svc.get_policy(uuid4())


@pytest.mark.asyncio
async def test_list_policies(test_db_session: AsyncSession, test_user: User) -> None:
    """List policies returns created policies."""
    svc = PolicyService(test_db_session, test_user)
    await svc.create_policy(name="list-p1", statements=[{"effect": "allow", "actions": ["read"], "scope": "any"}])
    await svc.create_policy(name="list-p2", statements=[{"effect": "allow", "actions": ["write"], "scope": "any"}])
    result = await svc.list_policies(limit=100, include_total=True)
    names = [r.name for r in result.resources]
    assert "list-p1" in names
    assert "list-p2" in names


@pytest.mark.asyncio
async def test_update_policy(test_db_session: AsyncSession, test_user: User) -> None:
    """Update name, description, statements, and labels of a custom policy."""
    svc = PolicyService(test_db_session, test_user)
    policy = await svc.create_policy(
        name="updatable",
        statements=[{"effect": "allow", "actions": ["read"], "scope": "any"}],
        description="original",
    )
    updated = await svc.update_policy(
        policy.id,
        name="renamed",
        description="updated desc",
        statements=[{"effect": "deny", "actions": ["delete"], "scope": "any"}],
        labels={"updated": "true"},
    )
    assert updated.name == "renamed"
    assert updated.description == "updated desc"
    assert updated.statements == [{"effect": "deny", "actions": ["delete"], "scope": "any"}]
    assert updated.labels == {"updated": "true"}


@pytest.mark.asyncio
async def test_update_policy_partial(test_db_session: AsyncSession, test_user: User) -> None:
    """Partial update only changes provided fields."""
    svc = PolicyService(test_db_session, test_user)
    policy = await svc.create_policy(
        name="partial-update",
        statements=[{"effect": "allow", "actions": ["read"], "scope": "any"}],
        description="original",
    )
    updated = await svc.update_policy(policy.id, description="only desc changed")
    assert updated.name == "partial-update"
    assert updated.description == "only desc changed"


@pytest.mark.asyncio
async def test_update_builtin_policy_rejected(test_db_session: AsyncSession, test_user: User) -> None:
    """Cannot update a builtin policy."""
    builtin = Policy(
        name="builtin-policy",
        statements=[{"effect": "allow", "actions": ["read"], "scope": "any"}],
        is_builtin=True,
        labels={},
    )
    test_db_session.add(builtin)
    await test_db_session.commit()
    await test_db_session.refresh(builtin)

    svc = PolicyService(test_db_session, test_user)
    with pytest.raises(BuiltinProtectionError):
        await svc.update_policy(builtin.id, description="hacked")


@pytest.mark.asyncio
async def test_update_policy_name_conflict(test_db_session: AsyncSession, test_user: User) -> None:
    """Renaming to an existing name raises PolicyNameConflictError."""
    svc = PolicyService(test_db_session, test_user)
    await svc.create_policy(name="existing-name", statements=[{"effect": "allow", "actions": ["read"], "scope": "any"}])
    p2 = await svc.create_policy(
        name="other-name", statements=[{"effect": "allow", "actions": ["read"], "scope": "any"}]
    )
    with pytest.raises(PolicyNameConflictError):
        await svc.update_policy(p2.id, name="existing-name")


@pytest.mark.asyncio
async def test_delete_policy(test_db_session: AsyncSession, test_user: User) -> None:
    """Delete a custom policy."""
    svc = PolicyService(test_db_session, test_user)
    policy = await svc.create_policy(
        name="deletable",
        statements=[{"effect": "allow", "actions": ["read"], "scope": "any"}],
    )
    await svc.delete_policy(policy.id)
    with pytest.raises(PolicyNotFoundError):
        await svc.get_policy(policy.id)


@pytest.mark.asyncio
async def test_delete_builtin_policy_rejected(test_db_session: AsyncSession, test_user: User) -> None:
    """Cannot delete a builtin policy."""
    builtin = Policy(
        name="builtin-delete-test",
        statements=[{"effect": "allow", "actions": ["read"], "scope": "any"}],
        is_builtin=True,
        labels={},
    )
    test_db_session.add(builtin)
    await test_db_session.commit()
    await test_db_session.refresh(builtin)

    svc = PolicyService(test_db_session, test_user)
    with pytest.raises(BuiltinProtectionError):
        await svc.delete_policy(builtin.id)


@pytest.mark.asyncio
async def test_name_conflict_scoped_to_project(test_db_session: AsyncSession, test_user: User) -> None:
    """Same name in different project scopes is allowed."""
    from nexus.authz.models.project import Project

    project = Project(name="scope-test-proj", labels={})
    test_db_session.add(project)
    await test_db_session.commit()
    await test_db_session.refresh(project)

    svc = PolicyService(test_db_session, test_user)
    await svc.create_policy(
        name="scoped-policy",
        statements=[{"effect": "allow", "actions": ["read"], "scope": "any"}],
        project_id=project.id,
    )
    # Same name but global scope -- should succeed
    global_policy = await svc.create_policy(
        name="scoped-policy",
        statements=[{"effect": "allow", "actions": ["read"], "scope": "any"}],
    )
    assert global_policy.name == "scoped-policy"
    assert global_policy.project_id is None
