"""Application configuration using Pydantic Settings.

This module provides centralized configuration management using Pydantic Settings,
which offers:
- Type validation
- Environment variable loading with .env file support
- Clear defaults and documentation
- IDE autocomplete support

Usage:
    from nexus.core.config.base import get_settings

    settings = get_settings()
    llm = get_openrouter_llm(api_key=settings.openrouter_api_key)
"""

import os
import tempfile
from functools import lru_cache
from typing import Any, Self
from urllib.parse import quote_plus
from uuid import UUID

from pydantic import Field, HttpUrl, SecretStr, computed_field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from nexus.core.constants import RetrieverServiceDefaults
from nexus.core.exceptions import SafeValueError

# =============================================================================
# LLM Provider Configuration
# =============================================================================


class OpenRouterSettings(BaseSettings):
    """OpenRouter LLM configuration settings.

    OpenRouter provides API gateway to multiple LLMs (Claude, GPT-4, Gemini, etc.).
    Get your API key from: https://openrouter.ai/keys

    Note: This class should not be instantiated directly. Use Settings via get_settings().
    """

    openrouter_api_key: SecretStr | None = Field(
        default=None,
        description="OpenRouter API key for LLM access",
    )

    openrouter_model: str = Field(
        default="anthropic/claude-3.5-sonnet",
        description="Default OpenRouter model to use (e.g., anthropic/claude-3.5-sonnet, openai/gpt-4)",
    )

    openrouter_base_url: HttpUrl = Field(  # type: ignore[assignment]
        default="https://openrouter.ai/api/v1",
        description="OpenRouter API base URL",
    )

    openrouter_temperature: float = Field(
        default=0.7,
        description="LLM temperature (0.0-1.0) for response randomness",
        ge=0.0,
        le=1.0,
    )

    openrouter_max_tokens: int = Field(
        default=1000,
        description="Maximum tokens in LLM response",
        ge=1,
    )


# =============================================================================
# File Upload Configuration
# =============================================================================


class FileUploadSettings(BaseSettings):
    """File upload configuration settings.

    Settings for file attachment support in invocations.

    Note: This class should not be instantiated directly. Use Settings via get_settings().
    """

    file_upload_max_size_mb: int = Field(
        default=10,
        description="Maximum file size in MB per file",
    )

    file_upload_max_files: int = Field(
        default=10,
        description="Maximum number of files per invocation",
    )

    file_upload_storage_dir: str = Field(
        default_factory=tempfile.gettempdir,
        description="Storage directory for uploaded files",
    )

    file_upload_allowed_mime_types: list[str] = Field(
        default=[
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "text/plain",
            "text/markdown",
        ],
        description="Allowed MIME types for file uploads",
    )


# =============================================================================
# Document Conversion Configuration
# =============================================================================


class DocumentConversionSettings(BaseSettings):
    """Document conversion configuration settings.

    Settings specific to document conversion operations.
    Builds upon FileUploadSettings for consistency.

    Note: This class should not be instantiated directly. Use Settings via get_settings().
    """

    document_conversion_timeout_seconds: int = Field(
        default=30,
        description="Maximum time allowed for document conversion (NFR-001: under 30 seconds)",
        ge=1,
        le=300,  # 5 minute absolute maximum
    )

    document_conversion_overwrite_existing: bool = Field(
        default=False,
        description="Whether to overwrite existing converted files",
    )

    document_conversion_temp_dir: str = Field(
        default_factory=tempfile.gettempdir,
        description="Temporary directory for conversion operations",
    )


# =============================================================================
# API Validation Configuration
# =============================================================================


class OpenAPIValidationSettings(BaseSettings):
    """OpenAPI schema validation configuration settings.

    This configuration controls the validation of FastAPI routes against
    OpenAPI schema specifications. This is NOT related to OpenRouter (the LLM service).

    Note: This class should not be instantiated directly. Use Settings via get_settings().
    """

    openapi_validation_enabled: bool = Field(
        default=True,
        description="Enable OpenAPI schema validation at startup",
    )


# =============================================================================
# Router Discovery Configuration
# =============================================================================


class RouterDiscoverySettings(BaseSettings):
    """Router discovery configuration settings.

    Controls automatic router discovery and registration behavior.

    Note: This class should not be instantiated directly. Use Settings via get_settings().
    """

    router_discovery_enabled: bool = Field(
        default=True,
        description="Enable automatic router discovery and registration",
    )

    router_exclude_modules: str = Field(
        default="",
        description="Comma-separated list of module names to exclude from discovery (e.g., 'core,utils,websocket')",
    )


# =============================================================================
# Cache Configuration
# =============================================================================


