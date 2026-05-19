"""Unit tests for the ao-admin CLI enable-user and reset-password commands."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
import typer

from nexus.ao_admin.__main__ import _enable_user_async, _get_actor, _reset_password_async
from nexus.core.models.user import AuthType


def _make_mock_user(
    username: str = "alice",
    *,
    auth_type: AuthType = AuthType.LOCAL,
    is_enabled: bool = True,
) -> MagicMock:
    user = MagicMock()
    user.id = uuid4()
    user.username = username
    user.auth_type = auth_type
    user.is_enabled = is_enabled
    return user


def _mock_session_returning(entity: MagicMock | None) -> AsyncMock:
    """Build a mock AsyncSessionLocal that returns `entity` from a SELECT query."""
    mock_result = MagicMock()
    mock_result.one_or_none.return_value = entity

    mock_session = AsyncMock()
    mock_session.exec = AsyncMock(return_value=mock_result)
    mock_session.add = MagicMock()
    return mock_session


def _session_factory(mock_session: AsyncMock) -> AsyncMock:
    return AsyncMock(
        __aenter__=AsyncMock(return_value=mock_session),
        __aexit__=AsyncMock(return_value=False),
    )


# ---------------------------------------------------------------------------
# _get_actor
# ---------------------------------------------------------------------------


class TestGetActor:
    """Tests for _get_actor helper."""

    def test_returns_os_login(self) -> None:
        with patch("nexus.ao_admin.__main__.os.getlogin", return_value="jdoe"):
            assert _get_actor() == "jdoe"

    def test_falls_back_on_os_error(self) -> None:
        with patch("nexus.ao_admin.__main__.os.getlogin", side_effect=OSError("no tty")):
            assert _get_actor() == "ao-admin"


# ---------------------------------------------------------------------------
# enable-user
# ---------------------------------------------------------------------------


class TestEnableUser:
    """Tests for the enable-user CLI command."""

    @pytest.mark.asyncio
    async def test_enables_disabled_local_user(self) -> None:
        """Should set is_enabled=True, revoke sessions, and dispatch audit event."""
        mock_user = _make_mock_user(is_enabled=False)
        mock_session = _mock_session_returning(mock_user)

        mock_store = MagicMock()
        mock_store.revoke_all_for_user = AsyncMock(return_value=2)
        mock_store.increment_token_version = AsyncMock()

        with (
            patch("nexus.ao_admin.__main__._init_audit"),
            patch(
                "nexus.core.database.session.AsyncSessionLocal",
                return_value=_session_factory(mock_session),
            ),
            patch("nexus.auth.session.create_session_store", return_value=mock_store),
            patch("nexus.audit.dispatcher.AuditEventDispatcher") as mock_dispatcher,
        ):
            await _enable_user_async(username="alice", actor="ao-admin")

        assert mock_user.is_enabled is True
        mock_store.revoke_all_for_user.assert_called_once_with(mock_user.id)
        mock_store.increment_token_version.assert_called_once_with(mock_user.id)
        mock_dispatcher.dispatch.assert_called_once()

        event = mock_dispatcher.dispatch.call_args[0][0]
        assert event.target_username == mock_user.username
        assert event.actor_username == "ao-admin"

    @pytest.mark.asyncio
    async def test_enables_disabled_idp_user(self) -> None:
        """Should re-enable identity provider users (they just can't have passwords reset)."""
        mock_user = _make_mock_user(auth_type=AuthType.FEDERATED, is_enabled=False)
        mock_session = _mock_session_returning(mock_user)

        mock_store = MagicMock()
        mock_store.revoke_all_for_user = AsyncMock(return_value=0)
        mock_store.increment_token_version = AsyncMock()

        with (
            patch("nexus.ao_admin.__main__._init_audit"),
            patch(
                "nexus.core.database.session.AsyncSessionLocal",
                return_value=_session_factory(mock_session),
            ),
            patch("nexus.auth.session.create_session_store", return_value=mock_store),
            patch("nexus.audit.dispatcher.AuditEventDispatcher") as mock_dispatcher,
        ):
            await _enable_user_async(username="alice", actor="ao-admin")

        assert mock_user.is_enabled is True
        mock_dispatcher.dispatch.assert_called_once()

    @pytest.mark.asyncio
    async def test_exits_with_error_for_unknown_user(self) -> None:
        """Should raise typer.Exit(1) when user is not found."""
        mock_session = _mock_session_returning(None)

        with (
            patch("nexus.ao_admin.__main__._init_audit"),
            patch(
                "nexus.core.database.session.AsyncSessionLocal",
                return_value=_session_factory(mock_session),
            ),
            pytest.raises(typer.Exit) as exc_info,
        ):
            await _enable_user_async(username="nonexistent", actor="ao-admin")

        assert exc_info.value.exit_code == 1

    @pytest.mark.asyncio
    async def test_exits_cleanly_for_already_enabled_user(self) -> None:
        """Should raise typer.Exit(0) when user is already enabled."""
        mock_user = _make_mock_user(is_enabled=True)
        mock_session = _mock_session_returning(mock_user)

        with (
            patch("nexus.ao_admin.__main__._init_audit"),
            patch(
                "nexus.core.database.session.AsyncSessionLocal",
                return_value=_session_factory(mock_session),
            ),
            pytest.raises(typer.Exit) as exc_info,
        ):
            await _enable_user_async(username="alice", actor="ao-admin")

        assert exc_info.value.exit_code == 0

    @pytest.mark.asyncio
    async def test_custom_actor_recorded(self) -> None:
        """Should use the custom actor name in the audit event."""
        mock_user = _make_mock_user(is_enabled=False)
        mock_session = _mock_session_returning(mock_user)

        mock_store = MagicMock()
        mock_store.revoke_all_for_user = AsyncMock(return_value=0)
        mock_store.increment_token_version = AsyncMock()

        with (
            patch("nexus.ao_admin.__main__._init_audit"),
            patch(
                "nexus.core.database.session.AsyncSessionLocal",
                return_value=_session_factory(mock_session),
            ),
            patch("nexus.auth.session.create_session_store", return_value=mock_store),
            patch("nexus.audit.dispatcher.AuditEventDispatcher") as mock_dispatcher,
        ):
            await _enable_user_async(username="alice", actor="security-team@corp.com")

        event = mock_dispatcher.dispatch.call_args[0][0]
        assert event.actor_username == "security-team@corp.com"


# ---------------------------------------------------------------------------
# reset-password
# ---------------------------------------------------------------------------


class TestResetPassword:
    """Tests for the reset-password CLI command."""

    @pytest.mark.asyncio
    async def test_resets_password_for_local_user(self) -> None:
        """Should update password_hash, revoke sessions, and dispatch audit event."""
        mock_user = _make_mock_user()
        mock_session = _mock_session_returning(mock_user)

        mock_store = MagicMock()
        mock_store.revoke_all_for_user = AsyncMock(return_value=3)
        mock_store.increment_token_version = AsyncMock()

        with (
            patch("nexus.ao_admin.__main__._init_audit"),
            patch(
                "nexus.core.database.session.AsyncSessionLocal",
                return_value=_session_factory(mock_session),
            ),
            patch("nexus.auth.session.create_session_store", return_value=mock_store),
            patch("nexus.auth.passwords.hash_password", return_value="$argon2id$hashed") as mock_hash,
            patch("nexus.audit.dispatcher.AuditEventDispatcher") as mock_dispatcher,
        ):
            await _reset_password_async(username="alice", new_password="newpassword123", actor="ao-admin")  # noqa: S106

        mock_hash.assert_called_once_with("newpassword123")
        assert mock_user.password_hash == "$argon2id$hashed"  # noqa: S105
        mock_store.revoke_all_for_user.assert_called_once_with(mock_user.id)
        mock_store.increment_token_version.assert_called_once_with(mock_user.id)
        mock_dispatcher.dispatch.assert_called_once()

        event = mock_dispatcher.dispatch.call_args[0][0]
        assert event.target_username == mock_user.username
        assert event.actor_username == "ao-admin"

    @pytest.mark.asyncio
    async def test_exits_with_error_for_unknown_user(self) -> None:
        """Should raise typer.Exit(1) when user is not found."""
        mock_session = _mock_session_returning(None)

        with (
            patch("nexus.ao_admin.__main__._init_audit"),
            patch(
                "nexus.core.database.session.AsyncSessionLocal",
                return_value=_session_factory(mock_session),
            ),
            pytest.raises(typer.Exit) as exc_info,
        ):
            await _reset_password_async(username="nonexistent", new_password="newpassword123", actor="ao-admin")  # noqa: S106

        assert exc_info.value.exit_code == 1

    @pytest.mark.asyncio
    async def test_exits_with_error_for_idp_user(self) -> None:
        """Should raise typer.Exit(1) for identity provider users."""
        mock_user = _make_mock_user(auth_type=AuthType.FEDERATED)
        mock_session = _mock_session_returning(mock_user)

        with (
            patch("nexus.ao_admin.__main__._init_audit"),
            patch(
                "nexus.core.database.session.AsyncSessionLocal",
                return_value=_session_factory(mock_session),
            ),
            pytest.raises(typer.Exit) as exc_info,
        ):
            await _reset_password_async(username="alice", new_password="newpassword123", actor="ao-admin")  # noqa: S106

        assert exc_info.value.exit_code == 1

    @pytest.mark.asyncio
    async def test_custom_actor_recorded(self) -> None:
        """Should use the custom actor name in the audit event."""
        mock_user = _make_mock_user()
        mock_session = _mock_session_returning(mock_user)

        mock_store = MagicMock()
        mock_store.revoke_all_for_user = AsyncMock(return_value=0)
        mock_store.increment_token_version = AsyncMock()

        with (
            patch("nexus.ao_admin.__main__._init_audit"),
            patch(
                "nexus.core.database.session.AsyncSessionLocal",
                return_value=_session_factory(mock_session),
            ),
            patch("nexus.auth.session.create_session_store", return_value=mock_store),
            patch("nexus.auth.passwords.hash_password", return_value="$argon2id$hashed"),
            patch("nexus.audit.dispatcher.AuditEventDispatcher") as mock_dispatcher,
        ):
            await _reset_password_async(username="alice", new_password="newpassword123", actor="ops@example.com")  # noqa: S106

        event = mock_dispatcher.dispatch.call_args[0][0]
        assert event.actor_username == "ops@example.com"


# ---------------------------------------------------------------------------
# Typer CLI integration
# ---------------------------------------------------------------------------


class TestTyperCommands:
    """Tests for Typer command registration and help output."""

    def test_help_lists_commands(self) -> None:
        from typer.testing import CliRunner

        from nexus.ao_admin.__main__ import app

        runner = CliRunner()
        result = runner.invoke(app, ["--help"])
        assert result.exit_code == 0
        assert "enable-user" in result.output
        assert "reset-password" in result.output
