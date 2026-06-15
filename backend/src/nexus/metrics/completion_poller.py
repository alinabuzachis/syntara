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

Agent metrics (AGENT_ROUTING_DURATION, AGENT_INVOCATION_DURATION,
AGENT_STATUS) are recorded by the Temporal worker process which has a
separate in-memory MetricsRecorder.  This poller bridges them into the
API server's store by reading persisted timing data from completed
invocations.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import structlog
from sqlalchemy.orm import selectinload
from sqlmodel import select

from nexus.agent_orchestrator.models.invocation import Invocation, InvocationStatus
from nexus.core.config.base import get_settings
from nexus.core.database.session import AsyncSessionLocal
from nexus.core.workers.periodic import PeriodicWorker
from nexus.metrics.dependencies import get_metrics_recorder
from nexus.metrics.emission import emit_completion_metrics, emitted_invocations
from nexus.metrics.types import MetricType
from nexus.workflows.models.execution import TERMINAL_EXECUTION_STATUSES, Execution

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from sqlmodel.ext.asyncio.session import AsyncSession

    from nexus.metrics.recorder import MetricsRecorder

logger = structlog.stdlib.get_logger(__name__)

TERMINAL_INVOCATION_STATUSES = frozenset(
    {
        InvocationStatus.COMPLETED,
        InvocationStatus.FAILED,
        InvocationStatus.CANCELLED,
    }
)


def _emit_invocation_agent_metrics(invocation: Invocation, recorder: MetricsRecorder) -> bool:
    """Emit agent metrics for a completed invocation.

    Reads ``routing_duration_ms`` and invocation timing from the
    persisted result metadata and records AGENT_ROUTING_DURATION,
    AGENT_INVOCATION_DURATION, and AGENT_STATUS.

    Returns True if metrics were emitted, False if skipped.
    """
    if invocation.id in emitted_invocations:
        return False
    if invocation.status not in TERMINAL_INVOCATION_STATUSES:
        return False

    inv_id = str(invocation.id)
    result = invocation.result or {}
    meta = result.get("response_metadata") if isinstance(result, dict) else None
    emitted_any = False

    # AGENT_ROUTING_DURATION from persisted orchestrator timing
    if isinstance(meta, dict):
        routing_ms = meta.get("routing_duration_ms")
        if isinstance(routing_ms, (int, float)):
            recorder.record(
                MetricType.AGENT_ROUTING_DURATION,
                float(routing_ms),
                unit="ms",
                labels={
                    "invocation_id": inv_id,
                    "target_agent": str(meta.get("routed_to_agent", "unknown")),
                },
            )
            emitted_any = True

    # AGENT_INVOCATION_DURATION from DB timestamps
    if invocation.started_at and invocation.completed_at:
        duration_ms = (invocation.completed_at - invocation.started_at).total_seconds() * 1000
        status = "success" if invocation.status == InvocationStatus.COMPLETED else invocation.status.value
        recorder.record(
            MetricType.AGENT_INVOCATION_DURATION,
            duration_ms,
            unit="ms",
            labels={"invocation_id": inv_id, "status": status},
        )
        recorder.record(
            MetricType.AGENT_STATUS,
            value=1,
            labels={"invocation_id": inv_id, "status": status},
        )
        emitted_any = True

    if emitted_any:
        emitted_invocations.add(invocation.id)

    return emitted_any


async def poll_completed_executions(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Query for recent completions and emit their metrics.

    This is the callback invoked by ``PeriodicWorker`` each cycle.
    Covers both workflow/activity metrics (from Execution) and agent
    metrics (from Invocation).
    """
    settings = get_settings()
    cutoff = datetime.now(UTC) - timedelta(seconds=settings.metrics_poller_lookback_seconds)
    recorder = get_metrics_recorder()

    # --- Workflow / activity metrics (existing) ---
    async with session_factory() as session:
        result = await session.exec(
            select(Execution)
            .where(Execution.status.in_(TERMINAL_EXECUTION_STATUSES))  # type: ignore[attr-defined]
            .where(Execution.completed_at >= cutoff)  # type: ignore[operator]
            .where(Execution.deleted_at.is_(None))  # type: ignore[union-attr]
            .options(selectinload(Execution.workflow))  # type: ignore[arg-type]
        )
        executions = result.all()

    exec_emitted = 0
    for execution in executions:
        async with session_factory() as session:
            if await emit_completion_metrics(session, execution, recorder):
                exec_emitted += 1

    # --- Agent metrics (bridged from Temporal worker) ---
    async with session_factory() as session:
        inv_result = await session.exec(
            select(Invocation)
            .where(Invocation.status.in_(TERMINAL_INVOCATION_STATUSES))  # type: ignore[attr-defined]
            .where(Invocation.completed_at >= cutoff)  # type: ignore[operator]
        )
        invocations = inv_result.all()

    inv_emitted = 0
    for invocation in invocations:
        if _emit_invocation_agent_metrics(invocation, recorder):
            inv_emitted += 1

    if exec_emitted or inv_emitted:
        logger.debug(
            "Completion poller emitted metrics",
            execution_count=exec_emitted,
            invocation_count=inv_emitted,
        )


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
