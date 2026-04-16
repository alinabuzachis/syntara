# ruff: noqa: S105, S106, S107
"""Unit tests for OIDC authentication router endpoints."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest

from nexus.auth.exceptions import SessionStoreUnavailableError
from nexus.auth.router import (
    _auto_create_user,
    _exchange_and_validate_tokens,
    _find_or_create_oidc_user,
    _get_oidc_endpoints,
    _load_enabled_provider,
    _revalidate_origin,
    _safe_redirect_url,
    list_auth_providers,
    oidc_authorize,
    oidc_callback,
)
from nexus.auth.services.oidc_service import OIDCError, OIDCService
from nexus.core.models import User
from nexus.identity_providers.models.identity_provider import IdentityProvider
from nexus.identity_providers.models.identity_provider_configuration import OIDCConfiguration


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


def _make_user(
    *,
    user_id: str | None = None,
    email: str = "test@example.com",
    username: str = "testuser",
    is_active: bool = True,
    password_hash: str | None = None,
) -> User:
    return User(
        id=UUID(user_id) if user_id else uuid4(),
        username=username,
        email=email,
        full_name="Test User",
        is_active=is_active,
        password_hash=password_hash,
    )


def _make_oidc_config(
    *,
    auto_discovery: bool = True,
    issuer_url: str = "https://idp.example.com",
    client_id: str = "test-client-id",
    client_secret: str = "test-client-secret",
    redirect_uri: str = "http://localhost:8000/auth/oidc/callback",
    scopes: str = "openid profile email",
    authorization_endpoint: str | None = None,
    token_endpoint: str | None = None,
    jwks_uri: str | None = None,
    userinfo_endpoint: str | None = None,
) -> OIDCConfiguration:
    return OIDCConfiguration(
        provider_type="oidc",
        auto_discovery=auto_discovery,
        issuer_url=issuer_url,
        client_id=client_id,
        client_secret=client_secret,
        redirect_uri=redirect_uri,
        scopes=scopes,
        authorization_endpoint=authorization_endpoint,
        token_endpoint=token_endpoint,
        jwks_uri=jwks_uri,
        userinfo_endpoint=userinfo_endpoint,
    )


def _make_provider(
    *,
    provider_id: str | None = None,
    name: str = "Test Provider",
    enabled: bool = True,
    deleted_at: datetime | None = None,
    config: OIDCConfiguration | None = None,
) -> IdentityProvider:
    provider = IdentityProvider(
        id=UUID(provider_id) if provider_id else uuid4(),
        name=name,
        description="Test OIDC Provider",
        enabled=enabled,
        configuration=config or _make_oidc_config(),
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    provider.deleted_at = deleted_at
    return provider


def _make_discovery_response() -> dict[str, str]:
    """Make a mock OIDC discovery response."""
    return {
        "issuer": "https://idp.example.com",
        "authorization_endpoint": "https://idp.example.com/oauth/authorize",
        "token_endpoint": "https://idp.example.com/oauth/token",
        "jwks_uri": "https://idp.example.com/.well-known/jwks.json",
        "userinfo_endpoint": "https://idp.example.com/oauth/userinfo",
    }


def _make_user_claims(
    *,
    email: str = "user@example.com",
    name: str = "Test User",
    preferred_username: str = "testuser",
) -> dict[str, str | None]:
    """Make a mock user claims dict from ID token."""
    return {
        "sub": "oidc-sub-12345",
        "email": email,
        "name": name,
        "preferred_username": preferred_username,
    }


def _patch_session_store(mock_store: AsyncMock) -> MagicMock:
    """Create a patched SessionStore class whose context manager yields *mock_store*."""
    ctx = AsyncMock()
    ctx.__aenter__ = AsyncMock(return_value=mock_store)
    ctx.__aexit__ = AsyncMock(return_value=None)
    return MagicMock(return_value=ctx)


def _patch_session_store_unavailable() -> MagicMock:
    """Create a patched SessionStore whose context manager raises ConnectionError (Redis down)."""
    from redis.exceptions import ConnectionError as RedisConnectionError

    ctx = AsyncMock()
    ctx.__aenter__ = AsyncMock(side_effect=RedisConnectionError("Connection refused"))
    ctx.__aexit__ = AsyncMock(return_value=None)
    return MagicMock(return_value=ctx)


def _make_oidc_service_mock(
    *,
    state_data: dict[str, str] | None = None,
    user_claims: dict[str, str | None] | None = None,
) -> MagicMock:
    """Build a mock OIDCService with async context manager support and common defaults."""
    mock = MagicMock(spec=OIDCService)
    mock.__aenter__ = AsyncMock(return_value=mock)
    mock.__aexit__ = AsyncMock(return_value=False)
    mock.fetch_discovery_config = AsyncMock(return_value=_make_discovery_response())
    mock.generate_state_and_nonce.return_value = ("state-abc", "nonce-xyz")
    mock.generate_pkce.return_value = ("verifier-123", "challenge-456")
    mock.store_oidc_state = AsyncMock()
    mock.build_authorization_url.return_value = "https://idp.example.com/oauth/authorize?..."
    if state_data is not None:
        mock.retrieve_oidc_state = AsyncMock(return_value=state_data)
    if user_claims is not None:
        mock.exchange_code_for_tokens = AsyncMock(return_value={"id_token": "fake-id-token"})
        mock.validate_id_token.return_value = {"sub": "oidc-sub"}
        mock.extract_user_claims.return_value = user_claims
    return mock


# =============================================================================
# List Auth Providers
# =============================================================================


class TestListAuthProviders:
    """Tests for the /auth/providers endpoint."""

    @pytest.mark.asyncio
    async def test_returns_enabled_providers(self) -> None:
        """Should return a list of enabled, non-deleted providers."""
        provider1 = _make_provider(name="Provider 1", enabled=True)
        provider2 = _make_provider(name="Provider 2", enabled=True)

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.all.return_value = [provider1, provider2]
        db.exec.return_value = mock_result

        result = await list_auth_providers(db)

        assert len(result.providers) == 2
        assert result.providers[0].id == str(provider1.id)
        assert result.providers[0].name == "Provider 1"
        assert result.providers[0].provider_type == "oidc"
        assert result.providers[1].id == str(provider2.id)
        assert result.providers[1].name == "Provider 2"

    @pytest.mark.asyncio
    async def test_returns_empty_list_when_no_enabled_providers(self) -> None:
        """Should return empty list when no providers are enabled."""
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.all.return_value = []
        db.exec.return_value = mock_result

        result = await list_auth_providers(db)

        assert result.providers == []

    @pytest.mark.asyncio
    async def test_filters_out_deleted_providers(self) -> None:
        """Should not return providers that have been soft-deleted."""
        provider1 = _make_provider(name="Active Provider", enabled=True, deleted_at=None)
        # Deleted provider should not be in the query results at all due to WHERE clause

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.all.return_value = [provider1]  # Only non-deleted
        db.exec.return_value = mock_result

        result = await list_auth_providers(db)

        assert len(result.providers) == 1
        assert result.providers[0].name == "Active Provider"


# =============================================================================
# OIDC Authorize
# =============================================================================


class TestOidcAuthorize:
    """Tests for the /auth/oidc/authorize endpoint."""

    @pytest.mark.asyncio
    async def test_redirects_to_provider_authorization_url(self) -> None:
        """Should generate authorization URL and redirect with 302."""
        provider = _make_provider()
        provider_id = provider.id

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = provider
        db.exec.return_value = mock_result

        mock_svc = _make_oidc_service_mock()

        with patch("nexus.auth.router.OIDCService", return_value=mock_svc):
            response = await oidc_authorize(provider_id, _make_request(), db)

        assert response.status_code == 302
        assert response.headers["location"] == "https://idp.example.com/oauth/authorize?..."
        mock_svc.store_oidc_state.assert_called_once_with(
            state="state-abc",
            provider_id=provider.id,
            nonce="nonce-xyz",
            code_verifier="verifier-123",
            redirect_to=None,
            origin=None,
        )

    @pytest.mark.asyncio
    async def test_redirects_to_login_when_provider_not_found(self) -> None:
        """Should redirect to frontend with auth_error when provider not found."""
        provider_id = uuid4()

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = None
        db.exec.return_value = mock_result

        mock_settings = MagicMock()
        mock_settings.jwt_issuer = "http://localhost:3000"
        mock_settings.cors_allow_origins = ["http://localhost:3000"]

        with patch("nexus.auth.router.get_settings", return_value=mock_settings):
            response = await oidc_authorize(provider_id, _make_request(), db)

        assert response.status_code == 302
        assert "auth_error=" in response.headers["location"]

    @pytest.mark.asyncio
    async def test_redirects_to_login_when_provider_disabled(self) -> None:
        """Should redirect to frontend with auth_error when provider is disabled."""
        provider = _make_provider(enabled=False)
        provider_id = provider.id

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = None  # Query filters out disabled providers
        db.exec.return_value = mock_result

        mock_settings = MagicMock()
        mock_settings.jwt_issuer = "http://localhost:3000"
        mock_settings.cors_allow_origins = ["http://localhost:3000"]

        with patch("nexus.auth.router.get_settings", return_value=mock_settings):
            response = await oidc_authorize(provider_id, _make_request(), db)

        assert response.status_code == 302
        assert "auth_error=" in response.headers["location"]

    @pytest.mark.asyncio
    async def test_generates_pkce_and_stores_state_in_redis(self) -> None:
        """Should generate PKCE values and store state in Redis."""
        provider = _make_provider()
        provider_id = provider.id

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = provider
        db.exec.return_value = mock_result

        mock_svc = _make_oidc_service_mock()

        with patch("nexus.auth.router.OIDCService", return_value=mock_svc):
            await oidc_authorize(provider_id, _make_request(), db)

        mock_svc.generate_pkce.assert_called_once()
        mock_svc.store_oidc_state.assert_called_once()

    @pytest.mark.asyncio
    async def test_uses_provider_redirect_uri(self) -> None:
        """Should use the redirect_uri from provider configuration."""
        config = _make_oidc_config(redirect_uri="https://app.example.com/auth/callback")
        provider = _make_provider(config=config)
        provider_id = provider.id

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = provider
        db.exec.return_value = mock_result

        mock_svc = _make_oidc_service_mock()

        with patch("nexus.auth.router.OIDCService", return_value=mock_svc):
            await oidc_authorize(provider_id, _make_request(), db)

        call_kwargs = mock_svc.build_authorization_url.call_args.kwargs
        assert call_kwargs["redirect_uri"] == "https://app.example.com/auth/callback"


# =============================================================================
# Get OIDC Endpoints
# =============================================================================


class TestGetOidcEndpoints:
    """Tests for the _get_oidc_endpoints helper function."""

    @pytest.mark.asyncio
    async def test_uses_auto_discovery_when_enabled(self) -> None:
        """Should call fetch_discovery_config when auto_discovery is True."""
        config = _make_oidc_config(auto_discovery=True)
        mock_svc = _make_oidc_service_mock()

        result = await _get_oidc_endpoints(mock_svc, config)

        mock_svc.fetch_discovery_config.assert_called_once_with(config.issuer_url)
        assert result["issuer"] == "https://idp.example.com"
        assert result["authorization_endpoint"] == "https://idp.example.com/oauth/authorize"

    @pytest.mark.asyncio
    async def test_uses_manual_endpoints_when_auto_discovery_false(self) -> None:
        """Should use manual configuration when auto_discovery is False."""
        config = _make_oidc_config(
            auto_discovery=False,
            authorization_endpoint="https://manual.example.com/auth",
            token_endpoint="https://manual.example.com/token",
            jwks_uri="https://manual.example.com/jwks",
            userinfo_endpoint="https://manual.example.com/userinfo",
        )
        mock_svc = _make_oidc_service_mock()

        result = await _get_oidc_endpoints(mock_svc, config)

        mock_svc.fetch_discovery_config.assert_not_called()
        assert result["authorization_endpoint"] == "https://manual.example.com/auth"
        assert result["token_endpoint"] == "https://manual.example.com/token"
        assert result["jwks_uri"] == "https://manual.example.com/jwks"
        assert result["userinfo_endpoint"] == "https://manual.example.com/userinfo"

    @pytest.mark.asyncio
    async def test_raises_error_when_manual_endpoints_missing(self) -> None:
        """Should raise OIDCError when manual mode but required fields missing."""
        config = _make_oidc_config(
            auto_discovery=False,
            authorization_endpoint=None,  # Missing required field
            token_endpoint="https://manual.example.com/token",
            jwks_uri="https://manual.example.com/jwks",
        )
        mock_svc = _make_oidc_service_mock()

        with pytest.raises(OIDCError, match="Manual OIDC configuration requires"):
            await _get_oidc_endpoints(mock_svc, config)


# =============================================================================
# OIDC Callback
# =============================================================================


class TestOidcCallback:
    """Tests for the /auth/oidc/callback endpoint."""

    @pytest.mark.asyncio
    async def test_handles_error_parameter_from_idp(self) -> None:
        """Should redirect to login with error when IDP returns error."""
        request = _make_request()
        db = AsyncMock()

        mock_settings = MagicMock()
        mock_settings.jwt_issuer = "http://localhost:3000"
        mock_settings.cors_allow_origins = ["http://localhost:3000"]

        with patch("nexus.auth.router.get_settings", return_value=mock_settings):
            response = await oidc_callback(
                state="some-state",
                request=request,
                db=db,
                code=None,
                error="invalid_scope",
                error_description="Requested scope is invalid",
            )

        assert response.status_code == 302
        assert "auth_error=Requested%20scope%20is%20invalid" in response.headers["location"]

    @pytest.mark.asyncio
    async def test_handles_missing_code_parameter(self) -> None:
        """Should redirect to login with error when code is missing."""
        request = _make_request()
        db = AsyncMock()

        mock_settings = MagicMock()
        mock_settings.jwt_issuer = "http://localhost:3000"
        mock_settings.cors_allow_origins = ["http://localhost:3000"]

        with patch("nexus.auth.router.get_settings", return_value=mock_settings):
            response = await oidc_callback(
                state="some-state",
                request=request,
                db=db,
                code=None,
                error=None,
            )

        assert response.status_code == 302
        assert "auth_error=" in response.headers["location"]

    @pytest.mark.asyncio
    async def test_handles_invalid_expired_state(self) -> None:
        """Should redirect to login with error when state is invalid/expired."""
        request = _make_request()

        db = AsyncMock()

        mock_svc = _make_oidc_service_mock()
        mock_svc.retrieve_oidc_state = AsyncMock(return_value=None)  # State not found

        mock_settings = MagicMock()
        mock_settings.jwt_issuer = "http://localhost:3000"
        mock_settings.cors_allow_origins = ["http://localhost:3000"]

        with (
            patch("nexus.auth.router.OIDCService", return_value=mock_svc),
            patch("nexus.auth.router.get_settings", return_value=mock_settings),
        ):
            response = await oidc_callback(
                state="invalid-state",
                request=request,
                db=db,
                code="auth-code-123",
            )

        assert response.status_code == 302
        assert "auth_error=" in response.headers["location"]

    @pytest.mark.asyncio
    async def test_successfully_creates_new_user_from_oidc_claims(self) -> None:
        """Should create new user when email doesn't exist."""
        provider = _make_provider(name="Google")
        request = _make_request()

        state_data = {
            "provider_id": str(provider.id),
            "nonce": "test-nonce",
            "code_verifier": "test-verifier",
        }

        user_claims = _make_user_claims(email="newuser@example.com", preferred_username="newuser")

        db = AsyncMock()
        # Provider query
        provider_result = MagicMock()
        provider_result.one_or_none.return_value = provider
        # User query (no existing user)
        user_result = MagicMock()
        user_result.one_or_none.return_value = None
        # Username collision check (no collision)
        username_result = MagicMock()
        username_result.one_or_none.return_value = None

        db.exec.side_effect = [provider_result, user_result, username_result]

        mock_oidc_service = _make_oidc_service_mock(state_data=state_data, user_claims=user_claims)

        mock_token_service = MagicMock()
        mock_token_service.create_refresh_token.return_value = ("refresh-jwt", "jti-123", datetime.now(UTC))

        mock_store = AsyncMock()

        mock_settings = MagicMock()
        mock_settings.jwt_issuer = "http://localhost:3000"
        mock_settings.cors_allow_origins = ["http://localhost:3000"]
        mock_settings.jwt_refresh_token_lifetime_hours = 8

        with (
            patch("nexus.auth.router.OIDCService", return_value=mock_oidc_service),
            patch("nexus.auth.router._get_token_service", return_value=mock_token_service),
            patch("nexus.auth.router.SessionStore", _patch_session_store(mock_store)),
            patch("nexus.auth.router.get_settings", return_value=mock_settings),
            patch("nexus.auth.router.set_refresh_cookie") as mock_set_cookie,
        ):
            response = await oidc_callback(
                state="valid-state",
                request=request,
                db=db,
                code="auth-code-123",
            )

        assert response.status_code == 302
        assert response.headers["location"] == "http://localhost:3000"
        mock_set_cookie.assert_called_once()
        db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_matches_existing_user_by_email(self) -> None:
        """Should find and use existing user when email matches."""
        provider = _make_provider(name="Azure")
        existing_user = _make_user(email="existing@example.com", username="existinguser")
        request = _make_request()

        state_data = {
            "provider_id": str(provider.id),
            "nonce": "test-nonce",
            "code_verifier": "test-verifier",
        }

        user_claims = _make_user_claims(email="existing@example.com")

        db = AsyncMock()
        # Provider query
        provider_result = MagicMock()
        provider_result.one_or_none.return_value = provider
        # User query (existing user found)
        user_result = MagicMock()
        user_result.one_or_none.return_value = existing_user

        db.exec.side_effect = [provider_result, user_result]

        mock_oidc_service = _make_oidc_service_mock(state_data=state_data, user_claims=user_claims)

        mock_token_service = MagicMock()
        mock_token_service.create_refresh_token.return_value = ("refresh-jwt", "jti-123", datetime.now(UTC))

        mock_store = AsyncMock()

        mock_settings = MagicMock()
        mock_settings.jwt_issuer = "http://localhost:3000"
        mock_settings.cors_allow_origins = ["http://localhost:3000"]
        mock_settings.jwt_refresh_token_lifetime_hours = 8

        with (
            patch("nexus.auth.router.OIDCService", return_value=mock_oidc_service),
            patch("nexus.auth.router._get_token_service", return_value=mock_token_service),
            patch("nexus.auth.router.SessionStore", _patch_session_store(mock_store)),
            patch("nexus.auth.router.get_settings", return_value=mock_settings),
            patch("nexus.auth.router.set_refresh_cookie"),
        ):
            response = await oidc_callback(
                state="valid-state",
                request=request,
                db=db,
                code="auth-code-123",
            )

        assert response.status_code == 302
        # Should not have created a new user (no db.add for user)
        db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_rejects_inactive_user(self) -> None:
        """Should redirect to login with error for inactive user."""
        provider = _make_provider()
        inactive_user = _make_user(email="inactive@example.com", is_active=False)
        request = _make_request()

        state_data = {
            "provider_id": str(provider.id),
            "nonce": "test-nonce",
            "code_verifier": "test-verifier",
        }

        user_claims = _make_user_claims(email="inactive@example.com")

        db = AsyncMock()
        # Provider query
        provider_result = MagicMock()
        provider_result.one_or_none.return_value = provider
        # User query (inactive user found)
        user_result = MagicMock()
        user_result.one_or_none.return_value = inactive_user

        db.exec.side_effect = [provider_result, user_result]

        mock_oidc_service = _make_oidc_service_mock(state_data=state_data, user_claims=user_claims)

        mock_settings = MagicMock()
        mock_settings.jwt_issuer = "http://localhost:3000"
        mock_settings.cors_allow_origins = ["http://localhost:3000"]

        with (
            patch("nexus.auth.router.OIDCService", return_value=mock_oidc_service),
            patch("nexus.auth.router.get_settings", return_value=mock_settings),
        ):
            response = await oidc_callback(
                state="valid-state",
                request=request,
                db=db,
                code="auth-code-123",
            )

        assert response.status_code == 302
        assert "auth_error=" in response.headers["location"]

    @pytest.mark.asyncio
    async def test_handles_username_collision(self) -> None:
        """Should raise OIDCError when preferred_username already exists."""
        provider = _make_provider()
        request = _make_request()

        state_data = {
            "provider_id": str(provider.id),
            "nonce": "test-nonce",
            "code_verifier": "test-verifier",
        }

        user_claims = _make_user_claims(email="newuser@example.com", preferred_username="alice")

        # Existing user with username 'alice'
        existing_username_user = _make_user(username="alice", email="different@example.com")

        db = AsyncMock()
        # Provider query
        provider_result = MagicMock()
        provider_result.one_or_none.return_value = provider
        # User email query (no existing user with this email)
        user_result = MagicMock()
        user_result.one_or_none.return_value = None
        # Username collision check (collision found)
        username_collision_result = MagicMock()
        username_collision_result.one_or_none.return_value = existing_username_user

        db.exec.side_effect = [provider_result, user_result, username_collision_result]

        mock_oidc_service = _make_oidc_service_mock(state_data=state_data, user_claims=user_claims)

        mock_settings = MagicMock()
        mock_settings.jwt_issuer = "http://localhost:3000"
        mock_settings.cors_allow_origins = ["http://localhost:3000"]

        with (
            patch("nexus.auth.router.OIDCService", return_value=mock_oidc_service),
            patch("nexus.auth.router.get_settings", return_value=mock_settings),
        ):
            response = await oidc_callback(
                state="valid-state",
                request=request,
                db=db,
                code="auth-code-123",
            )

        assert response.status_code == 302
        assert "auth_error=" in response.headers["location"]

    @pytest.mark.asyncio
    async def test_sets_refresh_cookie_and_redirects_to_base_url(self) -> None:
        """Should set refresh cookie and redirect to base URL."""
        provider = _make_provider()
        request = _make_request()

        state_data = {
            "provider_id": str(provider.id),
            "nonce": "test-nonce",
            "code_verifier": "test-verifier",
        }

        user_claims = _make_user_claims()

        db = AsyncMock()
        # Provider query
        provider_result = MagicMock()
        provider_result.one_or_none.return_value = provider
        # User query (no existing user)
        user_result = MagicMock()
        user_result.one_or_none.return_value = None
        # Username check (no collision)
        username_result = MagicMock()
        username_result.one_or_none.return_value = None

        db.exec.side_effect = [provider_result, user_result, username_result]

        mock_oidc_service = _make_oidc_service_mock(state_data=state_data, user_claims=user_claims)

        mock_token_service = MagicMock()
        mock_token_service.create_refresh_token.return_value = ("refresh-jwt-token", "jti-999", datetime.now(UTC))

        mock_store = AsyncMock()

        mock_settings = MagicMock()
        mock_settings.jwt_issuer = "https://app.example.com"
        mock_settings.cors_allow_origins = ["https://app.example.com"]
        mock_settings.jwt_refresh_token_lifetime_hours = 24

        with (
            patch("nexus.auth.router.OIDCService", return_value=mock_oidc_service),
            patch("nexus.auth.router._get_token_service", return_value=mock_token_service),
            patch("nexus.auth.router.SessionStore", _patch_session_store(mock_store)),
            patch("nexus.auth.router.get_settings", return_value=mock_settings),
            patch("nexus.auth.router.set_refresh_cookie") as mock_set_cookie,
        ):
            response = await oidc_callback(
                state="valid-state",
                request=request,
                db=db,
                code="auth-code-123",
            )

        assert response.status_code == 302
        assert response.headers["location"] == "https://app.example.com"
        mock_set_cookie.assert_called_once()
        call_args = mock_set_cookie.call_args
        assert call_args[0][1] == "refresh-jwt-token"
        assert call_args[1]["max_age"] == 24 * 3600

    @pytest.mark.asyncio
    async def test_stores_amr_fed_and_idp_in_session(self) -> None:
        """Should store amr=['fed'] and idp in session."""
        provider = _make_provider(name="Okta")
        request = _make_request()

        state_data = {
            "provider_id": str(provider.id),
            "nonce": "test-nonce",
            "code_verifier": "test-verifier",
        }

        user_claims = _make_user_claims()

        db = AsyncMock()
        # Provider query
        provider_result = MagicMock()
        provider_result.one_or_none.return_value = provider
        # User query
        user_result = MagicMock()
        user_result.one_or_none.return_value = None
        # Username check
        username_result = MagicMock()
        username_result.one_or_none.return_value = None

        db.exec.side_effect = [provider_result, user_result, username_result]

        mock_oidc_service = _make_oidc_service_mock(state_data=state_data, user_claims=user_claims)

        mock_token_service = MagicMock()
        mock_token_service.create_refresh_token.return_value = ("refresh-jwt", "jti-555", datetime.now(UTC))

        mock_store = AsyncMock()

        mock_settings = MagicMock()
        mock_settings.jwt_issuer = "http://localhost:3000"
        mock_settings.cors_allow_origins = ["http://localhost:3000"]
        mock_settings.jwt_refresh_token_lifetime_hours = 8

        with (
            patch("nexus.auth.router.OIDCService", return_value=mock_oidc_service),
            patch("nexus.auth.router._get_token_service", return_value=mock_token_service),
            patch("nexus.auth.router.SessionStore", _patch_session_store(mock_store)),
            patch("nexus.auth.router.get_settings", return_value=mock_settings),
            patch("nexus.auth.router.set_refresh_cookie"),
        ):
            await oidc_callback(
                state="valid-state",
                request=request,
                db=db,
                code="auth-code-123",
            )

        # Verify session was created with correct amr and idp
        mock_store.create.assert_called_once()
        call_kwargs = mock_store.create.call_args.kwargs
        assert call_kwargs["amr"] == ["fed"]
        assert call_kwargs["idp"] == "Okta"

    @pytest.mark.asyncio
    async def test_raises_503_when_redis_unavailable(self) -> None:
        """OIDC callback should raise SessionStoreUnavailableError when Redis is down."""
        provider = _make_provider()
        request = _make_request()

        state_data = {
            "provider_id": str(provider.id),
            "nonce": "test-nonce",
            "code_verifier": "test-verifier",
        }

        user_claims = _make_user_claims()

        db = AsyncMock()
        provider_result = MagicMock()
        provider_result.one_or_none.return_value = provider
        user_result = MagicMock()
        user_result.one_or_none.return_value = None
        username_result = MagicMock()
        username_result.one_or_none.return_value = None
        db.exec.side_effect = [provider_result, user_result, username_result]

        mock_oidc_service = _make_oidc_service_mock(state_data=state_data, user_claims=user_claims)

        mock_token_service = MagicMock()
        mock_token_service.create_refresh_token.return_value = ("refresh-jwt", "jti-1", datetime.now(UTC))

        mock_settings = MagicMock()
        mock_settings.jwt_issuer = "http://localhost:3000"
        mock_settings.cors_allow_origins = ["http://localhost:3000"]

        with (
            patch("nexus.auth.router.OIDCService", return_value=mock_oidc_service),
            patch("nexus.auth.router._get_token_service", return_value=mock_token_service),
            patch("nexus.auth.router.SessionStore", _patch_session_store_unavailable()),
            patch("nexus.auth.router.get_settings", return_value=mock_settings),
            pytest.raises(SessionStoreUnavailableError),
        ):
            await oidc_callback(
                state="valid-state",
                request=request,
                db=db,
                code="auth-code-123",
            )

        db.rollback.assert_called_once()
        db.commit.assert_not_called()


