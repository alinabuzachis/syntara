"""Unit tests for nexus.metrics.queue_depth_poller."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from nexus.metrics.queue_depth_poller import (
    _ensure_client,
    _query_queue_depth,
    get_queue_depth_poller,
)


class TestEnsureClient:
    """Tests for _ensure_client lazy connection helper."""

    @pytest.fixture(autouse=True)
    def _reset_module_client(self) -> None:
        """Reset the module-level cached client before each test."""
        import nexus.metrics.queue_depth_poller as mod

        mod._temporal_client = None

    @pytest.mark.asyncio
    async def test_connects_on_first_call(self) -> None:
        """First call should attempt to connect and return the client."""
        mock_client = MagicMock()
        with patch(
            "nexus.metrics.queue_depth_poller.Client.connect",
            new_callable=AsyncMock,
            return_value=mock_client,
        ):
            result = await _ensure_client("localhost:7233", "default")

        assert result is mock_client

    @pytest.mark.asyncio
    async def test_returns_cached_client_on_subsequent_calls(self) -> None:
        """Second call should return the cached client without reconnecting."""
        mock_client = MagicMock()
        with patch(
            "nexus.metrics.queue_depth_poller.Client.connect",
            new_callable=AsyncMock,
            return_value=mock_client,
        ) as mock_connect:
            first = await _ensure_client("localhost:7233", "default")
            second = await _ensure_client("localhost:7233", "default")

        assert first is second
        mock_connect.assert_called_once()

    @pytest.mark.asyncio
    async def test_returns_none_on_connection_failure(self) -> None:
        """Connection failures should return None without raising."""
        with patch(
            "nexus.metrics.queue_depth_poller.Client.connect",
            new_callable=AsyncMock,
            side_effect=OSError("connection refused"),
        ):
            result = await _ensure_client("bad-host:7233", "default")

        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_on_rpc_error(self) -> None:
        """RPCError during connect should return None."""
        from temporalio.service import RPCError, RPCStatusCode

        with patch(
            "nexus.metrics.queue_depth_poller.Client.connect",
            new_callable=AsyncMock,
            side_effect=RPCError("unavailable", RPCStatusCode.UNAVAILABLE, b""),
        ):
            result = await _ensure_client("bad-host:7233", "default")

        assert result is None


class TestQueryQueueDepth:
    """Tests for _query_queue_depth gRPC helper."""

    @pytest.mark.asyncio
    async def test_returns_approximate_backlog_count(self) -> None:
        """Should prefer stats.approximate_backlog_count when available."""
        mock_resp = MagicMock()
        mock_resp.stats.approximate_backlog_count = 42
        mock_resp.task_queue_status = None

        mock_client = MagicMock()
        mock_client.workflow_service.describe_task_queue = AsyncMock(return_value=mock_resp)

        depth = await _query_queue_depth(mock_client, "nexus-task-queue", "default")
        assert depth == 42

    @pytest.mark.asyncio
    async def test_falls_back_to_backlog_count_hint(self) -> None:
        """Should use backlog_count_hint when stats is empty."""
        mock_resp = MagicMock()
        mock_resp.stats = None
        mock_resp.task_queue_status.backlog_count_hint = 7

        mock_client = MagicMock()
        mock_client.workflow_service.describe_task_queue = AsyncMock(return_value=mock_resp)

        depth = await _query_queue_depth(mock_client, "nexus-task-queue", "default")
        assert depth == 7

    @pytest.mark.asyncio
    async def test_returns_zero_when_empty(self) -> None:
        """Should return 0 when both stats and status report no backlog."""
        mock_resp = MagicMock()
        mock_resp.stats = None
        mock_resp.task_queue_status = None

        mock_client = MagicMock()
        mock_client.workflow_service.describe_task_queue = AsyncMock(return_value=mock_resp)

        depth = await _query_queue_depth(mock_client, "nexus-task-queue", "default")
        assert depth == 0


class TestPollCallback:
    """Tests for the poll callback produced by _make_poll_callback."""

    @pytest.fixture(autouse=True)
    def _reset_module_client(self) -> None:
        import nexus.metrics.queue_depth_poller as mod

        mod._temporal_client = None

    @pytest.mark.asyncio
    async def test_records_metric_on_success(self) -> None:
        """Callback should record TEMPORAL_QUEUE_DEPTH on successful poll."""
        from nexus.metrics.queue_depth_poller import _make_poll_callback

        mock_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.stats.approximate_backlog_count = 5
        mock_resp.task_queue_status = None
        mock_client.workflow_service.describe_task_queue = AsyncMock(return_value=mock_resp)

        mock_recorder = MagicMock()

        with (
            patch(
                "nexus.metrics.queue_depth_poller.Client.connect",
                new_callable=AsyncMock,
                return_value=mock_client,
            ),
            patch(
                "nexus.metrics.queue_depth_poller.get_metrics_recorder",
                return_value=mock_recorder,
            ),
        ):
            callback = _make_poll_callback("localhost:7233", "default", "nexus-task-queue")
            await callback(None)

        from nexus.metrics.types import ComponentLabel, MetricType

        mock_recorder.record.assert_called_once_with(
            MetricType.TEMPORAL_QUEUE_DEPTH,
            5.0,
            component=ComponentLabel.TEMPORAL_WORKER,
        )

    @pytest.mark.asyncio
    async def test_skips_recording_when_client_unavailable(self) -> None:
        """Callback should not record when Temporal connection fails."""
        from nexus.metrics.queue_depth_poller import _make_poll_callback

        mock_recorder = MagicMock()

        with (
            patch(
                "nexus.metrics.queue_depth_poller.Client.connect",
                new_callable=AsyncMock,
                side_effect=OSError("refused"),
            ),
            patch(
                "nexus.metrics.queue_depth_poller.get_metrics_recorder",
                return_value=mock_recorder,
            ),
        ):
            callback = _make_poll_callback("bad:7233", "default", "q")
            await callback(None)

        mock_recorder.record.assert_not_called()

    @pytest.mark.asyncio
    async def test_skips_recording_on_rpc_error(self) -> None:
        """Callback should swallow RPCError and not record."""
        from temporalio.service import RPCError, RPCStatusCode

        from nexus.metrics.queue_depth_poller import _make_poll_callback

        mock_client = MagicMock()
        mock_client.workflow_service.describe_task_queue = AsyncMock(
            side_effect=RPCError("unavailable", RPCStatusCode.UNAVAILABLE, b""),
        )
        mock_recorder = MagicMock()

        with (
            patch(
                "nexus.metrics.queue_depth_poller.Client.connect",
                new_callable=AsyncMock,
                return_value=mock_client,
            ),
            patch(
                "nexus.metrics.queue_depth_poller.get_metrics_recorder",
                return_value=mock_recorder,
            ),
        ):
            callback = _make_poll_callback("localhost:7233", "default", "q")
            await callback(None)

        mock_recorder.record.assert_not_called()


class TestGetQueueDepthPoller:
    """Tests for the get_queue_depth_poller factory."""

    def test_returns_periodic_worker(self) -> None:
        """Factory should return a PeriodicWorker with coordinate=False."""
        from nexus.core.workers.periodic import PeriodicWorker

        poller = get_queue_depth_poller()

        assert isinstance(poller, PeriodicWorker)
        assert poller._coordinate is False
        assert poller._session_factory is None
        assert poller._name == "temporal-queue-depth-poller"


class TestPeriodicWorkerOptionalSessionFactory:
    """Tests for PeriodicWorker's optional session_factory."""

    def test_raises_when_coordinate_true_and_no_session_factory(self) -> None:
        """coordinate=True without session_factory must raise ValueError."""
        from nexus.core.workers.periodic import PeriodicWorker

        async def noop(_sf: object) -> None:
            pass

        with pytest.raises(ValueError, match="session_factory is required"):
            PeriodicWorker(
                name="bad",
                interval_seconds=1.0,
                callback=noop,
                coordinate=True,
            )

    def test_accepts_none_session_factory_when_uncoordinated(self) -> None:
        """coordinate=False should accept session_factory=None."""
        from nexus.core.workers.periodic import PeriodicWorker

        async def noop(_sf: object) -> None:
            pass

        worker = PeriodicWorker(
            name="ok",
            interval_seconds=1.0,
            callback=noop,
            coordinate=False,
        )
        assert worker._session_factory is None
