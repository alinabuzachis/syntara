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
import warnings
from enum import StrEnum
from functools import lru_cache
from pathlib import Path
from typing import Self
from uuid import UUID

from pydantic import Field, HttpUrl, SecretStr, computed_field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL, make_url

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
        default="anthropic/claude-sonnet-4",
        description="Default OpenRouter model to use (e.g., anthropic/claude-sonnet-4, openai/gpt-4o)",
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
    1. Set individual APP_DB_* variables (user, password, host, port, name)
    2. Set APP_DATABASE_URL to override with a full connection string

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
    def database_url(self) -> URL:
        """Get the database URL.

        If APP_DATABASE_URL env var is set, use it directly.
        Otherwise, compute from individual APP_DB_* components.

        Returns a SQLAlchemy URL object which redacts credentials in
        __repr__/__str__, preventing accidental exposure in logs.
        """
        override = os.environ.get("APP_DATABASE_URL")
        if override:
            return make_url(override)
        return URL.create(
            drivername="postgresql+asyncpg",
            username=self.db_user,
            password=self.db_password.get_secret_value(),
            host=self.db_host,
            port=self.db_port,
            database=self.db_name,
        )


# =============================================================================
# Audit Database Configuration
# =============================================================================


class AuditDatabaseSettings(BaseSettings):
    """Audit database connection configuration settings.

    Configures a separate PostgreSQL database for audit event persistence on the
    same database instance as the main application database.  The audit database
    uses a different database name (default ``nexus_audit``) and a dedicated
    database user (default ``nexus_audit``) to ensure credential wiring is
    validated.

    You can either:
    1. Set individual APP_AUDIT_DB_* variables (user, password, host, port, name)
    2. Set APP_AUDIT_DATABASE_URL to override with a full connection string

    Note: This class should not be instantiated directly. Use Settings via get_settings().
    """

    audit_db_user: str = Field(
        default="nexus_audit",
        description="Audit database username",
    )

    audit_db_password: SecretStr = Field(
        default=SecretStr("audit_pass"),
        description="Audit database password",
    )

    audit_db_host: str = Field(
        default="localhost",
        description="Audit database host",
    )

    audit_db_port: int = Field(
        default=5432,
        description="Audit database port",
        ge=1,
        le=65535,
    )

    audit_db_name: str = Field(
        default="nexus_audit",
        description="Audit database name",
    )

    audit_db_pool_size: int = Field(
        default=5,
        description="Maximum number of persistent audit database connections in SQLAlchemy pool",
        ge=1,
    )

    audit_db_max_overflow: int = Field(
        default=10,
        description="Maximum number of overflow connections beyond audit_db_pool_size",
        ge=0,
    )

    audit_db_pool_timeout_seconds: float = Field(
        default=30.0,
        description="Seconds to wait for a free connection before pool checkout timeout",
        gt=0,
    )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def audit_database_url(self) -> URL:
        """Get the audit database URL.

        If APP_AUDIT_DATABASE_URL env var is set, use it directly.
        Otherwise, compute from individual APP_AUDIT_DB_* components.

        Returns a SQLAlchemy URL object which redacts credentials in
        __repr__/__str__, preventing accidental exposure in logs.
        """
        override = os.environ.get("APP_AUDIT_DATABASE_URL")
        if override:
            return make_url(override)
        return URL.create(
            drivername="postgresql+asyncpg",
            username=self.audit_db_user,
            password=self.audit_db_password.get_secret_value(),
            host=self.audit_db_host,
            port=self.audit_db_port,
            database=self.audit_db_name,
        )


# =============================================================================
# Server Configuration
# =============================================================================