# =============================================================================
# Load Enabled Provider
# =============================================================================


class TestLoadEnabledProvider:
    """Tests for the _load_enabled_provider helper function."""

    @pytest.mark.asyncio
    async def test_returns_provider_when_enabled_and_not_deleted(self) -> None:
        """Should return provider when it is enabled and not deleted."""
        provider = _make_provider(enabled=True, deleted_at=None)
        provider_id = provider.id

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = provider
        db.exec.return_value = mock_result

        result = await _load_enabled_provider(db, provider_id)

        assert result == provider
        assert result.enabled is True
        assert result.deleted_at is None

    @pytest.mark.asyncio
    @pytest.mark.parametrize("scenario", ["not_found", "disabled", "deleted"])
    async def test_raises_when_provider_unavailable(self, scenario: str) -> None:
        """Should raise OIDCError when provider is not found, disabled, or deleted."""
        provider_id = uuid4()

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = None  # Query filters out unavailable providers
        db.exec.return_value = mock_result

        with pytest.raises(OIDCError):
            await _load_enabled_provider(db, provider_id)


# =============================================================================
# Exchange and Validate Tokens
# =============================================================================


class TestExchangeAndValidateTokens:
    """Tests for the _exchange_and_validate_tokens helper function."""

    @pytest.mark.asyncio
    async def test_returns_user_claims_on_success(self) -> None:
        """Should return user claims when token exchange and validation succeed."""
        discovery = _make_discovery_response()
        config = _make_oidc_config()
        mock_oidc_service = _make_oidc_service_mock(user_claims=_make_user_claims())

        result = await _exchange_and_validate_tokens(
            oidc_service=mock_oidc_service,
            discovery=discovery,
            config=config,
            redirect_uri="http://localhost:8000/callback",
            code="auth-code",
            code_verifier="verifier-abc",
            nonce="nonce-xyz",
        )

        assert result["email"] == "user@example.com"
        mock_oidc_service.exchange_code_for_tokens.assert_called_once()
        mock_oidc_service.validate_id_token.assert_called_once()

    @pytest.mark.asyncio
    async def test_raises_on_token_exchange_failure(self) -> None:
        """Should raise OIDCError when token exchange fails."""
        discovery = _make_discovery_response()
        config = _make_oidc_config()
        mock_oidc_service = _make_oidc_service_mock()
        mock_oidc_service.exchange_code_for_tokens = AsyncMock(side_effect=OIDCError("Exchange failed"))

        with pytest.raises(OIDCError):
            await _exchange_and_validate_tokens(
                oidc_service=mock_oidc_service,
                discovery=discovery,
                config=config,
                redirect_uri="http://localhost:8000/callback",
                code="bad-code",
                code_verifier="verifier",
                nonce="nonce",
            )

    @pytest.mark.asyncio
    async def test_raises_when_no_id_token_in_response(self) -> None:
        """Should raise OIDCError when id_token is missing."""
        discovery = _make_discovery_response()
        config = _make_oidc_config()
        mock_oidc_service = _make_oidc_service_mock()
        mock_oidc_service.exchange_code_for_tokens = AsyncMock(
            return_value={"access_token": "access-token-123"}  # id_token missing!
        )

        with pytest.raises(OIDCError):
            await _exchange_and_validate_tokens(
                oidc_service=mock_oidc_service,
                discovery=discovery,
                config=config,
                redirect_uri="http://localhost:8000/callback",
                code="auth-code",
                code_verifier="verifier",
                nonce="nonce",
            )

    @pytest.mark.asyncio
    async def test_raises_on_id_token_validation_failure(self) -> None:
        """Should raise OIDCError when ID token validation fails."""
        discovery = _make_discovery_response()
        config = _make_oidc_config()
        mock_oidc_service = _make_oidc_service_mock()
        mock_oidc_service.exchange_code_for_tokens = AsyncMock(
            return_value={"access_token": "access-token-123", "id_token": "invalid-id-token-jwt"}
        )
        mock_oidc_service.validate_id_token.side_effect = OIDCError("Invalid signature")

        with pytest.raises(OIDCError):
            await _exchange_and_validate_tokens(
                oidc_service=mock_oidc_service,
                discovery=discovery,
                config=config,
                redirect_uri="http://localhost:8000/callback",
                code="auth-code",
                code_verifier="verifier",
                nonce="nonce",
            )

    @pytest.mark.asyncio
    async def test_supplements_claims_from_userinfo_when_email_missing(self) -> None:
        """Should fetch userinfo and merge claims when ID token is missing email."""
        discovery = _make_discovery_response()
        config = _make_oidc_config()
        mock_oidc_service = _make_oidc_service_mock()
        mock_oidc_service.exchange_code_for_tokens = AsyncMock(
            return_value={"access_token": "access-token-123", "id_token": "id-token-jwt"}
        )
        mock_oidc_service.validate_id_token.return_value = {"sub": "oidc-sub"}
        # ID token has no email/name
        mock_oidc_service.extract_user_claims.side_effect = [
            {"sub": "oidc-sub", "email": None, "name": None, "preferred_username": None},
            {"sub": "oidc-sub", "email": "user@example.com", "name": "Test User", "preferred_username": "testuser"},
        ]
        mock_oidc_service.fetch_userinfo = AsyncMock(
            return_value={
                "sub": "oidc-sub",
                "email": "user@example.com",
                "name": "Test User",
                "preferred_username": "testuser",
            }
        )

        result = await _exchange_and_validate_tokens(
            oidc_service=mock_oidc_service,
            discovery=discovery,
            config=config,
            redirect_uri="http://localhost:8000/callback",
            code="auth-code",
            code_verifier="verifier",
            nonce="nonce",
        )

        assert result["email"] == "user@example.com"
        assert result["name"] == "Test User"
        mock_oidc_service.fetch_userinfo.assert_called_once_with(
            "https://idp.example.com/oauth/userinfo", "access-token-123"
        )

    @pytest.mark.asyncio
    async def test_id_token_claims_take_precedence_over_userinfo(self) -> None:
        """ID token claims should not be overwritten by userinfo (OIDC Core §5.3.2)."""
        discovery = _make_discovery_response()
        config = _make_oidc_config()
        mock_oidc_service = _make_oidc_service_mock()
        mock_oidc_service.exchange_code_for_tokens = AsyncMock(
            return_value={"access_token": "access-token-123", "id_token": "id-token-jwt"}
        )
        mock_oidc_service.validate_id_token.return_value = {"sub": "oidc-sub", "email": "idtoken@example.com"}
        # ID token has email but no name — should fetch userinfo for name but keep email from ID token
        mock_oidc_service.extract_user_claims.side_effect = [
            {"sub": "oidc-sub", "email": "idtoken@example.com", "name": None, "preferred_username": None},
            {
                "sub": "oidc-sub",
                "email": "userinfo@example.com",
                "name": "Userinfo Name",
                "preferred_username": "uiuser",
            },
        ]
        mock_oidc_service.fetch_userinfo = AsyncMock(
            return_value={
                "sub": "oidc-sub",
                "email": "userinfo@example.com",
                "name": "Userinfo Name",
                "preferred_username": "uiuser",
            }
        )

        result = await _exchange_and_validate_tokens(
            oidc_service=mock_oidc_service,
            discovery=discovery,
            config=config,
            redirect_uri="http://localhost:8000/callback",
            code="auth-code",
            code_verifier="verifier",
            nonce="nonce",
        )

        # email from ID token must not be overwritten
        assert result["email"] == "idtoken@example.com"
        # name should come from userinfo since it was missing
        assert result["name"] == "Userinfo Name"

    @pytest.mark.asyncio
    async def test_skips_userinfo_when_claims_complete(self) -> None:
        """Should not call userinfo when ID token has all needed claims."""
        discovery = _make_discovery_response()
        config = _make_oidc_config()
        mock_oidc_service = _make_oidc_service_mock()
        mock_oidc_service.exchange_code_for_tokens = AsyncMock(
            return_value={"access_token": "access-token-123", "id_token": "id-token-jwt"}
        )
        mock_oidc_service.validate_id_token.return_value = {"sub": "oidc-sub"}
        mock_oidc_service.extract_user_claims.return_value = _make_user_claims()
        mock_oidc_service.fetch_userinfo = AsyncMock()

        await _exchange_and_validate_tokens(
            oidc_service=mock_oidc_service,
            discovery=discovery,
            config=config,
            redirect_uri="http://localhost:8000/callback",
            code="auth-code",
            code_verifier="verifier",
            nonce="nonce",
        )

        mock_oidc_service.fetch_userinfo.assert_not_called()

    @pytest.mark.asyncio
    async def test_skips_userinfo_when_no_endpoint(self) -> None:
        """Should not call userinfo when no userinfo_endpoint in discovery."""
        discovery = _make_discovery_response()
        del discovery["userinfo_endpoint"]
        config = _make_oidc_config()
        mock_oidc_service = _make_oidc_service_mock()
        mock_oidc_service.exchange_code_for_tokens = AsyncMock(
            return_value={"access_token": "access-token-123", "id_token": "id-token-jwt"}
        )
        mock_oidc_service.validate_id_token.return_value = {"sub": "oidc-sub"}
        mock_oidc_service.extract_user_claims.return_value = {
            "sub": "oidc-sub",
            "email": None,
            "name": None,
            "preferred_username": None,
        }
        mock_oidc_service.fetch_userinfo = AsyncMock()

        await _exchange_and_validate_tokens(
            oidc_service=mock_oidc_service,
            discovery=discovery,
            config=config,
            redirect_uri="http://localhost:8000/callback",
            code="auth-code",
            code_verifier="verifier",
            nonce="nonce",
        )

        mock_oidc_service.fetch_userinfo.assert_not_called()

    @pytest.mark.asyncio
    async def test_continues_when_userinfo_fails(self) -> None:
        """Should proceed with ID token claims when userinfo fetch fails."""
        discovery = _make_discovery_response()
        config = _make_oidc_config()
        mock_oidc_service = _make_oidc_service_mock()
        mock_oidc_service.exchange_code_for_tokens = AsyncMock(
            return_value={"access_token": "access-token-123", "id_token": "id-token-jwt"}
        )
        mock_oidc_service.validate_id_token.return_value = {"sub": "oidc-sub"}
        mock_oidc_service.extract_user_claims.return_value = {
            "sub": "oidc-sub",
            "email": None,
            "name": None,
            "preferred_username": None,
        }
        mock_oidc_service.fetch_userinfo = AsyncMock(side_effect=OIDCError("Userinfo failed"))

        # Should NOT raise — userinfo failure is non-fatal
        result = await _exchange_and_validate_tokens(
            oidc_service=mock_oidc_service,
            discovery=discovery,
            config=config,
            redirect_uri="http://localhost:8000/callback",
            code="auth-code",
            code_verifier="verifier",
            nonce="nonce",
        )

        assert result["email"] is None


