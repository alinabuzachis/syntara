"""Unit tests for CSRF protection module."""

from unittest.mock import MagicMock, patch

import pytest

from nexus.auth.cookies import CSRF_COOKIE_NAME, CSRF_COOKIE_PATH, clear_csrf_cookie, set_csrf_cookie
from nexus.auth.csrf import (
    CSRF_HEADER_NAME,
    derive_csrf_form_token,
    generate_csrf_seed,
    validate_csrf,
)
from nexus.auth.exceptions import CSRFErrorCode, CSRFValidationError


def _mock_settings(**overrides: bool | str | int | None) -> MagicMock:
    defaults: dict[str, bool | str | int | None] = {
        "cookie_secure": True,
        "cookie_domain": None,
        "jwt_refresh_token_lifetime_hours": 8,
    }
    defaults.update(overrides)
    settings = MagicMock(**defaults)
    settings.secret_encryption_key.get_secret_value.return_value = "test-server-secret-key"
    return settings


# =============================================================================
# generate_csrf_seed
# =============================================================================


class TestGenerateCsrfSeed:
    """Tests for generate_csrf_seed."""

    def test_returns_nonempty_string(self) -> None:
        seed = generate_csrf_seed()
        assert isinstance(seed, str)
        assert len(seed) > 0

    def test_produces_unique_values(self) -> None:
        seeds = {generate_csrf_seed() for _ in range(50)}
        assert len(seeds) == 50


# =============================================================================
# derive_csrf_form_token
# =============================================================================


class TestDeriveCsrfFormToken:
    """Tests for derive_csrf_form_token."""

    def test_returns_hex_string(self) -> None:
        with patch("nexus.auth.csrf.get_settings", return_value=_mock_settings()):
            token = derive_csrf_form_token("test-seed")

        # SHA-256 hex digest is 64 characters
        assert len(token) == 64
        assert all(c in "0123456789abcdef" for c in token)

    def test_deterministic_for_same_seed(self) -> None:
        with patch("nexus.auth.csrf.get_settings", return_value=_mock_settings()):
            token1 = derive_csrf_form_token("same-seed")
            token2 = derive_csrf_form_token("same-seed")

        assert token1 == token2

    def test_different_seeds_produce_different_tokens(self) -> None:
        with patch("nexus.auth.csrf.get_settings", return_value=_mock_settings()):
            token1 = derive_csrf_form_token("seed-one")
            token2 = derive_csrf_form_token("seed-two")

        assert token1 != token2

    def test_different_secrets_produce_different_tokens(self) -> None:
        settings_a = _mock_settings()
        settings_a.secret_encryption_key.get_secret_value.return_value = "secret-a"
        settings_b = _mock_settings()
        settings_b.secret_encryption_key.get_secret_value.return_value = "secret-b"

        with patch("nexus.auth.csrf.get_settings", return_value=settings_a):
            token_a = derive_csrf_form_token("same-seed")

        with patch("nexus.auth.csrf.get_settings", return_value=settings_b):
            token_b = derive_csrf_form_token("same-seed")

        assert token_a != token_b


# =============================================================================
# set_csrf_cookie
# =============================================================================


class TestSetCsrfCookie:
    """Tests for set_csrf_cookie."""

    def test_sets_cookie_with_correct_attributes(self) -> None:
        response = MagicMock()
        with patch("nexus.auth.cookies.get_settings", return_value=_mock_settings()):
            set_csrf_cookie(response, "my-seed", max_age=28800)

        response.set_cookie.assert_called_once_with(
            key=CSRF_COOKIE_NAME,
            value="my-seed",
            max_age=28800,
            httponly=True,
            secure=True,
            samesite="lax",
            domain=None,
            path=CSRF_COOKIE_PATH,
        )

    def test_uses_configurable_settings(self) -> None:
        response = MagicMock()
        settings = _mock_settings(cookie_secure=False, cookie_domain=".example.com")
        with patch("nexus.auth.cookies.get_settings", return_value=settings):
            set_csrf_cookie(response, "seed", max_age=3600)

        response.set_cookie.assert_called_once_with(
            key=CSRF_COOKIE_NAME,
            value="seed",
            max_age=3600,
            httponly=True,
            secure=False,
            samesite="lax",
            domain=".example.com",
            path=CSRF_COOKIE_PATH,
        )


