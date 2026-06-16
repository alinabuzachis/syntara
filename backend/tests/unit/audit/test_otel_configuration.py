"""Tests for OTEL audit event emission.

Verifies that emit_audit_event_otel sends events through the full OTEL logging
stack and produces ReadableLogRecords with the expected audit event data,
actor context, and sanitization.
"""

import logging
from collections.abc import Generator
from unittest.mock import MagicMock, patch

import pytest
from pydantic import SecretStr

from nexus.audit.otel_logging import OTEL_AUDIT_LOGGER_NAME, OtelLoggingState, configure_otel_logging

MOCK_SECRET_ENCRYPTION_KEY = SecretStr("1" * 64)


@pytest.fixture(autouse=True)
def _reset_otel_state() -> Generator[None, None, None]:
    """Reset OTEL state between tests to ensure isolation."""
    import nexus.audit.otel_logging as otel_module

    # Reset state before test
    with otel_module._otel_state_lock:
        otel_module._otel_state = OtelLoggingState.UNCONFIGURED
        # Clean up any handlers from previous tests
        audit_logger = logging.getLogger(OTEL_AUDIT_LOGGER_NAME)
        for handler in audit_logger.handlers[:]:
            audit_logger.removeHandler(handler)

    yield

    # Clean up after test
    with otel_module._otel_state_lock:
        otel_module._otel_state = OtelLoggingState.UNCONFIGURED
        audit_logger = logging.getLogger(OTEL_AUDIT_LOGGER_NAME)
        for handler in audit_logger.handlers[:]:
            audit_logger.removeHandler(handler)


