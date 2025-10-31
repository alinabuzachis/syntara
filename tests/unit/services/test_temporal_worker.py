"""Unit tests for Temporal worker service.

Tests the TemporalWorkerService class and global worker management functions.
"""

# ruff: noqa: SLF001
# SLF001: Tests need to access private members (_worker_task, _worker_service) to verify internal state

import asyncio
from collections.abc import Coroutine
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import nexus.workflows.workflow_engine.services.temporal_worker
from nexus.workflows.workflow_engine.services.temporal_worker import (
    TemporalWorkerService,
    get_worker,
    start_worker,
    stop_worker,
)


class TestTemporalWorkerServiceInit:
    """Test TemporalWorkerService initialization."""

    def test_init_with_values(self) -> None:
        """Test worker service initialization with provided values."""
        service = TemporalWorkerService(
            temporal_address="test-address", namespace="test-namespace", task_queue="test-queue"
        )

        assert service.temporal_address == "test-address"
        assert service.namespace == "test-namespace"
        assert service.task_queue == "test-queue"
        assert service.client is None
        assert service.worker is None
        assert service._worker_task is None

    def test_init_with_custom_values(self) -> None:
        """Test worker service initialization with custom values."""
        service = TemporalWorkerService(
            temporal_address="temporal.example.com:7233",
            namespace="production",
            task_queue="custom-queue",
        )

        assert service.temporal_address == "temporal.example.com:7233"
        assert service.namespace == "production"
        assert service.task_queue == "custom-queue"


class TestTemporalWorkerServiceStart:
    """Test starting the Temporal worker service."""

    @pytest.mark.asyncio
    async def test_start_success(self) -> None:
        """Test successfully starting the worker service."""
        service = TemporalWorkerService(
            temporal_address="test-address", namespace="test-namespace", task_queue="test-queue"
        )

        # Mock Temporal client and worker
        mock_client = MagicMock()
        mock_worker = MagicMock()

        # Create a simple coroutine for worker.run to avoid AsyncMock warnings
        async def mock_run() -> None:
            await asyncio.sleep(0)

        mock_worker.run = mock_run

        # Track if create_task was called
        create_task_called = False
        original_create_task = asyncio.create_task

        def mock_create_task(coro: Coroutine[Any, Any, None]) -> asyncio.Task[None]:
            nonlocal create_task_called
            create_task_called = True
            # Use the original create_task to avoid recursion
            return original_create_task(coro)

        with (
            patch(
                "nexus.workflows.workflow_engine.services.temporal_worker.Client.connect",
                new=AsyncMock(return_value=mock_client),
            ),
            patch("nexus.workflows.workflow_engine.services.temporal_worker.Worker", return_value=mock_worker),
            patch("asyncio.create_task", side_effect=mock_create_task),
        ):
            await service.start()

            # Verify client was created
            assert service.client == mock_client

            # Verify worker was created
            assert service.worker == mock_worker

            # Verify worker task was created
            assert create_task_called

    @pytest.mark.asyncio
    async def test_start_with_custom_config(self) -> None:
        """Test starting worker with custom configuration."""
        service = TemporalWorkerService(
            temporal_address="custom.temporal.io:7233",
            namespace="staging",
            task_queue="staging-queue",
        )

        mock_client = MagicMock()
        mock_worker = MagicMock()

        # Create a simple coroutine for worker.run to avoid AsyncMock warnings
        async def mock_run() -> None:
            await asyncio.sleep(0)

        mock_worker.run = mock_run

        original_create_task = asyncio.create_task

        def mock_create_task(coro: Coroutine[Any, Any, None]) -> asyncio.Task[None]:
            # Use the original create_task to avoid recursion
            return original_create_task(coro)

        with (
            patch(
                "nexus.workflows.workflow_engine.services.temporal_worker.Client.connect",
                new=AsyncMock(return_value=mock_client),
            ) as mock_connect,
            patch(
                "nexus.workflows.workflow_engine.services.temporal_worker.Worker", return_value=mock_worker
            ) as mock_worker_class,
            patch("asyncio.create_task", side_effect=mock_create_task),
        ):
            await service.start()

            # Verify client connected with correct address and namespace
            mock_connect.assert_called_once_with(
                "custom.temporal.io:7233",
                namespace="staging",
            )

            # Verify worker was created with correct task queue
            mock_worker_class.assert_called_once()
            _, kwargs = mock_worker_class.call_args
            assert kwargs["task_queue"] == "staging-queue"

    @pytest.mark.asyncio
    async def test_start_client_connection_failure(self) -> None:
        """Test handling of client connection failure."""
        service = TemporalWorkerService(
            temporal_address="test-address", namespace="test-namespace", task_queue="test-queue"
        )

        connection_error = ConnectionError("Connection failed")
        with patch(
            "nexus.workflows.workflow_engine.services.temporal_worker.Client.connect",
            new=AsyncMock(side_effect=connection_error),
        ):
            with pytest.raises(ConnectionError, match="Connection failed"):
                await service.start()

            # Ensure client and worker remain None after failure
            assert service.client is None
            assert service.worker is None

    @pytest.mark.asyncio
    async def test_start_worker_creation_failure(self) -> None:
        """Test handling of worker creation failure."""
        service = TemporalWorkerService(
            temporal_address="test-address", namespace="test-namespace", task_queue="test-queue"
        )

        mock_client = MagicMock()

        worker_error = RuntimeError("Worker creation failed")
        with (
            patch(
                "nexus.workflows.workflow_engine.services.temporal_worker.Client.connect",
                new=AsyncMock(return_value=mock_client),
            ),
            patch(
                "nexus.workflows.workflow_engine.services.temporal_worker.Worker",
                side_effect=worker_error,
            ),
            pytest.raises(RuntimeError, match="Worker creation failed"),
        ):
            await service.start()


