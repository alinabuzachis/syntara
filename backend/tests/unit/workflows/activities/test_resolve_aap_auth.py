"""Tests for resolve_aap_auth integration-required behavior (PR #771)."""

from unittest.mock import MagicMock

import pytest
from temporalio.exceptions import ApplicationError

from nexus.workflows.workflow_engine.activities.aap_common import (
    AAPResolvedAuth,
    resolve_aap_auth,
)

_FAKE_TOKEN = "tok"  # noqa: S105
_FAKE_ENV_TOKEN = "env-token"  # noqa: S105


def _make_settings(*, token: str | None = None, username: str | None = None, password: str | None = None) -> MagicMock:
    settings = MagicMock()
    if token:
        settings.aap_token.get_secret_value.return_value = token
    else:
        settings.aap_token = None
    settings.aap_username = username
    if password:
        settings.aap_password.get_secret_value.return_value = password
    else:
        settings.aap_password = None
    return settings


_INTEGRATION = {"base_url": "https://aap.example.com", "verify_ssl": True}
_INTEGRATION_NO_SSL = {"base_url": "https://aap.example.com", "verify_ssl": False}


class TestResolveAAPAuthRequiresIntegration:
    """resolve_aap_auth must error when _resolved_integration is absent."""

    def test_missing_integration_raises_config_error(self) -> None:
        settings = _make_settings(token=_FAKE_TOKEN)
        with pytest.raises(ApplicationError, match="AAP integration not configured") as exc_info:
            resolve_aap_auth({}, settings)
        assert exc_info.value.non_retryable

    def test_none_integration_raises_config_error(self) -> None:
        settings = _make_settings(token=_FAKE_TOKEN)
        with pytest.raises(ApplicationError, match="AAP integration not configured"):
            resolve_aap_auth({"_resolved_integration": None}, settings)

    def test_empty_dict_integration_raises_config_error(self) -> None:
        settings = _make_settings(token=_FAKE_TOKEN)
        with pytest.raises(ApplicationError, match="AAP integration not configured"):
            resolve_aap_auth({"_resolved_integration": {}}, settings)


class TestResolveAAPAuthWithIntegration:
    """resolve_aap_auth uses integration for URL/SSL and credentials for auth."""

    def test_url_and_ssl_from_integration(self) -> None:
        settings = _make_settings(token=_FAKE_TOKEN)
        result = resolve_aap_auth({"_resolved_integration": _INTEGRATION}, settings)

        assert isinstance(result, AAPResolvedAuth)
        assert result.base_url == "https://aap.example.com"
        assert result.verify_ssl is True

    def test_verify_ssl_false_from_integration(self) -> None:
        settings = _make_settings(token=_FAKE_TOKEN)
        result = resolve_aap_auth({"_resolved_integration": _INTEGRATION_NO_SSL}, settings)

        assert result.verify_ssl is False

    def test_auth_from_credentials_token(self) -> None:
        settings = _make_settings()
        creds = {
            "extra_vars": {"aap_oauth_token": "cred-token"},
        }
        result = resolve_aap_auth(
            {"_resolved_integration": _INTEGRATION, "_resolved_credentials": creds},
            settings,
        )

        assert result.auth_headers == {"Authorization": "Bearer cred-token"}
        assert result.basic_auth is None

    def test_auth_from_credentials_basic(self) -> None:
        settings = _make_settings()
        creds = {
            "extra_vars": {"aap_username": "admin", "aap_password": "secret"},
        }
        result = resolve_aap_auth(
            {"_resolved_integration": _INTEGRATION, "_resolved_credentials": creds},
            settings,
        )

        assert result.auth_headers == {}
        assert result.basic_auth is not None

    def test_auth_from_settings_when_no_credentials(self) -> None:
        settings = _make_settings(token=_FAKE_ENV_TOKEN)
        result = resolve_aap_auth({"_resolved_integration": _INTEGRATION}, settings)

        assert result.auth_headers == {"Authorization": "Bearer env-token"}

    def test_auth_failure_raises_config_error(self) -> None:
        settings = _make_settings()
        with pytest.raises(ApplicationError, match="Authentication failed"):
            resolve_aap_auth({"_resolved_integration": _INTEGRATION}, settings)

    def test_credential_auth_failure_raises_config_error(self) -> None:
        settings = _make_settings()
        creds = {
            "extra_vars": {
                "aap_host": "https://evil.com/path/injection",
                "aap_oauth_token": "tok",
            },
        }
        with pytest.raises(ApplicationError, match="Authentication failed"):
            resolve_aap_auth(
                {"_resolved_integration": _INTEGRATION, "_resolved_credentials": creds},
                settings,
            )
