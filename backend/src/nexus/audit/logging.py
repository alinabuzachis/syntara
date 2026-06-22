"""OpenTelemetry logging configuration for audit events.

This module configures a dedicated Python logger ("nexus.audit.otel") that exports
log records to an OTLP collector. The logger is intended for audit events that need
to be sent to external observability platforms.

This module provides stateless setup functions. Lifecycle coordination (state management,
startup/shutdown orchestration) is handled by core.logging.lifecycle.

Usage:
    # Via lifecycle orchestration (preferred):
    from nexus.core.logging.lifecycle import start_loggers, stop_loggers
    start_loggers()  # Configures root + audit loggers
    stop_loggers()   # Flushes and cleans up

    # In audit emitter code:
    audit_logger_otel = structlog.stdlib.get_logger("nexus.audit.otel")
    audit_logger_otel.info("audit_event", **event_dict)
"""

import logging

import structlog

from nexus.core.config.base import get_settings
from nexus.core.logging.logging import build_nexus_formatter
from nexus.core.logging.otel_handlers import create_otel_handler

# Logger name for OTEL-exported audit logs
OTEL_AUDIT_LOGGER_NAME = "nexus.audit.otel"

# Operational logger for diagnostics when OTEL setup fails
logger = structlog.stdlib.get_logger(__name__)


def configure_audit_logging() -> None:
    """Configure OpenTelemetry logging for the audit logger.

    Stateless setup function that configures the "nexus.audit.otel" logger with:
    - Stdout handler (NOTSET level) for operational visibility
    - OTLP handler (if enabled) for external observability platforms

    The audit logger is configured with NOTSET level and propagate=False to ensure
    all audit events emit regardless of application log level and don't duplicate
    to the root logger.

    Called by core.logging.lifecycle during startup. State management and idempotency
    are handled by the lifecycle module, not here.

    """
    settings = get_settings()
    audit_otel_logger = logging.getLogger(OTEL_AUDIT_LOGGER_NAME)

    # Create stdout handler for operational logs
    # This ensures audit events are ALWAYS visible in standard logs,
    # regardless of OTEL export configuration
    stdout_handler = logging.StreamHandler()
    stdout_handler.setFormatter(build_nexus_formatter())
    stdout_handler.setLevel(logging.NOTSET)

    # Always attach stdout handler
    audit_otel_logger.addHandler(stdout_handler)

    # Create and attach OTLP handler if enabled
    otel_handler = create_otel_handler()
    if otel_handler is not None:
        audit_otel_logger.addHandler(otel_handler)
        logger.info(
            "otel.logging.configured",
            logger_name=OTEL_AUDIT_LOGGER_NAME,
            endpoint=settings.otel_endpoint,
            service_name=settings.otel_service_name,
            otel_export_enabled=True,
        )
    else:
        logger.info(
            "otel.logging.configured",
            logger_name=OTEL_AUDIT_LOGGER_NAME,
            otel_export_enabled=False,
            reason="otel_enabled=False in settings",
        )

    # Set NOTSET level to ensure all audit events emit
    audit_otel_logger.setLevel(logging.NOTSET)

    # Prevent propagation to avoid duplicate logs in the root logger
    # (stdout_handler already writes to stdout, we don't need root logger to do it again)
    audit_otel_logger.propagate = False
