"""Unit tests for RoleAssignmentService private helper methods.

Covers _resolve_assignment_identity, _validate_principal_id, and is_visible
branches introduced by the principal_id/group_id refactor.
"""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.authz.services.role_assignment_service import RoleAssignmentService
from nexus.core.exceptions import SafeValueError
from nexus.core.models import User


def _make_service(mock_session: AsyncMock, test_user: User) -> RoleAssignmentService:
    return RoleAssignmentService(session=mock_session, current_user=test_user)


# ============================================================================
# _resolve_assignment_identity
# ============================================================================


class TestResolveAssignmentIdentity:
    """Test best-effort identity resolution used during revoke()."""

    @pytest.mark.asyncio
    async def test_group_id_with_existing_group(self, test_user: User) -> None:
        group = MagicMock()
        group.name = "developers"
        session = AsyncMock(spec=AsyncSession)
        session.get = AsyncMock(return_value=group)

        svc = _make_service(session, test_user)
        pname, ptype, gname = await svc._resolve_assignment_identity(None, uuid4())

        assert pname is None
        assert ptype is None
        assert gname == "developers"

    @pytest.mark.asyncio
    async def test_group_id_with_deleted_group(self, test_user: User) -> None:
        session = AsyncMock(spec=AsyncSession)
        session.get = AsyncMock(return_value=None)

        svc = _make_service(session, test_user)
        pname, ptype, gname = await svc._resolve_assignment_identity(None, uuid4())

        assert pname is None
        assert ptype is None
        assert gname is None

    @pytest.mark.asyncio
    async def test_principal_id_user(self, test_user: User) -> None:
        principal = MagicMock()
        principal.principal_type = "user"
        user_entity = MagicMock()
        user_entity.username = "alice"

        session = AsyncMock(spec=AsyncSession)
        session.get = AsyncMock(side_effect=[principal, user_entity])

        svc = _make_service(session, test_user)
        pname, ptype, gname = await svc._resolve_assignment_identity(uuid4(), None)

        assert pname == "alice"
        assert ptype == "user"
        assert gname is None

    @pytest.mark.asyncio
    async def test_principal_id_service_account(self, test_user: User) -> None:
        principal = MagicMock()
        principal.principal_type = "service_account"
        sa_entity = MagicMock()
        sa_entity.name = "my-sa"

        session = AsyncMock(spec=AsyncSession)
        session.get = AsyncMock(side_effect=[principal, sa_entity])

        svc = _make_service(session, test_user)
        pname, ptype, gname = await svc._resolve_assignment_identity(uuid4(), None)

        assert pname == "my-sa"
        assert ptype == "service_account"
        assert gname is None

    @pytest.mark.asyncio
    async def test_principal_id_deleted_principal(self, test_user: User) -> None:
        session = AsyncMock(spec=AsyncSession)
        session.get = AsyncMock(return_value=None)

        svc = _make_service(session, test_user)
        pname, ptype, gname = await svc._resolve_assignment_identity(uuid4(), None)

        assert pname is None
        assert ptype is None
        assert gname is None

    @pytest.mark.asyncio
    async def test_principal_id_deleted_user_entity(self, test_user: User) -> None:
        """Principal record exists but the User row is gone."""
        principal = MagicMock()
        principal.principal_type = "user"

        session = AsyncMock(spec=AsyncSession)
        session.get = AsyncMock(side_effect=[principal, None])

        svc = _make_service(session, test_user)
        pname, ptype, gname = await svc._resolve_assignment_identity(uuid4(), None)

        assert pname is None
        assert ptype == "user"
        assert gname is None

    @pytest.mark.asyncio
    async def test_principal_id_deleted_service_account_entity(self, test_user: User) -> None:
        """Principal record exists but the ServiceAccount row is gone."""
        principal = MagicMock()
        principal.principal_type = "service_account"

        session = AsyncMock(spec=AsyncSession)
        session.get = AsyncMock(side_effect=[principal, None])

        svc = _make_service(session, test_user)
        pname, ptype, gname = await svc._resolve_assignment_identity(uuid4(), None)

        assert pname is None
        assert ptype == "service_account"
        assert gname is None

    @pytest.mark.asyncio
    async def test_neither_id_provided(self, test_user: User) -> None:
        session = AsyncMock(spec=AsyncSession)
        svc = _make_service(session, test_user)
        pname, ptype, gname = await svc._resolve_assignment_identity(None, None)

        assert pname is None
        assert ptype is None
        assert gname is None


# ============================================================================
# _validate_principal_id
# ============================================================================


