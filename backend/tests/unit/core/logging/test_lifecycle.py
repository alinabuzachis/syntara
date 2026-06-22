"""Unit tests for core logging lifecycle management.

Tests cover:
- Logger initialization and startup (root + audit)
- Logger shutdown and flushing
- Thread-safe state transitions
- Idempotent start/stop operations
- Logger restart after shutdown
- Handler cleanup
"""

import logging
import threading
from collections.abc import Generator
from unittest.mock import MagicMock, patch

import pytest

from nexus.audit.logging import OTEL_AUDIT_LOGGER_NAME
from nexus.core.logging.lifecycle import OtelLoggingState, start_loggers, stop_loggers

# ------------------------------------------------------------------ #
# Fixtures
# ------------------------------------------------------------------ #


@pytest.fixture(autouse=True)
def _reset_logging_state() -> Generator[None, None, None]:
    """Reset logging state and handlers between tests to ensure isolation."""
    import nexus.core.logging.lifecycle as lifecycle_module

    # Reset state before test
    with lifecycle_module._logging_state_lock:
        lifecycle_module._logging_state = OtelLoggingState.UNCONFIGURED

    # Clean up handlers
    root_logger = logging.getLogger()
    audit_logger = logging.getLogger(OTEL_AUDIT_LOGGER_NAME)

    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    for handler in audit_logger.handlers[:]:
        audit_logger.removeHandler(handler)

    yield

    # Clean up after test
    with lifecycle_module._logging_state_lock:
        lifecycle_module._logging_state = OtelLoggingState.UNCONFIGURED

    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    for handler in audit_logger.handlers[:]:
        audit_logger.removeHandler(handler)


# ------------------------------------------------------------------ #
# Helper Functions
# ------------------------------------------------------------------ #


def _reset_lifecycle_state() -> None:
    """Reset module-level lifecycle state to UNCONFIGURED (for test isolation)."""
    import nexus.core.logging.lifecycle as lifecycle_module

    with lifecycle_module._logging_state_lock:
        lifecycle_module._logging_state = OtelLoggingState.UNCONFIGURED


# ------------------------------------------------------------------ #
# Start Tests
# ------------------------------------------------------------------ #


class TestStartLoggers:
    """Test start_loggers function."""

    @patch("nexus.core.logging.lifecycle.configure_audit_logging")
    @patch("nexus.core.logging.lifecycle.configure_app_logging")
    def test_configures_app_logging(self, mock_configure_app: MagicMock, mock_configure_audit: MagicMock) -> None:
        """Test that start_loggers configures application logging."""
        start_loggers()

        mock_configure_app.assert_called_once()

    @patch("nexus.core.logging.lifecycle.configure_audit_logging")
    @patch("nexus.core.logging.lifecycle.configure_app_logging")
    def test_configures_audit_logging(self, mock_configure_app: MagicMock, mock_configure_audit: MagicMock) -> None:
        """Test that start_loggers configures audit logging."""
        start_loggers()

        mock_configure_audit.assert_called_once()

    @patch("nexus.core.logging.lifecycle.configure_audit_logging")
    @patch("nexus.core.logging.lifecycle.configure_app_logging")
    def test_sets_configured_state(self, mock_configure_app: MagicMock, mock_configure_audit: MagicMock) -> None:
        """Test that start_loggers transitions state to CONFIGURED."""
        start_loggers()

        import nexus.core.logging.lifecycle as lifecycle_module

        assert lifecycle_module._logging_state == OtelLoggingState.CONFIGURED

    @patch("nexus.core.logging.lifecycle.configure_audit_logging")
    @patch("nexus.core.logging.lifecycle.configure_app_logging")
    def test_idempotent_when_already_configured(
        self, mock_configure_app: MagicMock, mock_configure_audit: MagicMock
    ) -> None:
        """Test that calling start_loggers when already configured is a no-op."""
        # First call configures
        start_loggers()
        assert mock_configure_app.call_count == 1
        assert mock_configure_audit.call_count == 1

        # Second call should not configure again
        start_loggers()
        assert mock_configure_app.call_count == 1
        assert mock_configure_audit.call_count == 1

    @patch("nexus.core.logging.lifecycle.configure_audit_logging")
    @patch("nexus.core.logging.lifecycle.configure_app_logging")
    def test_logs_already_configured(self, mock_configure_app: MagicMock, mock_configure_audit: MagicMock) -> None:
        """Test that calling start_loggers when configured logs a debug message."""
        with patch("nexus.core.logging.lifecycle.logger") as mock_logger:
            # First call
            start_loggers()

            # Second call should log
            start_loggers()

            mock_logger.debug.assert_called_with("logging.already_configured", state=OtelLoggingState.CONFIGURED)

    @patch("nexus.core.logging.lifecycle.configure_audit_logging")
    @patch("nexus.core.logging.lifecycle.configure_app_logging")
    def test_thread_safe_concurrent_calls(self, mock_configure_app: MagicMock, mock_configure_audit: MagicMock) -> None:
        """Test that concurrent start_loggers calls are thread-safe (only one configures)."""
        barrier = threading.Barrier(2)

        def concurrent_start() -> None:
            barrier.wait()  # Synchronize threads
            start_loggers()

        thread1 = threading.Thread(target=concurrent_start)
        thread2 = threading.Thread(target=concurrent_start)

        thread1.start()
        thread2.start()

        thread1.join()
        thread2.join()

        # Both loggers should only be configured once despite concurrent calls
        assert mock_configure_app.call_count == 1
        assert mock_configure_audit.call_count == 1

    @patch("nexus.core.logging.lifecycle.configure_audit_logging")
    @patch("nexus.core.logging.lifecycle.configure_app_logging")
    def test_logs_success_message(self, mock_configure_app: MagicMock, mock_configure_audit: MagicMock) -> None:
        """Test that start_loggers logs a success message."""
        with patch("nexus.core.logging.lifecycle.logger") as mock_logger:
            start_loggers()

            mock_logger.info.assert_called_with("logging.configured")


