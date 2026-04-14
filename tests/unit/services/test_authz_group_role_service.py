"""Unit tests for GroupRoleService.

Tests cover:
- Assign role to group
- List assignments with resolved names
- Revoke assignment
- Error conditions (group/role not found, duplicate assignment)
"""

from uuid import uuid4

import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.authz.models.role import Role
from nexus.authz.services.group_role_service import GroupRoleService
from nexus.core.exceptions import SafeValueError
from nexus.core.models import User
from nexus.core.models.group import Group


async def _create_role(session: AsyncSession, name: str = "grp-test-role") -> Role:
    """Create a test role."""
    role = Role(name=name, is_builtin=False, labels={})
    session.add(role)
    await session.commit()
    await session.refresh(role)
    return role


async def _create_group(session: AsyncSession, name: str = "grp-test-group") -> Group:
    """Create a test group."""
    group = Group(id=uuid4(), name=name, description="Test group", labels={})
    session.add(group)
    await session.commit()
    await session.refresh(group)
    return group


@pytest.mark.asyncio
async def test_assign_role_to_group(test_db_session: AsyncSession, test_user: User) -> None:
    """Assign a role to a group."""
    role = await _create_role(test_db_session)
    group = await _create_group(test_db_session)
    svc = GroupRoleService(test_db_session, test_user)
    assignment = await svc.assign_role(group.id, role.id)
    assert assignment.group_id == group.id
    assert assignment.role_id == role.id


@pytest.mark.asyncio
async def test_assign_role_group_not_found(test_db_session: AsyncSession, test_user: User) -> None:
    """Assigning to a non-existent group raises SafeValueError."""
    role = await _create_role(test_db_session)
    svc = GroupRoleService(test_db_session, test_user)
    with pytest.raises(SafeValueError, match=r"Group .* not found"):
        await svc.assign_role(uuid4(), role.id)


@pytest.mark.asyncio
async def test_assign_role_not_found(test_db_session: AsyncSession, test_user: User) -> None:
    """Assigning a non-existent role raises SafeValueError."""
    group = await _create_group(test_db_session)
    svc = GroupRoleService(test_db_session, test_user)
    with pytest.raises(SafeValueError, match=r"Role .* not found"):
        await svc.assign_role(group.id, uuid4())


@pytest.mark.asyncio
async def test_assign_duplicate_role(test_db_session: AsyncSession, test_user: User) -> None:
    """Assigning the same role twice raises SafeValueError."""
    role = await _create_role(test_db_session)
    group = await _create_group(test_db_session)
    svc = GroupRoleService(test_db_session, test_user)
    await svc.assign_role(group.id, role.id)
    with pytest.raises(SafeValueError, match="already assigned"):
        await svc.assign_role(group.id, role.id)


@pytest.mark.asyncio
async def test_list_assignments(test_db_session: AsyncSession, test_user: User) -> None:
    """List assignments with resolved group and role names."""
    role = await _create_role(test_db_session, name="listed-grp-role")
    group = await _create_group(test_db_session, name="listed-group")
    svc = GroupRoleService(test_db_session, test_user)
    await svc.assign_role(group.id, role.id)
    assignments = await svc.list_assignments()
    assert len(assignments) >= 1
    match = [a for a in assignments if a["role_name"] == "listed-grp-role"]
    assert len(match) == 1
    assert match[0]["group_name"] == "listed-group"


@pytest.mark.asyncio
async def test_revoke_assignment(test_db_session: AsyncSession, test_user: User) -> None:
    """Revoke an existing group role assignment."""
    role = await _create_role(test_db_session, name="revoke-grp-role")
    group = await _create_group(test_db_session, name="revoke-group")
    svc = GroupRoleService(test_db_session, test_user)
    assignment = await svc.assign_role(group.id, role.id)
    await svc.revoke_assignment(assignment.id)
    # Verify it's gone
    assignments = await svc.list_assignments()
    assert not any(a["id"] == str(assignment.id) for a in assignments)


@pytest.mark.asyncio
async def test_revoke_nonexistent_assignment(test_db_session: AsyncSession, test_user: User) -> None:
    """Revoking a non-existent assignment raises SafeValueError."""
    svc = GroupRoleService(test_db_session, test_user)
    with pytest.raises(SafeValueError, match="not found"):
        await svc.revoke_assignment(uuid4())