class CacheSettings(BaseSettings):
    """Cache configuration for event streaming.

    Used for persistent event storage and multi-client synchronization.
    Currently implemented using Redis.
    """

    cache_host: str = Field(
        default="localhost",
        description="Cache server hostname",
    )

    cache_port: int = Field(
        default=6379,
        description="Cache server port",
    )

    cache_db: int = Field(
        default=0,
        description="Cache database number",
    )

    cache_password: SecretStr = Field(
        default=SecretStr("cache"),
        description="Cache server password (if required)",
    )

    cache_stream_ttl_seconds: int = Field(
        default=86400,  # 24 hours
        description="Time-to-live for streaming event streams in seconds",
    )

    cache_connection_pool_size: int = Field(
        default=10,
        description="Maximum number of cache connections in pool",
    )


# =============================================================================
# Database Configuration
# =============================================================================


class DatabaseSettings(BaseSettings):
    """Database connection configuration settings.

    Configures PostgreSQL connection parameters. You can either:
    1. Set individual NEXUS_DB_* variables (user, password, host, port, name)
    2. Set NEXUS_DATABASE_URL to override with a full connection string

    The full URL option supports URL-encoded passwords, alternate drivers,
    and extra query params (e.g., sslmode=require).

    Note: This class should not be instantiated directly. Use Settings via get_settings().
    """

    db_user: str = Field(
        default="admin",
        description="Database username",
    )

    db_password: SecretStr = Field(
        default=SecretStr("admin"),
        description="Database password",
    )

    db_host: str = Field(
        default="localhost",
        description="Database host",
    )

    db_port: int = Field(
        default=5432,
        description="Database port",
        ge=1,
        le=65535,
    )

    db_name: str = Field(
        default="nexus_api",
        description="Database name",
    )

    db_pool_size: int = Field(
        default=10,
        description="Maximum number of persistent database connections in SQLAlchemy pool",
        ge=1,
    )

    db_max_overflow: int = Field(
        default=20,
        description="Maximum number of overflow connections beyond db_pool_size",
        ge=0,
    )

    db_pool_timeout_seconds: float = Field(
        default=30.0,
        description="Seconds to wait for a free connection before pool checkout timeout",
        gt=0,
    )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def database_url(self) -> str:
        """Get the database URL.

        If NEXUS_DATABASE_URL env var is set, use it directly.
        Otherwise, compute from individual NEXUS_DB_* components.

        Note: Username and password are URL-encoded to handle special characters.
        """
        override = os.environ.get("NEXUS_DATABASE_URL")
        if override:
            return override
        user = quote_plus(self.db_user)
        password = quote_plus(self.db_password.get_secret_value())
        return f"postgresql+asyncpg://{user}:{password}@{self.db_host}:{self.db_port}/{self.db_name}"


# =============================================================================
# Server Configuration
# =============================================================================


class ServerSettings(BaseSettings):
    """Server and CORS configuration settings.

    Configures uvicorn server parameters and CORS middleware.

    Note: This class should not be instantiated directly. Use Settings via get_settings().
    """

    server_host: str = Field(
        default="0.0.0.0",  # noqa: S104
        description="Server bind host",
    )

    server_port: int = Field(
        default=8000,
        description="Server bind port",
        ge=1,
        le=65535,
    )

    server_reload: bool = Field(
        default=False,
        description="Enable hot reload (development only)",
    )

    workflow_base_url: str | None = Field(
        default=None,
        description=(
            "Workflow API base URL for callback URL generation (e.g., 'http://nexus:8000/api/v1'). "
            "If not set, will be constructed from server_host and server_port. "
            "Used by workflow activities to generate callback URLs for external services."
        ),
    )

    # CORS configuration
    cors_allow_origins: list[str] = Field(
        default=["*"],
        description="Allowed origins for CORS",
    )

    cors_allow_credentials: bool = Field(
        default=True,
        description="Allow credentials in CORS requests",
    )

    cors_allow_methods: list[str] = Field(
        default=["*"],
        description="Allowed HTTP methods for CORS",
    )

    cors_allow_headers: list[str] = Field(
        default=["*"],
        description="Allowed headers for CORS",
    )


# =============================================================================
# Retriever Service Configuration
# =============================================================================


