"""Background worker that publishes audit events from the outbox.

Periodically queries the outbox table for unpublished events, reconstructs
AuditEvent objects, writes them to the audit database, then deletes the
outbox records.

Uses the shared ``PeriodicWorker`` with ``coordinate=True`` so that only
one API-server instance across a scaled deployment processes the outbox per cycle
(via PostgreSQL advisory locks).

This guarantees at-least-once delivery of audit events even if the process
crashes between business commit and audit write.
"""

from __future__ import annotations

import asyncio
from functools import lru_cache
from typing import TYPE_CHECKING, Any

import structlog
from pydantic import ValidationError
from sqlalchemy import func
from sqlalchemy.exc import DatabaseError, IntegrityError
from sqlmodel import select

from nexus.audit.models.audit_event import AuditEvent
from nexus.audit.models.audit_event_record import AuditEventRecord
from nexus.audit.otel_logging import OTEL_AUDIT_LOGGER_NAME
from nexus.audit.outbox.models import AuditEventSource, AuditOutboxRecord
from nexus.audit.sanitization import sanitizer
from nexus.audit.truncation import DEFAULT_MAX_PAYLOAD_BYTES, enforce_payload_limit
from nexus.core.config.base import get_settings
from nexus.core.database.audit_session import AuditSessionLocal
from nexus.core.database.session import AsyncSessionLocal
from nexus.core.workers.periodic import PeriodicWorker

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from sqlalchemy.ext.asyncio import async_sessionmaker
    from sqlalchemy.orm import Session
    from sqlmodel.ext.asyncio.session import AsyncSession

# Standard audit logger (exports to stdio)
logger = structlog.stdlib.get_logger(__name__)

# OTEL audit logger (exports to OTLP collector)
# Note: configure_otel_logging() must be called at app startup for this to export
audit_logger_otel = structlog.stdlib.get_logger(OTEL_AUDIT_LOGGER_NAME)


async def _handle_business_audit_records(
    records: list[AuditOutboxRecord], audit_session_factory: async_sessionmaker[AsyncSession]
) -> None:
    logger.info("Writing AuditOutboxRecords to Audit database.", record_count=len(records))

    audit_records: list[AuditEventRecord] = []
    for obr in records:
        try:
            # Reconstruct AuditEvent from JSON payload
            audit_event = AuditEvent(**obr.event_payload)
            logger.debug("Converted AuditOutboxRecord record.", event_action=audit_event.event_action)

            # Create AuditEventRecord from the event
            audit_record = AuditEventRecord.from_event(audit_event)

            # Override created_at with the outbox record's timestamp
            # to preserve the original event creation time
            audit_record.created_at = obr.created_at

            audit_records.append(audit_record)

        except ValidationError:
            logger.warning("Dropped malformed AuditOutboxRecord record.", id=obr.id)

    # Write all audit records to audit database in a single batch
    if audit_records:
        logger.info("Saving AuditOutboxRecords to Audit database.", records=len(audit_records))
        async with audit_session_factory() as audit_session:
            audit_session.add_all(audit_records)
            await audit_session.commit()


def _handle_crud_audit_records(records: list[AuditOutboxRecord]) -> None:
    logger.info("Exporting AuditOutboxRecord records to OTEL Collector.", record_count=len(records))

    for obr in records:
        try:
            # Reconstruct AuditEvent from JSON payload
            audit_event = AuditEvent(**obr.event_payload)

            # CRUD events were not sanitized by the trigger.
            # Therefore, sanitize them and enforce payload limits before emitting
            audit_event.structured_data = sanitizer.sanitize(audit_event.structured_data)
            audit_event.structured_data = enforce_payload_limit(audit_event.structured_data, DEFAULT_MAX_PAYLOAD_BYTES)

            logger.debug("Converted AuditOutboxRecord record.", event_action=audit_event.event_action)
            _emit_otel_log_entry(audit_event)
        except ValidationError:
            logger.warning("Dropped malformed AuditOutboxRecord record.", id=obr.id)


def _emit_otel_log_entry(audit_event: AuditEvent) -> None:
    # Emit as structured log entry to OTEL Collection (NOP, for now) for down
    event_dict = audit_event.model_dump(mode="json")
    audit_logger_otel.info("audit_event", **event_dict)


