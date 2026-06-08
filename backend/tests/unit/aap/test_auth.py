"""Tests for AAP shared auth resolution."""

# ruff: noqa: S106  — test fixtures use hardcoded passwords

from unittest.mock import MagicMock

import httpx
import pytest

from nexus.aap.auth import (
    _get_auth_headers_from_settings,
    _get_basic_auth_from_settings,
    resolve_aap_connection,
)
from nexus.aap.exceptions import AAPNotConfiguredError


def _mock_settings(
    *,
    base_url: str | None = None,
    token: str | None = None,
    username: str | None = None,
    password: str | None = None,
    verify_ssl: bool = True,
    timeout_seconds: int = 30,
) -> MagicMock:
    """Create a mock Settings object."""
    settings = MagicMock(spec=[])  # Empty spec to prevent attribute access fallback
    settings.aap_base_url = base_url
    settings.aap_verify_ssl = verify_ssl
    settings.aap_proxy_timeout_seconds = timeout_seconds

    if token:
        mock_token = MagicMock()
        mock_token.get_secret_value.return_value = token
        settings.aap_token = mock_token
    else:
        settings.aap_token = None

    settings.aap_username = username
    if password:
        mock_password = MagicMock()
        mock_password.get_secret_value.return_value = password
        settings.aap_password = mock_password
    else:
        settings.aap_password = None

    return settings


class TestGetAuthHeadersFromSettings:
    """Tests for _get_auth_headers_from_settings."""

    def test_token_auth_returns_bearer_header(self) -> None:
        settings = _mock_settings(token="my-token")
        headers = _get_auth_headers_from_settings(settings)
        assert headers == {"Authorization": "Bearer my-token"}

    def test_basic_auth_returns_empty_headers(self) -> None:
        settings = _mock_settings(username="admin", password="secret")
        headers = _get_auth_headers_from_settings(settings)
        assert headers == {}

    def test_token_preferred_over_basic(self) -> None:
        settings = _mock_settings(token="my-token", username="admin", password="secret")
        headers = _get_auth_headers_from_settings(settings)
        assert headers == {"Authorization": "Bearer my-token"}

    def test_no_auth_raises_not_configured(self) -> None:
        settings = _mock_settings()
        with pytest.raises(AAPNotConfiguredError):
            _get_auth_headers_from_settings(settings)


class TestGetBasicAuthFromSettings:
    """Tests for _get_basic_auth_from_settings."""

    def test_returns_basic_auth_when_no_token(self) -> None:
        settings = _mock_settings(username="admin", password="secret")
        auth = _get_basic_auth_from_settings(settings)
        assert isinstance(auth, httpx.BasicAuth)

    def test_returns_none_when_token_present(self) -> None:
        settings = _mock_settings(token="my-token", username="admin", password="secret")
        auth = _get_basic_auth_from_settings(settings)
        assert auth is None

    def test_returns_none_when_no_credentials(self) -> None:
        settings = _mock_settings()
        auth = _get_basic_auth_from_settings(settings)
        assert auth is None


class TestResolveAAPConnection:
    """Tests for resolve_aap_connection."""

    def test_env_token_auth(self) -> None:
        settings = _mock_settings(base_url="https://aap.example.com", token="env-token")
        conn = resolve_aap_connection(settings)
        assert conn.base_url == "https://aap.example.com"
        assert conn.headers == {"Authorization": "Bearer env-token"}
        assert conn.basic_auth is None

    def test_env_basic_auth(self) -> None:
        settings = _mock_settings(base_url="https://aap.example.com", username="admin", password="secret")
        conn = resolve_aap_connection(settings)
        assert conn.base_url == "https://aap.example.com"
        assert conn.headers == {}
        assert isinstance(conn.basic_auth, httpx.BasicAuth)

    def test_no_base_url_raises_not_configured(self) -> None:
        settings = _mock_settings(token="env-token")
        with pytest.raises(AAPNotConfiguredError, match="AAP host not configured"):
            resolve_aap_connection(settings)

    def test_trailing_slash_stripped(self) -> None:
        settings = _mock_settings(base_url="https://aap.example.com/", token="t")
        conn = resolve_aap_connection(settings)
        assert conn.base_url == "https://aap.example.com"

    def test_timeout_from_settings(self) -> None:
        settings = _mock_settings(base_url="https://aap.example.com", token="t", timeout_seconds=120)
        conn = resolve_aap_connection(settings)
        assert conn.timeout == 120.0

    def test_basic_auth_over_http_raises_not_configured(self) -> None:
        settings = _mock_settings(base_url="http://aap.example.com", username="admin", password="secret")
        with pytest.raises(AAPNotConfiguredError, match="credentials require HTTPS"):
            resolve_aap_connection(settings)

    def test_token_auth_over_http_raises_not_configured(self) -> None:
        settings = _mock_settings(base_url="http://aap.example.com", token="t")
        with pytest.raises(AAPNotConfiguredError, match="credentials require HTTPS"):
            resolve_aap_connection(settings)

    def test_basic_auth_with_verify_ssl_false_raises_not_configured(self) -> None:
        settings = _mock_settings(
            base_url="https://aap.example.com", username="admin", password="secret", verify_ssl=False
        )
        with pytest.raises(AAPNotConfiguredError, match="basic auth requires SSL verification"):
            resolve_aap_connection(settings)

    def test_token_auth_with_verify_ssl_false_warns(self) -> None:
        settings = _mock_settings(base_url="https://aap.example.com", token="t", verify_ssl=False)
        conn = resolve_aap_connection(settings)
        assert conn.verify_ssl is False