class RetrieverServiceSettings(BaseSettings):
    """RetrieverService configuration settings.

    Configuration settings for the RetrieverService framework for document
    retrieval and relevancy checking.
    """

    # LLM Relevancy Checker Configuration
    retriever_llm_model: str = Field(
        default=RetrieverServiceDefaults.LLM_MODEL,
        description="OpenRouter model for LLM relevancy checking",
    )

    retriever_llm_temperature: float = Field(
        default=RetrieverServiceDefaults.LLM_TEMPERATURE,
        description="Temperature for LLM relevancy checking",
        ge=0.0,
        le=2.0,
    )

    retriever_llm_max_tokens: int = Field(
        default=RetrieverServiceDefaults.LLM_MAX_TOKENS,
        description="Maximum tokens for LLM relevancy responses",
        ge=1,
        le=4000,
    )

    retriever_llm_similarity_threshold: float = Field(
        default=RetrieverServiceDefaults.LLM_SIMILARITY_THRESHOLD,
        description="Similarity threshold for LLM relevancy filtering",
        ge=0.0,
        le=1.0,
    )

    retriever_llm_max_results: int = Field(
        default=RetrieverServiceDefaults.LLM_MAX_RESULTS,
        description="Maximum results returned by LLM relevancy checking",
        ge=1,
        le=1000,
    )

    # Keyword Relevancy Checker Configuration
    retriever_keyword_similarity_threshold: float = Field(
        default=RetrieverServiceDefaults.KEYWORD_SIMILARITY_THRESHOLD,
        description="Similarity threshold for keyword relevancy filtering",
        ge=0.0,
        le=1.0,
    )

    retriever_keyword_max_results: int = Field(
        default=RetrieverServiceDefaults.KEYWORD_MAX_RESULTS,
        description="Maximum results returned by keyword relevancy checking",
        ge=1,
        le=1000,
    )

    retriever_keyword_case_sensitive: bool = Field(
        default=RetrieverServiceDefaults.KEYWORD_CASE_SENSITIVE,
        description="Whether keyword matching is case sensitive",
    )

    retriever_keyword_stem_words: bool = Field(
        default=RetrieverServiceDefaults.KEYWORD_STEM_WORDS,
        description="Whether to apply word stemming in keyword matching",
    )

    retriever_keyword_remove_stopwords: bool = Field(
        default=RetrieverServiceDefaults.KEYWORD_REMOVE_STOPWORDS,
        description="Whether to remove stopwords in keyword processing",
    )

    retriever_keyword_phrase_bonus_multiplier: float = Field(
        default=RetrieverServiceDefaults.KEYWORD_PHRASE_BONUS_MULTIPLIER,
        description="Multiplier bonus for exact phrase matches",
        ge=0.1,
        le=10.0,
    )

    # General Retriever Configuration
    retriever_context_window_size: int = Field(
        default=RetrieverServiceDefaults.CONTEXT_WINDOW_SIZE,
        description="Maximum characters for document content excerpt",
        ge=100,
        le=10000,
    )

    # LLM Relevancy Configuration Defaults
    retriever_llm_ranking_content_similarity: float = Field(
        default=RetrieverServiceDefaults.LLM_RANKING_CONTENT_SIMILARITY,
        description="Weight for content similarity in LLM relevancy ranking",
        ge=0.0,
        le=1.0,
    )

    retriever_llm_ranking_file_metadata_relevance: float = Field(
        default=RetrieverServiceDefaults.LLM_RANKING_FILE_METADATA_RELEVANCE,
        description="Weight for file metadata relevance in LLM relevancy ranking",
        ge=0.0,
        le=1.0,
    )

    retriever_llm_ranking_recency: float = Field(
        default=RetrieverServiceDefaults.LLM_RANKING_RECENCY,
        description="Weight for recency in LLM relevancy ranking",
        ge=0.0,
        le=1.0,
    )

    retriever_llm_system_prompt: str = Field(
        default=RetrieverServiceDefaults.LLM_SYSTEM_PROMPT,
        description="System prompt for LLM relevancy checking",
    )

    retriever_llm_include_file_metadata: bool = Field(
        default=RetrieverServiceDefaults.LLM_INCLUDE_FILE_METADATA,
        description="Whether to include file metadata in LLM grounding",
    )

    retriever_llm_use_title_weighting: bool = Field(
        default=RetrieverServiceDefaults.LLM_USE_TITLE_WEIGHTING,
        description="Whether to use title weighting in LLM grounding",
    )

    retriever_llm_recency_weight: float = Field(
        default=RetrieverServiceDefaults.LLM_RECENCY_WEIGHT,
        description="Recency weight for LLM relevancy configuration",
        ge=0.0,
        le=1.0,
    )

    retriever_llm_mmr_lambda_param: float = Field(
        default=RetrieverServiceDefaults.LLM_MMR_LAMBDA_PARAM,
        description="Lambda parameter for LLM MMR (Maximal Marginal Relevance)",
        ge=0.0,
        le=1.0,
    )

    retriever_llm_mmr_enabled: bool = Field(
        default=RetrieverServiceDefaults.LLM_MMR_ENABLED,
        description="Whether to enable MMR for LLM relevancy",
    )

    # Keyword Relevancy Configuration Defaults
    retriever_keyword_ranking_term_frequency: float = Field(
        default=RetrieverServiceDefaults.KEYWORD_RANKING_TERM_FREQUENCY,
        description="Weight for term frequency in keyword relevancy ranking",
        ge=0.0,
        le=1.0,
    )

    retriever_keyword_ranking_filename_match: float = Field(
        default=RetrieverServiceDefaults.KEYWORD_RANKING_FILENAME_MATCH,
        description="Weight for filename match in keyword relevancy ranking",
        ge=0.0,
        le=1.0,
    )

    retriever_keyword_ranking_content_density: float = Field(
        default=RetrieverServiceDefaults.KEYWORD_RANKING_CONTENT_DENSITY,
        description="Weight for content density in keyword relevancy ranking",
        ge=0.0,
        le=1.0,
    )

    retriever_keyword_ranking_proximity_bonus: float = Field(
        default=RetrieverServiceDefaults.KEYWORD_RANKING_PROXIMITY_BONUS,
        description="Weight for proximity bonus in keyword relevancy ranking",
        ge=0.0,
        le=1.0,
    )

    retriever_keyword_ranking_exact_match_bonus: float = Field(
        default=RetrieverServiceDefaults.KEYWORD_RANKING_EXACT_MATCH_BONUS,
        description="Weight for exact match bonus in keyword relevancy ranking",
        ge=0.0,
        le=1.0,
    )

    retriever_keyword_ranking_fuzzy_match_bonus: float = Field(
        default=RetrieverServiceDefaults.KEYWORD_RANKING_FUZZY_MATCH_BONUS,
        description="Weight for fuzzy match bonus in keyword relevancy ranking",
        ge=0.0,
        le=1.0,
    )

    retriever_keyword_proximity_scoring: bool = Field(
        default=RetrieverServiceDefaults.KEYWORD_PROXIMITY_SCORING,
        description="Whether to enable proximity scoring in keyword matching",
    )

    retriever_keyword_fuzzy_matching: bool = Field(
        default=RetrieverServiceDefaults.KEYWORD_FUZZY_MATCHING,
        description="Whether to enable fuzzy matching in keyword relevancy",
    )

    retriever_keyword_boost_title_matches: bool = Field(
        default=RetrieverServiceDefaults.KEYWORD_BOOST_TITLE_MATCHES,
        description="Whether to boost title matches in keyword grounding",
    )

    retriever_keyword_boost_filename_matches: bool = Field(
        default=RetrieverServiceDefaults.KEYWORD_BOOST_FILENAME_MATCHES,
        description="Whether to boost filename matches in keyword grounding",
    )

    retriever_keyword_penalty_for_short_documents: bool = Field(
        default=RetrieverServiceDefaults.KEYWORD_PENALTY_FOR_SHORT_DOCUMENTS,
        description="Whether to apply penalty for short documents in keyword grounding",
    )

    retriever_keyword_recency_weight: float = Field(
        default=RetrieverServiceDefaults.KEYWORD_RECENCY_WEIGHT,
        description="Recency weight for keyword relevancy configuration",
        ge=0.0,
        le=1.0,
    )

    retriever_keyword_mmr_lambda_param: float = Field(
        default=RetrieverServiceDefaults.KEYWORD_MMR_LAMBDA_PARAM,
        description="Lambda parameter for keyword MMR (Maximal Marginal Relevance)",
        ge=0.0,
        le=1.0,
    )

    retriever_keyword_mmr_enabled: bool = Field(
        default=RetrieverServiceDefaults.KEYWORD_MMR_ENABLED,
        description="Whether to enable MMR for keyword relevancy",
    )

    @model_validator(mode="after")
    def validate_keyword_ranking_weights_sum(self) -> Self:
        """Validate that all keyword ranking weights sum to between 0.0 and 1.0.

        This validator runs after all fields are processed and checks that the
        sum of all keyword ranking weights is within the valid range.
        """
        # Get all keyword ranking weight values from the model instance
        weights = [
            self.retriever_keyword_ranking_term_frequency,
            self.retriever_keyword_ranking_filename_match,
            self.retriever_keyword_ranking_content_density,
            self.retriever_keyword_ranking_proximity_bonus,
            self.retriever_keyword_ranking_exact_match_bonus,
            self.retriever_keyword_ranking_fuzzy_match_bonus,
        ]

        total = sum(weights)
        if not (0.0 <= total <= 1.0):
            field_names = [
                "retriever_keyword_ranking_term_frequency",
                "retriever_keyword_ranking_filename_match",
                "retriever_keyword_ranking_content_density",
                "retriever_keyword_ranking_proximity_bonus",
                "retriever_keyword_ranking_exact_match_bonus",
                "retriever_keyword_ranking_fuzzy_match_bonus",
            ]
            msg = (
                f"Keyword ranking weights must sum to between 0.0 and 1.0, "
                f"but sum to {total:.3f}. Affected fields: {', '.join(field_names)}"
            )
            raise SafeValueError(msg)

        return self


