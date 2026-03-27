"""Periodic cleanup worker for the in-memory metrics store.

Wires the existing :meth:`MetricsRecorder.cleanup` (time-based eviction of
stale records) into a :class:`PeriodicWorker` so that expired records are
pruned automatically without waiting for the ``deque`` ``maxlen`` cap.

Uses ``coordinate=False`` because each process owns its own in-memory
store and must trim it independently.
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

import structlog

from nexus.core.config.base import get_settings
from nexus.core.database.session import AsyncSessionLocal
from nexus.core.workers.periodic import PeriodicWorker
from nexus.metrics.dependencies import get_metrics_recorder

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from sqlmodel.ext.asyncio.session import AsyncSession

logger = structlog.stdlib.get_logger(__name__)


async def cleanup_stale_metrics(
    _session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Evict expired records from the process-local metrics store.

    This is the callback invoked by :class:`PeriodicWorker` each cycle.
    The ``session_factory`` parameter is required by the worker interface
    but unused here since the metrics store is purely in-memory.
    """
    recorder = get_metrics_recorder()
    removed = await asyncio.to_thread(recorder.cleanup)
    if removed:
        logger.debug("metrics_cleanup_completed", records_removed=removed)


def get_metrics_cleanup_worker() -> PeriodicWorker:
    """Return the application-wide metrics-cleanup PeriodicWorker."""
    settings = get_settings()
    return PeriodicWorker(
        name="metrics-store-cleanup",
        interval_seconds=settings.metrics_cleanup_interval_seconds,
        session_factory=AsyncSessionLocal,
        callback=cleanup_stale_metrics,
        coordinate=False,
    )
