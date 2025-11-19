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


class Settings(OpenRouterSettings, FileUploadSettings):
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
