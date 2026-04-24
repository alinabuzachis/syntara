"""Unit tests for auth router endpoints: login, refresh, and logout."""

from collections.abc import Generator
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest

from nexus.audit.dispatcher import AuditEventDispatcher
from nexus.audit.events.function_execution import FunctionExecutionEvent, FunctionExecutionHandler
from nexus.auth.dependencies import get_refresh_token
from nexus.auth.exceptions import (
    AuthenticationRequiredError,
    InvalidTokenError,
    RefreshTokenRevokedError,
    SessionStoreUnavailableError,
)
from nexus.auth.router import _OIDCCallbackError, login, logout, oidc_authorize, oidc_callback, refresh_token
from nexus.auth.schemas import LoginRequest
from nexus.auth.services.oidc_service import OIDCError
from nexus.auth.services.token_service import TokenPayload
from nexus.auth.session.session_store import SessionInfo
from nexus.core.models import User


@pytest.fixture
def _mock_audit_dispatcher() -> Generator[MagicMock, None, None]:
    """Prevent AuditEventDispatcher.dispatch from having side effects during tests."""
    with patch("nexus.auth.router.AuditEventDispatcher.dispatch") as mock_dispatch:
        yield mock_dispatch


@pytest.fixture
def _mock_audit_emission() -> Generator[None, None, None]:
    """Prevent @track_event emission side effects in unit tests."""
    with patch("nexus.audit.emitter.emit_audit_event"):
        yield


@pytest.fixture(autouse=True)
def _register_audit_event_handler() -> Any:  # noqa: ANN401
    """Register FunctionExecutionHandler for tests."""
    AuditEventDispatcher.register({FunctionExecutionEvent: FunctionExecutionHandler()})
    yield
    AuditEventDispatcher.reset()


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


def _patch_session_store_unavailable() -> MagicMock:
    """Create a patched SessionStore whose context manager raises OSError (Redis down)."""
    from redis.exceptions import ConnectionError as RedisConnectionError

    ctx = AsyncMock()
    ctx.__aenter__ = AsyncMock(side_effect=RedisConnectionError("Connection refused"))
    ctx.__aexit__ = AsyncMock(return_value=None)
    return MagicMock(return_value=ctx)


# =============================================================================
# Login endpoint
# =============================================================================


@pytest.mark.usefixtures("_mock_audit_dispatcher", "_mock_audit_emission")
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

        # Verify the first DB query (user lookup) used the lowercased username
        stmt = db.exec.call_args_list[0][0][0]
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

    @pytest.mark.asyncio
    async def test_login_raises_503_when_redis_unavailable(self) -> None:
        """Login should raise SessionStoreUnavailableError when Redis is down."""
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

        # First SessionStore call (get_token_version) succeeds;
        # second call (create session) fails with ConnectionError.
        ok_store = AsyncMock()
        ok_store.get_token_version = AsyncMock(return_value=1)

        mock_session_store_cls = MagicMock(
            side_effect=[
                _patch_session_store(ok_store).return_value,
                _patch_session_store_unavailable().return_value,
            ]
        )

        with (
            patch("nexus.auth.router._get_token_service", return_value=mock_token_service),
            patch("nexus.auth.router.verify_password", return_value=True),
            patch("nexus.auth.router._get_user_group_names", return_value=["authenticated"]),
            patch("nexus.auth.router.SessionStore", mock_session_store_cls),
            pytest.raises(SessionStoreUnavailableError),
        ):
            await login(body, request, response, db)

        db.rollback.assert_called_once()


# =============================================================================
# get_refresh_token dependency
# =============================================================================


@pytest.mark.usefixtures("_mock_audit_dispatcher", "_mock_audit_emission")
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


@pytest.mark.usefixtures("_mock_audit_dispatcher", "_mock_audit_emission")
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
    async def test_raises_503_when_redis_unavailable(self) -> None:
        """Refresh should raise SessionStoreUnavailableError when Redis is down."""
        db = AsyncMock()

        payload = _make_payload()
        mock_token_service = MagicMock()
        mock_token_service.decode_token.return_value = payload

        with (
            patch("nexus.auth.router._get_token_service", return_value=mock_token_service),
            patch("nexus.auth.router.SessionStore", _patch_session_store_unavailable()),
            pytest.raises(SessionStoreUnavailableError),
        ):
            await refresh_token("valid-token", db)

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