class ServerSettings(BaseSettings):
    """Server and CORS configuration settings.

    Configures uvicorn server parameters and CORS middleware.

    Note: This class should not be instantiated directly. Use Settings via get_settings().
    """

    server_scheme: str = Field(
        default="https",
        description="Server URL scheme (https or http). Defaults to https for security. "
        "Set to http for local development without TLS.",
    )

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

    # Database encryption key (Fernet, for encrypting sensitive fields at rest)
    db_encryption_key: SecretStr | None = Field(
        default=None,
        description=(
            "Fernet encryption key for encrypting sensitive fields at rest (e.g. client secrets). "
            "Generate with: python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'. "
            "Required for encrypting sensitive fields; operations will fail if not configured."
        ),
    )

    db_encryption_key_path: str | None = Field(
        default=None,
        description=(
            "Path to a file containing the Fernet encryption key. "
            "Preferred over db_encryption_key to avoid exposing the key in the process environment."
        ),
    )

    # CORS configuration
    cors_allow_origins: list[str] = Field(
        default_factory=list,
        description="Allowed origins for CORS (explicit list required when using credential cookies)",
    )

    cors_allow_credentials: bool = Field(
        default=True,
        description="Allow credentials in CORS requests",
    )

    cors_allow_methods: list[str] = Field(
        default=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        description="Allowed HTTP methods for CORS",
    )

    cors_allow_headers: list[str] = Field(
        default=["Authorization", "Content-Type", "Accept"],
        description="Allowed headers for CORS",
    )

    # OIDC security
    oidc_allow_private_networks: bool = Field(
        default=False,
        description="Allow OIDC identity providers on private/internal networks. "
        "Enable for environments with internal IdPs (e.g., corporate Keycloak on a private network). "
        "When disabled, OIDC issuer URLs that resolve to private, loopback, or link-local IPs are rejected.",
    )

    @model_validator(mode="after")
    def _load_db_encryption_key_from_path(self) -> "ServerSettings":
        """Load ``db_encryption_key`` from file if ``db_encryption_key_path`` is set."""
        if self.db_encryption_key is None and self.db_encryption_key_path is not None:
            key_text = Path(self.db_encryption_key_path).read_text().strip()
            self.db_encryption_key = SecretStr(key_text)
        return self

    @model_validator(mode="after")
    def _validate_cors(self) -> "ServerSettings":
        """Reject wildcard origins when credentials are enabled.

        Per the CORS specification, ``Access-Control-Allow-Origin: *`` is
        incompatible with ``Access-Control-Allow-Credentials: true``.
        """
        if self.cors_allow_credentials and "*" in self.cors_allow_origins:
            msg = "CORS: cors_allow_origins cannot contain '*' when cors_allow_credentials is True"
            raise ValueError(msg)
        return self


# =============================================================================
# Retriever Service Configuration
# =============================================================================