# =============================================================================
# LLM Adapter Retry Configuration
# =============================================================================


class AdapterRetrySettings(BaseSettings):
    """LLM adapter retry and recovery configuration settings.

    Configures retry behavior for LLM adapter operations to handle transient
    failures (network issues, rate limiting, temporary service outages).

    Note: This class should not be instantiated directly. Use Settings via get_settings().
    """

    adapter_max_retries: int = Field(
        default=3,
        description="Maximum number of retry attempts (0 disables retries)",
        ge=0,
    )

    adapter_initial_backoff_seconds: float = Field(
        default=1.0,
        description="Initial delay before first retry in seconds",
        gt=0,
    )

    adapter_backoff_growth_factor: float = Field(
        default=2.0,
        description="Exponential growth factor for backoff delays (1.0 = fixed, >1.0 = exponential)",
        ge=1.0,
    )

    adapter_max_backoff_seconds: float = Field(
        default=10.0,
        description="Maximum cap for backoff delay in seconds",
        gt=0,
    )

    adapter_request_timeout_seconds: float = Field(
        default=30.0,
        description="Per-attempt timeout to prevent unbounded wait times (applies to initial + all retries)",
        gt=0,
    )

    @model_validator(mode="after")
    def validate_backoff_relationship(self) -> "AdapterRetrySettings":
        """Validate that max_backoff >= initial_backoff.

        This ensures exponential backoff works as intended. If max < initial,
        all retry attempts would be immediately capped to max, defeating the
        purpose of exponential growth.
        """
        if self.adapter_max_backoff_seconds < self.adapter_initial_backoff_seconds:
            msg = (
                f"adapter_max_backoff_seconds ({self.adapter_max_backoff_seconds}) "
                f"must be >= adapter_initial_backoff_seconds ({self.adapter_initial_backoff_seconds})"
            )
            raise SafeValueError(msg)
        return self


