"""Integration tests for TemporalWorkerService.

These tests verify the TemporalWorkerService works correctly with a real Temporal test server.
They focus on worker lifecycle management (start, stop, context manager) and ensure
the worker can successfully process workflows.
"""

# SLF001: Integration tests need to verify internal state (_worker_task) of the service

import asyncio
import os
import signal
from unittest.mock import patch

import pytest
import yaml
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

from nexus.workflows.worker import main
from nexus.workflows.workflow_engine.activities.manual_trigger import manual_trigger
from nexus.workflows.workflow_engine.activities.script_activity import execute_script_activity
from nexus.workflows.workflow_engine.dynamic_workflow import NexusWorkflow
from nexus.workflows.workflow_engine.services.temporal_execution_service import TemporalExecutionService
from nexus.workflows.workflow_engine.services.temporal_worker import TemporalWorkerService


class MockWorkerService(TemporalWorkerService):
    """Worker service that uses test environment instead of connecting.

    This test helper overrides the start() method to use the Temporal test
    environment instead of connecting to a real server.
    """

    def __init__(
        self,
        temporal_env: WorkflowEnvironment,
        task_queue: str = "test-queue",
    ) -> None:
        """Initialize mock worker service for testing.

        Args:
            temporal_env: Temporal test environment
            task_queue: Task queue name for this worker

        """
        super().__init__(
            temporal_address="test-env",
            namespace="default",
            task_queue=task_queue,
        )
        self._temporal_env = temporal_env

    async def start(self) -> None:
        """Override start to use test environment."""
        self.client = self._temporal_env.client

        self.worker = Worker(
            self.client,
            task_queue=self.task_queue,
            workflows=[NexusWorkflow],
            activities=[execute_script_activity, manual_trigger],
        )

        self._worker_task = asyncio.create_task(self.worker.run())


def create_simple_workflow_yaml(
    name: str,
    description: str,
    activity_id: str,
    script: str,
) -> str:
    """Create a simple workflow YAML definition.

    Args:
        name: Workflow name
        description: Workflow description
        activity_id: Activity identifier
        script: Bash script to execute

    Returns:
        YAML workflow definition string

    """
    return f"""
schema_version: "2.0.0"
name: {name}
description: {description}
triggers:
- id: trigger_manual
  type: manual_trigger
nodes:
- id: {activity_id}
  type: script
  config:
    language: bash
    code: {script}
  settings:
    timeout: 1
edges:
- from: trigger_manual
  to: {activity_id}
"""