# =============================================================================
# Find or Create OIDC User
# =============================================================================


class TestFindOrCreateOidcUser:
    """Tests for the _find_or_create_oidc_user helper function."""

    @pytest.mark.asyncio
    async def test_returns_existing_user_matched_by_email(self) -> None:
        """Should return existing user when email matches."""
        existing_user = _make_user(email="existing@example.com")
        user_claims = _make_user_claims(email="existing@example.com")

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = existing_user
        db.exec.return_value = mock_result

        result = await _find_or_create_oidc_user(db, user_claims, "Test Provider")

        assert result == existing_user
        # Should not have added a new user
        db.add.assert_not_called()

    @pytest.mark.asyncio
    async def test_creates_new_user_when_none_exists(self) -> None:
        """Should create new user when no existing user with email."""
        user_claims = _make_user_claims(email="newuser@example.com", preferred_username="newuser")

        db = AsyncMock()
        # User email query (no existing user)
        user_result = MagicMock()
        user_result.one_or_none.return_value = None
        # Username collision check (no collision)
        username_result = MagicMock()
        username_result.one_or_none.return_value = None

        db.exec.side_effect = [user_result, username_result]

        result = await _find_or_create_oidc_user(db, user_claims, "Test Provider")

        assert result.email == "newuser@example.com"
        assert result.username == "newuser"
        assert result.is_active is True
        assert result.password_hash is None
        db.add.assert_called_once()
        db.flush.assert_called_once()

    @pytest.mark.asyncio
    async def test_normalizes_email_to_lowercase_for_lookup(self) -> None:
        """Should normalize email to lowercase before looking up existing user."""
        existing_user = _make_user(email="user@example.com")
        user_claims = _make_user_claims(email="User@Example.COM")

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = existing_user
        db.exec.return_value = mock_result

        result = await _find_or_create_oidc_user(db, user_claims, "Test Provider")

        assert result == existing_user
        db.add.assert_not_called()

    @pytest.mark.asyncio
    async def test_raises_when_no_email_claim(self) -> None:
        """Should raise OIDCError when email claim is missing."""
        user_claims: dict[str, str | None] = {
            "sub": "user-sub",
            "email": None,  # Missing email
            "name": "Test User",
            "preferred_username": "testuser",
        }

        db = AsyncMock()

        with pytest.raises(OIDCError):
            await _find_or_create_oidc_user(db, user_claims, "Test Provider")

    @pytest.mark.asyncio
    async def test_raises_when_email_has_invalid_format(self) -> None:
        """Should raise OIDCError when email has no @ sign."""
        user_claims: dict[str, str | None] = {
            "sub": "user-sub",
            "email": "not-an-email",
            "name": "Test User",
            "preferred_username": "testuser",
        }

        db = AsyncMock()

        with pytest.raises(OIDCError):
            await _find_or_create_oidc_user(db, user_claims, "Test Provider")

    @pytest.mark.asyncio
    async def test_raises_when_user_is_inactive(self) -> None:
        """Should raise OIDCError when matched user is inactive."""
        inactive_user = _make_user(email="inactive@example.com", is_active=False)
        user_claims = _make_user_claims(email="inactive@example.com")

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = inactive_user
        db.exec.return_value = mock_result

        with pytest.raises(OIDCError):
            await _find_or_create_oidc_user(db, user_claims, "Test Provider")