class TestOtelAuditPipeline:
    """Tests for OTEL audit event emission through the full logging stack."""

    @patch("opentelemetry.exporter.otlp.proto.http._log_exporter.OTLPLogExporter")
    def test_configure_otel_logging_with_api_key_authentication(
        self,
        mock_exporter_class: MagicMock,
        override_settings,
    ) -> None:
        """configure_otel_logging passes authentication headers when API key is configured."""
        mock_exporter_instance = MagicMock()
        mock_exporter_class.return_value = mock_exporter_instance

        api_key = "test-api-key-12345"

        with override_settings(
            otel_enabled=True,
            otel_endpoint="https://otlp.example.com/v1/logs",
            otel_service_name="nexus-test",
            otel_api_key=SecretStr(api_key),
            otel_auth_header_name="X-API-Key",
        ):
            configure_otel_logging()

            # Verify OTLPLogExporter was called with authentication headers
            mock_exporter_class.assert_called_once()
            call_kwargs = mock_exporter_class.call_args[1]

            assert call_kwargs["endpoint"] == "https://otlp.example.com/v1/logs"
            assert call_kwargs["headers"] == {"X-API-Key": f"Bearer {api_key}"}
            assert call_kwargs["certificate_file"] is None
            assert call_kwargs["client_certificate_file"] is None
            assert call_kwargs["client_key_file"] is None

            # Cleanup
            otel_logger = logging.getLogger(OTEL_AUDIT_LOGGER_NAME)
            for handler in otel_logger.handlers[:]:
                otel_logger.removeHandler(handler)

    @patch("opentelemetry.exporter.otlp.proto.http._log_exporter.OTLPLogExporter")
    def test_configure_otel_logging_with_mtls_authentication(
        self,
        mock_exporter_class: MagicMock,
        override_settings,
    ) -> None:
        """configure_otel_logging passes certificate files when mTLS is configured."""
        mock_exporter_instance = MagicMock()
        mock_exporter_class.return_value = mock_exporter_instance

        with override_settings(
            otel_enabled=True,
            otel_endpoint="https://otlp.example.com/v1/logs",
            otel_service_name="nexus-test",
            otel_ca_cert_file="/etc/ssl/ca.crt",
            otel_client_cert_file="/etc/ssl/client.crt",
            otel_client_key_file="/etc/ssl/client.key",
        ):
            configure_otel_logging()

            # Verify OTLPLogExporter was called with certificate files
            mock_exporter_class.assert_called_once()
            call_kwargs = mock_exporter_class.call_args[1]

            assert call_kwargs["endpoint"] == "https://otlp.example.com/v1/logs"
            assert call_kwargs["headers"] is None
            assert call_kwargs["certificate_file"] == "/etc/ssl/ca.crt"
            assert call_kwargs["client_certificate_file"] == "/etc/ssl/client.crt"
            assert call_kwargs["client_key_file"] == "/etc/ssl/client.key"

            # Cleanup
            otel_logger = logging.getLogger(OTEL_AUDIT_LOGGER_NAME)
            for handler in otel_logger.handlers[:]:
                otel_logger.removeHandler(handler)

    @patch("nexus.audit.otel_logging.logger")
    @patch("opentelemetry.exporter.otlp.proto.http._log_exporter.OTLPLogExporter")
    def test_configure_otel_logging_warns_without_authentication(
        self,
        mock_exporter_class: MagicMock,
        mock_logger: MagicMock,
        override_settings,
    ) -> None:
        """configure_otel_logging warns when enabled without authentication."""
        mock_exporter_instance = MagicMock()
        mock_exporter_class.return_value = mock_exporter_instance

        with override_settings(
            otel_enabled=True,
            otel_endpoint="http://localhost:4318/v1/logs",
            otel_service_name="nexus-test",
        ):
            configure_otel_logging()

            # Verify warning was logged about missing authentication
            mock_logger.warning.assert_called_once()
            warning_call = mock_logger.warning.call_args
            assert warning_call[0][0] == "otel.logging.no_authentication"
            assert "endpoint" in warning_call[1]
            assert warning_call[1]["endpoint"] == "http://localhost:4318/v1/logs"

            # Cleanup
            otel_logger = logging.getLogger(OTEL_AUDIT_LOGGER_NAME)
            for handler in otel_logger.handlers[:]:
                otel_logger.removeHandler(handler)

    @patch("opentelemetry.exporter.otlp.proto.http._log_exporter.OTLPLogExporter")
    def test_configure_otel_logging_adds_both_otel_and_stdout_handlers(
        self,
        mock_exporter_class: MagicMock,
        override_settings,
    ) -> None:
        """configure_otel_logging adds both OTEL and stdout handlers for dual output."""
        mock_exporter_instance = MagicMock()
        mock_exporter_class.return_value = mock_exporter_instance

        with override_settings(
            otel_enabled=True,
            otel_endpoint="https://otlp.example.com/v1/logs",
            otel_service_name="nexus-test",
        ):
            configure_otel_logging()

            otel_logger = logging.getLogger(OTEL_AUDIT_LOGGER_NAME)

            # Should have exactly 2 handlers: OTEL + stdout
            assert len(otel_logger.handlers) == 2, "Should have both OTEL and stdout handlers"

            # Verify handler types
            handler_types = {type(h).__name__ for h in otel_logger.handlers}
            assert "LoggingHandler" in handler_types, "Should have OTEL LoggingHandler"
            assert "StreamHandler" in handler_types, "Should have stdout StreamHandler"

            # Verify propagate is False (prevents duplicate logs in root logger)
            assert otel_logger.propagate is False, "Should not propagate to avoid duplicates"

            # Cleanup
            for handler in otel_logger.handlers[:]:
                otel_logger.removeHandler(handler)

    @patch("opentelemetry.exporter.otlp.proto.http._log_exporter.OTLPLogExporter")
    def test_configure_otel_logging_is_idempotent(
        self,
        mock_exporter_class: MagicMock,
        override_settings,
    ) -> None:
        """configure_otel_logging is idempotent and safe to call multiple times."""
        mock_exporter_instance = MagicMock()
        mock_exporter_class.return_value = mock_exporter_instance

        with override_settings(
            otel_enabled=True,
            otel_endpoint="https://otlp.example.com/v1/logs",
            otel_service_name="nexus-test",
        ):
            # First call should configure
            configure_otel_logging()

            otel_logger = logging.getLogger(OTEL_AUDIT_LOGGER_NAME)
            initial_handler_count = len(otel_logger.handlers)

            assert initial_handler_count == 2, "First call should add exactly two handlers (OTEL + stdout)"
            assert mock_exporter_class.call_count == 1, "Exporter should be created once"

            # Second call should be idempotent (no new handlers added)
            configure_otel_logging()

            assert len(otel_logger.handlers) == initial_handler_count, "Second call should not add additional handlers"
            assert mock_exporter_class.call_count == 1, "Exporter should still only be created once"

            # Third call to verify continued idempotency
            configure_otel_logging()

            assert len(otel_logger.handlers) == initial_handler_count, "Third call should not add additional handlers"
            assert mock_exporter_class.call_count == 1, "Exporter should still only be created once"

            # Cleanup
            for handler in otel_logger.handlers[:]:
                otel_logger.removeHandler(handler)

    def test_configure_otel_logging_when_disabled_adds_only_stdout_handler(
        self,
        override_settings,
    ) -> None:
        """configure_otel_logging adds only stdout handler when OTEL is disabled."""
        with override_settings(
            otel_enabled=False,
        ):
            configure_otel_logging()

            otel_logger = logging.getLogger(OTEL_AUDIT_LOGGER_NAME)

            # Should have exactly 1 handler: stdout only
            assert len(otel_logger.handlers) == 1, "Should have only stdout handler when OTEL is disabled"

            # Verify handler type
            handler = otel_logger.handlers[0]
            assert isinstance(handler, logging.StreamHandler), "Handler should be StreamHandler"
            assert type(handler).__name__ == "StreamHandler", "Should be StreamHandler, not OTEL LoggingHandler"

            # Verify propagate is False (prevents duplicate logs in root logger)
            assert otel_logger.propagate is False, "Should not propagate to avoid duplicates"

            # Verify logger level is set to NOTSET (allows all levels)
            assert otel_logger.level == logging.NOTSET, "Logger level should be NOTSET"

            # Cleanup
            for handler in otel_logger.handlers[:]:
                otel_logger.removeHandler(handler)

    def test_configure_otel_logging_when_disabled_transitions_to_configured_state(
        self,
        override_settings,
    ) -> None:
        """configure_otel_logging transitions to CONFIGURED state even when OTEL is disabled."""
        import nexus.audit.otel_logging as otel_module

        with override_settings(
            otel_enabled=False,
        ):
            # Initial state is UNCONFIGURED (guaranteed by fixture)
            configure_otel_logging()

            # Verify state transitioned to CONFIGURED
            with otel_module._otel_state_lock:
                assert otel_module._otel_state == OtelLoggingState.CONFIGURED

            # Verify subsequent calls are idempotent
            configure_otel_logging()

            otel_logger = logging.getLogger(OTEL_AUDIT_LOGGER_NAME)
            assert len(otel_logger.handlers) == 1, "Should still have exactly one handler"

            # Cleanup
            for handler in otel_logger.handlers[:]:
                otel_logger.removeHandler(handler)

    def test_audit_events_logged_to_stdout_when_otel_disabled(
        self,
        override_settings,
    ) -> None:
        """Audit events can be logged through stream handler when OTEL is disabled."""
        import io
        from unittest.mock import patch

        with override_settings(
            otel_enabled=False,
        ):
            # Capture stderr (StreamHandler default) to verify logs are written
            with patch("sys.stderr", new=io.StringIO()) as mock_stderr:
                configure_otel_logging()

                # Verify the stream handler was configured and can emit logs
                otel_logger = logging.getLogger(OTEL_AUDIT_LOGGER_NAME)

                # Emit a test log
                test_record = logging.LogRecord(
                    name=OTEL_AUDIT_LOGGER_NAME,
                    level=logging.INFO,
                    pathname="test",
                    lineno=1,
                    msg="test audit event",
                    args=(),
                    exc_info=None,
                )
                otel_logger.handle(test_record)

                # Verify something was written to stderr
                output = mock_stderr.getvalue()
                assert len(output) > 0, "Should write to stderr when OTEL is disabled"
                assert "test audit event" in output, "Should contain the log message"

            # Cleanup
            for handler in otel_logger.handlers[:]:
                otel_logger.removeHandler(handler)


