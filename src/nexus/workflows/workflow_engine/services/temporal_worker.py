"""Temporal worker service for workflow execution.

This module provides the Temporal worker that executes workflows and activities.
The worker connects to the Temporal server and processes tasks from configured queues.
"""

import asyncio
import logging
import types

from temporalio.client import Client
from temporalio.worker import Worker

from nexus.core.config import get_settings
from nexus.workflows.workflow_engine.activities.agentic_activity import execute_agentic_activity
from nexus.workflows.workflow_engine.activities.api_activity import execute_api_request
from nexus.workflows.workflow_engine.activities.script_activity import execute_bash_script, execute_python_script
from nexus.workflows.workflow_engine.dynamic_workflow import DynamicWorkflow

logger = logging.getLogger(__name__)


class TemporalWorkerService:
    """Service for managing Temporal worker lifecycle."""

    def __init__(
        self,
        temporal_address: str,
        namespace: str,
        task_queue: str,
    ) -> None:
        """Initialize Temporal worker service.

        Note:
            For most use cases, use start_worker() factory function instead,
            which provides sensible defaults for temporal_address, namespace, and task_queue.

        Args:
            temporal_address: Temporal server address (host:port)
            namespace: Temporal namespace to use
            task_queue: Task queue name for this worker

        """
        self.temporal_address = temporal_address
        self.namespace = namespace
        self.task_queue = task_queue
        self.client: Client | None = None
        self.worker: Worker | None = None
        self._worker_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        """Start the Temporal worker.

        Connects to Temporal server and begins processing workflow tasks.

        Raises:
            Exception: If worker fails to start or connect to Temporal

        """
        try:
            logger.info(
                "Connecting to Temporal server at %s (namespace: %s)",
                self.temporal_address,
                self.namespace,
            )

            # Create Temporal client
            self.client = await Client.connect(
                self.temporal_address,
                namespace=self.namespace,
            )

            logger.info("Connected to Temporal. Starting worker on queue: %s", self.task_queue)

            # Create worker with workflows and activities
            self.worker = Worker(
                self.client,
                task_queue=self.task_queue,
                workflows=[DynamicWorkflow],
                activities=[
                    execute_agentic_activity,
                    execute_api_request,
                    execute_bash_script,
                    execute_python_script,
                ],
            )

            # Start worker in background task
            self._worker_task = asyncio.create_task(self.worker.run())

            logger.info("Temporal worker started successfully on queue: %s", self.task_queue)

        except Exception:
            logger.exception("Failed to start Temporal worker")
            raise

    async def stop(self) -> None:
        """Stop the Temporal worker gracefully.

        Waits for in-progress tasks to complete before shutting down.
        """
        if self._worker_task:
            logger.info("Stopping Temporal worker...")

            # Cancel the worker task
            self._worker_task.cancel()

            try:
                await self._worker_task
            except asyncio.CancelledError:
                logger.info("Worker task cancelled successfully")

            self._worker_task = None

        # Client cleanup is handled automatically by Temporal SDK
        self.client = None

        logger.info("Temporal worker stopped")

    async def __aenter__(self) -> "TemporalWorkerService":
        """Async context manager entry."""
        await self.start()
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: types.TracebackType | None,
    ) -> None:
        """Async context manager exit."""
        _ = exc_type, exc_val, exc_tb  # Unused but required for __aexit__
        await self.stop()


# Global worker instance for application lifecycle
_worker_service: TemporalWorkerService | None = None


async def start_worker(
    temporal_address: str | None = None,
    namespace: str | None = None,
    task_queue: str | None = None,
) -> TemporalWorkerService:
    """Start the global Temporal worker service.

    This function should be called during application startup.

    Args:
        temporal_address: Temporal server address (default from settings)
        namespace: Temporal namespace (default from settings)
        task_queue: Task queue name (default from settings)

    Returns:
        TemporalWorkerService instance

    Example:
        >>> await start_worker()  # Called in app startup

    """
    global _worker_service  # noqa: PLW0603

    if _worker_service is not None:
        logger.warning("Temporal worker already running")
        return _worker_service

    settings = get_settings()
    _worker_service = TemporalWorkerService(
        temporal_address=temporal_address or settings.temporal_address,
        namespace=namespace or settings.temporal_namespace,
        task_queue=task_queue or settings.task_queue,
    )

    await _worker_service.start()

    return _worker_service


async def stop_worker() -> None:
    """Stop the global Temporal worker service.

    This function should be called during application shutdown.

    Example:
        >>> await stop_worker()  # Called in app shutdown

    """
    global _worker_service  # noqa: PLW0603

    if _worker_service is None:
        logger.warning("No Temporal worker running")
        return

    await _worker_service.stop()
    _worker_service = None


def get_worker() -> TemporalWorkerService | None:
    """Get the current worker service instance.

    Returns:
        TemporalWorkerService if started, None otherwise

    """
    return _worker_service
