"""Unit tests for OpenRouter LLM configuration."""

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

    def test_raises_error_when_api_key_missing(self) -> None:
        """Test that missing API key raises LLMConfigurationError."""
        with pytest.raises(LLMConfigurationError, match="No LLM API key available"):
            get_openrouter_llm()

    def test_raises_error_when_api_key_empty(self) -> None:
        """Test that empty API key raises LLMConfigurationError."""
        with pytest.raises(LLMConfigurationError, match="No LLM API key available"):
            get_openrouter_llm(api_key="")

    def test_creates_llm_with_explicit_api_key(self) -> None:
        """Test that explicit api_key creates LLM successfully."""
        llm = get_openrouter_llm(api_key="test-key-123")
        assert llm.openai_api_key.get_secret_value() == "test-key-123"  # type: ignore[union-attr]

    def test_uses_settings_defaults_when_args_none(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test that get_openrouter_llm respects settings defaults when args are None."""
        monkeypatch.setenv("APP_OPENROUTER_MODEL", "test/model")
        monkeypatch.setenv("APP_OPENROUTER_TEMPERATURE", "0.9")
        monkeypatch.setenv("APP_OPENROUTER_MAX_TOKENS", "1500")

        llm = get_openrouter_llm(api_key="test-key-123")

        assert llm.model_name == "test/model"
        assert llm.temperature == 0.9
        assert llm.max_tokens == 1500

    def test_explicit_args_override_settings(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test that explicit arguments override settings defaults."""
        monkeypatch.setenv("APP_OPENROUTER_MODEL", "default/model")
        monkeypatch.setenv("APP_OPENROUTER_TEMPERATURE", "0.7")
        monkeypatch.setenv("APP_OPENROUTER_MAX_TOKENS", "1000")

        llm = get_openrouter_llm(
            api_key="test-key-123",
            model="override/model",
            temperature=0.3,
            max_tokens=2000,
        )

        assert llm.model_name == "override/model"
        assert llm.temperature == 0.3
        assert llm.max_tokens == 2000

    def test_zero_temperature_allowed(self) -> None:
        """Test that temperature=0.0 is correctly handled (not treated as None)."""
        llm = get_openrouter_llm(api_key="test-key-123", temperature=0.0)
        assert llm.temperature == 0.0

    def test_base_url_from_credential(self) -> None:
        """Test that base_url from credential is used."""
        llm = get_openrouter_llm(api_key="test-key-123", base_url="https://custom.example.com/v1")
        assert llm.openai_api_base == "https://custom.example.com/v1"

    def test_default_headers_configured(self) -> None:
        """Test that OpenRouter-specific headers are configured."""
        llm = get_openrouter_llm(api_key="test-key-123")

        assert llm.default_headers is not None
        assert llm.default_headers["HTTP-Referer"] == "https://github.com/syntara-orchestration/syntara"
        assert llm.default_headers["X-Title"] == "Nexus Agent Orchestrator"

    def test_error_message_references_credential_system(self) -> None:
        """Test that error message directs users to credential configuration."""
        with pytest.raises(LLMConfigurationError, match="Attach an LLM Provider credential"):
            get_openrouter_llm()
