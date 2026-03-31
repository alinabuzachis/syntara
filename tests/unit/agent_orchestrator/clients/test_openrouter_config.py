"""Unit tests for OpenRouter LLM configuration."""

import os
from collections.abc import Generator

import pytest

from nexus.agent_orchestrator.clients.openrouter_config import get_openrouter_llm
from nexus.agent_orchestrator.exceptions import LLMConfigurationError
from nexus.core.config.base import get_settings


@pytest.fixture(autouse=True)
def clear_settings_cache() -> Generator[None, None, None]:
    """Clear settings cache before each test to ensure fresh settings."""
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


class TestGetOpenRouterLLM:
    """Tests for get_openrouter_llm function."""

    def test_raises_error_when_api_key_missing(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test that missing API key raises LLMConfigurationError with helpful message."""
        # Remove API key if it exists from environment
        monkeypatch.delenv("APP_OPENROUTER_API_KEY", raising=False)
        # Also need to prevent .env file loading by temporarily removing all APP_OPENROUTER env vars
        monkeypatch.setenv("APP_OPENROUTER_API_KEY", "")  # Set to empty string to override .env

        with pytest.raises(LLMConfigurationError, match="APP_OPENROUTER_API_KEY environment variable is required"):
            get_openrouter_llm()

    def test_uses_settings_defaults_when_args_none(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test that get_openrouter_llm respects settings defaults when args are None."""
        # Set environment variables
        monkeypatch.setenv("APP_OPENROUTER_API_KEY", "test-key-123")
        monkeypatch.setenv("APP_OPENROUTER_MODEL", "test/model")
        monkeypatch.setenv("APP_OPENROUTER_TEMPERATURE", "0.9")
        monkeypatch.setenv("APP_OPENROUTER_MAX_TOKENS", "1500")

        # Get LLM without providing arguments
        llm = get_openrouter_llm()

        # Verify it uses settings defaults
        assert llm.model_name == "test/model"
        assert llm.temperature == 0.9
        assert llm.max_tokens == 1500
        assert llm.openai_api_key.get_secret_value() == "test-key-123"  # type: ignore[union-attr]

    def test_explicit_args_override_settings(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test that explicit arguments override settings defaults."""
        # Set environment variables to defaults
        monkeypatch.setenv("APP_OPENROUTER_API_KEY", "test-key-123")
        monkeypatch.setenv("APP_OPENROUTER_MODEL", "default/model")
        monkeypatch.setenv("APP_OPENROUTER_TEMPERATURE", "0.7")
        monkeypatch.setenv("APP_OPENROUTER_MAX_TOKENS", "1000")

        # Get LLM with explicit overrides
        llm = get_openrouter_llm(
            model="override/model",
            temperature=0.3,
            max_tokens=2000,
        )

        # Verify explicit arguments are used
        assert llm.model_name == "override/model"
        assert llm.temperature == 0.3
        assert llm.max_tokens == 2000

    def test_partial_args_override(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test that partial argument overrides work correctly."""
        monkeypatch.setenv("APP_OPENROUTER_API_KEY", "test-key-123")
        monkeypatch.setenv("APP_OPENROUTER_MODEL", "default/model")
        monkeypatch.setenv("APP_OPENROUTER_TEMPERATURE", "0.7")
        monkeypatch.setenv("APP_OPENROUTER_MAX_TOKENS", "1000")

        # Override only temperature
        llm = get_openrouter_llm(temperature=0.5)

        # Verify: temperature is overridden, others use settings
        assert llm.model_name == "default/model"
        assert llm.temperature == 0.5
        assert llm.max_tokens == 1000

    def test_zero_temperature_allowed(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test that temperature=0.0 is correctly handled (not treated as None)."""
        monkeypatch.setenv("APP_OPENROUTER_API_KEY", "test-key-123")
        monkeypatch.setenv("APP_OPENROUTER_TEMPERATURE", "0.7")

        # Explicitly set temperature to 0.0
        llm = get_openrouter_llm(temperature=0.0)

        # Verify 0.0 is used (not the default 0.7)
        assert llm.temperature == 0.0

    def test_base_url_from_settings(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test that base URL is correctly read from settings."""
        monkeypatch.setenv("APP_OPENROUTER_API_KEY", "test-key-123")
        monkeypatch.setenv("APP_OPENROUTER_BASE_URL", "https://custom.openrouter.ai/api/v1")

        llm = get_openrouter_llm()

        # Verify base URL is set correctly
        assert llm.openai_api_base == "https://custom.openrouter.ai/api/v1"

    def test_default_headers_configured(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test that OpenRouter-specific headers are configured."""
        monkeypatch.setenv("APP_OPENROUTER_API_KEY", "test-key-123")

        llm = get_openrouter_llm()

        # Verify default headers are set for OpenRouter
        assert llm.default_headers is not None
        assert "HTTP-Referer" in llm.default_headers
        assert "X-Title" in llm.default_headers
        assert llm.default_headers["HTTP-Referer"] == "https://github.com/syntara-orchestration/syntara"
        assert llm.default_headers["X-Title"] == "Nexus Agent Orchestrator"

    def test_settings_temperature_validation(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test that invalid temperature in settings is caught by pydantic validation."""
        monkeypatch.setenv("APP_OPENROUTER_API_KEY", "test-key-123")
        monkeypatch.setenv("APP_OPENROUTER_TEMPERATURE", "1.5")  # Invalid: > 1.0

        with pytest.raises(ValueError, match="less than or equal to 1"):
            get_openrouter_llm()

    def test_settings_max_tokens_validation(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test that invalid max_tokens in settings is caught by pydantic validation."""
        monkeypatch.setenv("APP_OPENROUTER_API_KEY", "test-key-123")
        monkeypatch.setenv("APP_OPENROUTER_MAX_TOKENS", "0")  # Invalid: must be >= 1

        with pytest.raises(ValueError, match="greater than or equal to 1"):
            get_openrouter_llm()

    def test_settings_cache_cleared_between_tests(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test helper to ensure settings cache doesn't interfere between tests."""
        # This test ensures we're cleaning up properly
        # Set unique values
        monkeypatch.setenv("APP_OPENROUTER_API_KEY", "unique-key-789")
        monkeypatch.setenv("APP_OPENROUTER_MODEL", "unique/model")

        llm = get_openrouter_llm()

        assert llm.model_name == "unique/model"
        assert llm.openai_api_key.get_secret_value() == "unique-key-789"  # type: ignore[union-attr]


class TestOpenRouterIntegration:
    """Integration tests for OpenRouter configuration with settings."""

    def test_nexus_prefix_required(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test that environment variables require APP_ prefix."""
        # Set non-prefixed env var
        monkeypatch.setenv("OPENROUTER_API_KEY", "should-not-work")
        # Set prefixed env var
        monkeypatch.setenv("APP_OPENROUTER_API_KEY", "should-work")

        llm = get_openrouter_llm()
        # Should use the APP_ prefixed variable
        assert llm.openai_api_key.get_secret_value() == "should-work"  # type: ignore[union-attr]

    def test_all_settings_integration(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test full integration of all OpenRouter settings."""
        # Set all OpenRouter settings
        monkeypatch.setenv("APP_OPENROUTER_API_KEY", "integration-key")
        monkeypatch.setenv("APP_OPENROUTER_BASE_URL", "https://integration.example.com/v1")
        monkeypatch.setenv("APP_OPENROUTER_MODEL", "integration/model")
        monkeypatch.setenv("APP_OPENROUTER_TEMPERATURE", "0.8")
        monkeypatch.setenv("APP_OPENROUTER_MAX_TOKENS", "1200")

        llm = get_openrouter_llm()

        # Verify all settings are correctly integrated
        assert llm.model_name == "integration/model"
        assert llm.temperature == 0.8
        assert llm.max_tokens == 1200
        assert llm.openai_api_key.get_secret_value() == "integration-key"  # type: ignore[union-attr]
        assert llm.openai_api_base == "https://integration.example.com/v1"

    def test_settings_defaults_match_expected(self) -> None:
        """Test that settings defaults match documented values."""
        # Create settings with no env vars (uses defaults)
        # Use context manager to isolate environment
        old_env = os.environ.copy()
        try:
            # Clear OpenRouter env vars to test defaults
            for key in list(os.environ.keys()):
                if key.startswith("APP_OPENROUTER"):
                    del os.environ[key]

            settings = get_settings()

            # Verify documented defaults
            assert str(settings.openrouter_base_url) == "https://openrouter.ai/api/v1"
            assert settings.openrouter_model == "anthropic/claude-3.5-sonnet"
            assert settings.openrouter_temperature == 0.7
            assert settings.openrouter_max_tokens == 1000
        finally:
            # Restore environment
            os.environ.clear()
            os.environ.update(old_env)