@pytest.mark.integration
@pytest.mark.asyncio
class TestTemporalWorkerServiceIntegration:
    """Integration tests for TemporalWorkerService with real Temporal."""

    async def test_worker_start_and_stop(self, temporal_env: WorkflowEnvironment) -> None:
        """Test starting and stopping a worker service."""
        # Create worker service pointing to the test environment
        # Note: We can't connect to localhost:7233 in tests, so we use the test env's client
        worker_service = TemporalWorkerService(
            temporal_address="test-env",  # Not used, we'll use test client
            namespace="default",
            task_queue="integration-test-queue",
        )

        # Manually set the client to the test client (simulates successful connection)
        worker_service.client = temporal_env.client

        # Create worker with test environment
        worker_service.worker = Worker(
            temporal_env.client,
            task_queue="integration-test-queue",
            workflows=[NexusWorkflow],
            activities=[execute_script_activity, manual_trigger],
        )

        # Start worker in background
        worker_service._worker_task = asyncio.create_task(worker_service.worker.run())

        # Give it a moment to start
        await asyncio.sleep(0.1)

        # Verify worker is running
        assert worker_service._worker_task is not None
        assert not worker_service._worker_task.done()

        # Stop the worker
        await worker_service.stop()

        # Verify worker stopped (check task first to avoid unreachable code warning)
        task_is_none = worker_service._worker_task is None
        client_is_none = worker_service.client is None
        assert task_is_none
        assert client_is_none

    async def test_worker_context_manager(self, temporal_env: WorkflowEnvironment) -> None:
        """Test using worker service as async context manager."""
        worker_service = MockWorkerService(
            temporal_env=temporal_env,
            task_queue="context-test-queue",
        )

        # Use as context manager
        async with worker_service as service:
            # Verify worker is running
            assert service.client is not None
            assert service.worker is not None
            assert service._worker_task is not None
            assert not service._worker_task.done()

        # Verify cleanup after context exit
        assert worker_service._worker_task is None
        assert worker_service.client is None

    async def test_worker_processes_workflows(self, temporal_env: WorkflowEnvironment) -> None:
        """Test that worker actually processes workflow executions."""
        worker_service = MockWorkerService(
            temporal_env=temporal_env,
            task_queue="workflow-processing-queue",
        )

        async with worker_service:
            # Create execution service using the same client and queue
            execution_service = TemporalExecutionService(
                temporal_client=temporal_env.client,
                task_queue="workflow-processing-queue",
            )

            # Start a workflow
            workflow_yaml = create_simple_workflow_yaml(
                name="worker-integration-test",
                description="Test worker processes workflows",
                activity_id="test_activity",
                script='echo "Worker is processing workflows!"',
            )
            workflow_def = yaml.safe_load(workflow_yaml)

            result = await execution_service.start_workflow(
                workflow_def=workflow_def,
                workflow_name="worker-integration-test",
            )

            # Wait for workflow to complete
            workflow_result = await execution_service.get_workflow_result(result.temporal_workflow_id)

            # Verify workflow was processed successfully
            assert workflow_result.status == "completed"

    async def test_multiple_workers_different_queues(self, temporal_env: WorkflowEnvironment) -> None:
        """Test running multiple workers on different queues simultaneously."""
        # Create two workers on different queues
        worker1 = MockWorkerService(
            temporal_env=temporal_env,
            task_queue="queue-1",
        )

        worker2 = MockWorkerService(
            temporal_env=temporal_env,
            task_queue="queue-2",
        )

        # Start both workers
        async with worker1, worker2:
            # Both workers should be running
            assert worker1._worker_task is not None
            assert worker2._worker_task is not None

            # Create execution services for each queue
            service1 = TemporalExecutionService(temporal_client=temporal_env.client, task_queue="queue-1")
            service2 = TemporalExecutionService(temporal_client=temporal_env.client, task_queue="queue-2")

            # Start workflows on different queues
            workflow_yaml = create_simple_workflow_yaml(
                name="multi-worker-test",
                description="Test multiple workers",
                activity_id="task1",
                script='echo "Processed by worker"',
            )
            workflow_def = yaml.safe_load(workflow_yaml)

            result1 = await service1.start_workflow(
                workflow_def=workflow_def,
                workflow_name="worker1-test",
            )

            result2 = await service2.start_workflow(
                workflow_def=workflow_def,
                workflow_name="worker2-test",
            )

            # Both workflows should complete
            workflow_result1 = await service1.get_workflow_result(result1.temporal_workflow_id)
            workflow_result2 = await service2.get_workflow_result(result2.temporal_workflow_id)

            assert workflow_result1.status == "completed"
            assert workflow_result2.status == "completed"

        # Verify both workers stopped
        worker1_stopped = worker1._worker_task is None
        worker2_stopped = worker2._worker_task is None
        assert worker1_stopped
        assert worker2_stopped

    async def test_worker_graceful_shutdown_with_running_workflow(self, temporal_env: WorkflowEnvironment) -> None:
        """Test worker graceful shutdown handles running workflows properly."""
        worker_service = MockWorkerService(
            temporal_env=temporal_env,
            task_queue="shutdown-test-queue",
        )

        async with worker_service:
            # Create execution service
            execution_service = TemporalExecutionService(
                temporal_client=temporal_env.client,
                task_queue="shutdown-test-queue",
            )

            # Start a long-running workflow
            workflow_yaml = create_simple_workflow_yaml(
                name="long-running-test",
                description="Test graceful shutdown",
                activity_id="long_task",
                script='|\n          sleep 2\n          echo "Completed"',
            )
            workflow_def = yaml.safe_load(workflow_yaml)

            await execution_service.start_workflow(
                workflow_def=workflow_def,
                workflow_name="long-running-test",
            )

            # Give workflow a moment to start
            await asyncio.sleep(0.5)

            # Note: Worker shutdown cancels the worker task, but Temporal handles
            # workflow state properly. The workflow continues in Temporal's state.

        # Worker should stop gracefully
        assert worker_service._worker_task is None

        # Note: In a real scenario, another worker could pick up the workflow.
        # In tests, we're just verifying the worker shuts down cleanly.


