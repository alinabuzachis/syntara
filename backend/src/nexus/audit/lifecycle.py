"""Audit system lifecycle management.

Provides initialization and shutdown handlers for the complete audit subsystem.
These functions coordinate startup and teardown of all audit components to ensure
reliable event capture and persistence.

Initialization (`initialize_audit_components`):
    - Configures OpenTelemetry logging integration for audit event export
    - Initializes asynchronous database worker with retry and batching support

Shutdown (`flush_audit_components`):
    - Drains in-flight audit events from the async worker queue
    - Flushes OTEL logging provider to export buffered records

Call `initialize_audit_components` during application startup (lifespan context)
and `flush_audit_components` during shutdown, after all request handlers complete
but before database connections close.
"""

import threading
from enum import StrEnum

import structlog

from nexus.audit.otel_logging import configure_otel_logging, flush_otel_logging
from nexus.audit.outbox.worker import get_outbox_worker
from nexus.audit.retention.purge import get_audit_purge_worker

logger = structlog.stdlib.get_logger(__name__)


class AuditLifecycleState(StrEnum):
    """Audit system lifecycle states."""

    STOPPED = "stopped"
    RUNNING = "running"


# Thread lock to ensure thread-safe state transitions
_state_lock = threading.Lock()
_state = AuditLifecycleState.STOPPED


def start_audit_components() -> None:
    """Initialize and start all audit system components.

    Configures OTEL logging, and database persistence.
    Thread-safe and idempotent - safe to call multiple times.
    Can be called after stop to restart the audit system.
    """
    global _state  # noqa: PLW0603

    with _state_lock:
        if _state == AuditLifecycleState.RUNNING:
            logger.debug("audit.components.already_running", state=_state)
            return

        # Configure OpenTelemetry logging for audit events
        try:
            configure_otel_logging()
        except Exception:  # noqa: BLE001  # Broad catch to prevent startup failure if OTEL unavailable
            logger.warning("OTEL logging initialization failed", exc_info=True)

        # Start audit outbox worker (publishes events from main DB to audit DB)
        outbox_worker = get_outbox_worker()
        outbox_worker.start()
        logger.info("AuditOutboxWorker started")

        # Start audit purge worker (deletes events older than retention period)
        purge_worker = get_audit_purge_worker()
        purge_worker.start()
        logger.info("AuditPurgeWorker started")

        _state = AuditLifecycleState.RUNNING


async def stop_audit_components() -> None:
    """Flush and stop all audit components during shutdown.

    This ensures:
    - In-flight audit outbox events are drained and the worker is stopped
    - OTEL logger exports remaining records

    Thread-safe and idempotent - safe to call multiple times.
    Must be called last during shutdown to avoid dropping events.
    """
    global _state  # noqa: PLW0603

    with _state_lock:
        if _state == AuditLifecycleState.STOPPED:
            logger.debug("audit.components.already_stopped", state=_state)
            return

        # Stop audit purge worker
        purge_worker = get_audit_purge_worker()
        await purge_worker.stop()
        logger.info("AuditPurgeWorker stopped")

        # Wait for in-flight audit writes to complete
        outbox_worker = get_outbox_worker()
        if outbox_worker is not None:
            await outbox_worker.drain()
            await outbox_worker.stop()
            logger.info("AuditOutboxWorker shutdown.")

        # Flush OTEL logging to ensure pending LogRecords are exported.
        # This transitions OTEL back to UNCONFIGURED, allowing restart
        flush_otel_logging()
        logger.info("AuditEvent OTEL Logging flushed.")

        _state = AuditLifecycleState.STOPPED