class TestValidatePrincipalId:
    """Test principal validation returns (name, type_label)."""

    @pytest.mark.asyncio
    async def test_user_principal(self, test_user: User) -> None:
        principal = MagicMock()
        principal.principal_type = "user"
        user_entity = MagicMock()
        user_entity.username = "bob"

        session = AsyncMock(spec=AsyncSession)
        session.get = AsyncMock(side_effect=[principal, user_entity])

        svc = _make_service(session, test_user)
        name, label = await svc._validate_principal_id(uuid4())

        assert name == "bob"
        assert label == "user"

    @pytest.mark.asyncio
    async def test_service_account_principal(self, test_user: User) -> None:
        principal = MagicMock()
        principal.principal_type = "service_account"
        sa_entity = MagicMock()
        sa_entity.name = "deploy-bot"

        session = AsyncMock(spec=AsyncSession)
        session.get = AsyncMock(side_effect=[principal, sa_entity])

        svc = _make_service(session, test_user)
        name, label = await svc._validate_principal_id(uuid4())

        assert name == "deploy-bot"
        assert label == "service_account"

    @pytest.mark.asyncio
    async def test_principal_not_found(self, test_user: User) -> None:
        session = AsyncMock(spec=AsyncSession)
        session.get = AsyncMock(return_value=None)

        svc = _make_service(session, test_user)
        with pytest.raises(SafeValueError, match=r"Principal .* not found"):
            await svc._validate_principal_id(uuid4())

    @pytest.mark.asyncio
    async def test_user_entity_missing_after_principal_found(self, test_user: User) -> None:
        principal = MagicMock()
        principal.principal_type = "user"

        session = AsyncMock(spec=AsyncSession)
        session.get = AsyncMock(side_effect=[principal, None])

        svc = _make_service(session, test_user)
        with pytest.raises(SafeValueError, match=r"User .* not found"):
            await svc._validate_principal_id(uuid4())

    @pytest.mark.asyncio
    async def test_service_account_entity_missing_after_principal_found(self, test_user: User) -> None:
        principal = MagicMock()
        principal.principal_type = "service_account"

        session = AsyncMock(spec=AsyncSession)
        session.get = AsyncMock(side_effect=[principal, None])

        svc = _make_service(session, test_user)
        with pytest.raises(SafeValueError, match=r"Service account .* not found"):
            await svc._validate_principal_id(uuid4())

    @pytest.mark.asyncio
    async def test_unsupported_principal_type(self, test_user: User) -> None:
        principal = MagicMock()
        principal.principal_type = "unknown_type"

        session = AsyncMock(spec=AsyncSession)
        session.get = AsyncMock(return_value=principal)

        svc = _make_service(session, test_user)
        with pytest.raises(SafeValueError, match="Unsupported principal type"):
            await svc._validate_principal_id(uuid4())


# ============================================================================
# is_visible
# ============================================================================


class TestIsVisible:
    """Test visibility checks for individual assignments."""

    def test_all_projects_always_visible(self, test_user: User) -> None:
        session = AsyncMock(spec=AsyncSession)
        svc = _make_service(session, test_user)
        assert svc.is_visible(
            {"principal_id": uuid4(), "group_id": None, "project_id": uuid4()},
            all_projects=True,
            user_id=test_user.id,
            group_ids=[],
            allowed_project_ids=[],
        )

    def test_own_principal_visible(self, test_user: User) -> None:
        session = AsyncMock(spec=AsyncSession)
        svc = _make_service(session, test_user)
        assert svc.is_visible(
            {"principal_id": test_user.id, "group_id": None, "project_id": None},
            all_projects=False,
            user_id=test_user.id,
            group_ids=[],
            allowed_project_ids=[],
        )

    def test_own_group_visible(self, test_user: User) -> None:
        group_id = uuid4()
        session = AsyncMock(spec=AsyncSession)
        svc = _make_service(session, test_user)
        assert svc.is_visible(
            {"principal_id": None, "group_id": group_id, "project_id": None},
            all_projects=False,
            user_id=test_user.id,
            group_ids=[group_id],
            allowed_project_ids=[],
        )

    def test_allowed_project_visible(self, test_user: User) -> None:
        project_id = uuid4()
        session = AsyncMock(spec=AsyncSession)
        svc = _make_service(session, test_user)
        assert svc.is_visible(
            {"principal_id": uuid4(), "group_id": None, "project_id": project_id},
            all_projects=False,
            user_id=test_user.id,
            group_ids=[],
            allowed_project_ids=[project_id],
        )

    def test_foreign_assignment_not_visible(self, test_user: User) -> None:
        session = AsyncMock(spec=AsyncSession)
        svc = _make_service(session, test_user)
        assert not svc.is_visible(
            {"principal_id": uuid4(), "group_id": None, "project_id": uuid4()},
            all_projects=False,
            user_id=test_user.id,
            group_ids=[],
            allowed_project_ids=[],
        )

    def test_null_principal_id_not_matched_to_user(self, test_user: User) -> None:
        """Group-only assignment (principal_id=None) shouldn't match on user_id."""
        session = AsyncMock(spec=AsyncSession)
        svc = _make_service(session, test_user)
        assert not svc.is_visible(
            {"principal_id": None, "group_id": uuid4(), "project_id": None},
            all_projects=False,
            user_id=test_user.id,
            group_ids=[],
            allowed_project_ids=[],
        )