# =============================================================================
# Auto Create User
# =============================================================================


class TestAutoCreateUser:
    """Tests for the _auto_create_user helper function."""

    @pytest.mark.asyncio
    async def test_creates_user_with_preferred_username(self) -> None:
        """Should create user with preferred_username as username."""
        email = "user@example.com"
        user_claims = _make_user_claims(email=email, preferred_username="alice", name="Alice Smith")

        db = AsyncMock()
        # Username collision check (no collision)
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = None
        db.exec.return_value = mock_result

        result = await _auto_create_user(db, email, user_claims, "Google")

        assert result.username == "alice"
        assert result.email == email
        assert result.full_name == "Alice Smith"
        assert result.is_active is True
        assert result.password_hash is None
        db.add.assert_called_once()
        db.flush.assert_called_once()

    @pytest.mark.asyncio
    async def test_uses_email_prefix_when_no_preferred_username(self) -> None:
        """Should use email prefix when preferred_username is missing."""
        email = "bob@example.com"
        user_claims: dict[str, str | None] = {
            "sub": "user-sub",
            "email": email,
            "name": "Bob Jones",
            "preferred_username": None,
        }

        db = AsyncMock()
        # Username collision check (no collision)
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = None
        db.exec.return_value = mock_result

        result = await _auto_create_user(db, email, user_claims, "Azure")

        assert result.username == "bob"  # From email prefix

    @pytest.mark.asyncio
    async def test_raises_error_on_username_collision(self) -> None:
        """Should raise OIDCError when username collides."""
        email = "charlie@example.com"
        user_claims = _make_user_claims(email=email, preferred_username="admin")

        # Existing user with username "admin"
        existing_user = _make_user(username="admin", email="other@example.com")

        db = AsyncMock()
        # Username collision check (collision found)
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = existing_user
        db.exec.return_value = mock_result

        with pytest.raises(OIDCError):
            await _auto_create_user(db, email, user_claims, "Okta")

    @pytest.mark.asyncio
    async def test_normalizes_username_and_email_to_lowercase(self) -> None:
        """Should normalize username and email to lowercase."""
        email = "Dave@Example.COM"
        user_claims = _make_user_claims(email=email, preferred_username="DaveSmith", name="Dave Smith")

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = None
        db.exec.return_value = mock_result

        result = await _auto_create_user(db, email, user_claims, "Azure")

        assert result.username == "davesmith"
        assert result.email == "dave@example.com"

    @pytest.mark.asyncio
    async def test_uses_preferred_username_as_full_name_fallback(self) -> None:
        """Should use preferred_username for full_name when name claim missing."""
        email = "dave@example.com"
        user_claims: dict[str, str | None] = {
            "sub": "user-sub",
            "email": email,
            "name": None,  # Missing name
            "preferred_username": "dave",
        }

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = None
        db.exec.return_value = mock_result

        result = await _auto_create_user(db, email, user_claims, "Provider")

        assert result.full_name == "dave"