# ------------------------------------------------------------------ #
# Stop Tests
# ------------------------------------------------------------------ #


class TestStopLoggers:
    """Test stop_loggers function."""

    @patch("nexus.core.logging.lifecycle.flush_otel_handler")
    @patch("nexus.core.logging.lifecycle.configure_audit_logging")
    @patch("nexus.core.logging.lifecycle.configure_app_logging")
    def test_flushes_root_logger(
        self,
        mock_configure_app: MagicMock,
        mock_configure_audit: MagicMock,
        mock_flush: MagicMock,
    ) -> None:
        """Test that stop_loggers flushes the root logger."""
        start_loggers()
        stop_loggers()

        # Should be called twice: once for root, once for audit
        assert mock_flush.call_count == 2

        # Verify root logger was flushed
        root_logger = logging.getLogger()
        flush_calls = [call[0][0] for call in mock_flush.call_args_list]
        assert root_logger in flush_calls

    @patch("nexus.core.logging.lifecycle.flush_otel_handler")
    @patch("nexus.core.logging.lifecycle.configure_audit_logging")
    @patch("nexus.core.logging.lifecycle.configure_app_logging")
    def test_flushes_audit_logger(
        self,
        mock_configure_app: MagicMock,
        mock_configure_audit: MagicMock,
        mock_flush: MagicMock,
    ) -> None:
        """Test that stop_loggers flushes the audit logger."""
        start_loggers()
        stop_loggers()

        # Verify audit logger was flushed
        audit_logger = logging.getLogger(OTEL_AUDIT_LOGGER_NAME)
        flush_calls = [call[0][0] for call in mock_flush.call_args_list]
        assert audit_logger in flush_calls

    @patch("nexus.core.logging.lifecycle.flush_otel_handler")
    @patch("nexus.core.logging.lifecycle.configure_audit_logging")
    @patch("nexus.core.logging.lifecycle.configure_app_logging")
    def test_removes_root_logger_handlers(
        self,
        mock_configure_app: MagicMock,
        mock_configure_audit: MagicMock,
        mock_flush: MagicMock,
    ) -> None:
        """Test that stop_loggers removes all root logger handlers."""
        # Add a mock handler to root logger
        root_logger = logging.getLogger()
        test_handler = logging.StreamHandler()
        root_logger.addHandler(test_handler)

        start_loggers()
        initial_count = len(root_logger.handlers)
        assert initial_count > 0

        stop_loggers()

        assert len(root_logger.handlers) == 0

    @patch("nexus.core.logging.lifecycle.flush_otel_handler")
    @patch("nexus.core.logging.lifecycle.configure_audit_logging")
    @patch("nexus.core.logging.lifecycle.configure_app_logging")
    def test_removes_audit_logger_handlers(
        self,
        mock_configure_app: MagicMock,
        mock_configure_audit: MagicMock,
        mock_flush: MagicMock,
    ) -> None:
        """Test that stop_loggers removes all audit logger handlers."""
        # Add a mock handler to audit logger
        audit_logger = logging.getLogger(OTEL_AUDIT_LOGGER_NAME)
        test_handler = logging.StreamHandler()
        audit_logger.addHandler(test_handler)

        start_loggers()
        initial_count = len(audit_logger.handlers)
        assert initial_count > 0

        stop_loggers()

        assert len(audit_logger.handlers) == 0

    @patch("nexus.core.logging.lifecycle.flush_otel_handler")
    @patch("nexus.core.logging.lifecycle.configure_audit_logging")
    @patch("nexus.core.logging.lifecycle.configure_app_logging")
    def test_sets_unconfigured_state(
        self,
        mock_configure_app: MagicMock,
        mock_configure_audit: MagicMock,
        mock_flush: MagicMock,
    ) -> None:
        """Test that stop_loggers transitions state to UNCONFIGURED."""
        start_loggers()
        stop_loggers()

        import nexus.core.logging.lifecycle as lifecycle_module

        assert lifecycle_module._logging_state == OtelLoggingState.UNCONFIGURED

    @patch("nexus.core.logging.lifecycle.flush_otel_handler")
    def test_idempotent_when_already_stopped(self, mock_flush: MagicMock) -> None:
        """Test that calling stop_loggers when already stopped is a no-op."""
        # First call without starting (already in UNCONFIGURED state)
        stop_loggers()

        # Flush should not be called
        mock_flush.assert_not_called()

    @patch("nexus.core.logging.lifecycle.flush_otel_handler")
    def test_logs_already_stopped(self, mock_flush: MagicMock) -> None:
        """Test that calling stop_loggers when stopped logs a debug message."""
        with patch("nexus.core.logging.lifecycle.logger") as mock_logger:
            # Call stop when already stopped
            stop_loggers()

            mock_logger.debug.assert_called_with(
                "logging.flush_skipped_not_configured", state=OtelLoggingState.UNCONFIGURED
            )

    @patch("nexus.core.logging.lifecycle.flush_otel_handler")
    @patch("nexus.core.logging.lifecycle.configure_audit_logging")
    @patch("nexus.core.logging.lifecycle.configure_app_logging")
    def test_logs_success_message(
        self,
        mock_configure_app: MagicMock,
        mock_configure_audit: MagicMock,
        mock_flush: MagicMock,
    ) -> None:
        """Test that stop_loggers logs all shutdown messages in order."""
        with patch("nexus.core.logging.lifecycle.logger") as mock_logger:
            start_loggers()
            stop_loggers()

            # Verify all shutdown log messages were emitted in the correct order
            expected_calls = [
                ("logging.flushing_and_stopping",),
                ("logging.flushed_and_stopped",),
                ("logging.removing_root_handlers",),
                ("logging.removing_audit_handlers",),
            ]

            # Get only the info() calls from stop_loggers (skip the one from start_loggers)
            info_calls = mock_logger.info.call_args_list
            # First call is from start_loggers ("logging.configured"), rest are from stop_loggers
            assert len(info_calls) == 5
            stop_calls = info_calls[1:]  # Skip the start_loggers call

            for i, expected_args in enumerate(expected_calls):
                assert stop_calls[i][0] == expected_args

    @patch("nexus.core.logging.lifecycle.flush_otel_handler")
    @patch("nexus.core.logging.lifecycle.configure_audit_logging")
    @patch("nexus.core.logging.lifecycle.configure_app_logging")
    def test_flush_before_handler_removal(
        self,
        mock_configure_app: MagicMock,
        mock_configure_audit: MagicMock,
        mock_flush: MagicMock,
    ) -> None:
        """Test that handlers are flushed before being removed."""
        call_order = []

        def track_flush(logger: logging.Logger) -> None:
            call_order.append(f"flush_{logger.name or 'root'}")

        mock_flush.side_effect = track_flush

        # Track handler removal by monitoring handler count
        root_logger = logging.getLogger()
        audit_logger = logging.getLogger(OTEL_AUDIT_LOGGER_NAME)

        start_loggers()

        # Add tracking to verify handlers exist during flush
        original_remove_handler_root = root_logger.removeHandler
        original_remove_handler_audit = audit_logger.removeHandler

        def track_remove_root(handler: logging.Handler) -> None:
            call_order.append("remove_root")
            original_remove_handler_root(handler)

        def track_remove_audit(handler: logging.Handler) -> None:
            call_order.append("remove_audit")
            original_remove_handler_audit(handler)

        root_logger.removeHandler = track_remove_root  # type: ignore[assignment,method-assign]
        audit_logger.removeHandler = track_remove_audit  # type: ignore[assignment,method-assign]

        stop_loggers()

        # Verify flush happened before remove for both loggers
        flush_root_index = next(i for i, v in enumerate(call_order) if v == "flush_root")
        flush_audit_index = next(i for i, v in enumerate(call_order) if v.startswith("flush_nexus.audit"))
        first_remove_index = next((i for i, v in enumerate(call_order) if v.startswith("remove_")), len(call_order))

        assert flush_root_index < first_remove_index
        assert flush_audit_index < first_remove_index


