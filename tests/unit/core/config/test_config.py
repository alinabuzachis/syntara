"""Unit tests for application configuration."""

import importlib
import os

import pytest

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
        expected_url = "postgresql+asyncpg://admin:admin@localhost:5432/nexus_api"
        assert settings.database_url == expected_url

    def test_database_url_with_custom_values(self) -> None:
        """Test database_url with custom configuration values."""
        os.environ["APP_DB_USER"] = "testuser"
        os.environ["APP_DB_PASSWORD"] = "testpass"  # noqa: S105
        os.environ["APP_DB_HOST"] = "dbserver"
        os.environ["APP_DB_PORT"] = "5433"
        os.environ["APP_DB_NAME"] = "testdb"

        try:
            settings = Settings()
            expected_url = "postgresql+asyncpg://testuser:testpass@dbserver:5433/testdb"
            assert settings.database_url == expected_url
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
        # Full URL with sslmode param - should be used directly
        override_url = "postgresql+asyncpg://prod:s3cret@db.example.com:5432/proddb?sslmode=require"
        os.environ["APP_DATABASE_URL"] = override_url
        try:
            settings = Settings()
            assert settings.database_url == override_url
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

    def test_logging_defaults(self) -> None:
        """Test default logging configuration values."""
        settings = Settings()
        assert settings.log_level == "INFO"

    def test_log_level_from_env(self) -> None:
        """Test log level can be configured via environment."""
        os.environ["APP_LOG_LEVEL"] = "DEBUG"

        try:
            settings = Settings()
            assert settings.log_level == "DEBUG"
        finally:
            os.environ.pop("APP_LOG_LEVEL", None)

    def test_log_level_case_preserved(self) -> None:
        """Test that log level case is preserved as configured."""
        os.environ["APP_LOG_LEVEL"] = "warning"

        try:
            settings = Settings()
            # Case is preserved, caller can use .upper() if needed
            assert settings.log_level == "warning"
        finally:
            os.environ.pop("APP_LOG_LEVEL", None)


# =============================================================================
# TemporalSettings Tests
# =============================================================================


class TestTemporalSettings:
    """Tests for TemporalSettings configuration."""

    def test_temporal_defaults(self) -> None:
        """Test default Temporal configuration values."""
        settings = Settings()
        assert settings.temporal_address == "localhost:7233"
        assert settings.temporal_namespace == "default"
        assert settings.task_queue == "nexus-workflow-queue"
        assert str(settings.system_user_id) == "00000000-0000-0000-0000-000000000001"
        assert settings.max_loop_iterations == 10000

    def test_temporal_settings_from_env(self) -> None:
        """Test Temporal settings can be configured via environment."""
        os.environ["APP_TEMPORAL_ADDRESS"] = "temporal.example.com:7233"
        os.environ["APP_TEMPORAL_NAMESPACE"] = "production"
        os.environ["APP_TASK_QUEUE"] = "prod-queue"
        os.environ["APP_SYSTEM_USER_ID"] = "12345678-1234-1234-1234-123456789012"
        os.environ["APP_MAX_LOOP_ITERATIONS"] = "5000"

        try:
            settings = Settings()
            assert settings.temporal_address == "temporal.example.com:7233"
            assert settings.temporal_namespace == "production"
            assert settings.task_queue == "prod-queue"
            assert str(settings.system_user_id) == "12345678-1234-1234-1234-123456789012"
            assert settings.max_loop_iterations == 5000
        finally:
            os.environ.pop("APP_TEMPORAL_ADDRESS", None)
            os.environ.pop("APP_TEMPORAL_NAMESPACE", None)
            os.environ.pop("APP_TASK_QUEUE", None)
            os.environ.pop("APP_SYSTEM_USER_ID", None)
            os.environ.pop("APP_MAX_LOOP_ITERATIONS", None)

    def test_max_loop_iterations_validation(self) -> None:
        """Test that max_loop_iterations must be at least 1."""
        os.environ["APP_MAX_LOOP_ITERATIONS"] = "0"
        try:
            with pytest.raises(ValueError, match="greater than or equal to 1"):
                Settings()
        finally:
            os.environ.pop("APP_MAX_LOOP_ITERATIONS", None)


