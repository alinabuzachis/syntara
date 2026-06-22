"""Centralized logging lifecycle orchestration.

This module coordinates the setup and teardown of all logging subsystems:
- Root logger (application logs) with OTLP export
- Audit logger (audit events) with OTLP export

It ensures thread-safe, idempotent initialization and clean shutdown with
proper flushing of pending OTLP log records.

Usage:
    # At application startup (e.g., in main.py lifespan):
    start_loggers()

    # At application shutdown:
    stop_loggers()
"""

import logging
import threading
from enum import StrEnum

import structlog

from nexus.audit.logging import OTEL_AUDIT_LOGGER_NAME, configure_audit_logging
from nexus.core.logging.logging import configure_app_logging
from nexus.core.logging.otel_handlers import flush_otel_handler

logger = structlog.stdlib.get_logger(__name__)


class OtelLoggingState(StrEnum):
    """OTEL logging lifecycle states."""

    UNCONFIGURED = "unconfigured"
    CONFIGURED = "configured"


# Thread lock to ensure thread-safe state transitions
_logging_state_lock = threading.Lock()
_logging_state = OtelLoggingState.UNCONFIGURED


def start_loggers() -> None:
    """Initialize and start all logging subsystems.

    Configures:
    - Root logger with stdout and OTLP handlers (respects configured log level)
    - Audit logger with stdout and OTLP handlers (NOTSET level, no propagation)

    Thread-safe and idempotent - safe to call multiple times.
    Can be called after stop_loggers() to restart logging.
    """
    global _logging_state  # noqa: PLW0603

    with _logging_state_lock:
        if _logging_state == OtelLoggingState.CONFIGURED:
            logger.debug(
                "logging.already_configured",
                state=_logging_state,
            )
            return

        # Configure root logger (stdout + OTLP)
        configure_app_logging()

        # Configure audit logger (stdout + OTLP, NOTSET level, no propagation)
        configure_audit_logging()

        _logging_state = OtelLoggingState.CONFIGURED
        logger.info("logging.configured")


def stop_loggers() -> None:
    """Flush and stop all logging subsystems.

    Flushes pending OTLP log records for both root and audit loggers,
    then removes all handlers to allow clean restart.

    Thread-safe and idempotent - safe to call multiple times.
    """
    global _logging_state  # noqa: PLW0603

    with _logging_state_lock:
        if _logging_state == OtelLoggingState.UNCONFIGURED:
            logger.debug(
                "logging.flush_skipped_not_configured",
                state=_logging_state,
            )
            return

        # Flush root logger OTLP handlers
        root_logger = logging.getLogger()
        flush_otel_handler(root_logger)

        # Flush audit logger OTLP handlers
        logger.info("logging.flushing_and_stopping")
        audit_logger = logging.getLogger(OTEL_AUDIT_LOGGER_NAME)
        flush_otel_handler(audit_logger)
        logger.info("logging.flushed_and_stopped")

        # Remove handlers from both loggers (cleanup for restart)
        logger.info("logging.removing_root_handlers")
        for handler in root_logger.handlers[:]:
            root_logger.removeHandler(handler)

        logger.info("logging.removing_audit_handlers")
        for handler in audit_logger.handlers[:]:
            audit_logger.removeHandler(handler)

        _logging_state = OtelLoggingState.UNCONFIGURED