# ------------------------------------------------------------------ #
# Restart Tests
# ------------------------------------------------------------------ #


class TestRestartLoggers:
    """Test restarting the logging system after shutdown."""

    @patch("nexus.core.logging.lifecycle.flush_otel_handler")
    @patch("nexus.core.logging.lifecycle.configure_audit_logging")
    @patch("nexus.core.logging.lifecycle.configure_app_logging")
    def test_can_restart_after_stop(
        self,
        mock_configure_app: MagicMock,
        mock_configure_audit: MagicMock,
        mock_flush: MagicMock,
    ) -> None:
        """Test that loggers can be restarted after being stopped."""
        # Start -> Stop -> Start cycle
        start_loggers()
        assert mock_configure_app.call_count == 1
        assert mock_configure_audit.call_count == 1

        stop_loggers()
        assert mock_flush.call_count == 2  # Root + audit

        # Restart should work
        start_loggers()
        assert mock_configure_app.call_count == 2
        assert mock_configure_audit.call_count == 2

    @patch("nexus.core.logging.lifecycle.flush_otel_handler")
    @patch("nexus.core.logging.lifecycle.configure_audit_logging")
    @patch("nexus.core.logging.lifecycle.configure_app_logging")
    def test_multiple_start_stop_cycles(
        self,
        mock_configure_app: MagicMock,
        mock_configure_audit: MagicMock,
        mock_flush: MagicMock,
    ) -> None:
        """Test multiple start/stop cycles work correctly."""
        for i in range(3):
            start_loggers()
            assert mock_configure_app.call_count == i + 1
            assert mock_configure_audit.call_count == i + 1

            stop_loggers()
            assert mock_flush.call_count == (i + 1) * 2  # 2 flushes per cycle

            import nexus.core.logging.lifecycle as lifecycle_module

            assert lifecycle_module._logging_state == OtelLoggingState.UNCONFIGURED


