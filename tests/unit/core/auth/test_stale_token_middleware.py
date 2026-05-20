"""Unit tests for StaleTokenMiddleware.

Tests cover:
- Pass-through when no Authorization header is present
- X-Token-Stale header set when token_ver < DB version
- No X-Token-Stale header when token_ver >= DB version
- Graceful handling of DB or decode errors
- Disabled user rejection with 401
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import PlainTextResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from nexus.auth.exceptions import InvalidTokenError
from nexus.auth.middleware import StaleTokenMiddleware, _user_status_cache
from nexus.auth.services.token_service import TokenPayload


def _build_app() -> Starlette:
    """Build a minimal Starlette app with the StaleTokenMiddleware."""

    async def homepage(request: Request) -> PlainTextResponse:
        return PlainTextResponse("ok")

    app = Starlette(routes=[Route("/", homepage), Route("/api/v1/auth/logout", homepage, methods=["POST"])])
    app.add_middleware(StaleTokenMiddleware)
    return app


def _make_payload(sub: str = "user-123", token_version: int = 0) -> TokenPayload:
    """Create a TokenPayload for testing."""
    now = datetime.now(UTC)
    return TokenPayload(
        sub=sub,
        iss="nexus",
        iat=now,
        exp=now,
        token_type="access",  # noqa: S106
        token_version=token_version,
    )


def _mock_token_service(payload: TokenPayload | None = None, error: Exception | None = None) -> MagicMock:
    """Create a mock TokenService."""
    mock = MagicMock()
    if error:
        mock.decode_token.side_effect = error
    else:
        mock.decode_token.return_value = payload
    return mock


def _mock_async_session(
    token_version: int | None = None,
    *,
    is_enabled: bool = True,
    error: Exception | None = None,
) -> AsyncMock:
    """Create a mock AsyncSessionLocal context manager that returns a mock session."""
    mock_session = AsyncMock()
    if error:
        mock_session.execute.side_effect = error
    else:
        mock_result = MagicMock()
        if token_version is not None:
            mock_result.one_or_none.return_value = (token_version, is_enabled)
        else:
            mock_result.one_or_none.return_value = None
        mock_session.execute.return_value = mock_result

    # Build the async context manager
    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)
    return mock_ctx


class TestStaleTokenMiddleware:
    """Tests for StaleTokenMiddleware."""

    def setup_method(self) -> None:
        """Clear the TTL cache between tests."""
        _user_status_cache.clear()

    def test_no_auth_header_passes_through(self) -> None:
        """When no Authorization header is present, response passes through unchanged."""
        app = _build_app()

        client = TestClient(app)
        response = client.get("/")

        assert response.status_code == 200
        assert "X-Token-Stale" not in response.headers

    def test_stale_header_set_when_token_outdated(self) -> None:
        """When token token_ver < DB version, X-Token-Stale header is set."""
        app = _build_app()
        payload = _make_payload(sub="user-123", token_version=1)

        mock_ts = _mock_token_service(payload=payload)
        mock_ctx = _mock_async_session(token_version=5)

        with (
            patch("nexus.auth.middleware.AsyncSessionLocal", return_value=mock_ctx),
            patch("nexus.auth.middleware.TokenService", return_value=mock_ts),
        ):
            client = TestClient(app)
            response = client.get("/", headers={"Authorization": "Bearer some-jwt"})

        assert response.status_code == 200
        assert response.headers.get("X-Token-Stale") == "true"

    def test_no_stale_header_when_token_current(self) -> None:
        """When token token_ver >= DB version, no X-Token-Stale header."""
        app = _build_app()
        payload = _make_payload(sub="user-123", token_version=5)

        mock_ts = _mock_token_service(payload=payload)
        mock_ctx = _mock_async_session(token_version=5)

        with (
            patch("nexus.auth.middleware.AsyncSessionLocal", return_value=mock_ctx),
            patch("nexus.auth.middleware.TokenService", return_value=mock_ts),
        ):
            client = TestClient(app)
            response = client.get("/", headers={"Authorization": "Bearer some-jwt"})

        assert response.status_code == 200
        assert "X-Token-Stale" not in response.headers

    def test_no_stale_header_when_token_ahead(self) -> None:
        """When token token_ver > DB version, no X-Token-Stale header."""
        app = _build_app()
        payload = _make_payload(sub="user-123", token_version=10)

        mock_ts = _mock_token_service(payload=payload)
        mock_ctx = _mock_async_session(token_version=3)

        with (
            patch("nexus.auth.middleware.AsyncSessionLocal", return_value=mock_ctx),
            patch("nexus.auth.middleware.TokenService", return_value=mock_ts),
        ):
            client = TestClient(app)
            response = client.get("/", headers={"Authorization": "Bearer some-jwt"})

        assert response.status_code == 200
        assert "X-Token-Stale" not in response.headers

    def test_db_error_passes_through(self) -> None:
        """When DB connection fails, response passes through without error."""
        app = _build_app()
        payload = _make_payload(sub="user-123", token_version=0)

        mock_ts = _mock_token_service(payload=payload)
        mock_ctx = _mock_async_session(error=OSError("connection refused"))

        with (
            patch("nexus.auth.middleware.AsyncSessionLocal", return_value=mock_ctx),
            patch("nexus.auth.middleware.TokenService", return_value=mock_ts),
        ):
            client = TestClient(app)
            response = client.get("/", headers={"Authorization": "Bearer some-jwt"})

        assert response.status_code == 200
        assert "X-Token-Stale" not in response.headers

    def test_decode_error_passes_through(self) -> None:
        """When token cannot be decoded, response passes through without error."""
        app = _build_app()

        mock_ts = _mock_token_service(error=InvalidTokenError())

        with (
            patch("nexus.auth.middleware.TokenService", return_value=mock_ts),
        ):
            client = TestClient(app)
            response = client.get("/", headers={"Authorization": "Bearer not-a-jwt"})

        assert response.status_code == 200
        assert "X-Token-Stale" not in response.headers

    def test_disabled_user_returns_401(self) -> None:
        """When user is disabled in DB, middleware returns 401 before handler runs."""
        app = _build_app()
        payload = _make_payload(sub="user-123", token_version=1)

        mock_ts = _mock_token_service(payload=payload)
        mock_ctx = _mock_async_session(token_version=1, is_enabled=False)

        with (
            patch("nexus.auth.middleware.AsyncSessionLocal", return_value=mock_ctx),
            patch("nexus.auth.middleware.TokenService", return_value=mock_ts),
        ):
            client = TestClient(app)
            response = client.get("/", headers={"Authorization": "Bearer some-jwt"})

        assert response.status_code == 401
        body = response.json()
        assert body["code"] == "ACCOUNT_DISABLED"
        assert body["detail"] == "User account is disabled"

    def test_disabled_user_cached_returns_401(self) -> None:
        """When cache has is_enabled=False, return 401 without DB query."""
        app = _build_app()
        payload = _make_payload(sub="user-123", token_version=1)

        _user_status_cache["user-123"] = (1, False)

        mock_ts = _mock_token_service(payload=payload)

        with (
            patch("nexus.auth.middleware.TokenService", return_value=mock_ts),
        ):
            client = TestClient(app)
            response = client.get("/", headers={"Authorization": "Bearer some-jwt"})

        assert response.status_code == 401

    def test_disabled_and_stale_returns_401(self) -> None:
        """Disabled user rejection takes priority over stale token header."""
        app = _build_app()
        payload = _make_payload(sub="user-123", token_version=1)

        mock_ts = _mock_token_service(payload=payload)
        mock_ctx = _mock_async_session(token_version=5, is_enabled=False)

        with (
            patch("nexus.auth.middleware.AsyncSessionLocal", return_value=mock_ctx),
            patch("nexus.auth.middleware.TokenService", return_value=mock_ts),
        ):
            client = TestClient(app)
            response = client.get("/", headers={"Authorization": "Bearer some-jwt"})

        assert response.status_code == 401
        assert "X-Token-Stale" not in response.headers

    def test_user_not_found_passes_through(self) -> None:
        """When user row not found, default to enabled and pass through."""
        app = _build_app()
        payload = _make_payload(sub="nonexistent-user", token_version=0)

        mock_ts = _mock_token_service(payload=payload)
        mock_ctx = _mock_async_session(token_version=None)

        with (
            patch("nexus.auth.middleware.AsyncSessionLocal", return_value=mock_ctx),
            patch("nexus.auth.middleware.TokenService", return_value=mock_ts),
        ):
            client = TestClient(app)
            response = client.get("/", headers={"Authorization": "Bearer some-jwt"})

        assert response.status_code == 200

    def test_disabled_user_can_still_logout(self) -> None:
        """Disabled users must be able to POST /auth/logout to clear their session."""
        app = _build_app()
        payload = _make_payload(sub="user-123", token_version=1)

        mock_ts = _mock_token_service(payload=payload)
        mock_ctx = _mock_async_session(token_version=1, is_enabled=False)

        with (
            patch("nexus.auth.middleware.AsyncSessionLocal", return_value=mock_ctx),
            patch("nexus.auth.middleware.TokenService", return_value=mock_ts),
        ):
            client = TestClient(app)
            response = client.post("/api/v1/auth/logout", headers={"Authorization": "Bearer some-jwt"})

        assert response.status_code == 200
