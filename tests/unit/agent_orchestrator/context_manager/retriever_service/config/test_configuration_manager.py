"""Unit tests for ConfigurationManager implementation."""

from unittest.mock import MagicMock, patch

import pytest

from nexus.agent_orchestrator.context_manager.retriever_service.config.configuration_manager import (
    ConfigurationManager,
)
from nexus.agent_orchestrator.context_manager.retriever_service.models.relevancy_configuration import (
    RelevancyConfiguration,
)


class TestConfigurationManager:
    """Test suite for ConfigurationManager."""

    @pytest.fixture
    def manager(self) -> ConfigurationManager:
        """Create ConfigurationManager instance."""
        return ConfigurationManager()

    @pytest.fixture
    def mock_settings(self) -> MagicMock:
        """Create mock settings object."""
        mock = MagicMock()
        mock.retriever_llm_similarity_threshold = 0.7
        mock.retriever_llm_max_results = 10
        mock.retriever_llm_model = "anthropic/claude-3.5-sonnet"
        mock.retriever_llm_temperature = 0.3
        mock.retriever_llm_max_tokens = 150
        mock.retriever_context_window_size = 2000
        mock.retriever_keyword_similarity_threshold = 0.5
        mock.retriever_keyword_max_results = 15
        mock.retriever_keyword_case_sensitive = False
        mock.retriever_keyword_stem_words = True
        mock.retriever_keyword_remove_stopwords = True
        mock.retriever_keyword_phrase_bonus_multiplier = 1.5
        return mock

    def test_initialization(self, manager: ConfigurationManager) -> None:
        """Test ConfigurationManager initialization."""
        assert manager._default_llm_config is None
        assert manager._default_keyword_config is None
        assert manager._loaded is False

    @patch("nexus.agent_orchestrator.context_manager.retriever_service.config.configuration_manager.get_settings")
    def test_get_llm_configuration(
        self, mock_get_settings: MagicMock, manager: ConfigurationManager, mock_settings: MagicMock
    ) -> None:
        """Test getting LLM configuration."""
        mock_get_settings.return_value = mock_settings

        config = manager.get_llm_configuration()

        assert isinstance(config, RelevancyConfiguration)
        assert config.checker_type == "llm"
        assert config.similarity_threshold == pytest.approx(0.7)
        assert config.max_results == 10
        assert config.algorithm_parameters["model"] == "anthropic/claude-3.5-sonnet"
        assert config.algorithm_parameters["temperature"] == pytest.approx(0.3)

    @patch("nexus.agent_orchestrator.context_manager.retriever_service.config.configuration_manager.get_settings")
    def test_get_keyword_configuration(
        self, mock_get_settings: MagicMock, manager: ConfigurationManager, mock_settings: MagicMock
    ) -> None:
        """Test getting keyword configuration."""
        mock_get_settings.return_value = mock_settings

        config = manager.get_keyword_configuration()

        assert isinstance(config, RelevancyConfiguration)
        assert config.checker_type == "keyword"
        assert config.similarity_threshold == pytest.approx(0.5)
        assert config.max_results == 15
        assert config.algorithm_parameters["case_sensitive"] is False
        assert config.algorithm_parameters["stem_words"] is True