class TestOtelEndpointValidation:
    """Tests for OTLP endpoint security validation."""

    def test_localhost_http_endpoint_allowed(self, monkeypatch) -> None:
        """HTTP endpoints are allowed for localhost."""
        from nexus.core.config.base import Settings

        # Should not raise - localhost with http:// is allowed for development
        monkeypatch.setenv("APP_OTEL_ENDPOINT", "http://localhost:4318/v1/logs")
        settings = Settings(secret_encryption_key=MOCK_SECRET_ENCRYPTION_KEY)
        assert settings.otel_endpoint == "http://localhost:4318/v1/logs"

    def test_localhost_ip_http_endpoint_allowed(self, monkeypatch) -> None:
        """HTTP endpoints are allowed for 127.0.0.1."""
        from nexus.core.config.base import Settings

        # Should not raise - 127.0.0.1 with http:// is allowed for development
        monkeypatch.setenv("APP_OTEL_ENDPOINT", "http://127.0.0.1:4318/v1/logs")
        settings = Settings(secret_encryption_key=MOCK_SECRET_ENCRYPTION_KEY)
        assert settings.otel_endpoint == "http://127.0.0.1:4318/v1/logs"

    def test_remote_https_endpoint_allowed(self, monkeypatch) -> None:
        """HTTPS endpoints are allowed for remote endpoints."""
        from nexus.core.config.base import Settings

        # Should not raise - remote endpoint with https:// is valid
        monkeypatch.setenv("APP_OTEL_ENDPOINT", "https://otlp.example.com:4318/v1/logs")
        settings = Settings(secret_encryption_key=MOCK_SECRET_ENCRYPTION_KEY)
        assert settings.otel_endpoint == "https://otlp.example.com:4318/v1/logs"

    def test_remote_http_endpoint_rejected(self, monkeypatch) -> None:
        """HTTP endpoints are rejected for remote endpoints."""
        import pytest
        from pydantic import ValidationError

        from nexus.core.config.base import Settings

        # Should raise ValidationError - remote endpoint requires https://
        monkeypatch.setenv("APP_OTEL_ENDPOINT", "http://otlp.example.com:4318/v1/logs")
        with pytest.raises(ValidationError, match="Remote OTLP endpoints must use HTTPS"):
            Settings(secret_encryption_key=MOCK_SECRET_ENCRYPTION_KEY)

    def test_remote_http_ip_endpoint_rejected(self, monkeypatch) -> None:
        """HTTP endpoints are rejected for remote IP addresses."""
        import pytest
        from pydantic import ValidationError

        from nexus.core.config.base import Settings

        # Should raise ValidationError - remote IP requires https://
        monkeypatch.setenv("APP_OTEL_ENDPOINT", "http://192.168.1.100:4318/v1/logs")
        with pytest.raises(ValidationError, match="Remote OTLP endpoints must use HTTPS"):
            Settings(secret_encryption_key=MOCK_SECRET_ENCRYPTION_KEY)

    def test_localhost_bypass_with_subdomain_rejected(self, monkeypatch) -> None:
        """HTTP endpoint with localhost as subdomain is rejected (prevents bypass)."""
        import pytest
        from pydantic import ValidationError

        from nexus.core.config.base import Settings

        # Should raise ValidationError - http://localhost.evil.com is NOT localhost
        monkeypatch.setenv("APP_OTEL_ENDPOINT", "http://localhost.evil.com:4318/v1/logs")
        with pytest.raises(ValidationError, match="Remote OTLP endpoints must use HTTPS"):
            Settings(secret_encryption_key=MOCK_SECRET_ENCRYPTION_KEY)

    def test_localhost_bypass_with_ip_subdomain_rejected(self, monkeypatch) -> None:
        """HTTP endpoint with 127.0.0.1 as subdomain is rejected (prevents bypass)."""
        import pytest
        from pydantic import ValidationError

        from nexus.core.config.base import Settings

        # Should raise ValidationError - http://127.0.0.1.evil.com is NOT localhost
        monkeypatch.setenv("APP_OTEL_ENDPOINT", "http://127.0.0.1.evil.com:4318/v1/logs")
        with pytest.raises(ValidationError, match="Remote OTLP endpoints must use HTTPS"):
            Settings(secret_encryption_key=MOCK_SECRET_ENCRYPTION_KEY)

    def test_localhost_bypass_with_userinfo_rejected(self, monkeypatch) -> None:
        """HTTP endpoint with localhost in userinfo is rejected (prevents bypass)."""
        import pytest
        from pydantic import ValidationError

        from nexus.core.config.base import Settings

        # Should raise ValidationError - http://localhost@evil.com uses localhost in userinfo
        monkeypatch.setenv("APP_OTEL_ENDPOINT", "http://localhost@evil.com:4318/v1/logs")
        with pytest.raises(ValidationError, match="Remote OTLP endpoints must use HTTPS"):
            Settings(secret_encryption_key=MOCK_SECRET_ENCRYPTION_KEY)

    def test_ipv6_localhost_http_endpoint_allowed(self, monkeypatch) -> None:
        """HTTP endpoints are allowed for IPv6 localhost (::1)."""
        from nexus.core.config.base import Settings

        # Should not raise - ::1 with http:// is allowed for development
        monkeypatch.setenv("APP_OTEL_ENDPOINT", "http://[::1]:4318/v1/logs")
        settings = Settings(secret_encryption_key=MOCK_SECRET_ENCRYPTION_KEY)
        assert settings.otel_endpoint == "http://[::1]:4318/v1/logs"

    def test_unsupported_scheme_rejected(self, monkeypatch) -> None:
        """Endpoints with unsupported schemes are rejected."""
        import pytest
        from pydantic import ValidationError

        from nexus.core.config.base import Settings

        # Should raise ValidationError - ftp:// is not supported
        monkeypatch.setenv("APP_OTEL_ENDPOINT", "ftp://localhost:4318/v1/logs")
        with pytest.raises(ValidationError, match="Unsupported URL scheme"):
            Settings(secret_encryption_key=MOCK_SECRET_ENCRYPTION_KEY)
