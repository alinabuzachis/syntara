"""Singleton audit event writer for fire-and-forget database persistence.

The writer is initialised once at application startup via :func:`init_audit_writer`
and accessed elsewhere via :func:`get_audit_writer`.  It owns the async task
pool; the read-only :class:`AuditEventService` remains a separate, per-request
object backed by ``BaseService``.
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

import structlog

from nexus.audit.models import AuditEventRecord

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from sqlmodel.ext.asyncio.session import AsyncSession

    from nexus.audit.models import AuditEvent

logger = structlog.stdlib.get_logger(__name__)


class AuditEventWriter:
    """Fire-and-forget audit event writer.

    Each call to :meth:`enqueue` creates an ``asyncio.Task`` that persists
    the event independently.
    """

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """Initialize the writer with a session factory."""
        self._session_factory = session_factory
        self._pending: set[asyncio.Task[None]] = set()

    def enqueue(self, event: AuditEvent) -> None:
        """Schedule an immediate async write for the given event.

        Creates a fire-and-forget task on the running event loop.
        Logs a warning if no event loop is running.
        """
        try:
            task = asyncio.create_task(self._write(event))
            self._pending.add(task)
            task.add_done_callback(self._pending.discard)
        except RuntimeError:
            logger.warning(
                "audit_event_write_skipped_no_loop",
                event_id=str(event.event_id),
            )

    async def _write(self, event: AuditEvent) -> None:
        """Persist a single audit event to the database."""
        record = AuditEventRecord.from_event(event)
        try:
            async with self._session_factory() as session:
                session.add(record)
                await session.commit()
        except Exception as exc:
            logger.exception(
                "audit_event_write_failed",
                event_id=str(event.event_id),
                exc_type=type(exc).__name__,
            )

    async def drain(self) -> None:
        """Wait for all in-flight writes to complete."""
        if self._pending:
            await asyncio.gather(*self._pending, return_exceptions=True)


# ------------------------------------------------------------------ #
# Module-level singleton
# ------------------------------------------------------------------ #

_writer: AuditEventWriter | None = None


def init_audit_writer(
    session_factory: async_sessionmaker[AsyncSession],
) -> AuditEventWriter:
    """Create and register the global audit event writer.

    Called once during application startup.
    """
    global _writer  # noqa: PLW0603
    _writer = AuditEventWriter(session_factory)
    return _writer


def get_audit_writer() -> AuditEventWriter | None:
    """Return the global audit event writer, or ``None`` if not initialised."""
    return _writer
