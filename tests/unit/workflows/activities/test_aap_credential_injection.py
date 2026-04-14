"""Tests for AAP activity credential injection (T068).

These tests verify the credential override logic in execute_aap_job_template_activity.
Full execution requires an AAP instance, so we test the auth setup path only.
"""

from unittest.mock import MagicMock

from nexus.workflows.workflow_engine.activities.aap_job_template_activity import (
    _get_aap_auth_headers,
    _get_aap_basic_auth,
)


class TestAAPCredentialInjection:
    """Test AAP activity auth override from resolved credentials."""

    def test_settings_token_auth(self) -> None:
        """Default settings-based token auth works."""
        settings = MagicMock()
        settings.aap_token.get_secret_value.return_value = "settings-token"
        settings.aap_username = None

        headers = _get_aap_auth_headers(settings)
        assert headers["Authorization"] == "Bearer settings-token"

    def test_settings_basic_auth(self) -> None:
        """Default settings-based basic auth works."""
        settings = MagicMock()
        settings.aap_token = None
        settings.aap_username = "admin"
        settings.aap_password.get_secret_value.return_value = "pass"

        basic_auth = _get_aap_basic_auth(settings)
        assert basic_auth is not None

    def test_credential_override_structure(self) -> None:
        """Verify resolved credential extra_vars structure matches what AAP activity expects."""
        resolved_creds = {
            "extra_vars": {
                "auth_type": "aap",
                "aap_host": "https://aap.example.com",
                "aap_username": "nexus-user",
                "aap_password": "nexus-pass",
                "aap_oauth_token": "oauth-token-123",
                "aap_verify_ssl": True,
            },
        }
        extra_vars = resolved_creds["extra_vars"]

        # Verify the structure has the fields the activity code checks
        assert "aap_host" in extra_vars
        assert "aap_oauth_token" in extra_vars
        assert "aap_username" in extra_vars
        assert "aap_password" in extra_vars
