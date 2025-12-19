"""Configuration model for document conversion operations.

This module provides the ConversionConfig class that encapsulates all settings
needed for document conversion operations, sourced from the centralized
configuration system.
"""

from pydantic import BaseModel, Field

from nexus.core.config import get_settings


class ConversionConfig(BaseModel):
    """Configuration for document conversion operations.

    This class provides a structured interface to document conversion settings
    while maintaining integration with the centralized configuration system.
    All values are sourced from DocumentConversionSettings in core config.
    Output format is always markdown (.md).
    """

    timeout_seconds: int = Field(
        description="Maximum time allowed for document conversion (NFR-001: under 30 seconds)", ge=1, le=300
    )

    overwrite_existing: bool = Field(description="Whether to overwrite existing converted files", default=False)

    temp_dir: str = Field(description="Temporary directory for conversion operations")

    @classmethod
    def from_settings(cls) -> "ConversionConfig":
        """Create configuration from centralized settings.

        Returns:
            ConversionConfig instance populated from DocumentConversionSettings

        Example:
            config = ConversionConfig.from_settings()
            assert config.timeout_seconds == 30  # Default from settings

        """
        settings = get_settings()

        return cls(
            timeout_seconds=settings.document_conversion_timeout_seconds,
            overwrite_existing=settings.document_conversion_overwrite_existing,
            temp_dir=settings.document_conversion_temp_dir,
        )
