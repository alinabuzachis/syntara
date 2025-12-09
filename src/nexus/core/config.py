"""Application configuration using Pydantic Settings.

This module provides centralized configuration management using Pydantic Settings,
which offers:
- Type validation
- Environment variable loading with .env file support
- Clear defaults and documentation
- IDE autocomplete support

Usage:
    from nexus.core.config import get_settings

    settings = get_settings()
    llm = get_openrouter_llm(api_key=settings.openrouter_api_key)
"""

import os
import tempfile
from functools import lru_cache
from urllib.parse import quote_plus
from uuid import UUID

from pydantic import Field, HttpUrl, SecretStr, computed_field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

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
# Valkey Configuration
# =============================================================================


class ValkeySettings(BaseSettings):
    """Valkey (Redis-compatible) configuration for event streaming.

    Used for persistent event storage and multi-client synchronization.
    Valkey provides Redis-compatible streams for event caching and replay.
    """

    valkey_host: str = Field(
        default="localhost",
        description="Valkey server hostname",
    )

    valkey_port: int = Field(
        default=6379,
        description="Valkey server port",
    )

    valkey_db: int = Field(
        default=0,
        description="Valkey database number",
    )

    valkey_password: SecretStr = Field(
        default=SecretStr("valkey"),  # Default matches podman-compose.yml
        description="Valkey server password (if required)",
    )

    valkey_stream_ttl_seconds: int = Field(
        default=86400,  # 24 hours
        description="Time-to-live for streaming event streams in seconds",
    )

    valkey_connection_pool_size: int = Field(
        default=10,
        description="Maximum number of Valkey connections in pool",
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
        default="anthropic/claude-3.5-sonnet",
        description="OpenRouter model for LLM relevancy checking",
    )

    retriever_llm_temperature: float = Field(
        default=0.3,
        description="Temperature for LLM relevancy checking",
        ge=0.0,
        le=2.0,
    )

    retriever_llm_max_tokens: int = Field(
        default=150,
        description="Maximum tokens for LLM relevancy responses",
        ge=1,
        le=4000,
    )

    retriever_llm_similarity_threshold: float = Field(
        default=0.7,
        description="Similarity threshold for LLM relevancy filtering",
        ge=0.0,
        le=1.0,
    )

    retriever_llm_max_results: int = Field(
        default=10,
        description="Maximum results returned by LLM relevancy checking",
        ge=1,
        le=1000,
    )

    # Keyword Relevancy Checker Configuration
    retriever_keyword_similarity_threshold: float = Field(
        default=0.4,
        description="Similarity threshold for keyword relevancy filtering",
        ge=0.0,
        le=1.0,
    )

    retriever_keyword_max_results: int = Field(
        default=15,
        description="Maximum results returned by keyword relevancy checking",
        ge=1,
        le=1000,
    )

    retriever_keyword_case_sensitive: bool = Field(
        default=False,
        description="Whether keyword matching is case sensitive",
    )

    retriever_keyword_stem_words: bool = Field(
        default=True,
        description="Whether to apply word stemming in keyword matching",
    )

    retriever_keyword_remove_stopwords: bool = Field(
        default=True,
        description="Whether to remove stopwords in keyword processing",
    )

    retriever_keyword_phrase_bonus_multiplier: float = Field(
        default=1.5,
        description="Multiplier bonus for exact phrase matches",
        ge=0.1,
        le=10.0,
    )

    # General Retriever Configuration
    retriever_context_window_size: int = Field(
        default=2000,
        description="Maximum characters for document content excerpt",
        ge=100,
        le=10000,
    )

    retriever_cache_ttl_seconds: int = Field(
        default=300,
        description="Time-to-live for relevancy cache entries in seconds",
        ge=60,
        le=3600,
    )

    retriever_cache_max_size: int = Field(
        default=100,
        description="Maximum number of entries in relevancy cache",
        ge=10,
        le=1000,
    )


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
            raise ValueError(msg)
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
    ValkeySettings,
    DatabaseSettings,
    ServerSettings,
    RetrieverServiceSettings,
    AdapterRetrySettings,
    LoggingSettings,
    TemporalSettings,
    ContextManagerSettings,
    WorkflowEngineSettings,
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
