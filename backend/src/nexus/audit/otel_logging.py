"""OpenTelemetry logging configuration for audit events.

This module configures a dedicated Python logger ("nexus.audit.otel") that exports
log records to an OTLP collector. The logger is intended for audit events that need
to be sent to external observability platforms.

Usage:
    # At application startup (e.g., in main.py):
    configure_otel_logging()

    # In audit emitter code:
    audit_logger_otel = structlog.stdlib.get_logger("nexus.audit.otel")
    audit_logger_otel.info("audit_event", **event_dict)
"""

import logging
import os
import threading
from enum import StrEnum

import structlog

from nexus.core.config.base import get_settings
from nexus.core.logging.logging import build_nexus_formatter

# Logger name for OTEL-exported audit logs
OTEL_AUDIT_LOGGER_NAME = "nexus.audit.otel"

# Operational logger for diagnostics when OTEL setup fails
logger = structlog.stdlib.get_logger(__name__)


class OtelLoggingState(StrEnum):
    """OTEL logging lifecycle states."""

    UNCONFIGURED = "unconfigured"
    CONFIGURED = "configured"


# Thread lock to ensure thread-safe state transitions
_otel_state_lock = threading.Lock()
_otel_state = OtelLoggingState.UNCONFIGURED


def configure_otel_logging() -> None:
    """Configure OpenTelemetry logging for the audit logger.

    Always configures a stdout handler for the "nexus.audit.otel" logger to ensure
    audit events are visible in operational logs. If OTEL is enabled in settings,
    also attaches an OTLP exporter for external observability platforms.

    This function is idempotent, thread-safe, and safe to call multiple times.
    Can be called after flushing to reconfigure.

    Raises:
        ImportError: If OpenTelemetry SDK packages are not installed and OTEL is enabled.

    """
    global _otel_state  # noqa: PLW0603

    settings = get_settings()

    # Thread-safe state-based configuration
    with _otel_state_lock:
        if _otel_state == OtelLoggingState.CONFIGURED:
            logger.debug(
                "otel.logging.already_configured",
                logger_name=OTEL_AUDIT_LOGGER_NAME,
                state=_otel_state,
            )
            return

        audit_otel_logger = logging.getLogger(OTEL_AUDIT_LOGGER_NAME)

        # Create stdout handler for operational logs
        # This ensures audit events are ALWAYS visible in standard logs,
        # regardless of OTEL export configuration
        stdout_handler = logging.StreamHandler()
        stdout_handler.setFormatter(build_nexus_formatter())
        stdout_handler.setLevel(logging.NOTSET)

        # Always attach stdout handler
        audit_otel_logger.addHandler(stdout_handler)
        audit_otel_logger.setLevel(logging.NOTSET)

        # Prevent propagation to avoid duplicate logs in the root logger
        # (stdout_handler already writes to stdout, we don't need root logger to do it again)
        audit_otel_logger.propagate = False

        # Conditionally configure OTEL export if enabled
        if settings.otel_enabled:
            try:
                # Import here to avoid hard dependency when OTEL is disabled
                from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter  # noqa: PLC0415
                from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler  # noqa: PLC0415
                from opentelemetry.sdk._logs.export import BatchLogRecordProcessor  # noqa: PLC0415
                from opentelemetry.sdk.resources import Resource  # noqa: PLC0415
            except ImportError:
                logger.exception(
                    "otel.logging.import_error",
                )
                raise

            # Create resource with service identification
            resource = Resource.create(
                {
                    "service.name": settings.otel_service_name,
                    "service.instance.id": os.uname().nodename,
                }
            )

            # Create logger provider
            logger_provider = LoggerProvider(resource=resource)

            # Build authentication headers if API key is configured
            headers = None
            if settings.otel_api_key:
                headers = {
                    settings.otel_auth_header_name: f"Bearer {settings.otel_api_key.get_secret_value()}",
                }

            # Determine if mTLS is configured
            has_mtls = settings.otel_client_cert_file and settings.otel_client_key_file

            # Warn if no authentication is configured in production
            if not settings.otel_api_key and not has_mtls:
                logger.warning(
                    "otel.logging.no_authentication",
                    endpoint=settings.otel_endpoint,
                    message="OTLP endpoint configured without authentication (no API key or mTLS)",
                )

            # Create OTLP exporter with authentication
            # HTTP transport uses URL scheme for security (http:// vs https://)
            otlp_exporter = OTLPLogExporter(
                endpoint=settings.otel_endpoint,
                headers=headers,
                certificate_file=settings.otel_ca_cert_file,
                client_certificate_file=settings.otel_client_cert_file,
                client_key_file=settings.otel_client_key_file,
            )

            # Add batch processor with OTLP exporter
            logger_provider.add_log_record_processor(BatchLogRecordProcessor(otlp_exporter))

            # Create OpenTelemetry logging handler
            otel_handler = LoggingHandler(
                level=logging.NOTSET,
                logger_provider=logger_provider,
            )

            # Attach OTEL handler to the audit logger
            audit_otel_logger.addHandler(otel_handler)

            logger.info(
                "otel.logging.configured",
                logger_name=OTEL_AUDIT_LOGGER_NAME,
                endpoint=settings.otel_endpoint,
                service_name=settings.otel_service_name,
                has_api_key_auth=bool(settings.otel_api_key),
                has_mtls=has_mtls,
                state=_otel_state,
                otel_export_enabled=True,
            )
        else:
            logger.info(
                "otel.logging.configured",
                logger_name=OTEL_AUDIT_LOGGER_NAME,
                state=_otel_state,
                otel_export_enabled=False,
                reason="otel_enabled=False in settings",
            )

        _otel_state = OtelLoggingState.CONFIGURED


def flush_otel_logging() -> None:
    """Flush pending log records and transition to UNCONFIGURED.

    Flushes all handlers attached to the audit logger. For OTEL handlers,
    forces the LoggerProvider to flush pending log records through the
    BatchLogRecordProcessor to the OTLP collector. For stdout handlers,
    ensures buffered output is written.

    Should be called during application shutdown to ensure all audit events
    are exported and written to logs.

    After flushing, removes handlers and transitions to UNCONFIGURED state,
    allowing the system to be reconfigured and restarted.

    Thread-safe and idempotent - safe to call multiple times and safe
    to call even if logging was never configured.
    """
    global _otel_state  # noqa: PLW0603

    with _otel_state_lock:
        if _otel_state == OtelLoggingState.UNCONFIGURED:
            logger.debug(
                "otel.logging.flush_skipped_not_configured",
                logger_name=OTEL_AUDIT_LOGGER_NAME,
                state=_otel_state,
            )
            return

        audit_otel_logger = logging.getLogger(OTEL_AUDIT_LOGGER_NAME)

        # Flush all handlers attached to the audit logger
        for handler in audit_otel_logger.handlers:
            try:
                handler.flush()

                # If this is an OTEL LoggingHandler, also force_flush the provider
                if hasattr(handler, "logger_provider"):
                    handler.logger_provider.force_flush()
                    logger.info(
                        "otel.logging.flushed",
                        logger_name=OTEL_AUDIT_LOGGER_NAME,
                    )
            except Exception:  # noqa: BLE001
                logger.warning(
                    "otel.logging.flush_failed",
                    logger_name=OTEL_AUDIT_LOGGER_NAME,
                    exc_info=True,
                )

        # Remove all handlers to allow clean reconfiguration
        for handler in audit_otel_logger.handlers[:]:
            audit_otel_logger.removeHandler(handler)

        # Transition back to UNCONFIGURED, allowing restart
        _otel_state = OtelLoggingState.UNCONFIGURED