class RetrieverServiceSettings(BaseSettings):
    """RetrieverService configuration settings.

    Configuration settings for the RetrieverService framework for document
    retrieval and relevancy checking.
    """

    # LLM Relevancy Checker Configuration
    retriever_llm_model: str | None = Field(
        default=None,
        description="OpenRouter model for LLM relevancy checking (defaults to node credential model at runtime)",
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


class LogLevel(StrEnum):
    """Standard Python logging levels."""

    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"


class LoggingSettings(BaseSettings):
    """Logging configuration settings.

    Note: This class should not be instantiated directly. Use Settings via get_settings().
    """

    fallback_log_level: LogLevel = Field(
        default=LogLevel.INFO,
        description="Fallback logging level used before runtime settings are available. "
        "Once the database is ready, the runtime setting logging.log_level takes precedence.",
    )

    log_output_format: str = Field(
        default="json",
        description="Log output format (json, text)",
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

    aap_public_url: str | None = Field(
        default=None,
        description=(
            "Public-facing AAP Controller URL for browser links (e.g., https://aap.example.com). "
            "Defaults to aap_base_url. Set this when aap_base_url is an internal/cluster URL "
            "that should not be exposed to end users."
        ),
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

    aap_proxy_timeout_seconds: int = Field(
        default=30,
        description="Timeout for AAP proxy (BFF) requests in seconds — list/detail API calls, not job execution",
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


# =============================================================================
# JWT Authentication Configuration
# =============================================================================


class JWTSettings(BaseSettings):
    """JWT authentication configuration settings.

    Configures JWT token creation, validation, and key management for
    authentication. Uses ES256 (ECDSA P-256) algorithm for signing.

    Note: This class should not be instantiated directly. Use Settings via get_settings().
    """

    # JWT Token Configuration
    jwt_access_token_lifetime_minutes: int = Field(
        default=15,
        description="Access token lifetime in minutes",
        ge=1,
        le=60,
    )

    jwt_refresh_token_lifetime_hours: int = Field(
        default=8,
        description="Refresh token lifetime in hours",
        ge=1,
        le=720,  # 30 days max
    )

    # Key Management
    jwt_private_key_path: str | None = Field(
        default=None,
        description="Path to ES256 private key PEM file (if not set, generates ephemeral key)",
    )

    jwt_private_key_base64: SecretStr | None = Field(
        default=None,
        description="Base64-encoded ES256 private key PEM (alternative to file path)",
    )

    jwt_key_id: str = Field(
        default="nexus-primary",
        description="Key ID (kid) for JWT header",
    )

    # Backup Keys for Key Rotation (verification only)
    jwt_backup_keys: list[dict[str, str]] | None = Field(
        default=None,
        description=(
            "List of backup keys for verification during key rotation. "
            "Each entry must have 'key_id' and either 'key_path' or 'key_base64'. "
            "Example: [{'key_id': 'nexus-2024-01', 'key_base64': '...'}]"
        ),
    )

    # Refresh-token cookie settings
    cookie_domain: str | None = Field(
        default=None,
        description="Domain attribute for the refresh-token cookie (None = host-only)",
    )

    # Bootstrap Admin
    admin_password_path: str | None = Field(
        default=None,
        description="Path to file containing the bootstrap admin password (e.g., /run/secrets/admin-password)",
    )


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
        default=3600,
        description="How long to retain raw metrics in memory (NFR-003)",
        ge=0,
    )

    metrics_max_records: int = Field(
        default=100_000,
        description="Maximum number of raw metrics to store in memory",
        ge=1,
    )

    metrics_enabled: bool = Field(
        default=True,
        description="Enable/disable metrics collection globally",
    )

    metrics_openmetrics_enabled: bool = Field(
        default=True,
        description="Enable OpenMetrics scrape endpoint (GET /metrics)",
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

    metrics_cleanup_interval_seconds: float = Field(
        default=300.0,
        description="Seconds between periodic in-memory metrics store cleanup cycles",
        gt=0,
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
# Credential Encryption Settings
# =============================================================================


class CredentialEncryptionSettings(BaseSettings):
    """Credential encryption configuration.

    Controls encryption of credential field values at rest using AES-256-GCM.
    A default insecure key is used for dev/test. Set APP_SECRET_ENCRYPTION_KEY
    to a secure random 64-character hex value in production.

    Note: This class should not be instantiated directly. Use Settings via get_settings().
    """

    secret_encryption_key: SecretStr = Field(
        default=SecretStr("0" * 64),
        description="64-character hex string (32 bytes) for AES-256-GCM secret encryption. "
        "MUST be set to a secure random value in production.",
    )

    @field_validator("secret_encryption_key")
    @classmethod
    def validate_encryption_key(cls, v: SecretStr) -> SecretStr:
        """Validate that the encryption key is a valid 64-character hex string."""
        key_value = v.get_secret_value()
        expected_hex_length = 64  # 32 bytes = 64 hex chars
        if len(key_value) != expected_hex_length:
            msg = f"secret_encryption_key must be exactly 64 hex characters (32 bytes), got {len(key_value)}"
            raise SafeValueError(msg)
        try:
            bytes.fromhex(key_value)
        except ValueError as e:
            msg = "secret_encryption_key must be a valid hex string"
            raise SafeValueError(msg) from e
        return v


# =============================================================================
# Authorization Configuration
# =============================================================================


class AuthzSettings(BaseSettings):
    """Authorization and OPA configuration settings."""

    opa_url: str = Field(
        default="http://localhost:8181",
        description="OPA server URL for policy evaluation",
    )

    authz_default_project: str = Field(
        default="default",
        description="Default project name for resources without a project",
    )


# =============================================================================
# Main Settings
# =============================================================================


def _get_env_file() -> str:
    """Get an optional custom .env file path."""
    return os.getenv("APP_ENV_FILE_PATH", ".env")


class Settings(
    CredentialEncryptionSettings,
    OpenRouterSettings,
    FileUploadSettings,
    DocumentConversionSettings,
    OpenAPIValidationSettings,
    RouterDiscoverySettings,
    CacheSettings,
    DatabaseSettings,
    AuditDatabaseSettings,
    ServerSettings,
    RetrieverServiceSettings,
    AdapterRetrySettings,
    LoggingSettings,
    TemporalSettings,
    WorkflowEngineSettings,
    JWTSettings,
    ToolManagerSettings,
    WorkflowClientSettings,
    TelemetrySettings,
    MetricsSettings,
    AuthzSettings,
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
        env_prefix="APP_",
    )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def cookie_secure(self) -> bool:
        """Derive the Secure flag for the refresh-token cookie from server_scheme.

        HTTPS → Secure=True (browser only sends the cookie over TLS).
        HTTP  → Secure=False (local development without TLS).
        """
        return self.server_scheme == "https"

    @model_validator(mode="after")
    def _validate_cors_production(self) -> "Settings":
        """Warn when CORS origins are empty in production mode (AAP-71274).

        An empty ``cors_allow_origins`` with ``server_scheme=https`` means all
        cross-origin requests carrying cookies will be blocked, which breaks
        the frontend.  This is a warning rather than an error because CORS
        origins may eventually be a runtime setting.
        """
        if self.cookie_secure and not self.cors_allow_origins:
            warnings.warn(
                "CORS: cors_allow_origins is empty while server_scheme is https (production mode). "
                "Cross-origin requests with credentials will be blocked. "
                "Set APP_CORS_ALLOW_ORIGINS to the frontend origin(s).",
                UserWarning,
                stacklevel=1,
            )
        return self

    @computed_field  # type: ignore[prop-decorator]
    @property
    def jwt_issuer(self) -> str:
        """JWT issuer claim (iss) derived from server host and port.

        Returns:
            URL identifying this Nexus instance as the token issuer.

        """
        return f"{self.server_scheme}://{self.server_host}:{self.server_port}"


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
