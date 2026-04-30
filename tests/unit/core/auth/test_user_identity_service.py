"""Unit tests for UserIdentityService."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest

from nexus.auth.exceptions import LastSignInMethodError, UserIdentityNotFoundError, UserNotFoundError
from nexus.users.services.user_identity_service import UserIdentityService

_PATCH_SESSION_STORE = "nexus.users.services.user_identity_service.SessionStore"


def _make_identity(*, user_id: UUID | None = None, identity_id: UUID | None = None) -> MagicMock:
    """Build a mock UserIdentity."""
    identity = MagicMock()
    identity.id = identity_id or uuid4()
    identity.user_id = user_id or uuid4()
    identity.identity_provider_id = uuid4()
    identity.issuer = "https://idp.example.com"
    identity.subject = "sub-123"
    return identity


def _make_user(*, user_id: UUID | None = None, password_hash: str | None = None) -> MagicMock:
    """Build a mock User."""
    user = MagicMock()
    user.id = user_id or uuid4()
    user.deleted_at = None
    user.password_hash = password_hash
    return user


class TestListForUser:
    """Tests for UserIdentityService.list_for_user."""

    @pytest.mark.asyncio
    async def test_returns_identities_with_provider_names(self) -> None:
        """Should return list of UserIdentityRead with provider_name populated."""
        user_id = uuid4()
        identity = _make_identity(user_id=user_id)
        identity.created_at = MagicMock()
        identity.updated_at = MagicMock()
        identity.last_used_at = None

        session = AsyncMock()
        # First exec: user exists check
        user_result = MagicMock()
        user_result.one_or_none.return_value = _make_user(user_id=user_id)
        # Second exec: identity join query
        identity_result = MagicMock()
        identity_result.all.return_value = [(identity, "Azure")]
        session.exec.side_effect = [user_result, identity_result]

        service = UserIdentityService(session)
        result = await service.list_for_user(user_id)

        assert len(result.resources) == 1
        assert result.resources[0].id == identity.id
        assert result.resources[0].provider_name == "Azure"

    @pytest.mark.asyncio
    async def test_returns_empty_list_when_no_identities(self) -> None:
        """Should return empty list when user has no federated identities."""
        user_id = uuid4()
        session = AsyncMock()
        user_result = MagicMock()
        user_result.one_or_none.return_value = _make_user(user_id=user_id)
        identity_result = MagicMock()
        identity_result.all.return_value = []
        session.exec.side_effect = [user_result, identity_result]

        service = UserIdentityService(session)
        result = await service.list_for_user(user_id)

        assert result.resources == []

    @pytest.mark.asyncio
    async def test_raises_when_user_not_found(self) -> None:
        """Should raise UserNotFoundError when user doesn't exist."""
        session = AsyncMock()
        user_result = MagicMock()
        user_result.one_or_none.return_value = None
        session.exec.return_value = user_result

        service = UserIdentityService(session)
        with pytest.raises(UserNotFoundError):
            await service.list_for_user(uuid4())