@pytest.mark.integration
@pytest.mark.asyncio
class TestWorkerServiceConfiguration:
    """Test worker service configuration and setup."""

    async def test_worker_uses_correct_task_queue(self, temporal_env: WorkflowEnvironment) -> None:
        """Test that worker only processes tasks from its configured queue."""
        # Create worker on specific queue
        worker = MockWorkerService(
            temporal_env=temporal_env,
            task_queue="specific-queue",
        )

        async with worker:
            # Verify worker is configured for correct queue
            assert worker.task_queue == "specific-queue"
            assert worker.worker is not None

            # Try to execute workflow on the correct queue - should work
            execution_service = TemporalExecutionService(
                temporal_client=temporal_env.client,
                task_queue="specific-queue",
            )

            workflow_yaml = create_simple_workflow_yaml(
                name="queue-test",
                description="Test task queue routing",
                activity_id="task1",
                script='echo "On correct queue"',
            )
            workflow_def = yaml.safe_load(workflow_yaml)

            result = await execution_service.start_workflow(
                workflow_def=workflow_def,
                workflow_name="queue-test",
            )

            # Should complete successfully
            workflow_result = await execution_service.get_workflow_result(result.temporal_workflow_id)
            assert workflow_result.status == "completed"


@pytest.mark.integration
@pytest.mark.asyncio
class TestWorkerSignalHandling:
    """Test worker signal handling and graceful shutdown."""

    @pytest.mark.parametrize("sig", [signal.SIGTERM, signal.SIGINT])
    async def test_worker_main_graceful_shutdown_on_signal(self, sig: int) -> None:
        """Test that worker main() function shuts down gracefully on signals.

        This test verifies the signal handling fix that uses loop.add_signal_handler()
        instead of signal.signal() for proper asyncio integration.

        Args:
            sig: Signal to send (SIGTERM or SIGINT)

        """
        # Track whether shutdown completed
        shutdown_completed = False

        async def mock_start_worker() -> TemporalWorkerService:
            """Mock start_worker that returns a service without actually connecting."""
            # Don't actually start - just return the service
            return TemporalWorkerService(
                temporal_address="test:7233",
                namespace="default",
                task_queue="test-queue",
            )

        async def mock_stop_worker() -> None:
            """Mock stop_worker that marks shutdown as completed."""
            nonlocal shutdown_completed
            shutdown_completed = True

        with (
            patch("nexus.workflows.worker.start_worker", side_effect=mock_start_worker),
            patch("nexus.workflows.worker.stop_worker", side_effect=mock_stop_worker),
        ):
            # Run main() in a background task
            main_task = asyncio.create_task(main())

            # Give main() time to set up signal handlers
            await asyncio.sleep(0.1)

            # Send signal to our own process
            # This will be caught by the signal handler registered with loop.add_signal_handler()
            os.kill(os.getpid(), sig)

            # Give the event loop a chance to process the signal
            await asyncio.sleep(0.1)

            # Give the worker time to shut down gracefully
            try:
                await asyncio.wait_for(main_task, timeout=2.0)
            except TimeoutError:
                signal_name = "SIGTERM" if sig == signal.SIGTERM else "SIGINT"
                pytest.fail(f"Worker did not shut down within timeout on {signal_name}")

            # Verify shutdown completed
            assert shutdown_completed, f"Worker stop_worker() was not called on signal {sig}"
