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

from pydantic import Field, SecretStr, computed_field
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

    openrouter_base_url: str = Field(
        default="https://openrouter.ai/api/v1",
        description="OpenRouter API base URL",
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
        """
        override = os.environ.get("NEXUS_DATABASE_URL")
        if override:
            return override
        password = self.db_password.get_secret_value()
        return f"postgresql+asyncpg://{self.db_user}:{password}@{self.db_host}:{self.db_port}/{self.db_name}"


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
# Main Settings
# =============================================================================


class Settings(
    OpenRouterSettings,
    FileUploadSettings,
    DocumentConversionSettings,
    OpenAPIValidationSettings,
    RouterDiscoverySettings,
    DatabaseSettings,
    ServerSettings,
    LoggingSettings,
):
    """Application-wide settings.

    Combines all configuration sections into a single settings object.
    Additional settings can be added by inheriting from more BaseSettings classes.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
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