# =============================================================================
# Logging Configuration
# =============================================================================


class LoggingSettings(BaseSettings):
    """Logging configuration settings.

    Note: This class should not be instantiated directly. Use Settings via get_settings().
    """

    log_level: str = Field(
        default="INFO",
        description="Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)",
    )
    log_output_format: str = Field(
        default="json",
        description="Log output format (json, text)",
    )

    @property
    def uvicorn_logging_config(self) -> dict[str, Any]:
        """Get uvicorn logging configuration with dynamic log level."""
        return {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "nexus": {
                    "()": "nexus.core.logging.logging.build_nexus_formatter",
                },
            },
            "handlers": {
                "nexus": {
                    "formatter": "nexus",
                    "class": "logging.StreamHandler",
                    "stream": "ext://sys.stdout",
                },
            },
            "loggers": {
                "uvicorn": {"handlers": ["nexus"], "level": self.log_level, "propagate": False},
                "uvicorn.error": {"handlers": ["nexus"], "level": self.log_level, "propagate": False},
                "uvicorn.access": {"handlers": ["nexus"], "level": self.log_level, "propagate": False},
            },
            "root": {
                "handlers": ["nexus"],
                "level": self.log_level,
            },
        }


# =============================================================================
# Temporal Configuration
# =============================================================================


class TemporalSettings(BaseSettings):
    """Temporal workflow engine configuration settings.

    Configures connection to Temporal server for workflow orchestration.

    Note: This class should not be instantiated directly. Use Settings via get_settings().
    """

    temporal_address: str = Field(
        default="localhost:7233",
        description="Temporal server address (host:port)",
    )

    temporal_namespace: str = Field(
        default="default",
        description="Temporal namespace for workflow isolation",
    )

    task_queue: str = Field(
        default="nexus-workflow-queue",
        description="Temporal task queue name for workflow routing",
    )

    system_user_id: UUID = Field(
        default=UUID("00000000-0000-0000-0000-000000000001"),
        description="System user UUID for automated/workflow operations",
    )

    max_loop_iterations: int = Field(
        default=10000,
        description="Maximum iterations for loops to prevent runaway execution",
        ge=1,
    )


