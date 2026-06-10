"""Tests for credential scrubber (T073)."""

from nexus.workflows.workflow_engine.utils.credential_scrubber import REDACTED, scrub_credentials


class TestScrubCredentials:
    """Tests for scrub_credentials utility."""

    def test_scrubs_bearer_token(self) -> None:
        data = {"auth_type": "bearer", "bearer_token": "sk-secret-123"}
        result = scrub_credentials(data)
        assert result["bearer_token"] == REDACTED
        # auth_type is also scrubbed (derived from injector extra_vars)
        assert result["auth_type"] == REDACTED

    def test_scrubs_basic_auth(self) -> None:
        data = {"basic_username": "admin", "basic_password": "secret"}
        result = scrub_credentials(data)
        assert result["basic_username"] == REDACTED
        assert result["basic_password"] == REDACTED

    def test_scrubs_llm_keys(self) -> None:
        data = {"llm_api_key": "llm-key", "llm_provider": "openai", "llm_base_url": "https://api.openai.com"}
        result = scrub_credentials(data)
        assert result["llm_api_key"] == REDACTED
        # Non-secret injector keys are also scrubbed (credential-adjacent metadata)
        assert result["llm_provider"] == REDACTED
        assert result["llm_base_url"] == REDACTED

    def test_scrubs_aap_credentials(self) -> None:
        data = {"aap_password": "pass", "aap_oauth_token": "token"}
        result = scrub_credentials(data)
        assert result["aap_password"] == REDACTED
        assert result["aap_oauth_token"] == REDACTED

    def test_scrubs_ssh_key(self) -> None:
        data = {"ssh_private_key": "-----BEGIN RSA PRIVATE KEY-----"}
        result = scrub_credentials(data)
        assert result["ssh_private_key"] == REDACTED

    def test_scrubs_resolved_credentials(self) -> None:
        data = {"_resolved_credentials": {"extra_vars": {"token": "secret"}}, "name": "test"}
        result = scrub_credentials(data)
        assert result["_resolved_credentials"] == REDACTED
        assert result["name"] == "test"

    def test_scrubs_nested_dict(self) -> None:
        data = {"outer": {"inner": {"bearer_token": "secret", "safe_key": "value"}}}
        result = scrub_credentials(data)
        assert result["outer"]["inner"]["bearer_token"] == REDACTED
        assert result["outer"]["inner"]["safe_key"] == "value"

    def test_preserves_non_credential_data(self) -> None:
        data = {"name": "test", "status": "active", "count": 42}
        result = scrub_credentials(data)
        assert result == data

    def test_handles_none(self) -> None:
        assert scrub_credentials(None) is None

    def test_handles_empty_dict(self) -> None:
        assert scrub_credentials({}) == {}

    def test_does_not_mutate_original(self) -> None:
        data = {"bearer_token": "secret", "name": "test"}
        scrub_credentials(data)
        assert data["bearer_token"] == "secret"  # noqa: S105

    def test_handles_list_with_dicts(self) -> None:
        data = [{"bearer_token": "a"}, {"name": "b"}]
        result = scrub_credentials(data)
        assert result[0]["bearer_token"] == REDACTED
        assert result[1]["name"] == "b"
