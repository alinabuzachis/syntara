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

from nexus.authz.services.user_role_service import UserRoleService
from nexus.core.exceptions import SafeValueError
from nexus.core.models import User


@pytest.mark.asyncio
async def test_assign_role_to_user(test_db_session: AsyncSession, test_user: User) -> None:
    """Assign a role to a user."""
    svc = UserRoleService(test_db_session, test_user)
    assignment = await svc.assign_role(test_user.id, "admin")
    assert assignment.user_id == test_user.id
    assert assignment.role_name == "admin"


@pytest.mark.asyncio
async def test_assign_role_user_not_found(test_db_session: AsyncSession, test_user: User) -> None:
    """Assigning to a non-existent user raises SafeValueError."""
    svc = UserRoleService(test_db_session, test_user)
    with pytest.raises(SafeValueError, match=r"User .* not found"):
        await svc.assign_role(uuid4(), "admin")


@pytest.mark.asyncio
async def test_assign_role_not_found(test_db_session: AsyncSession, test_user: User) -> None:
    """Assigning a non-existent role raises SafeValueError."""
    svc = UserRoleService(test_db_session, test_user)
    with pytest.raises(SafeValueError, match=r"Role .* not found"):
        await svc.assign_role(test_user.id, "nonexistent-role")


@pytest.mark.asyncio
async def test_assign_duplicate_role(test_db_session: AsyncSession, test_user: User) -> None:
    """Assigning the same role twice raises SafeValueError."""
    svc = UserRoleService(test_db_session, test_user)
    await svc.assign_role(test_user.id, "admin")
    with pytest.raises(SafeValueError, match="already assigned"):
        await svc.assign_role(test_user.id, "admin")


@pytest.mark.asyncio
async def test_list_assignments(test_db_session: AsyncSession, test_user: User) -> None:
    """List assignments with resolved user and role names."""
    svc = UserRoleService(test_db_session, test_user)
    await svc.assign_role(test_user.id, "user")
    assignments = await svc.list_assignments()
    assert len(assignments) >= 1
    match = [a for a in assignments if a["role_name"] == "user"]
    assert len(match) == 1
    assert match[0]["username"] == test_user.username


@pytest.mark.asyncio
async def test_revoke_assignment(test_db_session: AsyncSession, test_user: User) -> None:
    """Revoke an existing assignment."""
    svc = UserRoleService(test_db_session, test_user)
    assignment = await svc.assign_role(test_user.id, "auditor")
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