# =============================================================================
# Context Manager Configuration
# =============================================================================


class ContextManagerSettings(BaseSettings):
    """Context Manager configuration settings.

    Provides configuration for context retrieval, compression, assembly,
    and grounding score requirements.

    Note: This class should not be instantiated directly. Use Settings via get_settings().
    """

    # Grounding score requirements
    context_manager_required_grounding_score: float = Field(
        default=0.7,
        description="Required grounding score threshold",
        ge=0.0,
        le=1.0,
    )

    context_manager_minimum_grounding_score: float = Field(
        default=0.5,
        description="Minimum grounding score threshold",
        ge=0.0,
        le=1.0,
    )

    # Token budget settings
    context_manager_max_total_tokens: int = Field(
        default=4000,
        description="Maximum total tokens in context package",
        ge=1,
    )

    context_manager_max_context_tokens: int = Field(
        default=3000,
        description="Maximum tokens for context content",
        ge=1,
    )

    context_manager_max_system_tokens: int = Field(
        default=500,
        description="Maximum tokens for system prompts",
        ge=1,
    )

    context_manager_max_user_tokens: int = Field(
        default=500,
        description="Maximum tokens for user messages",
        ge=1,
    )

    # Retrieval settings
    context_manager_default_k: int = Field(
        default=10,
        description="Default number of documents to retrieve",
        ge=1,
    )

    context_manager_enable_hybrid_search: bool = Field(
        default=True,
        description="Enable hybrid search (semantic + lexical)",
    )

    context_manager_semantic_weight: float = Field(
        default=0.7,
        description="Weight for semantic search in hybrid mode",
        ge=0.0,
        le=1.0,
    )

    context_manager_lexical_weight: float = Field(
        default=0.3,
        description="Weight for lexical search in hybrid mode",
        ge=0.0,
        le=1.0,
    )

    # Compression settings
    context_manager_compression_mode: str = Field(
        default="extractive",
        description="Compression mode (extractive, abstractive, etc.)",
    )

    context_manager_max_snippets_per_doc: int = Field(
        default=3,
        description="Maximum number of snippets to extract per document",
        ge=1,
    )

    context_manager_snippet_min_length: int = Field(
        default=100,
        description="Minimum length of extracted snippets in characters",
        ge=1,
    )

    context_manager_snippet_max_length: int = Field(
        default=500,
        description="Maximum length of extracted snippets in characters",
        ge=1,
    )

    # Assembly settings
    context_manager_enforce_hierarchy: bool = Field(
        default=True,
        description="Enforce hierarchical ordering of context sections",
    )

    context_manager_priority_order: list[str] = Field(
        default=["system", "context", "user"],
        description="Priority order for context sections",
    )

    context_manager_include_citations: bool = Field(
        default=True,
        description="Include source citations in assembled context",
    )

    # Timing and performance
    context_manager_request_timeout_seconds: int = Field(
        default=30,
        description="Maximum time allowed for context manager requests",
        ge=1,
    )

    context_manager_max_concurrent_requests: int = Field(
        default=5,
        description="Maximum number of concurrent context requests",
        ge=1,
    )

    context_manager_compression_temperature: float = Field(
        default=0.3,
        description="LLM temperature for compression operations (0.0-1.0)",
        ge=0.0,
        le=1.0,
    )

    context_manager_compression_max_tokens: int = Field(
        default=2000,
        description="Maximum tokens for compression LLM responses",
        ge=1,
    )


# =============================================================================
# Telemetry Configuration
# =============================================================================


class TelemetrySettings(BaseSettings):
    """Telemetry configuration settings for Segment.com integration.

    Configures the Segment Analytics SDK for workflow runtime telemetry.
    Telemetry is always enabled per specification (FR-014).

    Note: This class should not be instantiated directly. Use Settings via get_settings().
    """

    segment_write_key: SecretStr = Field(
        default=SecretStr(""),
        description="Segment write API key for telemetry transmission",
    )

    segment_endpoint: HttpUrl = Field(  # type: ignore[assignment]
        default="https://api.segment.io",
        description="Segment API endpoint URL",
    )

    entitlement_id: str = Field(
        default="",
        description="Unique Nexus installation identifier for anonymized telemetry tracking",
    )

    collection_interval_seconds: int = Field(
        default=300,
        description="Interval in seconds between periodic analytics collection cycles",
    )


# =============================================================================
# Workflow Engine Configuration
# =============================================================================


