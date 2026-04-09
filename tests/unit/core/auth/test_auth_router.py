"""Unit tests for auth router endpoints: login, refresh, and logout."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest

from nexus.auth.dependencies import get_refresh_token
from nexus.auth.exceptions import (
    AuthenticationRequiredError,
    InvalidTokenError,
    RefreshTokenRevokedError,
)
from nexus.auth.router import login, logout, refresh_token
from nexus.auth.schemas import LoginRequest
from nexus.auth.services.token_service import TokenPayload
from nexus.auth.session.session_store import SessionInfo
from nexus.core.models import User
from nexus.core.models.user import UserRole


def _make_request(*, cookie_value: str | None = None) -> MagicMock:
    """Build a mock Request with optional refresh-token cookie."""
    request = MagicMock()
    cookies: dict[str, str] = {}
    if cookie_value is not None:
        cookies["ao_refresh_token"] = cookie_value
    request.cookies = cookies
    request.headers = MagicMock()
    request.headers.get = MagicMock(return_value="test-agent")
    request.client = MagicMock()
    request.client.host = "127.0.0.1"
    return request


def _make_response() -> MagicMock:
    """Build a mock Response."""
    return MagicMock()


def _make_payload(
    *,
    sub: str | None = None,
    jti: str = "jti-abc",
    preferred_username: str = "testuser",
    iat: datetime | None = None,
) -> TokenPayload:
    return TokenPayload(
        sub=sub or str(uuid4()),
        iss="http://localhost:8000",
        iat=iat or datetime.now(UTC),
        exp=datetime.now(UTC) + timedelta(hours=8),
        token_type="refresh",  # noqa: S106
        jti=jti,
        preferred_username=preferred_username,
        email=None,
        groups=None,
        amr=["pwd"],
        idp="local",
    )


def _make_user(
    *,
    user_id: str | None = None,
    is_active: bool = True,
    password_hash: str | None = "$argon2id$v=19$m=65536,t=3,p=4$fakehash",  # noqa: S107
) -> User:
    return User(
        id=UUID(user_id) if user_id else uuid4(),
        username="testuser",
        email="test@example.com",
        full_name="Test User",
        role=UserRole.CREATOR,
        is_active=is_active,
        password_hash=password_hash,
    )


def _make_session(jti: str = "jti-abc") -> SessionInfo:
    return SessionInfo(
        jti=jti,
        user_id=str(uuid4()),
        issued_at=datetime.now(UTC),
        device=None,
        ip_address=None,
        ttl=3600,
    )


def _patch_session_store(mock_store: AsyncMock) -> MagicMock:
    """Create a patched SessionStore class whose context manager yields *mock_store*."""
    ctx = AsyncMock()
    ctx.__aenter__ = AsyncMock(return_value=mock_store)
    ctx.__aexit__ = AsyncMock(return_value=None)
    return MagicMock(return_value=ctx)


# =============================================================================
# Login endpoint
# =============================================================================


class TestLoginEndpoint:
    """Tests for the /auth/login endpoint."""

    @pytest.mark.asyncio
    async def test_login_success(self) -> None:
        """Login with valid credentials returns access token and sets cookie."""
        user = _make_user()
        request = _make_request()
        response = _make_response()
        body = LoginRequest(username="testuser", password="correct-password")  # noqa: S106

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = user
        db.exec.return_value = mock_result

        mock_token_service = MagicMock()
        mock_token_service.create_access_token.return_value = "access-token-123"
        mock_token_service.create_refresh_token.return_value = ("refresh-jwt", "jti-1", datetime.now(UTC))

        mock_store = AsyncMock()

        mock_settings = MagicMock()
        mock_settings.jwt_refresh_token_lifetime_hours = 8
        mock_settings.jwt_access_token_lifetime_minutes = 15

        with (
            patch("nexus.auth.router._get_token_service", return_value=mock_token_service),
            patch("nexus.auth.router.verify_password", return_value=True),
            patch("nexus.auth.router.SessionStore", _patch_session_store(mock_store)),
            patch("nexus.auth.router.get_settings", return_value=mock_settings),
            patch("nexus.auth.router.set_refresh_cookie") as mock_set_cookie,
        ):
            result = await login(body, request, response, db)

        assert result.access_token == "access-token-123"  # noqa: S105
        assert result.expires_in == 900
        mock_set_cookie.assert_called_once()

    @pytest.mark.asyncio
    async def test_login_normalizes_username_to_lowercase(self) -> None:
        """Login should normalize username to lowercase before DB lookup."""
        user = _make_user()
        request = _make_request()
        response = _make_response()
        body = LoginRequest(username="TestUser", password="correct-password")  # noqa: S106

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = user
        db.exec.return_value = mock_result

        mock_token_service = MagicMock()
        mock_token_service.create_access_token.return_value = "access-token-123"
        mock_token_service.create_refresh_token.return_value = ("refresh-jwt", "jti-1", datetime.now(UTC))

        mock_store = AsyncMock()

        mock_settings = MagicMock()
        mock_settings.jwt_refresh_token_lifetime_hours = 8
        mock_settings.jwt_access_token_lifetime_minutes = 15

        with (
            patch("nexus.auth.router._get_token_service", return_value=mock_token_service),
            patch("nexus.auth.router.verify_password", return_value=True),
            patch("nexus.auth.router.SessionStore", _patch_session_store(mock_store)),
            patch("nexus.auth.router.get_settings", return_value=mock_settings),
            patch("nexus.auth.router.set_refresh_cookie"),
        ):
            result = await login(body, request, response, db)

        assert result.access_token == "access-token-123"  # noqa: S105

        # Verify the DB query used the lowercased username
        stmt = db.exec.call_args[0][0]
        compiled = stmt.compile(compile_kwargs={"literal_binds": True})
        assert "testuser" in str(compiled).lower()
        assert "TestUser" not in str(compiled)

    @pytest.mark.asyncio
    async def test_login_rejects_wrong_password(self) -> None:
        """Login with wrong password raises AuthenticationRequiredError."""
        user = _make_user()
        request = _make_request()
        response = _make_response()
        body = LoginRequest(username="testuser", password="wrong-password")  # noqa: S106

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = user
        db.exec.return_value = mock_result

        with (
            patch("nexus.auth.router.verify_password", return_value=False),
            pytest.raises(AuthenticationRequiredError),
        ):
            await login(body, request, response, db)

    @pytest.mark.asyncio
    async def test_login_rejects_unknown_user(self) -> None:
        """Login with unknown username raises AuthenticationRequiredError."""
        request = _make_request()
        response = _make_response()
        body = LoginRequest(username="nobody", password="any")  # noqa: S106

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = None
        db.exec.return_value = mock_result

        with pytest.raises(AuthenticationRequiredError):
            await login(body, request, response, db)

    @pytest.mark.asyncio
    async def test_login_rejects_inactive_user(self) -> None:
        """Login for inactive user raises AuthenticationRequiredError."""
        user = _make_user(is_active=False)
        request = _make_request()
        response = _make_response()
        body = LoginRequest(username="testuser", password="correct")  # noqa: S106

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = user
        db.exec.return_value = mock_result

        with (
            patch("nexus.auth.router.verify_password", return_value=True),
            pytest.raises(AuthenticationRequiredError),
        ):
            await login(body, request, response, db)

    @pytest.mark.asyncio
    async def test_login_rejects_user_without_password(self) -> None:
        """Login for federated-only user (no password_hash) raises AuthenticationRequiredError."""
        user = _make_user(password_hash=None)
        request = _make_request()
        response = _make_response()
        body = LoginRequest(username="testuser", password="any")  # noqa: S106

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = user
        db.exec.return_value = mock_result

        with pytest.raises(AuthenticationRequiredError):
            await login(body, request, response, db)


# =============================================================================
# get_refresh_token dependency
# =============================================================================


class TestGetRefreshTokenDependency:
    """Tests for the get_refresh_token dependency."""

    def test_raises_when_no_cookie(self) -> None:
        """Should raise AuthenticationRequiredError when cookie is missing."""
        request = _make_request(cookie_value=None)

        with pytest.raises(AuthenticationRequiredError):
            get_refresh_token(request)

    def test_returns_token_when_cookie_present(self) -> None:
        """Should return the raw token string when cookie exists."""
        request = _make_request(cookie_value="the-refresh-jwt")

        token = get_refresh_token(request)

        assert token == "the-refresh-jwt"  # noqa: S105


# =============================================================================
# Refresh endpoint
# =============================================================================


class TestRefreshEndpoint:
    """Tests for the /auth/refresh endpoint."""

    @pytest.mark.asyncio
    async def test_raises_on_invalid_token(self) -> None:
        """Refresh should re-raise InvalidTokenError from decode_token."""
        db = AsyncMock()

        mock_token_service = MagicMock()
        mock_token_service.decode_token.side_effect = InvalidTokenError

        with (
            patch("nexus.auth.router._get_token_service", return_value=mock_token_service),
            pytest.raises(InvalidTokenError),
        ):
            await refresh_token("bad-token", db)

    @pytest.mark.asyncio
    async def test_raises_when_session_not_in_store(self) -> None:
        """Refresh should raise RefreshTokenRevokedError when JTI not in Redis."""
        db = AsyncMock()

        payload = _make_payload()
        mock_token_service = MagicMock()
        mock_token_service.decode_token.return_value = payload

        mock_store = AsyncMock()
        mock_store.get.return_value = None

        with (
            patch("nexus.auth.router._get_token_service", return_value=mock_token_service),
            patch("nexus.auth.router.SessionStore", _patch_session_store(mock_store)),
            pytest.raises(RefreshTokenRevokedError),
        ):
            await refresh_token("valid-token", db)

    @pytest.mark.asyncio
    async def test_raises_when_user_not_found(self) -> None:
        """Refresh should raise AuthenticationRequiredError if user is not in DB."""
        payload = _make_payload()
        mock_token_service = MagicMock()
        mock_token_service.decode_token.return_value = payload

        mock_store = AsyncMock()
        mock_store.get.return_value = _make_session()

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = None
        db.exec.return_value = mock_result

        with (
            patch("nexus.auth.router._get_token_service", return_value=mock_token_service),
            patch("nexus.auth.router.SessionStore", _patch_session_store(mock_store)),
            pytest.raises(AuthenticationRequiredError),
        ):
            await refresh_token("valid-token", db)

    @pytest.mark.asyncio
    async def test_raises_when_user_inactive(self) -> None:
        """Refresh should raise AuthenticationRequiredError if user is inactive."""
        user = _make_user(is_active=False)
        payload = _make_payload(sub=str(user.id))

        mock_token_service = MagicMock()
        mock_token_service.decode_token.return_value = payload

        mock_store = AsyncMock()
        mock_store.get.return_value = _make_session()

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = user
        db.exec.return_value = mock_result

        with (
            patch("nexus.auth.router._get_token_service", return_value=mock_token_service),
            patch("nexus.auth.router.SessionStore", _patch_session_store(mock_store)),
            pytest.raises(AuthenticationRequiredError),
        ):
            await refresh_token("valid-token", db)

    @pytest.mark.asyncio
    async def test_success_returns_access_token(self) -> None:
        """Successful refresh returns AccessTokenResponse."""
        user = _make_user()
        payload = _make_payload(sub=str(user.id))

        mock_token_service = MagicMock()
        mock_token_service.decode_token.return_value = payload
        mock_token_service.create_access_token.return_value = "new-access-token"

        mock_store = AsyncMock()
        mock_store.get.return_value = _make_session()

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = user
        db.exec.return_value = mock_result

        mock_settings = MagicMock()
        mock_settings.jwt_refresh_token_lifetime_hours = 8
        mock_settings.jwt_access_token_lifetime_minutes = 15

        with (
            patch("nexus.auth.router._get_token_service", return_value=mock_token_service),
            patch("nexus.auth.router.SessionStore", _patch_session_store(mock_store)),
            patch("nexus.auth.router.get_settings", return_value=mock_settings),
        ):
            result = await refresh_token("the-refresh-jwt", db)

        assert result.access_token == "new-access-token"  # noqa: S105
        assert result.expires_in == 900  # 15 * 60
        assert result.token_type == "Bearer"  # noqa: S105

    @pytest.mark.asyncio
    async def test_refresh_preserves_amr_and_idp(self) -> None:
        """Refresh should carry forward the amr and idp claims from the original token."""
        user = _make_user()
        payload = _make_payload(sub=str(user.id))
        payload.amr = ["fed", "mfa"]
        payload.idp = "azure-ad-prod"

        mock_token_service = MagicMock()
        mock_token_service.decode_token.return_value = payload
        mock_token_service.create_access_token.return_value = "new-access-token"

        mock_store = AsyncMock()
        mock_store.get.return_value = _make_session()

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = user
        db.exec.return_value = mock_result

        mock_settings = MagicMock()
        mock_settings.jwt_refresh_token_lifetime_hours = 8
        mock_settings.jwt_access_token_lifetime_minutes = 15

        with (
            patch("nexus.auth.router._get_token_service", return_value=mock_token_service),
            patch("nexus.auth.router.SessionStore", _patch_session_store(mock_store)),
            patch("nexus.auth.router.get_settings", return_value=mock_settings),
        ):
            await refresh_token("the-refresh-jwt", db)

        # Verify amr and idp were passed through to create_access_token
        call_kwargs = mock_token_service.create_access_token.call_args
        assert call_kwargs.kwargs["amr"] == ["fed", "mfa"]
        assert call_kwargs.kwargs["idp"] == "azure-ad-prod"


# =============================================================================
# Logout endpoint
# =============================================================================


class TestLogoutEndpoint:
    """Tests for the /auth/logout endpoint."""

    @pytest.mark.asyncio
    async def test_clears_cookie_on_invalid_token(self) -> None:
        """Logout should clear cookie and re-raise InvalidTokenError."""
        response = _make_response()

        mock_token_service = MagicMock()
        mock_token_service.decode_token.side_effect = InvalidTokenError

        with (
            patch("nexus.auth.router._get_token_service", return_value=mock_token_service),
            patch("nexus.auth.router.clear_refresh_cookie") as mock_clear,
            pytest.raises(InvalidTokenError),
        ):
            await logout("bad-token", response)

        mock_clear.assert_called_once_with(response)

    @pytest.mark.asyncio
    async def test_clears_cookie_on_decode_exception(self) -> None:
        """Logout should clear cookie and raise AuthenticationRequiredError on unexpected decode error."""
        response = _make_response()

        mock_token_service = MagicMock()
        mock_token_service.decode_token.side_effect = RuntimeError("unexpected")

        with (
            patch("nexus.auth.router._get_token_service", return_value=mock_token_service),
            patch("nexus.auth.router.clear_refresh_cookie") as mock_clear,
            pytest.raises(AuthenticationRequiredError),
        ):
            await logout("bad-token", response)

        mock_clear.assert_called_once_with(response)

    @pytest.mark.asyncio
    async def test_clears_cookie_when_jti_missing(self) -> None:
        """Logout should clear cookie and raise when payload has no JTI."""
        response = _make_response()

        payload = _make_payload(jti="")
        payload.jti = None

        mock_token_service = MagicMock()
        mock_token_service.decode_token.return_value = payload

        with (
            patch("nexus.auth.router._get_token_service", return_value=mock_token_service),
            patch("nexus.auth.router.clear_refresh_cookie") as mock_clear,
            pytest.raises(AuthenticationRequiredError),
        ):
            await logout("valid-token", response)

        mock_clear.assert_called_once_with(response)

    @pytest.mark.asyncio
    async def test_success_revokes_session_and_clears_cookie(self) -> None:
        """Successful logout revokes session in Redis and clears cookie."""
        response = _make_response()

        payload = _make_payload(jti="jti-123")
        mock_token_service = MagicMock()
        mock_token_service.decode_token.return_value = payload

        mock_store = AsyncMock()
        mock_store.revoke.return_value = True

        with (
            patch("nexus.auth.router._get_token_service", return_value=mock_token_service),
            patch("nexus.auth.router.SessionStore", _patch_session_store(mock_store)),
            patch("nexus.auth.router.clear_refresh_cookie") as mock_clear,
        ):
            result = await logout("the-refresh-jwt", response)

        assert result == {"detail": "Successfully logged out"}
        mock_store.revoke.assert_called_once_with("jti-123")
        mock_clear.assert_called_once_with(response)

    @pytest.mark.asyncio
    async def test_success_when_session_already_expired(self) -> None:
        """Logout succeeds even when session was already expired in Redis."""
        response = _make_response()

        payload = _make_payload(jti="jti-456")
        mock_token_service = MagicMock()
        mock_token_service.decode_token.return_value = payload

        mock_store = AsyncMock()
        mock_store.revoke.return_value = False  # already expired

        with (
            patch("nexus.auth.router._get_token_service", return_value=mock_token_service),
            patch("nexus.auth.router.SessionStore", _patch_session_store(mock_store)),
            patch("nexus.auth.router.clear_refresh_cookie") as mock_clear,
        ):
            result = await logout("the-refresh-jwt", response)

        assert result == {"detail": "Successfully logged out"}
        mock_clear.assert_called_once_with(response)


# =============================================================================
# Get Me endpoint
# =============================================================================


class TestGetMeEndpoint:
    """Tests for the /auth/me endpoint."""

    @pytest.mark.asyncio
    async def test_returns_user_info_from_payload(self) -> None:
        """get_me should return UserInfo populated from token claims."""
        from nexus.auth.router import get_me

        user_id = str(uuid4())
        payload = _make_payload(sub=user_id, preferred_username="alice")
        payload.email = "alice@example.com"
        payload.groups = ["engineering", "admins"]
        payload.token_type = "access"  # noqa: S105

        result = await get_me(payload)

        assert result.id == user_id
        assert result.username == "alice"
        assert result.email == "alice@example.com"
        assert result.groups == ["engineering", "admins"]

    @pytest.mark.asyncio
    async def test_handles_none_optional_fields(self) -> None:
        """get_me should default to empty strings when optional claims are None."""
        from nexus.auth.router import get_me

        payload = _make_payload()
        payload.preferred_username = None
        payload.email = None
        payload.groups = None

        result = await get_me(payload)

        assert result.username == ""
        assert result.email == ""
        assert result.groups == []
