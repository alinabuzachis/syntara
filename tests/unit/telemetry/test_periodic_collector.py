"""Unit tests for PeriodicCollector background task.

Since PeriodicCollector now wraps PeriodicWorker, these tests focus on
the integration between the two and verify that:
1. Lifecycle methods delegate correctly to the worker
2. Cleanup callback (registry.flush) is invoked on stop
3. The collect_and_send callback is wired correctly

For error resilience and coordination tests, see tests/unit/core/workers/test_periodic_worker.py.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from nexus.telemetry.periodic_collector import PeriodicCollector, _collect_and_send


def _mock_session_factory() -> MagicMock:
    """Create a mock async_sessionmaker that returns an async-context session."""
    session = AsyncMock()
    factory = MagicMock()
    factory.return_value.__aenter__ = AsyncMock(return_value=session)
    factory.return_value.__aexit__ = AsyncMock(return_value=None)
    return factory


@pytest.fixture
def mock_registry() -> MagicMock:
    """Create a mock TelemetryClientRegistry."""
    registry = MagicMock()
    registry.is_initialized.return_value = True
    registry.entitlement_id = "test-entitlement-123"
    registry.send_event = MagicMock()
    registry.flush = MagicMock()
    return registry


class TestPeriodicCollectorLifecycle:
    """Tests for start/stop lifecycle delegation to PeriodicWorker."""

    async def test_start_creates_background_task(self, mock_registry: MagicMock) -> None:
        """start() creates an asyncio task via the underlying worker."""
        collector = PeriodicCollector(
            registry=mock_registry,
            session_factory=_mock_session_factory(),
        )

        collector.start()

        # Verify the worker has a running task
        assert collector._worker._task is not None
        assert not collector._worker._task.done()

        # Cleanup
        await collector.stop()

    async def test_stop_cancels_task_and_flushes(self, mock_registry: MagicMock) -> None:
        """stop() cancels the task and calls registry.flush() via cleanup callback."""
        collector = PeriodicCollector(
            registry=mock_registry,
            session_factory=_mock_session_factory(),
        )
        collector.start()

        await collector.stop()

        # Task should be stopped
        assert collector._worker._task is None
        # Cleanup callback should have called flush
        mock_registry.flush.assert_called_once()

    async def test_stop_noop_when_not_started(self, mock_registry: MagicMock) -> None:
        """Calling stop() without start() should not raise or flush."""
        collector = PeriodicCollector(
            registry=mock_registry,
            session_factory=_mock_session_factory(),
        )

        await collector.stop()  # Should not raise

        mock_registry.flush.assert_not_called()

    async def test_idempotent_start(self, mock_registry: MagicMock) -> None:
        """Calling start() multiple times creates only one task (via worker)."""
        collector = PeriodicCollector(
            registry=mock_registry,
            session_factory=_mock_session_factory(),
        )

        collector.start()
        first_task = collector._worker._task
        collector.start()
        second_task = collector._worker._task

        assert first_task is second_task

        await collector.stop()


class TestCollectAndSendFunction:
    """Tests for the _collect_and_send module-level function."""

    async def test_collect_and_send_queries_and_sends_event(self, mock_registry: MagicMock) -> None:
        """_collect_and_send queries the database and sends an event."""
        session_factory = _mock_session_factory()

        with (
            patch(
                "nexus.telemetry.periodic_collector.query_workflow_counts",
                new_callable=AsyncMock,
            ) as mock_wf,
            patch(
                "nexus.telemetry.periodic_collector.query_execution_counts",
                new_callable=AsyncMock,
            ) as mock_exec,
            patch(
                "nexus.telemetry.periodic_collector.query_credential_counts",
            ) as mock_creds,
            patch(
                "nexus.telemetry.periodic_collector.get_enabled_feature_flags",
            ) as mock_flags,
            patch(
                "nexus.telemetry.periodic_collector.query_model_usage",
                new_callable=AsyncMock,
            ) as mock_model_usage,
            patch(
                "nexus.telemetry.periodic_collector.query_tool_counts",
                new_callable=AsyncMock,
            ) as mock_tool_counts,
        ):
            # Set up return values
            mock_wf.return_value = MagicMock(total=10, enabled=8, disabled=2)
            mock_exec.return_value = MagicMock(total=100, completed=80, failed=10, running=5, pending=5)
            mock_creds.return_value = MagicMock(total=5)
            mock_flags.return_value = ["feature_a"]
            mock_model_usage.return_value = []
            mock_tool_counts.return_value = MagicMock(success_count=0, error_count=0, timeout_count=0, distinct_tools=0)

            await _collect_and_send(session_factory, mock_registry)

            # Verify all queries were called
            mock_wf.assert_called_once()
            mock_exec.assert_called_once()
            mock_creds.assert_called_once()
            mock_flags.assert_called_once()
            mock_model_usage.assert_called_once()
            mock_tool_counts.assert_called_once()

            # Verify event was sent
            mock_registry.send_event.assert_called_once()

    async def test_collect_and_send_propagates_exceptions(self, mock_registry: MagicMock) -> None:
        """_collect_and_send propagates exceptions (error handling is in worker)."""
        session_factory = _mock_session_factory()

        with (
            patch(
                "nexus.telemetry.periodic_collector.query_workflow_counts",
                new_callable=AsyncMock,
                side_effect=RuntimeError("db error"),
            ),
            pytest.raises(RuntimeError, match="db error"),
        ):
            await _collect_and_send(session_factory, mock_registry)


class TestPeriodicCollectorIntegration:
    """Integration tests for callback wiring with PeriodicWorker."""

    async def test_worker_calls_collect_and_send(self, mock_registry: MagicMock) -> None:
        """Verify the worker callback invokes _collect_and_send correctly."""
        session_factory = _mock_session_factory()
        collector = PeriodicCollector(
            registry=mock_registry,
            session_factory=session_factory,
        )

        # Patch at module level to intercept the call
        with patch(
            "nexus.telemetry.periodic_collector._collect_and_send",
            new_callable=AsyncMock,
        ) as mock_collect:
            # Manually invoke the callback that was passed to the worker
            await collector._worker._callback(session_factory)

            mock_collect.assert_called_once_with(session_factory, mock_registry)