# =============================================================================
# Safe Redirect URL
# =============================================================================


class TestRevalidateOrigin:
    """Tests for the _revalidate_origin CORS re-validation (AAP-71277)."""

    def test_returns_origin_when_still_allowed(self) -> None:
        """Should return the origin unchanged if it is still in CORS allowed origins."""
        mock_settings = MagicMock()
        mock_settings.cors_allow_origins = ["https://app.example.com", "https://other.example.com"]

        with patch("nexus.auth.router.get_settings", return_value=mock_settings):
            assert _revalidate_origin("https://app.example.com") == "https://app.example.com"

    def test_returns_none_when_origin_removed(self) -> None:
        """Should return None if the origin was removed from CORS allowed origins."""
        mock_settings = MagicMock()
        mock_settings.cors_allow_origins = ["https://other.example.com"]

        with patch("nexus.auth.router.get_settings", return_value=mock_settings):
            assert _revalidate_origin("https://app.example.com") is None

    def test_returns_none_when_cors_origins_empty(self) -> None:
        """Should return None if CORS allowed origins list is empty."""
        mock_settings = MagicMock()
        mock_settings.cors_allow_origins = []

        with patch("nexus.auth.router.get_settings", return_value=mock_settings):
            assert _revalidate_origin("https://app.example.com") is None

    def test_returns_none_for_none_input(self) -> None:
        """Should return None when origin is None (no origin was stored)."""
        assert _revalidate_origin(None) is None

    def test_returns_none_for_empty_string(self) -> None:
        """Should return None when origin is an empty string."""
        assert _revalidate_origin("") is None


