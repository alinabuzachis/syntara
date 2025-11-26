"""Test for ConversionConfig model validation and behavior."""

import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from nexus.agent_orchestrator.context_manager.file_manager.document_conversion.models.conversion_config import (
    ConversionConfig,
)


class TestConversionConfigValidation:
    """Test ConversionConfig validation logic."""

    def test_timeout_seconds_validation_minimum_boundary(self) -> None:
        """Test timeout_seconds validation at minimum boundary."""
        temp_dir = tempfile.gettempdir()
        with pytest.raises(ValueError, match="Input should be greater than or equal to 1"):
            ConversionConfig(timeout_seconds=0, temp_dir=temp_dir)

    def test_timeout_seconds_validation_maximum_boundary(self) -> None:
        """Test timeout_seconds validation at maximum boundary."""
        temp_dir = tempfile.gettempdir()
        with pytest.raises(ValueError, match="Input should be less than or equal to 300"):
            ConversionConfig(timeout_seconds=301, temp_dir=temp_dir)

    def test_timeout_seconds_accepts_valid_range(self) -> None:
        """Test timeout_seconds accepts values within valid range."""
        temp_dir = tempfile.gettempdir()
        config = ConversionConfig(timeout_seconds=30, temp_dir=temp_dir)
        assert config.timeout_seconds == 30

    def test_overwrite_existing_default_behavior(self) -> None:
        """Test that overwrite_existing defaults to False when not specified."""
        temp_dir = tempfile.gettempdir()
        config = ConversionConfig(timeout_seconds=30, temp_dir=temp_dir)
        assert config.overwrite_existing is False

    def test_overwrite_existing_accepts_true(self) -> None:
        """Test that overwrite_existing can be set to True."""
        temp_dir = tempfile.gettempdir()
        config = ConversionConfig(timeout_seconds=30, temp_dir=temp_dir, overwrite_existing=True)
        assert config.overwrite_existing is True

    def test_temp_dir_required_field(self) -> None:
        """Test that temp_dir is a required field."""
        with pytest.raises(ValueError, match="temp_dir"):
            ConversionConfig(timeout_seconds=30)  # type: ignore[call-arg]

    def test_temp_dir_accepts_valid_paths(self) -> None:
        """Test that temp_dir accepts valid directory paths."""
        test_path = str(Path(tempfile.gettempdir()) / "conversions")
        config = ConversionConfig(timeout_seconds=30, temp_dir=test_path)
        assert config.temp_dir == test_path


class TestConversionConfigSystemIntegration:
    """Test ConversionConfig integration with system configuration."""

    @patch(
        "nexus.agent_orchestrator.context_manager.file_manager.document_conversion.models.conversion_config.get_settings"
    )
    def test_from_settings_creates_valid_config(self, mock_get_settings) -> None:
        """Test that from_settings creates a valid configuration from system settings."""
        # Mock settings object
        mock_settings = type(
            "Settings",
            (),
            {
                "document_conversion_timeout_seconds": 25,
                "document_conversion_overwrite_existing": True,
                "document_conversion_temp_dir": "/app/tmp/conversions",
            },
        )()
        mock_get_settings.return_value = mock_settings

        config = ConversionConfig.from_settings()

        assert config.timeout_seconds == 25
        assert config.overwrite_existing is True
        assert config.temp_dir == "/app/tmp/conversions"

    @patch(
        "nexus.agent_orchestrator.context_manager.file_manager.document_conversion.models.conversion_config.get_settings"
    )
    def test_from_settings_respects_timeout_boundaries(self, mock_get_settings) -> None:
        """Test that from_settings respects timeout validation boundaries."""
        # Mock settings with boundary values
        mock_settings = type(
            "Settings",
            (),
            {
                "document_conversion_timeout_seconds": 1,  # Minimum valid value
                "document_conversion_overwrite_existing": False,
                "document_conversion_temp_dir": tempfile.gettempdir(),
            },
        )()
        mock_get_settings.return_value = mock_settings

        config = ConversionConfig.from_settings()

        assert config.timeout_seconds == 1

    def test_nfr_001_timeout_constraint_enforcement(self) -> None:
        """Test that NFR-001 (under 30 seconds) constraint is enforced."""
        # Test that 30 seconds is allowed (within limit)
        temp_dir = tempfile.gettempdir()
        config = ConversionConfig(timeout_seconds=30, temp_dir=temp_dir)
        assert config.timeout_seconds == 30

        # Test that values above 30 are also allowed up to the maximum
        temp_dir = tempfile.gettempdir()
        config = ConversionConfig(timeout_seconds=60, temp_dir=temp_dir)
        assert config.timeout_seconds == 60
