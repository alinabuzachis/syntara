"""Unit tests for application configuration."""

import os
import warnings
from pathlib import Path

import pytest
from pydantic import ValidationError

from nexus.core.config.base import Settings


def test_settings_requires_nexus_prefix(monkeypatch: object) -> None:
    """Test that settings only reads environment variables with APP_ prefix."""
    # Set both prefixed and non-prefixed versions
    os.environ["APP_OPENROUTER_MODEL"] = "prefixed-model"

    try:
        settings = Settings()

        # Should read the APP_ prefixed variable
        assert settings.openrouter_model == "prefixed-model"
    finally:
        # Cleanup
        os.environ.pop("APP_OPENROUTER_MODEL", None)


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
        assert settings.db_pool_size == 10
        assert settings.db_max_overflow == 20
        assert settings.db_pool_timeout_seconds == 30.0

    def test_database_url_computed_field(self) -> None:
        """Test that database_url is correctly computed from components."""
        settings = Settings()
        url = settings.database_url
        assert url.drivername == "postgresql+asyncpg"
        assert url.username == "admin"
        assert url.host == "localhost"
        assert url.port == 5432
        assert url.database == "nexus_api"

    def test_database_url_with_custom_values(self) -> None:
        """Test database_url with custom configuration values."""
        os.environ["APP_DB_USER"] = "testuser"
        os.environ["APP_DB_PASSWORD"] = "testpass"  # noqa: S105
        os.environ["APP_DB_HOST"] = "dbserver"
        os.environ["APP_DB_PORT"] = "5433"
        os.environ["APP_DB_NAME"] = "testdb"

        try:
            settings = Settings()
            url = settings.database_url
            assert url.drivername == "postgresql+asyncpg"
            assert url.username == "testuser"
            assert url.host == "dbserver"
            assert url.port == 5433
            assert url.database == "testdb"
        finally:
            os.environ.pop("APP_DB_USER", None)
            os.environ.pop("APP_DB_PASSWORD", None)
            os.environ.pop("APP_DB_HOST", None)
            os.environ.pop("APP_DB_PORT", None)
            os.environ.pop("APP_DB_NAME", None)

    def test_database_port_validation(self) -> None:
        """Test that database port validates within valid range."""
        os.environ["APP_DB_PORT"] = "0"
        try:
            with pytest.raises(ValueError, match="greater than or equal to 1"):
                Settings()
        finally:
            os.environ.pop("APP_DB_PORT", None)

        os.environ["APP_DB_PORT"] = "70000"
        try:
            with pytest.raises(ValueError, match="less than or equal to 65535"):
                Settings()
        finally:
            os.environ.pop("APP_DB_PORT", None)

    def test_database_url_override(self) -> None:
        """Test that APP_DATABASE_URL overrides component-based URL."""
        override_url = "postgresql+asyncpg://prod:s3cret@db.example.com:5432/proddb"
        os.environ["APP_DATABASE_URL"] = override_url
        try:
            settings = Settings()
            url = settings.database_url
            assert url.drivername == "postgresql+asyncpg"
            assert url.username == "prod"
            assert url.host == "db.example.com"
            assert url.database == "proddb"
        finally:
            os.environ.pop("APP_DATABASE_URL", None)

    def test_database_pool_settings_from_env(self) -> None:
        """Test database pool settings can be configured via environment."""
        os.environ["APP_DB_POOL_SIZE"] = "25"
        os.environ["APP_DB_MAX_OVERFLOW"] = "10"
        os.environ["APP_DB_POOL_TIMEOUT_SECONDS"] = "45"
        try:
            settings = Settings()
            assert settings.db_pool_size == 25
            assert settings.db_max_overflow == 10
            assert settings.db_pool_timeout_seconds == 45
        finally:
            os.environ.pop("APP_DB_POOL_SIZE", None)
            os.environ.pop("APP_DB_MAX_OVERFLOW", None)
            os.environ.pop("APP_DB_POOL_TIMEOUT_SECONDS", None)

    def test_database_pool_size_validation(self) -> None:
        """Test that database pool size must be at least 1."""
        os.environ["APP_DB_POOL_SIZE"] = "0"
        try:
            with pytest.raises(ValueError, match="greater than or equal to 1"):
                Settings()
        finally:
            os.environ.pop("APP_DB_POOL_SIZE", None)

    def test_database_max_overflow_validation(self) -> None:
        """Test that database max overflow cannot be negative."""
        os.environ["APP_DB_MAX_OVERFLOW"] = "-1"
        try:
            with pytest.raises(ValueError, match="greater than or equal to 0"):
                Settings()
        finally:
            os.environ.pop("APP_DB_MAX_OVERFLOW", None)

    def test_database_pool_timeout_validation(self) -> None:
        """Test that database pool timeout must be positive."""
        os.environ["APP_DB_POOL_TIMEOUT_SECONDS"] = "0"
        try:
            with pytest.raises(ValueError, match="greater than 0"):
                Settings()
        finally:
            os.environ.pop("APP_DB_POOL_TIMEOUT_SECONDS", None)