# =============================================================================
# WorkflowEngineSettings Tests
# =============================================================================


class TestWorkflowEngineSettings:
    """Tests for WorkflowEngineSettings configuration."""

    def test_workflow_engine_defaults(self) -> None:
        """Test default workflow engine configuration values."""
        settings = Settings()
        assert settings.api_timeout_seconds == 30
        assert settings.script_timeout_seconds == 300
        assert settings.agentic_timeout_seconds == 300
        assert settings.max_duration_hours == 8760
        assert settings.max_duration_minutes == 525600
        assert settings.max_duration_seconds == 31536000
        assert settings.script_cleanup_terminate_timeout == pytest.approx(1.0)
        assert settings.script_cleanup_kill_timeout == pytest.approx(0.5)
        assert settings.max_env_var_length == 32768
        assert settings.max_prompt_length == 100000
        assert settings.max_input_value_length == 10000
        assert settings.max_total_input_size == 50000
        assert str(settings.agent_orchestrator_base_url) == "http://localhost:8000/api/v1"

    def test_workflow_engine_settings_from_env(self) -> None:
        """Test workflow engine settings can be configured via environment."""
        os.environ["APP_API_TIMEOUT_SECONDS"] = "60"
        os.environ["APP_SCRIPT_TIMEOUT_SECONDS"] = "600"
        os.environ["APP_AGENTIC_TIMEOUT_SECONDS"] = "600"
        os.environ["APP_AGENT_ORCHESTRATOR_BASE_URL"] = "http://agent.example.com/api/v1"

        try:
            settings = Settings()
            assert settings.api_timeout_seconds == 60
            assert settings.script_timeout_seconds == 600
            assert settings.agentic_timeout_seconds == 600
            assert str(settings.agent_orchestrator_base_url) == "http://agent.example.com/api/v1"
        finally:
            os.environ.pop("APP_API_TIMEOUT_SECONDS", None)
            os.environ.pop("APP_SCRIPT_TIMEOUT_SECONDS", None)
            os.environ.pop("APP_AGENTIC_TIMEOUT_SECONDS", None)
            os.environ.pop("APP_AGENT_ORCHESTRATOR_BASE_URL", None)

    def test_duration_limits_allow_zero_for_unlimited(self) -> None:
        """Test that duration limits can be set to 0 (unlimited)."""
        os.environ["APP_MAX_DURATION_HOURS"] = "0"
        os.environ["APP_MAX_DURATION_MINUTES"] = "0"
        os.environ["APP_MAX_DURATION_SECONDS"] = "0"

        try:
            settings = Settings()
            assert settings.max_duration_hours == 0
            assert settings.max_duration_minutes == 0
            assert settings.max_duration_seconds == 0
        finally:
            os.environ.pop("APP_MAX_DURATION_HOURS", None)
            os.environ.pop("APP_MAX_DURATION_MINUTES", None)
            os.environ.pop("APP_MAX_DURATION_SECONDS", None)

    def test_timeout_validation(self) -> None:
        """Test that timeout settings enforce minimum values."""
        os.environ["APP_API_TIMEOUT_SECONDS"] = "0"
        try:
            with pytest.raises(ValueError, match="greater than or equal to 1"):
                Settings()
        finally:
            os.environ.pop("APP_API_TIMEOUT_SECONDS", None)


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


def test_custom_env_file_path(monkeypatch, tmp_path) -> None:
    """Ensure APP_ENV_FILE_PATH is honored when loading settings."""
    from nexus.core.config import base as config_module

    env_file = tmp_path / "custom.env"
    env_file.write_text("APP_OPENROUTER_MODEL=custom-model")

    monkeypatch.setenv("APP_ENV_FILE_PATH", str(env_file))

    reloaded_config = importlib.reload(config_module)
    reloaded_config.get_settings.cache_clear()

    settings = reloaded_config.get_settings()

    assert settings.openrouter_model == "custom-model"

    monkeypatch.delenv("APP_ENV_FILE_PATH", raising=False)
    importlib.reload(config_module).get_settings.cache_clear()


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
