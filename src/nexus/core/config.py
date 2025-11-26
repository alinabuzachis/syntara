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

import tempfile
from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

# =============================================================================
# LLM Provider Configuration
# =============================================================================


class OpenRouterSettings(BaseSettings):
    """OpenRouter LLM configuration settings.

    OpenRouter provides API gateway to multiple LLMs (Claude, GPT-4, Gemini, etc.).
    Get your API key from: https://openrouter.ai/keys
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

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
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

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
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

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
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

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
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    router_discovery_enabled: bool = Field(
        default=True,
        description="Enable automatic router discovery and registration",
    )

    router_exclude_modules: str = Field(
        default="",
        description="Comma-separated list of module names to exclude from discovery (e.g., 'core,utils,websocket')",
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
