"""Unit tests for application configuration."""

import os

import pytest

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


# =============================================================================
# DatabaseSettings Tests
# =============================================================================


class TestDatabaseSettings:
    """Tests for DatabaseSettings configuration."""

    def test_database_defaults(self) -> None:
        """Test default database configuration values."""
        settings = Settings()
        assert settings.db_user == "admin"
        assert settings.db_password.get_secret_value() == "admin"
        assert settings.db_host == "localhost"
        assert settings.db_port == 5432
        assert settings.db_name == "nexus_api"

    def test_database_url_computed_field(self) -> None:
        """Test that database_url is correctly computed from components."""
        settings = Settings()
        expected_url = "postgresql+asyncpg://admin:admin@localhost:5432/nexus_api"
        assert settings.database_url == expected_url

    def test_database_url_with_custom_values(self) -> None:
        """Test database_url with custom configuration values."""
        os.environ["NEXUS_DB_USER"] = "testuser"
        os.environ["NEXUS_DB_PASSWORD"] = "testpass"  # noqa: S105
        os.environ["NEXUS_DB_HOST"] = "dbserver"
        os.environ["NEXUS_DB_PORT"] = "5433"
        os.environ["NEXUS_DB_NAME"] = "testdb"

        try:
            settings = Settings()
            expected_url = "postgresql+asyncpg://testuser:testpass@dbserver:5433/testdb"
            assert settings.database_url == expected_url
        finally:
            os.environ.pop("NEXUS_DB_USER", None)
            os.environ.pop("NEXUS_DB_PASSWORD", None)
            os.environ.pop("NEXUS_DB_HOST", None)
            os.environ.pop("NEXUS_DB_PORT", None)
            os.environ.pop("NEXUS_DB_NAME", None)

    def test_database_port_validation(self) -> None:
        """Test that database port validates within valid range."""
        os.environ["NEXUS_DB_PORT"] = "0"
        try:
            with pytest.raises(ValueError, match="greater than or equal to 1"):
                Settings()
        finally:
            os.environ.pop("NEXUS_DB_PORT", None)

        os.environ["NEXUS_DB_PORT"] = "70000"
        try:
            with pytest.raises(ValueError, match="less than or equal to 65535"):
                Settings()
        finally:
            os.environ.pop("NEXUS_DB_PORT", None)

    def test_database_url_override(self) -> None:
        """Test that NEXUS_DATABASE_URL overrides component-based URL."""
        # Full URL with sslmode param - should be used directly
        override_url = "postgresql+asyncpg://prod:s3cret@db.example.com:5432/proddb?sslmode=require"
        os.environ["NEXUS_DATABASE_URL"] = override_url
        try:
            settings = Settings()
            assert settings.database_url == override_url
        finally:
            os.environ.pop("NEXUS_DATABASE_URL", None)

# =============================================================================
# ServerSettings Tests
# =============================================================================


class TestServerSettings:
    """Tests for ServerSettings configuration."""

    def test_server_defaults(self) -> None:
        """Test default server configuration values."""
        settings = Settings()
        assert settings.server_host == "0.0.0.0"  # noqa: S104
        assert settings.server_port == 8000
        assert settings.server_reload is False

    def test_cors_defaults(self) -> None:
        """Test default CORS configuration values."""
        settings = Settings()
        assert settings.cors_allow_origins == ["*"]
        assert settings.cors_allow_credentials is True
        assert settings.cors_allow_methods == ["*"]
        assert settings.cors_allow_headers == ["*"]

    def test_server_settings_from_env(self) -> None:
        """Test server settings can be configured via environment."""
        os.environ["NEXUS_SERVER_HOST"] = "127.0.0.1"
        os.environ["NEXUS_SERVER_PORT"] = "9000"
        os.environ["NEXUS_SERVER_RELOAD"] = "true"

        try:
            settings = Settings()
            assert settings.server_host == "127.0.0.1"
            assert settings.server_port == 9000
            assert settings.server_reload is True
        finally:
            os.environ.pop("NEXUS_SERVER_HOST", None)
            os.environ.pop("NEXUS_SERVER_PORT", None)
            os.environ.pop("NEXUS_SERVER_RELOAD", None)

    def test_cors_settings_from_env(self) -> None:
        """Test CORS settings can be configured via environment."""
        os.environ["NEXUS_CORS_ALLOW_ORIGINS"] = '["http://localhost:3000", "http://example.com"]'
        os.environ["NEXUS_CORS_ALLOW_CREDENTIALS"] = "false"

        try:
            settings = Settings()
            assert settings.cors_allow_origins == ["http://localhost:3000", "http://example.com"]
            assert settings.cors_allow_credentials is False
        finally:
            os.environ.pop("NEXUS_CORS_ALLOW_ORIGINS", None)
            os.environ.pop("NEXUS_CORS_ALLOW_CREDENTIALS", None)

    def test_server_port_validation(self) -> None:
        """Test that server port validates within valid range."""
        os.environ["NEXUS_SERVER_PORT"] = "0"
        try:
            with pytest.raises(ValueError, match="greater than or equal to 1"):
                Settings()
        finally:
            os.environ.pop("NEXUS_SERVER_PORT", None)

        os.environ["NEXUS_SERVER_PORT"] = "70000"
        try:
            with pytest.raises(ValueError, match="less than or equal to 65535"):
                Settings()
        finally:
            os.environ.pop("NEXUS_SERVER_PORT", None)


# =============================================================================
# LoggingSettings Tests
# =============================================================================


class TestLoggingSettings:
    """Tests for LoggingSettings configuration."""

    def test_logging_defaults(self) -> None:
        """Test default logging configuration values."""
        settings = Settings()
        assert settings.log_level == "INFO"

    def test_log_level_from_env(self) -> None:
        """Test log level can be configured via environment."""
        os.environ["NEXUS_LOG_LEVEL"] = "DEBUG"

        try:
            settings = Settings()
            assert settings.log_level == "DEBUG"
        finally:
            os.environ.pop("NEXUS_LOG_LEVEL", None)

    def test_log_level_case_preserved(self) -> None:
        """Test that log level case is preserved as configured."""
        os.environ["NEXUS_LOG_LEVEL"] = "warning"

        try:
            settings = Settings()
            # Case is preserved, caller can use .upper() if needed
            assert settings.log_level == "warning"
        finally:
            os.environ.pop("NEXUS_LOG_LEVEL", None)
