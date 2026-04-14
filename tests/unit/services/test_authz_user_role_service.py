"""Unit tests for UserRoleService.

Tests cover:
- Assign role to user
- List assignments with resolved names
- Revoke assignment
- Error conditions (user/role not found, duplicate assignment)
"""

from uuid import uuid4

import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.authz.models.role import Role
from nexus.authz.services.user_role_service import UserRoleService
from nexus.core.exceptions import SafeValueError
from nexus.core.models import User


async def _create_role(session: AsyncSession, name: str = "test-role") -> Role:
    """Create a test role."""
    role = Role(name=name, is_builtin=False, labels={})
    session.add(role)
    await session.commit()
    await session.refresh(role)
    return role


@pytest.mark.asyncio
async def test_assign_role_to_user(test_db_session: AsyncSession, test_user: User) -> None:
    """Assign a role to a user."""
    role = await _create_role(test_db_session)
    svc = UserRoleService(test_db_session, test_user)
    assignment = await svc.assign_role(test_user.id, role.id)
    assert assignment.user_id == test_user.id
    assert assignment.role_id == role.id


@pytest.mark.asyncio
async def test_assign_role_user_not_found(test_db_session: AsyncSession, test_user: User) -> None:
    """Assigning to a non-existent user raises SafeValueError."""
    role = await _create_role(test_db_session)
    svc = UserRoleService(test_db_session, test_user)
    with pytest.raises(SafeValueError, match=r"User .* not found"):
        await svc.assign_role(uuid4(), role.id)


@pytest.mark.asyncio
async def test_assign_role_not_found(test_db_session: AsyncSession, test_user: User) -> None:
    """Assigning a non-existent role raises SafeValueError."""
    svc = UserRoleService(test_db_session, test_user)
    with pytest.raises(SafeValueError, match=r"Role .* not found"):
        await svc.assign_role(test_user.id, uuid4())


@pytest.mark.asyncio
async def test_assign_duplicate_role(test_db_session: AsyncSession, test_user: User) -> None:
    """Assigning the same role twice raises SafeValueError."""
    role = await _create_role(test_db_session)
    svc = UserRoleService(test_db_session, test_user)
    await svc.assign_role(test_user.id, role.id)
    with pytest.raises(SafeValueError, match="already assigned"):
        await svc.assign_role(test_user.id, role.id)


@pytest.mark.asyncio
async def test_list_assignments(test_db_session: AsyncSession, test_user: User) -> None:
    """List assignments with resolved user and role names."""
    role = await _create_role(test_db_session, name="listed-role")
    svc = UserRoleService(test_db_session, test_user)
    await svc.assign_role(test_user.id, role.id)
    assignments = await svc.list_assignments()
    assert len(assignments) >= 1
    match = [a for a in assignments if a["role_name"] == "listed-role"]
    assert len(match) == 1
    assert match[0]["username"] == test_user.username


@pytest.mark.asyncio
async def test_revoke_assignment(test_db_session: AsyncSession, test_user: User) -> None:
    """Revoke an existing assignment."""
    role = await _create_role(test_db_session, name="revoke-role")
    svc = UserRoleService(test_db_session, test_user)
    assignment = await svc.assign_role(test_user.id, role.id)
    await svc.revoke_assignment(assignment.id)
    # Verify it's gone
    assignments = await svc.list_assignments()
    assert not any(a["id"] == str(assignment.id) for a in assignments)


@pytest.mark.asyncio
async def test_revoke_nonexistent_assignment(test_db_session: AsyncSession, test_user: User) -> None:
    """Revoking a non-existent assignment raises SafeValueError."""
    svc = UserRoleService(test_db_session, test_user)
    with pytest.raises(SafeValueError, match="not found"):
        await svc.revoke_assignment(uuid4())