class TestTemporalWorkerServiceStop:
    """Test stopping the Temporal worker service."""

    @pytest.mark.asyncio
    async def test_stop_with_running_worker(self) -> None:
        """Test stopping a running worker service."""
        service = TemporalWorkerService(
            temporal_address="test-address", namespace="test-namespace", task_queue="test-queue"
        )

        # Create a mock worker task that raises CancelledError
        async def mock_worker_run() -> None:
            raise asyncio.CancelledError

        mock_task = asyncio.create_task(mock_worker_run())

        service._worker_task = mock_task
        service.client = MagicMock()

        await service.stop()

    @pytest.mark.asyncio
    async def test_stop_without_running_worker(self) -> None:
        """Test stopping when no worker is running."""
        service = TemporalWorkerService(
            temporal_address="test-address", namespace="test-namespace", task_queue="test-queue"
        )

        # Should not raise any errors
        await service.stop()

        assert service._worker_task is None
        assert service.client is None

    @pytest.mark.asyncio
    async def test_stop_with_task_exception(self) -> None:
        """Test stopping when worker task has a pending exception.

        Awaiting a failed task will re-raise its exception. The stop() method
        only catches CancelledError, so other exceptions propagate.
        """
        service = TemporalWorkerService(
            temporal_address="test-address", namespace="test-namespace", task_queue="test-queue"
        )

        # Create a task that will raise an exception
        async def error_worker_run() -> None:
            msg = "Worker error"
            raise RuntimeError(msg)

        mock_task = asyncio.create_task(error_worker_run())

        # Give the task time to fail
        await asyncio.sleep(0.01)

        # Now assign the failed task
        service._worker_task = mock_task

        # Stop will re-raise the exception when awaiting the task
        with pytest.raises(RuntimeError, match="Worker error"):
            await service.stop()