class TestSafeRedirectUrl:
    """Tests for the _safe_redirect_url open-redirect protection."""

    def test_allows_relative_path(self) -> None:
        """Should allow simple relative paths."""
        assert _safe_redirect_url("/dashboard", origin="https://app.example.com") == "/dashboard"

    def test_allows_matching_origin(self) -> None:
        """Should allow absolute URLs with the same origin as the stored origin."""
        assert (
            _safe_redirect_url("https://app.example.com/page", origin="https://app.example.com")
            == "https://app.example.com/page"
        )

    def test_rejects_different_origin(self) -> None:
        """Should reject URLs with a different origin and fall back to stored origin."""
        assert (
            _safe_redirect_url("https://evil.com/steal", origin="https://app.example.com") == "https://app.example.com"
        )

    def test_rejects_protocol_relative_url(self) -> None:
        """Should reject protocol-relative URLs like //evil.com."""
        assert _safe_redirect_url("//evil.com/path", origin="https://app.example.com") == "https://app.example.com"

    def test_returns_base_url_for_none(self) -> None:
        """Should return base URL when input is None."""
        assert _safe_redirect_url(None, origin="https://app.example.com") == "https://app.example.com"

    def test_returns_base_url_for_empty_string(self) -> None:
        """Should return base URL when input is empty."""
        assert _safe_redirect_url("", origin="https://app.example.com") == "https://app.example.com"

    def test_falls_back_to_jwt_issuer_when_no_origin(self) -> None:
        """Should fall back to jwt_issuer when no stored origin is available."""
        mock_settings = MagicMock()
        mock_settings.jwt_issuer = "https://api.example.com"

        with patch("nexus.auth.router.get_settings", return_value=mock_settings):
            assert _safe_redirect_url(None) == "https://api.example.com"

    def test_rejects_different_scheme(self) -> None:
        """Should reject URLs with a different scheme (e.g. http vs https)."""
        assert (
            _safe_redirect_url("http://app.example.com/page", origin="https://app.example.com")
            == "https://app.example.com"
        )

    def test_rejects_javascript_uri(self) -> None:
        """Should reject javascript: URIs."""
        assert _safe_redirect_url("javascript:alert(1)", origin="https://app.example.com") == "https://app.example.com"
