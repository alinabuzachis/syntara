"""Background poller that emits workflow/activity completion metrics.

Periodically queries the database for recently completed executions and
emits their metrics into the API server's MetricsRecorder and Prometheus
registry.  This removes the dependency on a user hitting the GET endpoint
for metrics to appear.

Uses the shared ``PeriodicWorker`` with ``coordinate=True`` so that only
one API-server instance across a scaled deployment emits metrics per cycle
(via PostgreSQL advisory locks).

The poller reuses the same deduplication set as the on-read path, so
executions are never double-counted regardless of which path fires first.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import structlog
from sqlalchemy.orm import selectinload
from sqlmodel import select

from nexus.core.config.base import get_settings
from nexus.core.database.session import AsyncSessionLocal
from nexus.core.workers.periodic import PeriodicWorker
from nexus.metrics.dependencies import get_metrics_recorder
from nexus.metrics.emission import emit_completion_metrics
from nexus.workflows.models.execution import TERMINAL_EXECUTION_STATUSES, Execution

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from sqlmodel.ext.asyncio.session import AsyncSession

logger = structlog.stdlib.get_logger(__name__)


async def poll_completed_executions(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Query for recent completions and emit their metrics.

    This is the callback invoked by ``PeriodicWorker`` each cycle.
    """
    settings = get_settings()
    cutoff = datetime.now(UTC) - timedelta(seconds=settings.metrics_poller_lookback_seconds)

    async with session_factory() as session:
        result = await session.exec(
            select(Execution)
            .where(Execution.status.in_(TERMINAL_EXECUTION_STATUSES))  # type: ignore[attr-defined]
            .where(Execution.completed_at >= cutoff)  # type: ignore[operator]
            .where(Execution.deleted_at.is_(None))  # type: ignore[union-attr]
            .options(selectinload(Execution.workflow))  # type: ignore[arg-type]
        )
        executions = result.all()

    if not executions:
        return

    recorder = get_metrics_recorder()
    emitted = 0

    for execution in executions:
        async with session_factory() as session:
            if await emit_completion_metrics(session, execution, recorder):
                emitted += 1

    if emitted:
        logger.debug("Completion poller emitted metrics", count=emitted)


def get_completion_poller() -> PeriodicWorker:
    """Return the application-wide completion-metrics PeriodicWorker."""
    settings = get_settings()
    return PeriodicWorker(
        name="metrics-completion-poller",
        interval_seconds=settings.metrics_poller_interval_seconds,
        session_factory=AsyncSessionLocal,
        callback=poll_completed_executions,
        coordinate=True,
    )
