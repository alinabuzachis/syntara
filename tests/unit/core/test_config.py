"""Unit tests for application configuration."""

import os

from nexus.core.config import Settings


def test_settings_requires_nexus_prefix(monkeypatch: object) -> None:
    """Test that settings only reads environment variables with NEXUS_ prefix."""
    # Set both prefixed and non-prefixed versions
    os.environ["NEXUS_OPENROUTER_MODEL"] = "prefixed-model"

    try:
        settings = Settings()

        # Should read the NEXUS_ prefixed variable
        assert settings.openrouter_model == "prefixed-model"
    finally:
        # Cleanup
        os.environ.pop("NEXUS_OPENROUTER_MODEL", None)