class WorkflowEngineSettings(BaseSettings):
    """Workflow execution settings and configuration.

    Provides configuration for workflow execution timeouts, limits, and validation.

    Note: This class should not be instantiated directly. Use Settings via get_settings().
    """

    # Activity execution timeouts
    api_timeout_seconds: int = Field(
        default=30,
        description="Default timeout for API requests in seconds",
        ge=1,
    )

    script_timeout_seconds: int = Field(
        default=300,
        description="Default timeout for script execution in seconds (5 minutes)",
        ge=1,
    )

    agentic_timeout_seconds: int = Field(
        default=300,
        description="Default timeout for agentic activities in seconds (5 minutes)",
        ge=1,
    )

    # Duration validation limits (0 = unlimited)
    max_duration_hours: int = Field(
        default=8760,
        description="Maximum duration in hours (8760 = 1 year, 0 = unlimited)",
        ge=0,
    )

    max_duration_minutes: int = Field(
        default=525600,
        description="Maximum duration in minutes (525600 = 1 year, 0 = unlimited)",
        ge=0,
    )

    max_duration_seconds: int = Field(
        default=31536000,
        description="Maximum duration in seconds (31536000 = 1 year, 0 = unlimited)",
        ge=0,
    )

    # Script execution settings
    script_cleanup_terminate_timeout: float = Field(
        default=1.0,
        description="Timeout in seconds for graceful process termination",
        ge=0.1,
    )

    script_cleanup_kill_timeout: float = Field(
        default=0.5,
        description="Timeout in seconds for forceful process kill",
        ge=0.1,
    )

    max_env_var_length: int = Field(
        default=32768,
        description="Maximum length per environment variable in bytes (32KB)",
        ge=1024,
    )

    # Agentic activity settings
    max_prompt_length: int = Field(
        default=100000,
        description="Maximum prompt length for agentic activities in characters (100KB)",
        ge=1000,
    )

    max_input_value_length: int = Field(
        default=10000,
        description="Maximum length for individual input values in characters (10KB)",
        ge=100,
    )

    max_total_input_size: int = Field(
        default=50000,
        description="Maximum total size of all input values combined in characters (50KB)",
        ge=1000,
    )

    agent_orchestrator_base_url: HttpUrl = Field(  # type: ignore[assignment]
        default="http://localhost:8000/api/v1",
        description="Base URL for Agent Orchestrator API",
    )

    # AAP (Ansible Automation Platform) settings
    # NOTE: These settings may be deprecated when AAP Tool integration is added.
    aap_base_url: str | None = Field(
        default=None,
        description="AAP Controller base URL (e.g., https://aap.example.com)",
    )

    aap_username: str | None = Field(
        default=None,
        description="AAP username for basic authentication (optional if using token)",
    )

    aap_password: SecretStr | None = Field(
        default=None,
        description="AAP password for basic authentication (optional if using token)",
    )

    aap_token: SecretStr | None = Field(
        default=None,
        description="AAP API token for token authentication (preferred over username/password)",
    )

    aap_timeout_seconds: int = Field(
        default=3600,
        description="Default timeout for AAP job template activities in seconds (1 hour)",
        ge=1,
    )

    aap_poll_interval_seconds: float = Field(
        default=5.0,
        description="AAP job status polling interval in seconds (AAP recommendation: 5 seconds)",
        ge=1.0,
    )

    aap_verify_ssl: bool = Field(
        default=True,
        description="Verify SSL certificates for AAP connections (set to False for self-signed certs in dev/test)",
    )


# =============================================================================
# Tool Manager Configuration
# =============================================================================


class ToolManagerSettings(BaseSettings):
    """Tool Manager client configuration settings.

    Configures the HTTP client for Tool Manager REST API integration.

    Note: This class should not be instantiated directly. Use Settings via get_settings().
    """

    tool_manager_base_url: HttpUrl = Field(  # type: ignore[assignment]
        default="http://localhost:8000/api/v1",
        description="Tool Manager API base URL",
    )

    tool_manager_timeout_seconds: float = Field(
        default=30.0,
        description="Request timeout in seconds",
        gt=0,
    )

    tool_manager_max_connections: int = Field(
        default=10,
        description="Maximum number of connections to maintain",
        ge=1,
    )

    tool_manager_max_keepalive_connections: int = Field(
        default=5,
        description="Maximum number of keepalive connections",
        ge=0,
    )

    @model_validator(mode="after")
    def validate_keepalive_connections(self) -> Self:
        """Validate that keepalive connections don't exceed max connections."""
        if self.tool_manager_max_keepalive_connections > self.tool_manager_max_connections:
            msg = (
                f"tool_manager_max_keepalive_connections ({self.tool_manager_max_keepalive_connections}) "
                f"cannot exceed tool_manager_max_connections ({self.tool_manager_max_connections})"
            )
            raise SafeValueError(msg)
        return self