# =============================================================================
# DatabaseSettings SSL Tests
# =============================================================================


class TestDatabaseSSLSettings:
    """Tests for DatabaseSettings SSL configuration."""

    def test_ssl_defaults(self) -> None:
        settings = Settings()
        assert settings.db_ssl_mode == "prefer"
        assert settings.db_ssl_root_cert is None
        assert settings.db_ssl_cert is None
        assert settings.db_ssl_key is None

    def test_ssl_mode_from_env(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        cert_file = tmp_path / "ca.pem"
        cert_file.write_text("fake cert")
        monkeypatch.setenv("APP_DB_SSL_MODE", "verify-full")
        monkeypatch.setenv("APP_DB_SSL_ROOT_CERT", str(cert_file))
        settings = Settings()
        assert settings.db_ssl_mode == "verify-full"

    def test_ssl_mode_case_insensitive(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        cert_file = tmp_path / "ca.pem"
        cert_file.write_text("fake cert")
        monkeypatch.setenv("APP_DB_SSL_MODE", "VERIFY-FULL")
        monkeypatch.setenv("APP_DB_SSL_ROOT_CERT", str(cert_file))
        settings = Settings()
        assert settings.db_ssl_mode == "verify-full"

    @pytest.mark.parametrize("mode", ["disable", "allow", "prefer", "require"])
    def test_ssl_mode_valid_values(self, monkeypatch: pytest.MonkeyPatch, mode: str) -> None:
        monkeypatch.setenv("APP_DB_SSL_MODE", mode)
        settings = Settings()
        assert settings.db_ssl_mode == mode

    @pytest.mark.parametrize("mode", ["verify-ca", "verify-full"])
    def test_ssl_mode_verify_with_root_cert(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path, mode: str) -> None:
        cert_file = tmp_path / "ca.pem"
        cert_file.write_text("fake cert")
        monkeypatch.setenv("APP_DB_SSL_MODE", mode)
        monkeypatch.setenv("APP_DB_SSL_ROOT_CERT", str(cert_file))
        settings = Settings()
        assert settings.db_ssl_mode == mode

    def test_ssl_mode_invalid_rejected(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("APP_DB_SSL_MODE", "invalid")
        with pytest.raises(ValidationError, match="Invalid SSL mode"):
            Settings()

    def test_ssl_root_cert_from_env(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        cert_file = tmp_path / "ca.pem"
        cert_file.write_text("fake cert")
        monkeypatch.setenv("APP_DB_SSL_ROOT_CERT", str(cert_file))
        monkeypatch.setenv("APP_DB_SSL_MODE", "verify-full")
        settings = Settings()
        assert settings.db_ssl_root_cert == str(cert_file)

    def test_ssl_client_cert_and_key_from_env(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        cert_file = tmp_path / "client.pem"
        key_file = tmp_path / "client.key"
        cert_file.write_text("fake cert")
        key_file.write_text("fake key")
        monkeypatch.setenv("APP_DB_SSL_CERT", str(cert_file))
        monkeypatch.setenv("APP_DB_SSL_KEY", str(key_file))
        monkeypatch.setenv("APP_DB_SSL_MODE", "require")
        settings = Settings()
        assert settings.db_ssl_cert == str(cert_file)
        assert settings.db_ssl_key == str(key_file)

    def test_ssl_cert_path_validation_nonexistent(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("APP_DB_SSL_ROOT_CERT", "/nonexistent/ca.pem")
        monkeypatch.setenv("APP_DB_SSL_MODE", "verify-full")
        with pytest.raises(ValidationError, match=r"SSL .* file not found"):
            Settings()

    def test_database_url_override_takes_precedence(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        cert_file = tmp_path / "ca.pem"
        cert_file.write_text("fake cert")
        override_url = "postgresql+asyncpg://u:p@h:5432/d"
        monkeypatch.setenv("APP_DATABASE_URL", override_url)
        monkeypatch.setenv("APP_DB_SSL_MODE", "verify-full")
        monkeypatch.setenv("APP_DB_SSL_ROOT_CERT", str(cert_file))
        settings = Settings()
        url = settings.database_url
        assert url.host == "h"
        assert url.database == "d"

    def test_ssl_key_without_cert_rejected(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        key_file = tmp_path / "client.key"
        key_file.write_text("fake key")
        monkeypatch.setenv("APP_DB_SSL_KEY", str(key_file))
        monkeypatch.setenv("APP_DB_SSL_MODE", "require")
        with pytest.raises(ValidationError, match="requires a client certificate"):
            Settings()

    def test_ssl_client_certs_with_disable_rejected(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        cert_file = tmp_path / "client.pem"
        key_file = tmp_path / "client.key"
        cert_file.write_text("fake cert")
        key_file.write_text("fake key")
        monkeypatch.setenv("APP_DB_SSL_MODE", "disable")
        monkeypatch.setenv("APP_DB_SSL_CERT", str(cert_file))
        monkeypatch.setenv("APP_DB_SSL_KEY", str(key_file))
        with pytest.raises(ValidationError, match="only supported with"):
            Settings()

    def test_ssl_client_certs_with_prefer_rejected(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        cert_file = tmp_path / "client.pem"
        key_file = tmp_path / "client.key"
        cert_file.write_text("fake cert")
        key_file.write_text("fake key")
        monkeypatch.setenv("APP_DB_SSL_MODE", "prefer")
        monkeypatch.setenv("APP_DB_SSL_CERT", str(cert_file))
        monkeypatch.setenv("APP_DB_SSL_KEY", str(key_file))
        with pytest.raises(ValidationError, match="only supported with"):
            Settings()

    def test_ssl_verify_full_without_root_cert_rejected(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("APP_DB_SSL_MODE", "verify-full")
        with pytest.raises(ValidationError, match="requires ssl_root_cert"):
            Settings()


# =============================================================================
# AuditDatabaseSettings SSL Tests
# =============================================================================


class TestAuditDatabaseSSLSettings:
    """Tests for AuditDatabaseSettings SSL configuration."""

    def test_audit_ssl_defaults(self) -> None:
        settings = Settings()
        assert settings.audit_db_ssl_mode == "prefer"
        assert settings.audit_db_ssl_root_cert is None
        assert settings.audit_db_ssl_cert is None
        assert settings.audit_db_ssl_key is None

    def test_audit_ssl_mode_from_env(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        cert_file = tmp_path / "ca.pem"
        cert_file.write_text("fake cert")
        monkeypatch.setenv("APP_AUDIT_DB_SSL_MODE", "verify-full")
        monkeypatch.setenv("APP_AUDIT_DB_SSL_ROOT_CERT", str(cert_file))
        settings = Settings()
        assert settings.audit_db_ssl_mode == "verify-full"

    def test_audit_ssl_mode_invalid_rejected(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("APP_AUDIT_DB_SSL_MODE", "invalid")
        with pytest.raises(ValidationError, match="Invalid SSL mode"):
            Settings()

    def test_audit_ssl_root_cert_from_env(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        cert_file = tmp_path / "ca.pem"
        cert_file.write_text("fake cert")
        monkeypatch.setenv("APP_AUDIT_DB_SSL_ROOT_CERT", str(cert_file))
        monkeypatch.setenv("APP_AUDIT_DB_SSL_MODE", "verify-full")
        settings = Settings()
        assert settings.audit_db_ssl_root_cert == str(cert_file)

    def test_audit_database_url_override_takes_precedence(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        cert_file = tmp_path / "ca.pem"
        cert_file.write_text("fake cert")
        override_url = "postgresql+asyncpg://u:p@h:5432/d"
        monkeypatch.setenv("APP_AUDIT_DATABASE_URL", override_url)
        monkeypatch.setenv("APP_AUDIT_DB_SSL_MODE", "verify-full")
        monkeypatch.setenv("APP_AUDIT_DB_SSL_ROOT_CERT", str(cert_file))
        settings = Settings()
        url = settings.audit_database_url
        assert url.host == "h"
        assert url.database == "d"

    def test_audit_ssl_key_without_cert_rejected(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        key_file = tmp_path / "client.key"
        key_file.write_text("fake key")
        monkeypatch.setenv("APP_AUDIT_DB_SSL_KEY", str(key_file))
        monkeypatch.setenv("APP_AUDIT_DB_SSL_MODE", "require")
        with pytest.raises(ValidationError, match="requires a client certificate"):
            Settings()

    def test_audit_ssl_client_certs_with_disable_rejected(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        cert_file = tmp_path / "client.pem"
        key_file = tmp_path / "client.key"
        cert_file.write_text("fake cert")
        key_file.write_text("fake key")
        monkeypatch.setenv("APP_AUDIT_DB_SSL_MODE", "disable")
        monkeypatch.setenv("APP_AUDIT_DB_SSL_CERT", str(cert_file))
        monkeypatch.setenv("APP_AUDIT_DB_SSL_KEY", str(key_file))
        with pytest.raises(ValidationError, match="only supported with"):
            Settings()

    def test_audit_ssl_verify_full_without_root_cert_rejected(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("APP_AUDIT_DB_SSL_MODE", "verify-full")
        with pytest.raises(ValidationError, match="requires ssl_root_cert"):
            Settings()


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

    def test_server_settings_from_env(self) -> None:
        """Test server settings can be configured via environment."""
        os.environ["APP_SERVER_HOST"] = "127.0.0.1"
        os.environ["APP_SERVER_PORT"] = "9000"
        os.environ["APP_SERVER_RELOAD"] = "true"

        try:
            settings = Settings()
            assert settings.server_host == "127.0.0.1"
            assert settings.server_port == 9000
            assert settings.server_reload is True
        finally:
            os.environ.pop("APP_SERVER_HOST", None)
            os.environ.pop("APP_SERVER_PORT", None)
            os.environ.pop("APP_SERVER_RELOAD", None)

    def test_cors_settings_from_env(self) -> None:
        """Test CORS settings can be configured via environment."""
        os.environ["APP_CORS_ALLOW_ORIGINS"] = '["http://localhost:3000", "http://example.com"]'
        os.environ["APP_CORS_ALLOW_CREDENTIALS"] = "false"

        try:
            settings = Settings()
            assert settings.cors_allow_origins == ["http://localhost:3000", "http://example.com"]
            assert settings.cors_allow_credentials is False
        finally:
            os.environ.pop("APP_CORS_ALLOW_ORIGINS", None)
            os.environ.pop("APP_CORS_ALLOW_CREDENTIALS", None)

    def test_server_port_validation(self) -> None:
        """Test that server port validates within valid range."""
        os.environ["APP_SERVER_PORT"] = "0"
        try:
            with pytest.raises(ValueError, match="greater than or equal to 1"):
                Settings()
        finally:
            os.environ.pop("APP_SERVER_PORT", None)

        os.environ["APP_SERVER_PORT"] = "70000"
        try:
            with pytest.raises(ValueError, match="less than or equal to 65535"):
                Settings()
        finally:
            os.environ.pop("APP_SERVER_PORT", None)


# =============================================================================
# LoggingSettings Tests
# =============================================================================


class TestLoggingSettings:
    """Tests for LoggingSettings configuration."""

    def test_logging_defaults(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test default logging configuration values."""
        from nexus.core.config.base import get_settings

        # Clear env vars to test pure defaults
        monkeypatch.delenv("APP_FALLBACK_LOG_LEVEL", raising=False)
        monkeypatch.delenv("APP_NAME", raising=False)
        monkeypatch.delenv("APP_LOG_OUTPUT_FORMAT", raising=False)
        get_settings.cache_clear()

        try:
            # _env_file=None skips .env file loading (pydantic-settings feature)
            settings = Settings(_env_file=None)  # type: ignore[call-arg]
            assert settings.fallback_log_level == "INFO"
        finally:
            get_settings.cache_clear()

    def test_fallback_log_level_from_env(self) -> None:
        """Test fallback log level can be configured via environment."""
        os.environ["APP_FALLBACK_LOG_LEVEL"] = "DEBUG"

        try:
            settings = Settings()
            assert settings.fallback_log_level == "DEBUG"
        finally:
            os.environ.pop("APP_FALLBACK_LOG_LEVEL", None)

    def test_fallback_log_level_rejects_invalid(self) -> None:
        """Test that invalid log levels are rejected at config time."""
        os.environ["APP_FALLBACK_LOG_LEVEL"] = "TRACE"

        try:
            with pytest.raises(ValidationError):
                Settings()
        finally:
            os.environ.pop("APP_FALLBACK_LOG_LEVEL", None)


# =============================================================================
# TemporalSettings Tests
# =============================================================================


class TestTemporalSettings:
    """Tests for TemporalSettings configuration."""

    def test_temporal_defaults(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test default Temporal configuration values."""
        from nexus.core.config.base import get_settings

        # Clear env vars to test pure defaults
        monkeypatch.delenv("APP_TASK_QUEUE", raising=False)
        monkeypatch.delenv("APP_TEMPORAL_ADDRESS", raising=False)
        monkeypatch.delenv("APP_TEMPORAL_NAMESPACE", raising=False)
        monkeypatch.delenv("APP_SYSTEM_USER_ID", raising=False)
        monkeypatch.delenv("APP_MAX_LOOP_ITERATIONS", raising=False)
        monkeypatch.delenv("APP_NAME", raising=False)
        get_settings.cache_clear()

        try:
            # _env_file=None skips .env file loading (pydantic-settings feature)
            settings = Settings(_env_file=None)  # type: ignore[call-arg]
            assert settings.temporal_address == "localhost:7233"
            assert settings.temporal_namespace == "default"
            assert settings.task_queue == "nexus-workflow-queue"
            assert str(settings.system_user_id) == "00000000-0000-0000-0000-000000000001"
        finally:
            get_settings.cache_clear()

    def test_temporal_settings_from_env(self) -> None:
        """Test Temporal settings can be configured via environment."""
        os.environ["APP_TEMPORAL_ADDRESS"] = "temporal.example.com:7233"
        os.environ["APP_TEMPORAL_NAMESPACE"] = "production"
        os.environ["APP_TASK_QUEUE"] = "prod-queue"
        os.environ["APP_SYSTEM_USER_ID"] = "12345678-1234-1234-1234-123456789012"

        try:
            settings = Settings()
            assert settings.temporal_address == "temporal.example.com:7233"
            assert settings.temporal_namespace == "production"
            assert settings.task_queue == "prod-queue"
            assert str(settings.system_user_id) == "12345678-1234-1234-1234-123456789012"
        finally:
            os.environ.pop("APP_TEMPORAL_ADDRESS", None)
            os.environ.pop("APP_TEMPORAL_NAMESPACE", None)
            os.environ.pop("APP_TASK_QUEUE", None)
            os.environ.pop("APP_SYSTEM_USER_ID", None)


# =============================================================================
# WorkflowEngineSettings Tests
# =============================================================================


class TestWorkflowEngineSettings:
    """Tests for WorkflowEngineSettings configuration."""

    def test_workflow_engine_defaults(self) -> None:
        """Test default workflow engine configuration values."""
        settings = Settings()
        assert settings.script_cleanup_terminate_timeout == pytest.approx(1.0)
        assert settings.script_cleanup_kill_timeout == pytest.approx(0.5)
        assert settings.max_env_var_length == 32768
        assert str(settings.agent_orchestrator_base_url) == "http://localhost:8000/api/v1"

    def test_workflow_engine_settings_from_env(self) -> None:
        """Test workflow engine settings can be configured via environment."""
        os.environ["APP_AGENT_ORCHESTRATOR_BASE_URL"] = "http://agent.example.com/api/v1"

        try:
            settings = Settings()
            assert str(settings.agent_orchestrator_base_url) == "http://agent.example.com/api/v1"
        finally:
            os.environ.pop("APP_AGENT_ORCHESTRATOR_BASE_URL", None)


# =============================================================================
# OpenRouterSettings Extended Tests
# =============================================================================


class TestOpenRouterSettingsExtended:
    """Tests for OpenRouterSettings temperature and max_tokens."""

    def test_openrouter_extended_defaults(self) -> None:
        """Test default OpenRouter temperature and max_tokens values."""
        settings = Settings()
        assert settings.openrouter_temperature == pytest.approx(0.7)
        assert settings.openrouter_max_tokens == 1000

    def test_openrouter_extended_settings_from_env(self) -> None:
        """Test OpenRouter extended settings can be configured via environment."""
        os.environ["APP_OPENROUTER_TEMPERATURE"] = "0.5"
        os.environ["APP_OPENROUTER_MAX_TOKENS"] = "2000"

        try:
            settings = Settings()
            assert settings.openrouter_temperature == pytest.approx(0.5)
            assert settings.openrouter_max_tokens == 2000
        finally:
            os.environ.pop("APP_OPENROUTER_TEMPERATURE", None)
            os.environ.pop("APP_OPENROUTER_MAX_TOKENS", None)

    def test_openrouter_temperature_validation(self) -> None:
        """Test that OpenRouter temperature is validated between 0.0 and 1.0."""
        os.environ["APP_OPENROUTER_TEMPERATURE"] = "-0.1"
        try:
            with pytest.raises(ValueError, match="greater than or equal to 0"):
                Settings()
        finally:
            os.environ.pop("APP_OPENROUTER_TEMPERATURE", None)

        os.environ["APP_OPENROUTER_TEMPERATURE"] = "1.5"
        try:
            with pytest.raises(ValueError, match="less than or equal to 1"):
                Settings()
        finally:
            os.environ.pop("APP_OPENROUTER_TEMPERATURE", None)

    def test_openrouter_max_tokens_validation(self) -> None:
        """Test that OpenRouter max_tokens must be at least 1."""
        os.environ["APP_OPENROUTER_MAX_TOKENS"] = "0"
        try:
            with pytest.raises(ValueError, match="greater than or equal to 1"):
                Settings()
        finally:
            os.environ.pop("APP_OPENROUTER_MAX_TOKENS", None)


# =============================================================================
# RetrieverServiceSettings Tests
# =============================================================================


class TestRetrieverServiceSettings:
    """Tests for RetrieverServiceSettings configuration."""

    def test_keyword_ranking_weights_sum_success(self) -> None:
        """Test successful validation when keyword ranking weights sum to valid value."""
        # Test with default values (sum to 1.0)
        settings = Settings()
        assert settings.retriever_keyword_ranking_term_frequency == pytest.approx(0.4)
        assert settings.retriever_keyword_ranking_filename_match == pytest.approx(0.25)
        assert settings.retriever_keyword_ranking_content_density == pytest.approx(0.15)
        assert settings.retriever_keyword_ranking_proximity_bonus == pytest.approx(0.05)
        assert settings.retriever_keyword_ranking_exact_match_bonus == pytest.approx(0.1)
        assert settings.retriever_keyword_ranking_fuzzy_match_bonus == pytest.approx(0.05)

        # Test with custom values that sum to 0.8 (valid range)
        os.environ["APP_RETRIEVER_KEYWORD_RANKING_TERM_FREQUENCY"] = "0.3"
        os.environ["APP_RETRIEVER_KEYWORD_RANKING_FILENAME_MATCH"] = "0.2"
        os.environ["APP_RETRIEVER_KEYWORD_RANKING_CONTENT_DENSITY"] = "0.15"
        os.environ["APP_RETRIEVER_KEYWORD_RANKING_PROXIMITY_BONUS"] = "0.1"
        os.environ["APP_RETRIEVER_KEYWORD_RANKING_EXACT_MATCH_BONUS"] = "0.04"
        os.environ["APP_RETRIEVER_KEYWORD_RANKING_FUZZY_MATCH_BONUS"] = "0.01"

        try:
            settings = Settings()
            # Should not raise any validation errors
            assert settings.retriever_keyword_ranking_term_frequency == pytest.approx(0.3)
            assert settings.retriever_keyword_ranking_filename_match == pytest.approx(0.2)
            assert settings.retriever_keyword_ranking_content_density == pytest.approx(0.15)
            assert settings.retriever_keyword_ranking_proximity_bonus == pytest.approx(0.1)
            assert settings.retriever_keyword_ranking_exact_match_bonus == pytest.approx(0.04)
            assert settings.retriever_keyword_ranking_fuzzy_match_bonus == pytest.approx(0.01)
        finally:
            os.environ.pop("APP_RETRIEVER_KEYWORD_RANKING_TERM_FREQUENCY", None)
            os.environ.pop("APP_RETRIEVER_KEYWORD_RANKING_FILENAME_MATCH", None)
            os.environ.pop("APP_RETRIEVER_KEYWORD_RANKING_CONTENT_DENSITY", None)
            os.environ.pop("APP_RETRIEVER_KEYWORD_RANKING_PROXIMITY_BONUS", None)
            os.environ.pop("APP_RETRIEVER_KEYWORD_RANKING_EXACT_MATCH_BONUS", None)
            os.environ.pop("APP_RETRIEVER_KEYWORD_RANKING_FUZZY_MATCH_BONUS", None)

    def test_keyword_ranking_weights_sum_failure(self) -> None:
        """Test validation failure when keyword ranking weights sum exceeds valid range."""
        # Test with values that sum to 1.55 (invalid - exceeds 1.0)
        os.environ["APP_RETRIEVER_KEYWORD_RANKING_TERM_FREQUENCY"] = "0.5"
        os.environ["APP_RETRIEVER_KEYWORD_RANKING_FILENAME_MATCH"] = "0.4"
        os.environ["APP_RETRIEVER_KEYWORD_RANKING_CONTENT_DENSITY"] = "0.3"
        os.environ["APP_RETRIEVER_KEYWORD_RANKING_PROXIMITY_BONUS"] = "0.2"
        os.environ["APP_RETRIEVER_KEYWORD_RANKING_EXACT_MATCH_BONUS"] = "0.1"
        os.environ["APP_RETRIEVER_KEYWORD_RANKING_FUZZY_MATCH_BONUS"] = "0.05"

        try:
            with pytest.raises(ValueError) as exc_info:
                Settings()

            error_msg = str(exc_info.value)
            assert "Keyword ranking weights must sum to between 0.0 and 1.0" in error_msg
            assert "but sum to 1.550" in error_msg
            assert "retriever_keyword_ranking_term_frequency" in error_msg
            assert "retriever_keyword_ranking_filename_match" in error_msg
            assert "retriever_keyword_ranking_content_density" in error_msg
            assert "retriever_keyword_ranking_proximity_bonus" in error_msg
            assert "retriever_keyword_ranking_exact_match_bonus" in error_msg
            assert "retriever_keyword_ranking_fuzzy_match_bonus" in error_msg
        finally:
            os.environ.pop("APP_RETRIEVER_KEYWORD_RANKING_TERM_FREQUENCY", None)
            os.environ.pop("APP_RETRIEVER_KEYWORD_RANKING_FILENAME_MATCH", None)
            os.environ.pop("APP_RETRIEVER_KEYWORD_RANKING_CONTENT_DENSITY", None)
            os.environ.pop("APP_RETRIEVER_KEYWORD_RANKING_PROXIMITY_BONUS", None)
            os.environ.pop("APP_RETRIEVER_KEYWORD_RANKING_EXACT_MATCH_BONUS", None)
            os.environ.pop("APP_RETRIEVER_KEYWORD_RANKING_FUZZY_MATCH_BONUS", None)


# =============================================================================
# AdapterRetrySettings Tests
# =============================================================================


class TestAdapterRetrySettings:
    """Tests for AdapterRetrySettings configuration."""

    def test_adapter_backoff_relationship_validation(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test that max_backoff must be >= initial_backoff."""
        monkeypatch.setenv("APP_ADAPTER_INITIAL_BACKOFF_SECONDS", "10.0")
        monkeypatch.setenv("APP_ADAPTER_MAX_BACKOFF_SECONDS", "2.0")

        with pytest.raises(ValueError, match="adapter_max_backoff_seconds"):
            Settings()


# =============================================================================
# CORS Production Validation Tests (AAP-71274)
# =============================================================================


class TestCorsProductionValidation:
    """Tests for CORS origin validation in production mode."""

    def test_warns_when_cors_origins_empty_in_production(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Should warn when server_scheme=https but cors_allow_origins is empty."""
        monkeypatch.setenv("APP_SERVER_SCHEME", "https")
        monkeypatch.setenv("APP_CORS_ALLOW_ORIGINS", "[]")

        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            Settings()

        cors_warnings = [x for x in w if "cors_allow_origins is empty" in str(x.message)]
        assert len(cors_warnings) == 1

    def test_no_warning_when_cors_origins_set_in_production(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Should not warn when server_scheme=https and cors_allow_origins is configured."""
        monkeypatch.setenv("APP_SERVER_SCHEME", "https")
        monkeypatch.setenv("APP_CORS_ALLOW_ORIGINS", '["https://app.example.com"]')

        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            Settings()

        cors_warnings = [x for x in w if "cors_allow_origins is empty" in str(x.message)]
        assert len(cors_warnings) == 0

    def test_no_warning_when_server_scheme_http(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Should not warn when server_scheme=http (local dev mode)."""
        monkeypatch.setenv("APP_SERVER_SCHEME", "http")
        monkeypatch.setenv("APP_CORS_ALLOW_ORIGINS", "[]")

        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            Settings()

        cors_warnings = [x for x in w if "cors_allow_origins is empty" in str(x.message)]
        assert len(cors_warnings) == 0

    def test_cookie_secure_derived_from_https(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """cookie_secure should be True when server_scheme is https."""
        monkeypatch.setenv("APP_SERVER_SCHEME", "https")
        settings = Settings()
        assert settings.cookie_secure is True

    def test_cookie_secure_derived_from_http(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """cookie_secure should be False when server_scheme is http."""
        monkeypatch.setenv("APP_SERVER_SCHEME", "http")
        settings = Settings()
        assert settings.cookie_secure is False