# =============================================================================
# clear_csrf_cookie
# =============================================================================


class TestClearCsrfCookie:
    """Tests for clear_csrf_cookie."""

    def test_deletes_cookie_with_correct_attributes(self) -> None:
        response = MagicMock()
        with patch("nexus.auth.cookies.get_settings", return_value=_mock_settings()):
            clear_csrf_cookie(response)

        response.delete_cookie.assert_called_once_with(
            key=CSRF_COOKIE_NAME,
            httponly=True,
            secure=True,
            samesite="lax",
            domain=None,
            path=CSRF_COOKIE_PATH,
        )


# =============================================================================
# validate_csrf
# =============================================================================


class TestValidateCsrf:
    """Tests for validate_csrf."""

    def test_raises_when_cookie_missing(self) -> None:
        request = MagicMock()
        request.cookies = {}
        request.headers = {}

        with pytest.raises(CSRFValidationError, match="CSRF cookie missing") as exc_info:
            validate_csrf(request)
        assert exc_info.value.error_code == CSRFErrorCode.COOKIE_MISSING

    def test_raises_when_header_missing(self) -> None:
        request = MagicMock()
        request.cookies = {CSRF_COOKIE_NAME: "some-seed"}
        request.headers = MagicMock()
        request.headers.get = MagicMock(return_value=None)

        with (
            patch("nexus.auth.csrf.get_settings", return_value=_mock_settings()),
            pytest.raises(CSRFValidationError, match="CSRF token header missing") as exc_info,
        ):
            validate_csrf(request)
        assert exc_info.value.error_code == CSRFErrorCode.HEADER_MISSING

    def test_raises_on_token_mismatch(self) -> None:
        request = MagicMock()
        request.cookies = {CSRF_COOKIE_NAME: "the-seed"}
        request.headers = MagicMock()
        request.headers.get = MagicMock(return_value="wrong-token-value")

        with (
            patch("nexus.auth.csrf.get_settings", return_value=_mock_settings()),
            pytest.raises(CSRFValidationError, match="CSRF token mismatch") as exc_info,
        ):
            validate_csrf(request)
        assert exc_info.value.error_code == CSRFErrorCode.TOKEN_MISMATCH

    def test_passes_when_token_matches(self) -> None:
        seed = "valid-seed"
        settings = _mock_settings()
        with patch("nexus.auth.csrf.get_settings", return_value=settings):
            expected_token = derive_csrf_form_token(seed)

        request = MagicMock()
        request.cookies = {CSRF_COOKIE_NAME: seed}
        request.headers = MagicMock()
        request.headers.get = MagicMock(return_value=expected_token)

        with patch("nexus.auth.csrf.get_settings", return_value=settings):
            # Should not raise
            validate_csrf(request)

    def test_header_lookup_uses_correct_name(self) -> None:
        """Verify validate_csrf reads the X-CSRF-Token header specifically."""
        seed = "seed-for-header-check"
        settings = _mock_settings()
        with patch("nexus.auth.csrf.get_settings", return_value=settings):
            expected_token = derive_csrf_form_token(seed)

        request = MagicMock()
        request.cookies = {CSRF_COOKIE_NAME: seed}
        request.headers = MagicMock()
        request.headers.get = MagicMock(return_value=expected_token)

        with patch("nexus.auth.csrf.get_settings", return_value=settings):
            validate_csrf(request)

        request.headers.get.assert_called_with(CSRF_HEADER_NAME)
