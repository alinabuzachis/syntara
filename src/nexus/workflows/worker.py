"""Standalone Temporal worker entrypoint.

This module provides the entrypoint for running the Temporal worker
as a separate process or container. The worker polls the Temporal server
for workflow and activity tasks and executes them.

Usage:
    python -m nexus.workflows.worker

Environment Variables:
    NEXUS_TEMPORAL_ADDRESS: Temporal server address (default: localhost:7233)
    NEXUS_TEMPORAL_NAMESPACE: Temporal namespace (default: default)
    NEXUS_TASK_QUEUE: Task queue name (default: nexus-workflow-queue)
    NEXUS_LOG_LEVEL: Logging level (default: INFO)

"""

import asyncio
import logging
import signal
import sys

from nexus.core.config.base import get_settings
from nexus.workflows.workflow_engine.services.temporal_worker import start_worker, stop_worker

# Configure logging using centralized settings
_settings = get_settings()
logging.basicConfig(
    level=_settings.log_level.upper(),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)


async def main() -> None:
    """Run the Temporal worker."""
    worker_service = None

    # Setup graceful shutdown
    shutdown_event = asyncio.Event()
    loop = asyncio.get_running_loop()

    def signal_handler(sig: int) -> None:
        """Handle shutdown signals."""
        logger.info("Received signal %s, initiating graceful shutdown...", sig)
        shutdown_event.set()

    # Register signal handlers with the event loop for proper asyncio integration
    loop.add_signal_handler(signal.SIGINT, lambda: signal_handler(signal.SIGINT))
    loop.add_signal_handler(signal.SIGTERM, lambda: signal_handler(signal.SIGTERM))

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
        # Cleanup
        if worker_service:
            logger.info("Stopping Temporal worker...")
            await stop_worker()
            logger.info("Temporal worker stopped")


if __name__ == "__main__":
    asyncio.run(main())