class TestTemporalWorkerServiceContextManager:
    """Test async context manager protocol."""

    @pytest.mark.asyncio
    async def test_context_manager_success(self) -> None:
        """Test using worker service as async context manager."""
        service = TemporalWorkerService(
            temporal_address="test-address", namespace="test-namespace", task_queue="test-queue"
        )

        mock_client = MagicMock()
        mock_worker = MagicMock()
        mock_worker.run = AsyncMock()

        # Create a real asyncio task for the worker
        async def mock_worker_run() -> None:
            await asyncio.sleep(100)  # Long-running task

        with (
            patch(
                "nexus.workflows.workflow_engine.services.temporal_worker.Client.connect",
                new=AsyncMock(return_value=mock_client),
            ),
            patch("nexus.workflows.workflow_engine.services.temporal_worker.Worker", return_value=mock_worker),
        ):
            # Override the worker.run to return our mock task
            mock_worker.run.return_value = None

            async with service as worker:
                # Manually set a real task for testing
                service._worker_task = asyncio.create_task(mock_worker_run())

                # Verify service started
                assert worker == service
                assert service.client == mock_client
                assert service.worker == mock_worker

            # Verify service stopped after context exit
            assert service._worker_task is None

    @pytest.mark.asyncio
    async def test_context_manager_with_exception(self) -> None:
        """Test context manager properly cleans up even when exception occurs."""
        service = TemporalWorkerService(
            temporal_address="test-address", namespace="test-namespace", task_queue="test-queue"
        )

        mock_client = MagicMock()
        mock_worker = MagicMock()
        mock_worker.run = AsyncMock()

        # Create a real asyncio task for the worker
        async def mock_worker_run() -> None:
            await asyncio.sleep(100)  # Long-running task

        async def run_service_with_error() -> None:
            """Run service and raise an error for testing exception handling."""
            async with service:
                # Manually set a real task for testing
                service._worker_task = asyncio.create_task(mock_worker_run())
                msg = "Test error"
                raise ValueError(msg)

        with (
            patch(
                "nexus.workflows.workflow_engine.services.temporal_worker.Client.connect",
                new=AsyncMock(return_value=mock_client),
            ),
            patch("nexus.workflows.workflow_engine.services.temporal_worker.Worker", return_value=mock_worker),
        ):
            # Override the worker.run to return our mock task
            mock_worker.run.return_value = None

            # Test that exception is raised and cleanup still happens
            with pytest.raises(ValueError, match="Test error"):
                await run_service_with_error()

            # Verify service still stopped properly after exception
            assert service._worker_task is None
            assert service.client is None


class TestGlobalWorkerManagement:
    """Test global worker management functions."""

    @pytest.mark.asyncio
    async def test_start_worker_first_time(self) -> None:
        """Test starting the global worker for the first time."""
        # Reset global worker state
        nexus.workflows.workflow_engine.services.temporal_worker._worker_service = None

        mock_client = MagicMock()
        mock_worker = MagicMock()

        # Create a simple coroutine for worker.run to avoid AsyncMock warnings
        async def mock_run() -> None:
            await asyncio.sleep(0)

        mock_worker.run = mock_run

        original_create_task = asyncio.create_task

        def mock_create_task(coro: Coroutine[Any, Any, None]) -> asyncio.Task[None]:
            # Use the original create_task to avoid recursion
            return original_create_task(coro)

        with (
            patch(
                "nexus.workflows.workflow_engine.services.temporal_worker.Client.connect",
                new=AsyncMock(return_value=mock_client),
            ),
            patch("nexus.workflows.workflow_engine.services.temporal_worker.Worker", return_value=mock_worker),
            patch("asyncio.create_task", side_effect=mock_create_task),
        ):
            worker = await start_worker(
                temporal_address="test.temporal.io:7233",
                namespace="test",
                task_queue="test-queue",
            )

            assert worker is not None
            assert worker.temporal_address == "test.temporal.io:7233"
            assert worker.namespace == "test"
            assert worker.task_queue == "test-queue"

        # Cleanup
        nexus.workflows.workflow_engine.services.temporal_worker._worker_service = None

    @pytest.mark.asyncio
    async def test_start_worker_already_running(self) -> None:
        """Test starting worker when one is already running."""
        # Set up existing worker
        existing_worker = TemporalWorkerService(
            temporal_address="test-address", namespace="test-namespace", task_queue="test-queue"
        )
        nexus.workflows.workflow_engine.services.temporal_worker._worker_service = existing_worker

        worker = await start_worker()

        # Should return the existing worker
        assert worker == existing_worker

        # Cleanup
        nexus.workflows.workflow_engine.services.temporal_worker._worker_service = None

    @pytest.mark.asyncio
    async def test_stop_worker_when_running(self) -> None:
        """Test stopping the global worker when it's running."""
        # Set up running worker
        mock_service = MagicMock()
        mock_service.stop = AsyncMock()
        nexus.workflows.workflow_engine.services.temporal_worker._worker_service = mock_service

        await stop_worker()

        # Verify stop was called
        mock_service.stop.assert_called_once()

        # Verify global reference cleared
        assert nexus.workflows.workflow_engine.services.temporal_worker._worker_service is None

    @pytest.mark.asyncio
    async def test_stop_worker_when_not_running(self) -> None:
        """Test stopping worker when none is running."""
        nexus.workflows.workflow_engine.services.temporal_worker._worker_service = None

        # Should not raise any errors
        await stop_worker()

        assert nexus.workflows.workflow_engine.services.temporal_worker._worker_service is None

    def test_get_worker_when_running(self) -> None:
        """Test getting the worker when it's running."""
        # Set up running worker
        mock_service = TemporalWorkerService(
            temporal_address="test-address", namespace="test-namespace", task_queue="test-queue"
        )
        nexus.workflows.workflow_engine.services.temporal_worker._worker_service = mock_service

        worker = get_worker()

        assert worker == mock_service

        # Cleanup
        nexus.workflows.workflow_engine.services.temporal_worker._worker_service = None

    def test_get_worker_when_not_running(self) -> None:
        """Test getting worker when none is running."""
        nexus.workflows.workflow_engine.services.temporal_worker._worker_service = None

        worker = get_worker()

        assert worker is None


