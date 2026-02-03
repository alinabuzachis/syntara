"""Temporal worker service for workflow execution.

This module provides the Temporal worker that executes workflows and activities.
The worker connects to the Temporal server and processes tasks from configured queues.
"""

import asyncio
import types
from functools import lru_cache

import structlog
from temporalio.client import Client
from temporalio.worker import Worker

from nexus.core.config.base import get_settings
from nexus.core.database.session import AsyncSessionLocal
from nexus.workflows.services.activity_update_publisher import ActivityUpdatePublisher
from nexus.workflows.workflow_engine.activities.aap_job_template_activity import (
    execute_aap_job_template_activity,
)
from nexus.workflows.workflow_engine.activities.agentic_activity import execute_agentic_activity
from nexus.workflows.workflow_engine.activities.api_activity import execute_api_request
from nexus.workflows.workflow_engine.activities.internal import register_activity_monitoring
from nexus.workflows.workflow_engine.activities.script_activity import execute_bash_script, execute_python_script
from nexus.workflows.workflow_engine.dynamic_workflow import DynamicWorkflow
from nexus.workflows.workflow_engine.interceptors.monitoring_interceptor import MonitoringWorkflowInterceptor
from nexus.workflows.workflow_engine.services.activity_sync_registry import set_activity_sync_service
from nexus.workflows.workflow_engine.services.activity_sync_service import ActivitySyncService

logger = structlog.stdlib.get_logger(__name__)


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
        self.activity_sync_service: ActivitySyncService | None = None

    async def start(self) -> None:
        """Start the Temporal worker.

        Connects to Temporal server and begins processing workflow tasks.

        Raises:
            Exception: If worker fails to start or connect to Temporal

        """
        try:
            logger.info(
                "Connecting to Temporal server",
                temporal_address=self.temporal_address,
                namespace=self.namespace,
            )

            # Create Temporal client
            self.client = await Client.connect(
                self.temporal_address,
                namespace=self.namespace,
            )

            logger.info("Connected to Temporal. Starting worker on queue", task_queue=self.task_queue)

            # Initialize activity publisher for streaming updates
            activity_publisher = ActivityUpdatePublisher()

            # Initialize activity sync service
            self.activity_sync_service = ActivitySyncService(
                temporal_client=self.client,
                session_factory=AsyncSessionLocal,
                activity_publisher=activity_publisher,
            )
            logger.info("Activity sync service initialized")

            # Register in global registry for access by internal activities
            set_activity_sync_service(self.activity_sync_service)

            # Create worker with workflows, activities, and interceptors
            self.worker = Worker(
                self.client,
                task_queue=self.task_queue,
                workflows=[DynamicWorkflow],
                activities=[
                    # Internal activities
                    register_activity_monitoring,
                    # User-facing activities
                    execute_aap_job_template_activity,
                    execute_agentic_activity,
                    execute_api_request,
                    execute_bash_script,
                    execute_python_script,
                ],
                interceptors=[MonitoringWorkflowInterceptor()],
            )

            # Start worker in background task
            self._worker_task = asyncio.create_task(self.worker.run())

            logger.info("Temporal worker started successfully on queue", task_queue=self.task_queue)

        except Exception:
            logger.exception("Failed to start Temporal worker")
            raise

    async def stop(self) -> None:
        """Stop the Temporal worker gracefully.

        Waits for in-progress tasks to complete before shutting down.
        """
        # Shutdown activity sync service first
        if self.activity_sync_service:
            await self.activity_sync_service.shutdown()
            self.activity_sync_service = None

        # Unregister from global registry
        set_activity_sync_service(None)

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


class WorkerRegistry:
    """Registry for managing TemporalWorkerService lifecycle without global variables."""

    def __init__(self) -> None:
        """Initialize the registry."""
        self._worker: TemporalWorkerService | None = None

    def set_worker(self, worker: TemporalWorkerService | None) -> None:
        """Register the TemporalWorkerService instance.

        Args:
            worker: TemporalWorkerService instance or None

        """
        self._worker = worker

    def get_worker(self) -> TemporalWorkerService | None:
        """Get the registered TemporalWorkerService instance.

        Returns:
            TemporalWorkerService if registered, None otherwise

        """
        return self._worker


@lru_cache(maxsize=1)
def _get_worker_registry() -> WorkerRegistry:
    """Get the singleton WorkerRegistry instance.

    lru_cache provides thread-safe singleton without global mutable state.
    The registry itself manages the mutable worker reference.

    Returns:
        The shared WorkerRegistry instance

    """
    return WorkerRegistry()


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
    registry = _get_worker_registry()
    existing_worker = registry.get_worker()

    if existing_worker is not None:
        logger.warning("Temporal worker already running")
        return existing_worker

    settings = get_settings()
    worker_service = TemporalWorkerService(
        temporal_address=temporal_address or settings.temporal_address,
        namespace=namespace or settings.temporal_namespace,
        task_queue=task_queue or settings.task_queue,
    )

    await worker_service.start()
    registry.set_worker(worker_service)

    return worker_service


async def stop_worker() -> None:
    """Stop the global Temporal worker service.

    This function should be called during application shutdown.

    Example:
        >>> await stop_worker()  # Called in app shutdown

    """
    registry = _get_worker_registry()
    worker_service = registry.get_worker()

    if worker_service is None:
        logger.warning("No Temporal worker running")
        return

    await worker_service.stop()
    registry.set_worker(None)


def get_worker() -> TemporalWorkerService | None:
    """Get the current worker service instance.

    Returns:
        TemporalWorkerService if started, None otherwise

    """
    return _get_worker_registry().get_worker()