async def publish_outbox_events(
    session_factory: async_sessionmaker[AsyncSession] | None,
    audit_session_factory: async_sessionmaker[AsyncSession] | None,
) -> None:
    """Query outbox for unpublished events and write them to audit database.

    This is the callback invoked by ``PeriodicWorker`` each cycle.

    Uses row-level locking (FOR UPDATE SKIP LOCKED) to prevent race conditions
    across multiple workers - each worker locks the rows it processes, and other
    workers skip already-locked rows.

    Reads from main database (audit_outbox) and writes to audit database
    (audit_events) in batches for efficiency.
    """
    if session_factory is None:
        logger.warning("SessionFactory not set. Unable to publish AuditOutboxRecord to AuditOutbox database.")
        return

    if audit_session_factory is None:
        logger.warning("AuditSessionFactory not set. Unable to publish AuditOutboxRecord to AuditOutbox database.")
        return

    settings = get_settings()
    batch_size = settings.audit_outbox_batch_size

    logger.info("Running AuditOutboxRecord export loop.....")

    async with session_factory() as main_session:
        # Read batch of outbox records with row-level locking (FIFO processing)
        result = await main_session.exec(
            select(AuditOutboxRecord)
            .order_by(AuditOutboxRecord.created_at)  # type: ignore[arg-type]
            .limit(batch_size)  # Process in batches to avoid overwhelming the audit database
            .with_for_update(skip_locked=True)
        )
        outbox_records = result.all()

        if not outbox_records:
            logger.info("No AuditOutboxRecord records found.")
            return

        try:
            # Handle BUSINESS_EVENT Audit records (written to Postgres)
            business_records = [obr for obr in outbox_records if obr.event_source == AuditEventSource.BUSINESS_EVENT]
            await _handle_business_audit_records(business_records, audit_session_factory)

            # Handle CRUD_EVENT Audit records (exported to OTEL Collector)
            crud_records = [obr for obr in outbox_records if obr.event_source == AuditEventSource.CRUD_EVENT]
            _handle_crud_audit_records(crud_records)

            # Delete all successfully published records from outbox
            logger.info("Deleting AuditOutboxRecords from AuditOutbox database.", records=len(outbox_records))
            for outbox_record in outbox_records:
                await main_session.delete(outbox_record)

            await main_session.commit()
            logger.info("AuditOutboxWorker published AuditEventRecords", records=len(outbox_records))

        except Exception:
            # Don't delete from outbox - will retry next cycle
            logger.exception(
                "Failed to write AuditEvents batch to Audit database",
                batch_size=len(outbox_records),
            )


# ------------------------------------------------------------------ #
# Module-level singleton
# ------------------------------------------------------------------ #