class TestDeleteIdentity:
    """Tests for UserIdentityService.delete_identity."""

    @pytest.mark.asyncio
    async def test_deletes_identity_successfully(self) -> None:
        """Should delete identity when it exists."""
        identity = _make_identity()
        session = AsyncMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = identity
        session.exec.return_value = mock_result

        service = UserIdentityService(session)
        with patch(_PATCH_SESSION_STORE):
            await service.delete_identity(identity.id)

        session.delete.assert_called_once_with(identity)
        session.flush.assert_called()

    @pytest.mark.asyncio
    async def test_raises_when_identity_not_found(self) -> None:
        """Should raise UserIdentityNotFoundError when identity doesn't exist."""
        session = AsyncMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = None
        session.exec.return_value = mock_result

        service = UserIdentityService(session)
        with pytest.raises(UserIdentityNotFoundError):
            await service.delete_identity(uuid4())

    @pytest.mark.asyncio
    async def test_deletes_when_expected_user_id_matches(self) -> None:
        """Should delete identity when expected_user_id matches the identity's user_id."""
        user_id = uuid4()
        identity = _make_identity(user_id=user_id)
        session = AsyncMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = identity
        session.exec.return_value = mock_result

        service = UserIdentityService(session)
        with patch(_PATCH_SESSION_STORE):
            await service.delete_identity(identity.id, expected_user_id=user_id)

        session.delete.assert_called_once_with(identity)

    @pytest.mark.asyncio
    async def test_raises_when_expected_user_id_does_not_match(self) -> None:
        """Should raise UserIdentityNotFoundError when identity belongs to a different user."""
        identity = _make_identity(user_id=uuid4())
        different_user_id = uuid4()

        session = AsyncMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = identity
        session.exec.return_value = mock_result

        service = UserIdentityService(session)
        with pytest.raises(UserIdentityNotFoundError):
            await service.delete_identity(identity.id, expected_user_id=different_user_id)

        session.delete.assert_not_called()

    @pytest.mark.asyncio
    async def test_raises_last_sign_in_method_when_only_identity(self) -> None:
        """Should raise LastSignInMethodError when deleting the only identity of a passwordless user."""
        user_id = uuid4()
        identity = _make_identity(user_id=user_id)
        user = _make_user(user_id=user_id, password_hash=None)

        session = AsyncMock()
        # First exec: find identity
        identity_result = MagicMock()
        identity_result.one_or_none.return_value = identity
        # Second exec: find user (no password)
        user_result = MagicMock()
        user_result.one_or_none.return_value = user
        # Third exec: count remaining identities (only 1)
        remaining_result = MagicMock()
        remaining_result.all.return_value = [identity]
        session.exec.side_effect = [identity_result, user_result, remaining_result]

        service = UserIdentityService(session)
        with pytest.raises(LastSignInMethodError):
            await service.delete_identity(identity.id)

        session.delete.assert_not_called()

    @pytest.mark.asyncio
    async def test_allows_delete_when_user_has_password(self) -> None:
        """Should allow deleting the last identity when user has a local password."""
        user_id = uuid4()
        identity = _make_identity(user_id=user_id)
        user = _make_user(user_id=user_id, password_hash="argon2id$hash")  # noqa: S106

        session = AsyncMock()
        identity_result = MagicMock()
        identity_result.one_or_none.return_value = identity
        user_result = MagicMock()
        user_result.one_or_none.return_value = user
        session.exec.side_effect = [identity_result, user_result]

        service = UserIdentityService(session)
        with patch(_PATCH_SESSION_STORE):
            await service.delete_identity(identity.id)

        session.delete.assert_called_once_with(identity)

    @pytest.mark.asyncio
    async def test_allows_delete_when_multiple_identities_remain(self) -> None:
        """Should allow deleting an identity when other identities remain for passwordless user."""
        user_id = uuid4()
        identity = _make_identity(user_id=user_id)
        other_identity = _make_identity(user_id=user_id)
        user = _make_user(user_id=user_id, password_hash=None)

        session = AsyncMock()
        identity_result = MagicMock()
        identity_result.one_or_none.return_value = identity
        user_result = MagicMock()
        user_result.one_or_none.return_value = user
        remaining_result = MagicMock()
        remaining_result.all.return_value = [identity, other_identity]
        session.exec.side_effect = [identity_result, user_result, remaining_result]

        service = UserIdentityService(session)
        with patch(_PATCH_SESSION_STORE):
            await service.delete_identity(identity.id)

        session.delete.assert_called_once_with(identity)

    @pytest.mark.asyncio
    async def test_force_skips_last_sign_in_check(self) -> None:
        """Should skip last-sign-in-method check when force=True."""
        user_id = uuid4()
        identity = _make_identity(user_id=user_id)

        session = AsyncMock()
        identity_result = MagicMock()
        identity_result.one_or_none.return_value = identity
        session.exec.return_value = identity_result

        service = UserIdentityService(session)
        with patch(_PATCH_SESSION_STORE):
            await service.delete_identity(identity.id, force=True)

        session.delete.assert_called_once_with(identity)

    @pytest.mark.asyncio
    async def test_skips_user_id_check_when_not_provided(self) -> None:
        """Should not check user_id when expected_user_id is None (default)."""
        identity = _make_identity()
        session = AsyncMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = identity
        session.exec.return_value = mock_result

        service = UserIdentityService(session)
        with patch(_PATCH_SESSION_STORE):
            await service.delete_identity(identity.id)

        session.delete.assert_called_once_with(identity)

    @pytest.mark.asyncio
    async def test_flushes_transaction(self) -> None:
        """Should flush (but not commit) the transaction after deleting."""
        identity = _make_identity()
        session = AsyncMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = identity
        session.exec.return_value = mock_result

        service = UserIdentityService(session)
        with patch(_PATCH_SESSION_STORE):
            await service.delete_identity(identity.id)

        session.flush.assert_called()
        session.commit.assert_not_called()


