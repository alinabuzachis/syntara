"""Standalone Temporal worker entrypoint.

This module provides the entrypoint for running the Temporal worker
as a separate process or container. The worker polls the Temporal server
for workflow and activity tasks and executes them.

Usage:
    python -m nexus.workflows.worker

Environment Variables:
    APP_TEMPORAL_ADDRESS: Temporal server address (default: localhost:7233)
    APP_TEMPORAL_NAMESPACE: Temporal namespace (default: default)
    APP_TASK_QUEUE: Task queue name (default: nexus-workflow-queue)
    APP_FALLBACK_LOG_LEVEL: Logging level before runtime settings load (default: INFO)

"""

import asyncio
import logging
import signal
import sys

import structlog

import nexus.telemetry.handlers  # Package scanned by discover_handlers() at startup
import nexus.workflows.audit  # Package scanned by discover_handlers() at startup
from nexus.audit.discovery import discover_handlers
from nexus.audit.dispatcher import AuditEventDispatcher
from nexus.core.config.base import get_settings
from nexus.core.database.session import AsyncSessionLocal
from nexus.core.logging.logging import apply_runtime_log_level
from nexus.settings.cache.settings_cache import SettingsCache, get_runtime_settings, set_runtime_settings
from nexus.workflows.workflow_engine.services.temporal_worker import start_worker, stop_worker

# Configure logging using centralized settings
_settings = get_settings()
logging.basicConfig(
    level=_settings.fallback_log_level,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    stream=sys.stdout,
)
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
)

logger = structlog.stdlib.get_logger(__name__)


async def main() -> None:
    """Run the Temporal worker."""
    worker_service = None

    # Setup graceful shutdown
    shutdown_event = asyncio.Event()
    loop = asyncio.get_running_loop()

    def signal_handler(sig: int) -> None:
        """Handle shutdown signals."""
        logger.info("Received signal, initiating graceful shutdown...", signal=sig)
        shutdown_event.set()

    # Register signal handlers with the event loop for proper asyncio integration
    loop.add_signal_handler(signal.SIGINT, lambda: signal_handler(signal.SIGINT))
    loop.add_signal_handler(signal.SIGTERM, lambda: signal_handler(signal.SIGTERM))

    # Apply runtime log level from database (overrides fallback if set)
    set_runtime_settings(SettingsCache(session_factory=AsyncSessionLocal))
    await apply_runtime_log_level()

    # Start polling for setting changes (applies @watch_setting registrations)
    get_runtime_settings().start_watching()

    # Register audit/telemetry handlers so domain events dispatched by
    # activities (e.g. WorkflowStartEvent, WorkflowCompletedEvent) are handled in the worker.
    workflows_audit_registry = discover_handlers(nexus.workflows.audit)
    AuditEventDispatcher.register(workflows_audit_registry)
    telemetry_registry = discover_handlers(nexus.telemetry.handlers)
    AuditEventDispatcher.register(telemetry_registry)

    try:
        # Start the worker
        logger.info("Starting Temporal worker...")
        worker_service = await start_worker()
        logger.info("Temporal worker started successfully")

        # Wait for shutdown signal
        await shutdown_event.wait()

    except Exception:
        logger.exception("Failed to start Temporal worker")
        sys.exit(1)

    finally:
        # Stop settings watcher
        await get_runtime_settings().stop_watching()

        # Cleanup
        if worker_service:
            logger.info("Stopping Temporal worker...")
            await stop_worker()
            logger.info("Temporal worker stopped")


if __name__ == "__main__":
    asyncio.run(main())
