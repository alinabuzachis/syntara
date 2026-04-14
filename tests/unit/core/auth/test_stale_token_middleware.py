"""Unit tests for StaleTokenMiddleware.

Tests cover:
- Pass-through when no Authorization header is present
- X-Token-Stale header set when token_ver < Redis version
- No X-Token-Stale header when token_ver >= Redis version
- Graceful handling of Redis or decode errors
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import PlainTextResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from nexus.auth.exceptions import InvalidTokenError
from nexus.auth.middleware import StaleTokenMiddleware
from nexus.auth.services.token_service import TokenPayload


def _build_app() -> Starlette:
    """Build a minimal Starlette app with the StaleTokenMiddleware."""

    async def homepage(request: Request) -> PlainTextResponse:
        return PlainTextResponse("ok")

    app = Starlette(routes=[Route("/", homepage)])
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


class TestStaleTokenMiddleware:
    """Tests for StaleTokenMiddleware."""

    def test_no_auth_header_passes_through(self) -> None:
        """When no Authorization header is present, response passes through unchanged."""
        app = _build_app()

        with patch("nexus.auth.middleware.SessionStore"):
            client = TestClient(app)
            response = client.get("/")

        assert response.status_code == 200
        assert "X-Token-Stale" not in response.headers

    def test_stale_header_set_when_token_outdated(self) -> None:
        """When token token_ver < Redis version, X-Token-Stale header is set."""
        app = _build_app()
        payload = _make_payload(sub="user-123", token_version=1)

        mock_store = AsyncMock()
        mock_store.get_token_version = AsyncMock(return_value=5)
        mock_store.__aenter__ = AsyncMock(return_value=mock_store)
        mock_store.__aexit__ = AsyncMock(return_value=False)

        mock_ts = _mock_token_service(payload=payload)

        with (
            patch("nexus.auth.middleware.SessionStore", return_value=mock_store),
            patch("nexus.auth.middleware.TokenService", return_value=mock_ts),
        ):
            client = TestClient(app)
            response = client.get("/", headers={"Authorization": "Bearer some-jwt"})

        assert response.status_code == 200
        assert response.headers.get("X-Token-Stale") == "true"

    def test_no_stale_header_when_token_current(self) -> None:
        """When token token_ver >= Redis version, no X-Token-Stale header."""
        app = _build_app()
        payload = _make_payload(sub="user-123", token_version=5)

        mock_store = AsyncMock()
        mock_store.get_token_version = AsyncMock(return_value=5)
        mock_store.__aenter__ = AsyncMock(return_value=mock_store)
        mock_store.__aexit__ = AsyncMock(return_value=False)

        mock_ts = _mock_token_service(payload=payload)

        with (
            patch("nexus.auth.middleware.SessionStore", return_value=mock_store),
            patch("nexus.auth.middleware.TokenService", return_value=mock_ts),
        ):
            client = TestClient(app)
            response = client.get("/", headers={"Authorization": "Bearer some-jwt"})

        assert response.status_code == 200
        assert "X-Token-Stale" not in response.headers

    def test_no_stale_header_when_token_ahead(self) -> None:
        """When token token_ver > Redis version, no X-Token-Stale header."""
        app = _build_app()
        payload = _make_payload(sub="user-123", token_version=10)

        mock_store = AsyncMock()
        mock_store.get_token_version = AsyncMock(return_value=3)
        mock_store.__aenter__ = AsyncMock(return_value=mock_store)
        mock_store.__aexit__ = AsyncMock(return_value=False)

        mock_ts = _mock_token_service(payload=payload)

        with (
            patch("nexus.auth.middleware.SessionStore", return_value=mock_store),
            patch("nexus.auth.middleware.TokenService", return_value=mock_ts),
        ):
            client = TestClient(app)
            response = client.get("/", headers={"Authorization": "Bearer some-jwt"})

        assert response.status_code == 200
        assert "X-Token-Stale" not in response.headers

    def test_redis_error_passes_through(self) -> None:
        """When Redis connection fails, response passes through without error."""
        app = _build_app()
        payload = _make_payload(sub="user-123", token_version=0)

        mock_store = AsyncMock()
        mock_store.get_token_version = AsyncMock(side_effect=OSError("connection refused"))
        mock_store.__aenter__ = AsyncMock(return_value=mock_store)
        mock_store.__aexit__ = AsyncMock(return_value=False)

        mock_ts = _mock_token_service(payload=payload)

        with (
            patch("nexus.auth.middleware.SessionStore", return_value=mock_store),
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
            patch("nexus.auth.middleware.SessionStore"),
            patch("nexus.auth.middleware.TokenService", return_value=mock_ts),
        ):
            client = TestClient(app)
            response = client.get("/", headers={"Authorization": "Bearer not-a-jwt"})

        assert response.status_code == 200
        assert "X-Token-Stale" not in response.headers