@pytest.mark.usefixtures("_mock_audit_dispatcher", "_mock_audit_emission")
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
    async def test_raises_503_when_redis_unavailable(self) -> None:
        """Logout should raise SessionStoreUnavailableError when Redis is down."""
        response = _make_response()

        payload = _make_payload(jti="jti-123")
        mock_token_service = MagicMock()
        mock_token_service.decode_token.return_value = payload

        with (
            patch("nexus.auth.router._get_token_service", return_value=mock_token_service),
            patch("nexus.auth.router.SessionStore", _patch_session_store_unavailable()),
            pytest.raises(SessionStoreUnavailableError),
        ):
            await logout("the-refresh-jwt", response)

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


@pytest.mark.usefixtures("_mock_audit_dispatcher", "_mock_audit_emission")
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


class TestLoginAuditEvents:
    """Tests for audit event emission during login.

    These tests use a real AuditEventDispatcher with real handlers (no mock
    fixtures) so the full event pipeline runs end-to-end. Events are captured
    at the lowest level (_do_emit_audit_event) to verify ordering.
    """

    @pytest.mark.asyncio
    @patch("nexus.auth.router._get_token_service")
    @patch("nexus.auth.router.SessionStore")
    @patch("nexus.auth.router._get_user_group_names", new_callable=AsyncMock)
    @patch("nexus.auth.router.verify_password", return_value=True)
    async def test_successful_login_emits_all_events_in_order(
        self,
        mock_verify: MagicMock,
        mock_groups: AsyncMock,
        mock_session_store: MagicMock,
        mock_token_svc: MagicMock,
    ) -> None:
        """Happy login flow emits all audit events in correct chronological order.

        Expected order:
        1. SessionLifecycleEvent -> "session_created" (USER_ACTION, SUCCESS)
        2. LoginAttemptEvent -> "login" (USER_ACTION, SUCCESS, error_type=None)
        3. @track_event "login" (SECURITY_EVENT, SUCCESS)
        """
        from nexus.audit.dispatcher import AuditEventDispatcher
        from nexus.audit.models.audit_event import AuditEvent, EventCategory, EventStatus
        from nexus.audit.models.structured_data import AuditContextData
        from nexus.auth.audit.login_attempt import (
            LoginAttemptEvent,
            LoginAttemptHandler,
        )
        from nexus.auth.audit.session_lifecycle import (
            SessionLifecycleEvent,
            SessionLifecycleHandler,
        )

        user = _make_user()
        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = user
        mock_db.exec = AsyncMock(return_value=mock_result)

        mock_groups.return_value = ["authenticated"]

        mock_store_instance = AsyncMock()
        mock_store_instance.get_token_version = AsyncMock(return_value=1)
        mock_store_instance.create = AsyncMock()
        mock_session_store.return_value.__aenter__ = AsyncMock(return_value=mock_store_instance)
        mock_session_store.return_value.__aexit__ = AsyncMock(return_value=False)

        mock_token_svc.return_value.create_access_token.return_value = "access-token"
        mock_token_svc.return_value.create_refresh_token.return_value = ("refresh-token", "jti-123", 3600)

        request = _make_request()
        response = _make_response()

        # Wire up a real dispatcher with real handlers so domain events
        # flow through the full pipeline. Capture at _do_emit_audit_event
        # to see the complete ordered event stream.
        from nexus.audit.events.function_execution import FunctionExecutionEvent, FunctionExecutionHandler

        AuditEventDispatcher.reset()
        AuditEventDispatcher.register(
            {
                LoginAttemptEvent: LoginAttemptHandler(),
                SessionLifecycleEvent: SessionLifecycleHandler(),
                FunctionExecutionEvent: FunctionExecutionHandler(),
            }
        )

        try:
            with patch("nexus.audit.emitter._do_emit_audit_event") as mock_do_emit:
                await login(
                    body=LoginRequest(username="testuser", password="password123"),  # noqa: S106
                    request=request,
                    response=response,
                    db=mock_db,
                )

            assert mock_do_emit.call_count == 3
            events: list[AuditEvent] = [call.args[0] for call in mock_do_emit.call_args_list]

            # Event 1: SessionLifecycleEvent -> "session_created"
            assert events[0].event_action == "session_created"
            assert events[0].event_category == EventCategory.USER_ACTION
            assert events[0].event_status == EventStatus.SUCCESS
            assert events[0].actor_username == "testuser"
            assert isinstance(events[0].structured_data, AuditContextData)
            assert events[0].structured_data.lifecycle_action == "create"  # type: ignore[attr-defined]
            assert events[0].structured_data.jti == "jti-123"  # type: ignore[attr-defined]

            # Event 2: LoginAttemptEvent -> "login" (error_type=None)
            assert events[1].event_action == "login"
            assert events[1].event_category == EventCategory.USER_ACTION
            assert events[1].event_status == EventStatus.SUCCESS
            assert isinstance(events[1].structured_data, AuditContextData)
            assert events[1].structured_data.method == "password"  # type: ignore[attr-defined]
            assert events[1].actor_username == "testuser"
            assert events[1].actor_id == user.id

            # Event 3: @track_event "login"
            assert events[2].event_action == "login"
            assert events[2].event_category == EventCategory.SECURITY_EVENT
            assert events[2].event_status == EventStatus.SUCCESS
        finally:
            AuditEventDispatcher.reset()


