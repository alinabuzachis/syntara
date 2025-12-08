"""Global configuration manager for RetrieverService framework.

This module provides centralized configuration management for the RetrieverService
framework, integrating with the existing Nexus configuration patterns.
"""

import logging

from nexus.agent_orchestrator.context_manager.retriever_service.exceptions import ConfigurationError
from nexus.agent_orchestrator.context_manager.retriever_service.models.relevancy_configuration import (
    RelevancyConfiguration,
)
from nexus.core.config import get_settings

logger = logging.getLogger(__name__)


class ConfigurationManager:
    """Global configuration manager for RetrieverService framework.

    This class manages configuration settings for the RetrieverService framework,
    providing centralized access to default configuration values loaded from
    application settings.

    The manager integrates with existing Nexus configuration patterns and
    provides type-safe access to configuration settings.

    Example Usage:
        ```python
        manager = ConfigurationManager()

        # Get default configurations
        llm_config = manager.get_llm_configuration()
        keyword_config = manager.get_keyword_configuration()
        ```
    """

    def __init__(self) -> None:
        """Initialize configuration manager with default settings."""
        self._default_llm_config: RelevancyConfiguration | None = None
        self._default_keyword_config: RelevancyConfiguration | None = None
        self._loaded = False
        logger.debug("Initialized ConfigurationManager")

    def _load_default_configurations(self) -> None:
        """Load default configurations for built-in checker types from settings."""
        if self._loaded:
            return

        # Get settings from the main configuration
        settings = get_settings()

        # LLM configuration using settings
        self._default_llm_config = RelevancyConfiguration(
            checker_type="llm",
            similarity_threshold=settings.retriever_llm_similarity_threshold,
            max_results=settings.retriever_llm_max_results,
            ranking_weights={"content_similarity": 0.7, "file_metadata_relevance": 0.2, "recency": 0.1},
            algorithm_parameters={
                "model": settings.retriever_llm_model,
                "temperature": settings.retriever_llm_temperature,
                "max_tokens": settings.retriever_llm_max_tokens,
                "system_prompt": (
                    "You are a document relevancy scorer. Given a query and document content, "
                    "score the relevance from 0.0 to 1.0. Consider semantic meaning, context, "
                    "and specific information that answers the query. Return only the numeric score."
                ),
            },
            grounding_parameters={
                "include_file_metadata": True,
                "context_window_size": settings.retriever_context_window_size,
                "use_title_weighting": True,
            },
            recency_weight=0.1,
            mmr_settings={"lambda_param": 0.7, "enable_mmr": False},
        )

        # Keyword configuration using settings
        self._default_keyword_config = RelevancyConfiguration(
            checker_type="keyword",
            similarity_threshold=settings.retriever_keyword_similarity_threshold,
            max_results=settings.retriever_keyword_max_results,
            ranking_weights={
                "term_frequency": 0.4,
                "filename_match": 0.3,
                "content_density": 0.2,
                "exact_match_bonus": 0.1,
            },
            algorithm_parameters={
                "case_sensitive": settings.retriever_keyword_case_sensitive,
                "stem_words": settings.retriever_keyword_stem_words,
                "remove_stopwords": settings.retriever_keyword_remove_stopwords,
                "phrase_bonus_multiplier": settings.retriever_keyword_phrase_bonus_multiplier,
                "proximity_scoring": True,
                "fuzzy_matching": False,
            },
            grounding_parameters={
                "boost_title_matches": True,
                "boost_filename_matches": True,
                "penalty_for_short_documents": False,
            },
            recency_weight=0.05,
            mmr_settings={"lambda_param": 0.5, "enable_mmr": False},
        )

        self._loaded = True
        logger.info(
            "Loaded configurations from settings: LLM (model=%s, threshold=%.2f), Keyword (threshold=%.2f)",
            settings.retriever_llm_model,
            settings.retriever_llm_similarity_threshold,
            settings.retriever_keyword_similarity_threshold,
        )

    def get_llm_configuration(self) -> RelevancyConfiguration:
        """Get default configuration for LLM relevancy checking.

        Returns:
            Default RelevancyConfiguration for LLM checker

        """
        self._load_default_configurations()
        if self._default_llm_config is None:
            error_msg = "LLM configuration not available"
            raise ConfigurationError(error_msg)
        return self._default_llm_config

    def get_keyword_configuration(self) -> RelevancyConfiguration:
        """Get default configuration for keyword relevancy checking.

        Returns:
            Default RelevancyConfiguration for keyword checker

        """
        self._load_default_configurations()
        if self._default_keyword_config is None:
            error_msg = "Keyword configuration not available"
            raise ConfigurationError(error_msg)
        return self._default_keyword_config
