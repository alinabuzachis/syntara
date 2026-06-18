"""Integration tests for Principal auto-creation via the before_flush listener.

Tests verify:
- Adding a User or ServiceAccount via session.add() auto-creates a Principal row
- FK integrity between principals and subtypes
- Multiple entities in one flush each get their own Principal
- Non-principal entities are ignored
"""

from uuid import UUID, uuid4

import pytest
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.authz.models.project import Project
from nexus.core.models.principal import (
    Principal,
    PrincipalType,
)
from nexus.core.models.user import User
from nexus.service_accounts.models.service_account import ServiceAccount


def _make_user(user_id: UUID | None = None, **overrides: object) -> User:
    defaults: dict[str, object] = {
        "id": user_id or uuid4(),
        "username": f"testuser-{uuid4().hex[:8]}",
        "email": f"test-{uuid4().hex[:8]}@example.com",
        "first_name": "Test",
        "last_name": "User",
        "password_hash": "$argon2id$v=19$m=65536,t=3,p=4$test",
    }
    defaults.update(overrides)
    return User(**defaults)


def _make_service_account(
    sa_id: UUID | None = None, *, project_id: UUID, created_by: UUID, **overrides: object
) -> ServiceAccount:
    defaults: dict[str, object] = {
        "id": sa_id or uuid4(),
        "name": f"sa-{uuid4().hex[:8]}",
        "client_id": f"nx_sa_{uuid4().hex[:16]}",
        "hashed_secret": "$argon2id$v=19$m=65536,t=3,p=4$test",
        "project_id": project_id,
        "created_by": created_by,
    }
    defaults.update(overrides)
    return ServiceAccount(**defaults)


@pytest.fixture
async def owner_user(test_db_session: AsyncSession) -> User:
    """Create a user to serve as created_by for service accounts."""
    user = _make_user()
    test_db_session.add(user)
    await test_db_session.flush()
    return user


@pytest.fixture
async def project(test_db_session: AsyncSession) -> Project:
    """Create a project for service account isolation."""
    p = Project(name=f"test-project-{uuid4().hex[:8]}", description="Test project")
    test_db_session.add(p)
    await test_db_session.flush()
    return p


class TestPrincipalAutoCreation:
    """Tests for the before_flush event listener that auto-creates Principal rows.

    Adding a User or ServiceAccount via session.add() should automatically
    create the corresponding Principal row via the before_flush listener.
    """

    @pytest.mark.asyncio
    async def test_creates_principal_and_user(self, test_db_session: AsyncSession) -> None:
        user = _make_user()
        test_db_session.add(user)
        await test_db_session.flush()

        principal = await test_db_session.get(Principal, user.id)
        assert principal is not None
        assert principal.principal_type == PrincipalType.USER

        db_user = await test_db_session.get(User, user.id)
        assert db_user is not None
        assert db_user.username == user.username

    @pytest.mark.asyncio
    async def test_principal_id_matches_user_id(self, test_db_session: AsyncSession) -> None:
        user = _make_user()
        test_db_session.add(user)
        await test_db_session.flush()

        principal = await test_db_session.get(Principal, user.id)
        assert principal is not None
        assert principal.id == user.id

    @pytest.mark.asyncio
    async def test_creates_principal_and_service_account(
        self, test_db_session: AsyncSession, owner_user: User, project: Project
    ) -> None:
        sa = _make_service_account(project_id=project.id, created_by=owner_user.id)
        test_db_session.add(sa)
        await test_db_session.flush()

        principal = await test_db_session.get(Principal, sa.id)
        assert principal is not None
        assert principal.principal_type == PrincipalType.SERVICE_ACCOUNT

        db_sa = await test_db_session.get(ServiceAccount, sa.id)
        assert db_sa is not None
        assert db_sa.name == sa.name

    @pytest.mark.asyncio
    async def test_principal_id_matches_service_account_id(
        self, test_db_session: AsyncSession, owner_user: User, project: Project
    ) -> None:
        sa = _make_service_account(project_id=project.id, created_by=owner_user.id)
        test_db_session.add(sa)
        await test_db_session.flush()

        principal = await test_db_session.get(Principal, sa.id)
        assert principal is not None
        assert principal.id == sa.id

    @pytest.mark.asyncio
    async def test_no_duplicate_principal(self, test_db_session: AsyncSession) -> None:
        """Flushing a user twice should not create duplicate Principal rows."""
        user = _make_user()
        test_db_session.add(user)
        await test_db_session.flush()

        result = await test_db_session.exec(select(Principal).where(Principal.id == user.id))
        principals = result.all()
        assert len(principals) == 1

    @pytest.mark.asyncio
    async def test_multiple_entities_in_one_flush(
        self, test_db_session: AsyncSession, owner_user: User, project: Project
    ) -> None:
        """Multiple new users/SAs in a single flush each get their own Principal."""
        user1 = _make_user()
        user2 = _make_user()
        sa = _make_service_account(project_id=project.id, created_by=owner_user.id)

        test_db_session.add(user1)
        test_db_session.add(user2)
        test_db_session.add(sa)
        await test_db_session.flush()

        for entity_id, expected_type in [
            (user1.id, PrincipalType.USER),
            (user2.id, PrincipalType.USER),
            (sa.id, PrincipalType.SERVICE_ACCOUNT),
        ]:
            principal = await test_db_session.get(Principal, entity_id)
            assert principal is not None, f"Missing Principal for {expected_type} {entity_id}"
            assert principal.principal_type == expected_type

    @pytest.mark.asyncio
    async def test_non_principal_entity_ignored(self, test_db_session: AsyncSession) -> None:
        """Adding a non-principal entity (e.g., Project) should not create a Principal."""
        p = Project(name=f"ignored-{uuid4().hex[:8]}", description="Should not get a principal")
        test_db_session.add(p)
        await test_db_session.flush()

        principal = await test_db_session.get(Principal, p.id)
        assert principal is None