def _setup_oidc_callback_mocks() -> tuple[MagicMock, MagicMock, MagicMock, MagicMock, AsyncMock]:
    """Set up common mocks for oidc_callback tests."""
    mock_token_service = MagicMock()
    mock_token_service.create_refresh_token.return_value = ("refresh-jwt", "jti-123", 3600)

    mock_store_instance = AsyncMock()
    mock_store_instance.create = AsyncMock()
    mock_session_store = MagicMock()
    mock_session_store.return_value.__aenter__ = AsyncMock(return_value=mock_store_instance)
    mock_session_store.return_value.__aexit__ = AsyncMock(return_value=False)

    mock_settings = MagicMock()
    mock_settings.jwt_issuer = "http://localhost:3000"
    mock_settings.cors_allow_origins = ["http://localhost:3000"]
    mock_settings.jwt_refresh_token_lifetime_hours = 8

    db = AsyncMock()

    request = MagicMock()
    request.headers.get.return_value = "TestUserAgent"
    request.client = MagicMock()
    request.client.host = "127.0.0.1"

    return mock_token_service, mock_session_store, mock_settings, request, db


class TestOIDCAuditEvents:
    """Tests for audit event emission during OIDC flows.

    These tests verify that OIDC error paths emit audit events with correct
    error_type, provider_id, and event metadata. Uses real dispatcher and
    handlers to test the full pipeline.
    """

    @pytest.mark.asyncio
    async def test_authorize_oidc_error_emits_event_with_error_type(self) -> None:
        """oidc_authorize with OIDCError emits audit event with error_type and provider_id."""
        from nexus.audit.dispatcher import AuditEventDispatcher
        from nexus.audit.events.function_execution import FunctionExecutionEvent, FunctionExecutionHandler
        from nexus.audit.models.audit_event import AuditEvent, EventCategory, EventSeverity, EventStatus
        from nexus.audit.models.structured_data import AuditContextData
        from nexus.auth.audit.oidc_flow import OIDCFlowEvent, OIDCFlowHandler

        provider_id = uuid4()

        AuditEventDispatcher.reset()
        AuditEventDispatcher.register(
            {
                OIDCFlowEvent: OIDCFlowHandler(),
                FunctionExecutionEvent: FunctionExecutionHandler(),
            }
        )

        try:
            # Mock the underlying function to raise OIDCError
            with patch("nexus.auth.router._build_oidc_authorize_redirect") as mock_build:
                mock_build.side_effect = OIDCError("Provider not available")

                # Mock request and db
                request = MagicMock()
                request.headers.get.return_value = None
                db = AsyncMock()

                # Capture emitted events
                with patch("nexus.audit.emitter._do_emit_audit_event") as mock_do_emit:
                    # Call oidc_authorize - should redirect to login with error
                    response = await oidc_authorize(provider_id=provider_id, request=request, db=db)
                    assert response.status_code == 302
                    assert "auth_error=" in response.headers["location"]

                # Verify audit events were emitted
                # @track_event emits 1 event + OIDCFlowEvent dispatch = 2 total
                assert mock_do_emit.call_count == 2
                events: list[AuditEvent] = [call.args[0] for call in mock_do_emit.call_args_list]

                # Find the OIDCFlowEvent-generated event
                oidc_event = next(e for e in events if e.event_action == "oidc_authorize")

                assert oidc_event.event_category == EventCategory.SECURITY_EVENT
                assert oidc_event.event_severity == EventSeverity.ERROR
                assert oidc_event.event_status == EventStatus.ERROR
                assert isinstance(oidc_event.structured_data, AuditContextData)
                assert oidc_event.structured_data.error_type == "OIDCError"
                assert oidc_event.structured_data.provider_id == str(provider_id)  # type: ignore[attr-defined]
        finally:
            AuditEventDispatcher.reset()

    @pytest.mark.asyncio
    async def test_authorize_callback_error_emits_event_with_error_type(self) -> None:
        """oidc_authorize with _OIDCCallbackError emits audit event with error_type and provider_id."""
        from nexus.audit.dispatcher import AuditEventDispatcher
        from nexus.audit.events.function_execution import FunctionExecutionEvent, FunctionExecutionHandler
        from nexus.audit.models.audit_event import AuditEvent, EventCategory, EventSeverity, EventStatus
        from nexus.audit.models.structured_data import AuditContextData
        from nexus.auth.audit.oidc_flow import OIDCFlowEvent, OIDCFlowHandler

        provider_id = uuid4()

        AuditEventDispatcher.reset()
        AuditEventDispatcher.register(
            {
                OIDCFlowEvent: OIDCFlowHandler(),
                FunctionExecutionEvent: FunctionExecutionHandler(),
            }
        )

        try:
            # Mock the underlying function to raise _OIDCCallbackError
            with patch("nexus.auth.router._build_oidc_authorize_redirect") as mock_build:
                mock_build.side_effect = _OIDCCallbackError("Invalid state", origin="http://localhost:3000")

                # Mock request and db
                request = MagicMock()
                request.headers.get.return_value = None
                db = AsyncMock()

                # Capture emitted events
                with patch("nexus.audit.emitter._do_emit_audit_event") as mock_do_emit:
                    # Call oidc_authorize - should redirect to login with error
                    response = await oidc_authorize(provider_id=provider_id, request=request, db=db)
                    assert response.status_code == 302

                # Verify audit events were emitted
                # @track_event emits 1 event + OIDCFlowEvent dispatch = 2 total
                assert mock_do_emit.call_count == 2
                events: list[AuditEvent] = [call.args[0] for call in mock_do_emit.call_args_list]

                # Find the OIDCFlowEvent-generated event
                oidc_event = next(e for e in events if e.event_action == "oidc_authorize")

                assert oidc_event.event_category == EventCategory.SECURITY_EVENT
                assert oidc_event.event_severity == EventSeverity.ERROR
                assert oidc_event.event_status == EventStatus.ERROR
                assert isinstance(oidc_event.structured_data, AuditContextData)
                assert oidc_event.structured_data.error_type == "_OIDCCallbackError"
                assert oidc_event.structured_data.provider_id == str(provider_id)  # type: ignore[attr-defined]
        finally:
            AuditEventDispatcher.reset()

    @pytest.mark.asyncio
    async def test_authorize_generic_exception_emits_event_with_error_type(self) -> None:
        """oidc_authorize with generic Exception emits audit event with error_type and provider_id."""
        from nexus.audit.dispatcher import AuditEventDispatcher
        from nexus.audit.events.function_execution import FunctionExecutionEvent, FunctionExecutionHandler
        from nexus.audit.models.audit_event import AuditEvent, EventCategory, EventSeverity, EventStatus
        from nexus.audit.models.structured_data import AuditContextData
        from nexus.auth.audit.oidc_flow import OIDCFlowEvent, OIDCFlowHandler

        provider_id = uuid4()

        AuditEventDispatcher.reset()
        AuditEventDispatcher.register(
            {
                OIDCFlowEvent: OIDCFlowHandler(),
                FunctionExecutionEvent: FunctionExecutionHandler(),
            }
        )

        try:
            # Mock the underlying function to raise RuntimeError
            with patch("nexus.auth.router._build_oidc_authorize_redirect") as mock_build:
                mock_build.side_effect = RuntimeError("Unexpected error")

                # Mock request and db
                request = MagicMock()
                request.headers.get.return_value = None
                db = AsyncMock()

                # Capture emitted events
                with patch("nexus.audit.emitter._do_emit_audit_event") as mock_do_emit:
                    # Call oidc_authorize - should redirect to login with error
                    response = await oidc_authorize(provider_id=provider_id, request=request, db=db)
                    assert response.status_code == 302

                # Verify audit events were emitted
                # @track_event emits 1 event + OIDCFlowEvent dispatch = 2 total
                assert mock_do_emit.call_count == 2
                events: list[AuditEvent] = [call.args[0] for call in mock_do_emit.call_args_list]

                # Find the OIDCFlowEvent-generated event
                oidc_event = next(e for e in events if e.event_action == "oidc_authorize")

                assert oidc_event.event_category == EventCategory.SECURITY_EVENT
                assert oidc_event.event_severity == EventSeverity.ERROR
                assert oidc_event.event_status == EventStatus.ERROR
                assert isinstance(oidc_event.structured_data, AuditContextData)
                assert oidc_event.structured_data.error_type == "RuntimeError"
                assert oidc_event.structured_data.provider_id == str(provider_id)  # type: ignore[attr-defined]
        finally:
            AuditEventDispatcher.reset()

    @pytest.mark.asyncio
    async def test_callback_error_emits_event_with_none_provider_id(self) -> None:
        """oidc_callback with _OIDCCallbackError emits audit event with provider_id=None."""
        from nexus.audit.dispatcher import AuditEventDispatcher
        from nexus.audit.events.function_execution import FunctionExecutionEvent, FunctionExecutionHandler
        from nexus.audit.models.audit_event import AuditEvent, EventCategory, EventSeverity, EventStatus
        from nexus.audit.models.structured_data import AuditContextData
        from nexus.auth.audit.oidc_flow import OIDCFlowEvent, OIDCFlowHandler

        AuditEventDispatcher.reset()
        AuditEventDispatcher.register(
            {
                OIDCFlowEvent: OIDCFlowHandler(),
                FunctionExecutionEvent: FunctionExecutionHandler(),
            }
        )

        try:
            # Mock the underlying function to raise _OIDCCallbackError
            with patch("nexus.auth.router._process_oidc_callback") as mock_process:
                mock_process.side_effect = _OIDCCallbackError("Invalid code", origin="http://localhost:3000")

                # Mock request and db
                request = MagicMock()
                request.headers.get.return_value = None
                request.client = MagicMock()
                request.client.host = "127.0.0.1"
                db = AsyncMock()

                # Capture emitted events
                with patch("nexus.audit.emitter._do_emit_audit_event") as mock_do_emit:
                    # Call oidc_callback - should redirect to login with error
                    response = await oidc_callback(state="test-state", request=request, db=db, code="test-code")
                    assert response.status_code == 302

                # Verify audit events were emitted
                # @track_event emits 1 event + OIDCFlowEvent dispatch = 2 total
                assert mock_do_emit.call_count == 2
                events: list[AuditEvent] = [call.args[0] for call in mock_do_emit.call_args_list]

                # Find the OIDCFlowEvent-generated event
                oidc_event = next(e for e in events if e.event_action == "oidc_callback")

                assert oidc_event.event_category == EventCategory.SECURITY_EVENT
                assert oidc_event.event_severity == EventSeverity.ERROR
                assert oidc_event.event_status == EventStatus.ERROR
                assert isinstance(oidc_event.structured_data, AuditContextData)
                assert oidc_event.structured_data.error_type == "_OIDCCallbackError"
                # Critical: callback errors have provider_id=None
                assert oidc_event.structured_data.provider_id is None  # type: ignore[attr-defined]
        finally:
            AuditEventDispatcher.reset()

    @pytest.mark.asyncio
    async def test_successful_oidc_callback_emits_all_events_in_order(self) -> None:
        """Happy OIDC callback flow emits all audit events in correct chronological order.

        Expected order:
        1. OIDCFlowEvent -> "oidc_callback" (USER_ACTION, SUCCESS)
        2. SessionLifecycleEvent -> "session_created" (USER_ACTION, SUCCESS)
        3. LoginAttemptEvent -> "login" (USER_ACTION, SUCCESS, method=OIDC)
        4. @track_event "oidc_callback" (SECURITY_EVENT, SUCCESS)
        """
        from nexus.audit.dispatcher import AuditEventDispatcher
        from nexus.audit.models.audit_event import AuditEvent, EventCategory, EventStatus
        from nexus.audit.models.structured_data import AuditContextData
        from nexus.auth.audit.login_attempt import LoginAttemptEvent, LoginAttemptHandler
        from nexus.auth.audit.oidc_flow import OIDCFlowEvent, OIDCFlowHandler
        from nexus.auth.audit.session_lifecycle import SessionLifecycleEvent, SessionLifecycleHandler

        provider = MagicMock()
        provider.id, provider.name = uuid4(), "TestProvider"
        user = _make_user()
        state_data = {"origin": "http://localhost:3000", "redirect_to": "/dashboard"}
        mock_token_service, mock_session_store, mock_settings, request, db = _setup_oidc_callback_mocks()

        # Wire up a real dispatcher with real handlers so domain events
        # flow through the full pipeline. Capture at _do_emit_audit_event
        # to see the complete ordered event stream.
        from nexus.audit.events.function_execution import FunctionExecutionEvent, FunctionExecutionHandler

        AuditEventDispatcher.reset()
        AuditEventDispatcher.register(
            {
                OIDCFlowEvent: OIDCFlowHandler(),
                SessionLifecycleEvent: SessionLifecycleHandler(),
                LoginAttemptEvent: LoginAttemptHandler(),
                FunctionExecutionEvent: FunctionExecutionHandler(),
            }
        )

        try:
            with (
                patch("nexus.auth.router._process_oidc_callback") as mock_process,
                patch("nexus.auth.router._get_token_service", return_value=mock_token_service),
                patch("nexus.auth.router.SessionStore", return_value=mock_session_store),
                patch("nexus.auth.router.get_settings", return_value=mock_settings),
                patch("nexus.auth.router.set_refresh_cookie"),
                patch("nexus.audit.emitter._do_emit_audit_event") as mock_do_emit,
            ):
                mock_process.return_value = (user, provider, state_data)

                response = await oidc_callback(
                    state="valid-state",
                    request=request,
                    db=db,
                    code="auth-code-123",
                )

                assert response.status_code == 302

            # Verify all 4 events were emitted in the correct order
            assert mock_do_emit.call_count == 4
            events: list[AuditEvent] = [call.args[0] for call in mock_do_emit.call_args_list]

            # Event 1: OIDCFlowEvent -> "oidc_callback" (USER_ACTION, SUCCESS)
            e0 = events[0]
            assert (e0.event_action, e0.event_category, e0.event_status, e0.actor_id) == (
                "oidc_callback",
                EventCategory.USER_ACTION,
                EventStatus.SUCCESS,
                user.id,
            )
            assert e0.actor_username == "testuser"
            assert isinstance(e0.structured_data, AuditContextData)
            assert e0.structured_data.provider_id == str(provider.id)  # type: ignore[attr-defined]
            assert e0.structured_data.stage == "callback"  # type: ignore[attr-defined]

            # Event 2: SessionLifecycleEvent -> "session_created" (USER_ACTION, SUCCESS)
            e1 = events[1]
            assert (e1.event_action, e1.event_category, e1.event_status, e1.actor_id) == (
                "session_created",
                EventCategory.USER_ACTION,
                EventStatus.SUCCESS,
                user.id,
            )
            assert isinstance(e1.structured_data, AuditContextData)
            assert (
                e1.structured_data.lifecycle_action,  # type: ignore[attr-defined]
                e1.structured_data.jti,  # type: ignore[attr-defined]
                e1.structured_data.idp,  # type: ignore[attr-defined]
            ) == ("create", "jti-123", "TestProvider")

            # Event 3: LoginAttemptEvent -> "login" (USER_ACTION, SUCCESS, method=OIDC)
            e2 = events[2]
            assert (e2.event_action, e2.event_category, e2.event_status, e2.actor_id) == (
                "login",
                EventCategory.USER_ACTION,
                EventStatus.SUCCESS,
                user.id,
            )
            assert isinstance(e2.structured_data, AuditContextData)
            assert (
                e2.structured_data.method,  # type: ignore[attr-defined]
                e2.actor_username,
            ) == ("oidc", "testuser")

            # Event 4: @track_event "oidc_callback" (SECURITY_EVENT, SUCCESS)
            e3 = events[3]
            assert (e3.event_action, e3.event_category, e3.event_status) == (
                "oidc_callback",
                EventCategory.SECURITY_EVENT,
                EventStatus.SUCCESS,
            )
        finally:
            AuditEventDispatcher.reset()