class TestFindByIssuerAndSubject:
    """Tests for UserIdentityService.find_by_issuer_and_subject."""

    @pytest.mark.asyncio
    async def test_returns_identity_when_found(self) -> None:
        """Should return identity when (issuer, subject) pair exists."""
        identity = _make_identity()
        session = AsyncMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = identity
        session.exec.return_value = mock_result

        service = UserIdentityService(session)
        result = await service.find_by_issuer_and_subject("https://idp.example.com", "sub-123")

        assert result == identity

    @pytest.mark.asyncio
    async def test_returns_none_when_not_found(self) -> None:
        """Should return None when no identity matches."""
        session = AsyncMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = None
        session.exec.return_value = mock_result

        service = UserIdentityService(session)
        result = await service.find_by_issuer_and_subject("https://idp.example.com", "nonexistent")

        assert result is None


class TestCreateIdentity:
    """Tests for UserIdentityService.create_identity."""

    @pytest.mark.asyncio
    async def test_creates_and_returns_identity(self) -> None:
        """Should create a new identity and flush to DB."""
        session = AsyncMock()
        user_id = uuid4()
        provider_id = uuid4()

        service = UserIdentityService(session)
        result = await service.create_identity(
            user_id=user_id,
            identity_provider_id=provider_id,
            issuer="https://idp.example.com",
            subject="new-sub",
        )

        assert result.user_id == user_id
        assert result.identity_provider_id == provider_id
        assert result.issuer == "https://idp.example.com"
        assert result.subject == "new-sub"
        session.add.assert_called_once()
        session.flush.assert_called_once()


class TestAttachIdentity:
    """Tests for UserIdentityService.attach_identity."""

    @pytest.mark.asyncio
    async def test_moves_identity_to_target_user(self) -> None:
        """Should update identity's user_id to the target user and return UserIdentityRead."""
        source_user_id = uuid4()
        target_user_id = uuid4()
        identity = _make_identity(user_id=source_user_id)
        target_user = _make_user(user_id=target_user_id)

        session = AsyncMock()
        # First exec: load identity with provider name (join query)
        identity_join_result = MagicMock()
        identity_join_result.one_or_none.return_value = (identity, "Azure")
        target_result = MagicMock()
        target_result.one_or_none.return_value = target_user
        session.exec.side_effect = [identity_join_result, target_result]

        service = UserIdentityService(session)
        with patch(_PATCH_SESSION_STORE):
            result = await service.attach_identity(identity.id, target_user_id)

        assert result.user_id == target_user_id
        assert result.provider_name == "Azure"
        session.flush.assert_called_once()
        session.commit.assert_not_called()

    @pytest.mark.asyncio
    async def test_raises_when_identity_not_found(self) -> None:
        """Should raise UserIdentityNotFoundError when identity doesn't exist."""
        session = AsyncMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = None
        session.exec.return_value = mock_result

        service = UserIdentityService(session)
        with pytest.raises(UserIdentityNotFoundError):
            await service.attach_identity(uuid4(), uuid4())

    @pytest.mark.asyncio
    async def test_raises_when_target_user_not_found(self) -> None:
        """Should raise UserNotFoundError when target user doesn't exist."""
        identity = _make_identity()
        session = AsyncMock()

        identity_join_result = MagicMock()
        identity_join_result.one_or_none.return_value = (identity, "Okta")
        target_result = MagicMock()
        target_result.one_or_none.return_value = None
        session.exec.side_effect = [identity_join_result, target_result]

        service = UserIdentityService(session)
        with pytest.raises(UserNotFoundError):
            await service.attach_identity(identity.id, uuid4())

    @pytest.mark.asyncio
    async def test_preserves_source_user_after_attach(self) -> None:
        """Should NOT soft-delete the source user even if they have no remaining identities."""
        source_user_id = uuid4()
        target_user_id = uuid4()
        identity = _make_identity(user_id=source_user_id)
        target_user = _make_user(user_id=target_user_id)

        session = AsyncMock()
        identity_join_result = MagicMock()
        identity_join_result.one_or_none.return_value = (identity, "Azure")
        target_result = MagicMock()
        target_result.one_or_none.return_value = target_user
        session.exec.side_effect = [identity_join_result, target_result]

        service = UserIdentityService(session)
        with patch(_PATCH_SESSION_STORE):
            await service.attach_identity(identity.id, target_user_id)

        # Source user should not be soft-deleted — preserved for audit
        session.delete.assert_not_called()