class TestTemporalWorkerServiceLogging:
    """Test logging behavior of worker service."""

    @pytest.mark.asyncio
    async def test_start_logs_connection_info(self) -> None:
        """Test that start() logs connection information."""
        service = TemporalWorkerService(
            temporal_address="test.temporal.io:7233",
            namespace="test-namespace",
            task_queue="test-queue",
        )

        mock_client = MagicMock()
        mock_worker = MagicMock()

        # Create a simple coroutine for worker.run to avoid AsyncMock warnings
        async def mock_run() -> None:
            await asyncio.sleep(0)

        mock_worker.run = mock_run

        original_create_task = asyncio.create_task

        def mock_create_task(coro: Coroutine[Any, Any, None]) -> asyncio.Task[None]:
            # Use the original create_task to avoid recursion
            return original_create_task(coro)

        with (
            patch(
                "nexus.workflows.workflow_engine.services.temporal_worker.Client.connect",
                new=AsyncMock(return_value=mock_client),
            ),
            patch("nexus.workflows.workflow_engine.services.temporal_worker.Worker", return_value=mock_worker),
            patch("asyncio.create_task", side_effect=mock_create_task),
            patch("nexus.workflows.workflow_engine.services.temporal_worker.logger") as mock_logger,
        ):
            await service.start()

            # Verify logger was called with connection info
            mock_logger.info.assert_any_call(
                "Connecting to Temporal server at %s (namespace: %s)",
                "test.temporal.io:7233",
                "test-namespace",
            )

    @pytest.mark.asyncio
    async def test_stop_logs_shutdown_info(self) -> None:
        """Test that stop() logs shutdown information."""
        service = TemporalWorkerService(
            temporal_address="test-address", namespace="test-namespace", task_queue="test-queue"
        )

        # Create a real asyncio task that will be cancelled
        async def mock_worker_run() -> None:
            raise asyncio.CancelledError

        mock_task = asyncio.create_task(mock_worker_run())
        service._worker_task = mock_task

        with patch("nexus.workflows.workflow_engine.services.temporal_worker.logger") as mock_logger:
            await service.stop()

            # Verify shutdown logs were called
            mock_logger.info.assert_any_call("Stopping Temporal worker...")
            mock_logger.info.assert_any_call("Temporal worker stopped")

    @pytest.mark.asyncio
    async def test_start_failure_logs_error(self) -> None:
        """Test that start() logs errors on failure."""
        service = TemporalWorkerService(
            temporal_address="test-address", namespace="test-namespace", task_queue="test-queue"
        )

        connection_error = ConnectionError("Connection failed")
        with (
            patch(
                "nexus.workflows.workflow_engine.services.temporal_worker.Client.connect",
                new=AsyncMock(side_effect=connection_error),
            ),
            patch("nexus.workflows.workflow_engine.services.temporal_worker.logger") as mock_logger,
        ):
            with pytest.raises(ConnectionError, match="Connection failed"):
                await service.start()

            # Verify error was logged (using exception which includes traceback)
            mock_logger.exception.assert_called_once_with("Failed to start Temporal worker")
