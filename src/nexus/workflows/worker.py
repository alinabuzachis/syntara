"""Standalone Temporal worker entrypoint.

This module provides the entrypoint for running the Temporal worker
as a separate process or container. The worker polls the Temporal server
for workflow and activity tasks and executes them.

Usage:
    python -m nexus.workflows.worker

Environment Variables:
    TEMPORAL_ADDRESS: Temporal server address (default: localhost:7233)
    TEMPORAL_NAMESPACE: Temporal namespace (default: default)
    TEMPORAL_TASK_QUEUE: Task queue name (default: nexus-workflows)
    LOG_LEVEL: Logging level (default: INFO)

"""

import asyncio
import logging
import os
import signal
import sys
from types import FrameType

from nexus.workflows.workflow_engine.services.temporal_worker import start_worker, stop_worker

# Configure logging
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)


async def main() -> None:
    """Run the Temporal worker."""
    worker_service = None

    # Setup graceful shutdown
    shutdown_event = asyncio.Event()

    def signal_handler(sig: int, frame: FrameType | None) -> None:  # noqa: ARG001
        """Handle shutdown signals."""
        logger.info("Received signal %s, initiating graceful shutdown...", sig)
        shutdown_event.set()

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

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