# ------------------------------------------------------------------ #
# Thread Safety Tests
# ------------------------------------------------------------------ #


class TestThreadSafety:
    """Test thread safety of lifecycle operations."""

    @patch("nexus.core.logging.lifecycle.flush_otel_handler")
    @patch("nexus.core.logging.lifecycle.configure_audit_logging")
    @patch("nexus.core.logging.lifecycle.configure_app_logging")
    def test_state_transitions_are_atomic(
        self,
        mock_configure_app: MagicMock,
        mock_configure_audit: MagicMock,
        mock_flush: MagicMock,
    ) -> None:
        """Test that state transitions under lock prevent race conditions."""
        # Rapidly call start from multiple threads
        threads = [threading.Thread(target=start_loggers) for _ in range(10)]

        for thread in threads:
            thread.start()

        for thread in threads:
            thread.join()

        # Despite 10 concurrent calls, loggers should only be configured once
        assert mock_configure_app.call_count == 1
        assert mock_configure_audit.call_count == 1

        import nexus.core.logging.lifecycle as lifecycle_module

        assert lifecycle_module._logging_state == OtelLoggingState.CONFIGURED

    @patch("nexus.core.logging.lifecycle.flush_otel_handler")
    @patch("nexus.core.logging.lifecycle.configure_audit_logging")
    @patch("nexus.core.logging.lifecycle.configure_app_logging")
    def test_stop_waits_for_lock(
        self,
        mock_configure_app: MagicMock,
        mock_configure_audit: MagicMock,
        mock_flush: MagicMock,
    ) -> None:
        """Test that stop waits for lock even if start holds it."""
        # Start the loggers
        start_loggers()

        # Stop should acquire lock and complete
        stop_loggers()

        import nexus.core.logging.lifecycle as lifecycle_module

        assert lifecycle_module._logging_state == OtelLoggingState.UNCONFIGURED
