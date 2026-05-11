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
from sqlalchemy.exc import DatabaseError, IntegrityError

from nexus.audit.models.audit_event_record import AuditEventRecord
from nexus.core.config.base import get_settings

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from sqlmodel.ext.asyncio.session import AsyncSession

    from nexus.audit.models.audit_event import AuditEvent

logger = structlog.stdlib.get_logger(__name__)


class AuditEventWriter:
    """Fire-and-forget audit event writer.

    Each call to :meth:`enqueue` creates an ``asyncio.Task`` that persists
    the event independently. Uses a semaphore to limit concurrent writes
    and retries transient database errors.
    """

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """Initialize the writer with a session factory.

        Args:
            session_factory: SQLAlchemy async session factory.

        """
        settings = get_settings()
        self._session_factory = session_factory
        self._pending: set[asyncio.Task[None]] = set()
        self._semaphore = asyncio.Semaphore(settings.audit_writer_max_concurrent_writes)
        self._max_retries = settings.audit_writer_max_retries
        self._base_delay = settings.audit_writer_base_delay_seconds

    def enqueue(self, event: AuditEvent) -> None:
        """Schedule an immediate async write for the given event.

        Creates a fire-and-forget task on the running event loop.
        Logs a warning if no event loop is running.
        """
        try:
            task = asyncio.create_task(self._write_with_semaphore(event))
            self._pending.add(task)
            task.add_done_callback(self._pending.discard)
        except RuntimeError:
            logger.warning(
                "audit_event_write_skipped_no_loop",
                event_id=str(event.event_id),
            )

    async def _write_with_semaphore(self, event: AuditEvent) -> None:
        """Acquire semaphore before writing to limit concurrent database operations."""
        async with self._semaphore:
            await self._write(event)

    def _get_event_context(self, event: AuditEvent) -> dict[str, object]:
        """Extract common event fields for logging."""
        return {
            "event_id": str(event.event_id),
            "actor_id": str(event.actor_id) if event.actor_id else None,
            "event_category": event.event_category.value,
            "event_action": event.event_action,
            "source_component": event.source_component,
        }

    def _log_retry(self, event: AuditEvent, attempt: int, delay: float, exc: Exception) -> None:
        """Log a retry attempt with event context."""
        logger.warning(
            "audit_event_write_retry",
            **self._get_event_context(event),
            attempt=attempt,
            max_retries=self._max_retries,
            delay=delay,
            exc_type=type(exc).__name__,
        )

    def _log_retry_exhausted(self, event: AuditEvent, exc: Exception) -> None:
        """Log final failure after all retries exhausted."""
        logger.exception(
            "audit_event_write_failed_all_retries",
            **self._get_event_context(event),
            attempts=self._max_retries + 1,
            exc_type=type(exc).__name__,
        )

    def _log_non_retryable_error(self, event: AuditEvent, exc: Exception) -> None:
        """Log non-retryable error."""
        logger.exception(
            "audit_event_write_failed",
            **self._get_event_context(event),
            exc_type=type(exc).__name__,
        )

    async def _write(self, event: AuditEvent) -> None:
        """Persist a single audit event to the database with retry on transient errors."""
        record = AuditEventRecord.from_event(event)

        for attempt in range(self._max_retries + 1):
            try:
                async with self._session_factory() as session:
                    session.add(record)
                    await session.commit()
                return  # Success - exit early

            except IntegrityError as exc:
                # Non-retryable: constraint violations (shouldn't happen for audit inserts)
                self._log_non_retryable_error(event, exc)
                return  # Don't retry constraint violations

            except DatabaseError as exc:
                # Transient database errors - retry with exponential backoff
                if attempt < self._max_retries:
                    delay = self._base_delay * (2**attempt)  # 0.1s, 0.2s, 0.4s
                    self._log_retry(event, attempt + 1, delay, exc)
                    await asyncio.sleep(delay)
                else:
                    # Final failure after all retries
                    self._log_retry_exhausted(event, exc)

            except Exception as exc:  # noqa: BLE001
                # Non-retryable: programming errors (catch all to prevent audit loss)
                self._log_non_retryable_error(event, exc)
                return  # Don't retry programming errors

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
