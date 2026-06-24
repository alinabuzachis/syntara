"""Background poller that emits Temporal task queue depth metrics.

Periodically queries the Temporal server via ``describe_task_queue`` to
obtain the approximate backlog count and records it as a
``TEMPORAL_QUEUE_DEPTH`` metric in both the in-memory MetricsStore and the
Prometheus gauge.

Uses ``PeriodicWorker`` with ``coordinate=False`` so that every API-server
instance independently polls the same Temporal task queue; Prometheus
handles aggregation at scrape time.
"""

from __future__ import annotations

from typing import Any

import structlog
from temporalio.api.enums.v1 import TaskQueueKind, TaskQueueType
from temporalio.api.taskqueue.v1 import TaskQueue
from temporalio.api.workflowservice.v1 import DescribeTaskQueueRequest
from temporalio.client import Client
from temporalio.service import RPCError

from nexus.core.config.base import get_settings
from nexus.core.tls.temporal import build_temporal_tls_config
from nexus.core.workers.periodic import PeriodicWorker
from nexus.metrics.dependencies import get_metrics_recorder
from nexus.metrics.types import ComponentLabel, MetricType

logger = structlog.stdlib.get_logger(__name__)

_POLL_INTERVAL_SECONDS = 5.0

# Module-level client so the connection is established once and reused
# across polling cycles.
_temporal_client: Client | None = None


async def _ensure_client(address: str, namespace: str) -> Client | None:
    """Return a cached Temporal client, connecting on first call."""
    global _temporal_client  # noqa: PLW0603
    if _temporal_client is not None:
        return _temporal_client
    try:
        _temporal_client = await Client.connect(address, namespace=namespace, tls=build_temporal_tls_config())
    except (RPCError, OSError, RuntimeError):
        logger.warning(
            "queue_depth_poller_connect_failed",
            temporal_address=address,
            exc_info=True,
        )
        return None
    return _temporal_client


async def _query_queue_depth(client: Client, task_queue: str, namespace: str) -> int:
    """Query Temporal for the approximate backlog count on *task_queue*.

    Tries the ``report_stats`` field first (newer Temporal servers expose
    ``approximate_backlog_count``).  Falls back to the legacy
    ``include_task_queue_status`` / ``backlog_count_hint`` path.

    Returns 0 when the queue is empty or the server does not support
    either field.
    """
    req = DescribeTaskQueueRequest(
        namespace=namespace,
        task_queue=TaskQueue(name=task_queue, kind=TaskQueueKind.TASK_QUEUE_KIND_NORMAL),
        task_queue_type=TaskQueueType.TASK_QUEUE_TYPE_WORKFLOW,
        report_stats=True,
        include_task_queue_status=True,
    )
    resp = await client.workflow_service.describe_task_queue(req)

    if resp.stats and resp.stats.approximate_backlog_count:
        return int(resp.stats.approximate_backlog_count)

    if resp.task_queue_status and resp.task_queue_status.backlog_count_hint:
        return int(resp.task_queue_status.backlog_count_hint)

    return 0


def _make_poll_callback(
    temporal_address: str,
    namespace: str,
    task_queue: str,
) -> Any:  # noqa: ANN401
    """Build the async callback consumed by ``PeriodicWorker``."""

    async def _poll(_sf: object) -> None:
        client = await _ensure_client(temporal_address, namespace)
        if client is None:
            return
        try:
            depth = await _query_queue_depth(client, task_queue, namespace)
        except RPCError:
            logger.debug("queue_depth_poller_rpc_error", exc_info=True)
            return

        recorder = get_metrics_recorder()
        recorder.record(
            MetricType.TEMPORAL_QUEUE_DEPTH,
            float(depth),
            component=ComponentLabel.TEMPORAL_WORKER,
        )

    return _poll


def get_queue_depth_poller() -> PeriodicWorker:
    """Return a ``PeriodicWorker`` that polls Temporal queue depth."""
    settings = get_settings()
    return PeriodicWorker(
        name="temporal-queue-depth-poller",
        interval_seconds=_POLL_INTERVAL_SECONDS,
        callback=_make_poll_callback(
            temporal_address=settings.temporal_address,
            namespace=settings.temporal_namespace,
            task_queue=settings.task_queue,
        ),
        coordinate=False,
    )