class AuditOutboxWorker(PeriodicWorker):
    """Periodic background worker that publishes audit events from the outbox.

    Extends :class:`PeriodicWorker` to poll the audit_outbox table, publish
    events to the audit database, then delete them. Provides :meth:`write_to_outbox`
    for synchronous and asynchronous outbox writes. Uses a semaphore to limit
    concurrent writes and retries transient database errors.
    """

    async def _wrap(self, session_factory: async_sessionmaker[AsyncSession] | None) -> None:
        return await self._audit_callback(session_factory, self._audit_session_factory)

    def __init__(
        self,
        *,
        name: str,
        interval_seconds: float,
        session_factory: async_sessionmaker[AsyncSession] | None = None,
        audit_session_factory: async_sessionmaker[AsyncSession] | None = None,
        audit_callback: Callable[[Any, Any], Awaitable[None]],
        cleanup_callback: Callable[[], Awaitable[None]] | None = None,
        coordinate: bool = True,
    ) -> None:
        """Initialize the periodic worker with the given configuration."""
        super().__init__(
            name=name,
            interval_seconds=interval_seconds,
            callback=self._wrap,
            session_factory=session_factory,
            cleanup_callback=cleanup_callback,
            coordinate=coordinate,
        )

        settings = get_settings()
        self._pending: set[asyncio.Task[None]] = set()
        self._semaphore = asyncio.Semaphore(settings.audit_writer_max_concurrent_writes)
        self._max_retries = settings.audit_writer_max_retries
        self._base_delay = settings.audit_writer_base_delay_seconds
        self._audit_callback = audit_callback
        self._audit_session_factory = audit_session_factory

    def write_to_outbox(self, event: AuditEvent, session: Session | None = None) -> None:
        """Write AuditEvent to outbox.

        Args:
            event: The AuditEvent to save
            session: Optional Session for transactional outbox write.
                    If provided, the event is written to the outbox in the same
                    transaction as the caller's business logic (guaranteeing
                    at-least-once delivery).

        """
        if session is None:
            logger.debug(
                "Writing AuditOutboxRecord to AuditOutbox database in new session.", event_action=event.event_action
            )
            self._write_to_outbox_async(event)
        else:
            logger.debug(
                "Writing AuditOutboxRecord to AuditOutbox database in existing session.",
                event_action=event.event_action,
            )
            self._write_to_outbox_transactional(event, session)

    @staticmethod
    def _write_to_outbox_transactional(event: AuditEvent, session: Session) -> None:
        """Write audit event to outbox within provided transaction.

        Args:
            event: The audit event being emitted (for error context)
            session: Database session - outbox record will be added but not committed.
                    Caller is responsible for committing the transaction.

        """
        try:
            outbox_record = AuditOutboxRecord(
                event_source=AuditEventSource.BUSINESS_EVENT,
                event_payload=event.model_dump(mode="json"),
            )
            session.add(outbox_record)
        except Exception:
            logger.exception(
                "Failed to write Audit Event to Outbox",
                event_id=str(event.event_id),
                event_category=event.event_category.value,
                event_action=event.event_action,
            )

    def _write_to_outbox_async(self, event: AuditEvent) -> None:
        try:
            task = asyncio.create_task(self._tracked_write(event))
            self._pending.add(task)
        except RuntimeError:
            logger.warning(
                "audit_event_write_skipped_no_loop",
                event_id=str(event.event_id),
            )

    async def _tracked_write(self, event: AuditEvent) -> None:
        """Automatically remove pending task when write completes."""
        try:
            await self._write_with_semaphore(event)
        finally:
            _task = asyncio.current_task()
            if _task is not None:
                self._pending.discard(_task)

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
        if self._session_factory is None:
            logger.warning("SessionFactory not set. Unable to write AuditOutboxRecord to AuditOutbox database.")
            return

        logger.info("Writing AuditOutboxRecord to AuditOutbox database.")
        for attempt in range(self._max_retries + 1):
            try:
                async with self._session_factory() as session:
                    outbox_record = AuditOutboxRecord(
                        event_source=AuditEventSource.BUSINESS_EVENT,
                        event_payload=event.model_dump(mode="json"),
                    )
                    session.add(outbox_record)
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

    async def _get_pending_outbox_count(self) -> int:
        """Get count of pending outbox records.

        Returns:
            Number of pending outbox records, or 0 if database is unavailable.

        """
        if self._session_factory is None:
            return 0

        try:
            async with self._session_factory() as session:
                result = await session.exec(select(func.count()).select_from(AuditOutboxRecord))
                return result.one()
        except (DatabaseError, OSError):  # OSError covers socket/network errors like gaierror
            # Database may be unavailable during shutdown - return 0 to allow graceful termination
            logger.warning("Unable to query pending outbox count (database unavailable, likely during shutdown)")
            return 0

    async def drain(self) -> None:
        """Wait for all in-flight writes to complete.

        Attempts to drain all pending audit events from the outbox to the audit database.
        If the database becomes unavailable during shutdown, logs a warning and continues
        gracefully rather than raising an exception.

        """
        pending = list(self._pending)
        while pending:
            logger.info("Draining AuditEvent(s) to AuditOutbox database.", records=len(pending))
            await asyncio.gather(*pending, return_exceptions=True)
            pending = list(self._pending)

        await asyncio.sleep(0.5)

        # Manually trigger the outbox worker to process pending audit events
        # This moves events from audit_outbox to the audit_events table
        try:
            pending_count = await self._get_pending_outbox_count()
            while pending_count:
                logger.info("Draining AuditOutboxRecord(s) to Audit database.", records=pending_count)
                await publish_outbox_events(self._session_factory, self._audit_session_factory)
                pending_count = await self._get_pending_outbox_count()
        except (DatabaseError, OSError) as e:  # OSError covers socket/network errors like gaierror
            # Database may be unavailable during shutdown - log and continue
            logger.warning("Unable to drain outbox records to audit database", error=str(e), exc_info=True)


@lru_cache(maxsize=1)
def get_outbox_worker() -> AuditOutboxWorker:
    """Return the application-wide audit-outbox PeriodicWorker."""
    settings = get_settings()
    return AuditOutboxWorker(
        name="audit-outbox-worker",
        interval_seconds=settings.audit_outbox_poll_interval_seconds,
        session_factory=AsyncSessionLocal,
        audit_session_factory=AuditSessionLocal,
        audit_callback=publish_outbox_events,
        coordinate=True,
    )
