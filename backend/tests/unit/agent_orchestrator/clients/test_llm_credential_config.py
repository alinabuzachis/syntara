"""Unit tests for LLMCredentialConfig."""

import pytest

from nexus.agent_orchestrator.models.llm_credential_config import LLMCredentialConfig


class TestLLMCredentialConfig:
    """Tests for LLMCredentialConfig frozen dataclass."""

    def test_create_config(self) -> None:
        """Config stores all three fields."""
        config = LLMCredentialConfig(api_key="sk-123", base_url="https://api.example.com", model="gpt-4")
        assert config.api_key == "sk-123"
        assert config.base_url == "https://api.example.com"
        assert config.model == "gpt-4"

    def test_frozen_immutability(self) -> None:
        """Frozen dataclass rejects attribute assignment."""
        config = LLMCredentialConfig(api_key="sk-123", base_url="https://api.example.com", model="gpt-4")
        with pytest.raises(AttributeError):
            config.api_key = "new-key"  # type: ignore[misc]

    def test_importable_from_models_package(self) -> None:
        """LLMCredentialConfig is re-exported from the models package."""
        from nexus.agent_orchestrator.models import LLMCredentialConfig as Imported

        assert Imported is LLMCredentialConfig