# =============================================================================
# Metrics Configuration
# =============================================================================


class MetricsSettings(BaseSettings):
    """Performance metrics subsystem configuration.

    Controls recording and retention of raw performance metrics exposed via
    REST API and Prometheus endpoints.

    Note: This class should not be instantiated directly. Use Settings via get_settings().
    """

    metrics_retention_seconds: int = Field(
        default=86400,
        description="How long to retain raw metrics in memory (NFR-003)",
        ge=0,
    )

    metrics_max_records: int = Field(
        default=1_000_000,
        description="Maximum number of raw metrics to store in memory",
        ge=1,
    )

    metrics_enabled: bool = Field(
        default=True,
        description="Enable/disable metrics collection globally",
    )

    metrics_openmetrics_enabled: bool = Field(
        default=True,
        description="Enable OpenMetrics scrape endpoint (GET /api/v1/metrics/openmetrics)",
    )

    metrics_poller_interval_seconds: float = Field(
        default=15.0,
        description="Seconds between completion-poller cycles",
        gt=0,
    )

    metrics_poller_lookback_seconds: float = Field(
        default=120.0,
        description="How far back the completion poller queries for finished executions",
        gt=0,
    )

    metrics_poller_max_dedup_size: int = Field(
        default=50_000,
        description="Maximum size of the in-memory dedup set for emitted executions",
        ge=1,
    )


# =============================================================================
# Workflow Client Configuration
# =============================================================================


class WorkflowClientSettings(BaseSettings):
    """Workflow API client configuration settings.

    Configures the HTTP client for sending approval signals to workflow engine.

    Note: This class should not be instantiated directly. Use Settings via get_settings().
    """

    workflow_client_max_retries: int = Field(
        default=5,
        description="Maximum number of retry attempts (0 disables retries)",
        ge=0,
    )

    workflow_client_initial_backoff_seconds: float = Field(
        default=1.0,
        description="Initial delay before first retry in seconds",
        gt=0,
    )

    workflow_client_backoff_growth_factor: float = Field(
        default=2.0,
        description="Exponential growth factor for backoff delays (1.0 = fixed, >1.0 = exponential)",
        ge=1.0,
    )

    workflow_client_max_backoff_seconds: float = Field(
        default=10.0,
        description="Maximum cap for backoff delay in seconds",
        gt=0,
    )

    workflow_client_request_timeout_seconds: float = Field(
        default=30.0,
        description="Per-attempt timeout to prevent unbounded wait times (applies to initial + all retries)",
        gt=0,
    )

    @model_validator(mode="after")
    def validate_backoff_relationship(self) -> "WorkflowClientSettings":
        """Validate that max_backoff >= initial_backoff.

        This ensures exponential backoff works as intended. If max < initial,
        all retry attempts would be immediately capped to max, defeating the
        purpose of exponential growth.
        """
        if self.workflow_client_max_backoff_seconds < self.workflow_client_initial_backoff_seconds:
            msg = (
                f"workflow_client_max_backoff_seconds ({self.workflow_client_max_backoff_seconds}) "
                f"must be >= workflow_client_initial_backoff_seconds ({self.workflow_client_initial_backoff_seconds})"
            )
            raise SafeValueError(msg)
        return self


# =============================================================================
# Main Settings
# =============================================================================


def _get_env_file() -> str:
    """Get an optional custom .env file path."""
    return os.getenv("NEXUS_ENV_FILE_PATH", ".env")


class Settings(
    OpenRouterSettings,
    FileUploadSettings,
    DocumentConversionSettings,
    OpenAPIValidationSettings,
    RouterDiscoverySettings,
    CacheSettings,
    DatabaseSettings,
    ServerSettings,
    RetrieverServiceSettings,
    AdapterRetrySettings,
    LoggingSettings,
    TemporalSettings,
    ContextManagerSettings,
    WorkflowEngineSettings,
    ToolManagerSettings,
    WorkflowClientSettings,
    TelemetrySettings,
    MetricsSettings,
):
    """Application-wide settings.

    Combines all configuration sections into a single settings object.
    Defines the configuration for loading settings from environment variables and .env files.
    Additional settings can be added by inheriting from more BaseSettings classes.
    """

    model_config = SettingsConfigDict(
        env_file=_get_env_file(),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
        env_prefix="NEXUS_",
    )


@lru_cache
def get_settings() -> Settings:
    """Get cached application settings.

    Returns:
        Settings: Application configuration object

    Note:
        Settings are cached using lru_cache to avoid repeated .env file reads.
        Clear cache in tests if needed: get_settings.cache_clear()

    """
    return Settings()
