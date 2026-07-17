"""Background worker that publishes audit events from the outbox.

Periodically queries the outbox table for unpublished events, reconstructs
AuditEvent objects, and emits them to the OTEL collector.

Uses the shared ``PeriodicWorker`` with ``coordinate=True`` so that only
one API-server instance across a scaled deployment processes the outbox per cycle
(via PostgreSQL advisory locks).

This guarantees at-least-once delivery of audit events even if the process
crashes between business commit and OTEL emission.
"""

from __future__ import annotations

import asyncio
import json
from functools import lru_cache
from typing import TYPE_CHECKING

import structlog
from pydantic import ValidationError
from sqlalchemy import func
from sqlalchemy.exc import DatabaseError, IntegrityError
from sqlmodel import select

from nexus.audit.logging import OTEL_AUDIT_LOGGER_NAME
from nexus.audit.models.audit_event import AuditEvent
from nexus.audit.outbox.adaptive import AdaptiveOutboxStateMachine
from nexus.audit.outbox.models import AuditEventSource, AuditOutboxRecord
from nexus.audit.outbox.session import AuditWorkerAsyncSessionLocal
from nexus.audit.sanitization import sanitizer
from nexus.audit.truncation import DEFAULT_MAX_PAYLOAD_BYTES, enforce_payload_limit
from nexus.core.config.base import get_settings
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


def _handle_business_audit_records(records: list[AuditOutboxRecord]) -> None:
    logger.info("Exporting business AuditOutboxRecord records to OTEL Collector.", record_count=len(records))

    for obr in records:
        try:
            audit_event = AuditEvent(**obr.event_payload)
            logger.debug("Converted AuditOutboxRecord record.", event_action=audit_event.event_action)
            _emit_otel_log_entry(audit_event, event_source=AuditEventSource.BUSINESS_EVENT)
        except ValidationError:
            logger.warning("Dropped malformed AuditOutboxRecord record.", id=obr.id)


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
            _emit_otel_log_entry(audit_event, event_source=AuditEventSource.CRUD_EVENT)
        except ValidationError:
            logger.warning("Dropped malformed AuditOutboxRecord record.", id=obr.id)


def _emit_otel_log_entry(audit_event: AuditEvent, event_source: AuditEventSource) -> None:
    # Emit as structured log entry to OTEL Collection.
    #
    # json.loads(model_dump_json()) instead of model_dump(mode="json") because the OTLP
    # protobuf encoder only accepts basic Python types (str, int, float, bool, bytes,
    # list, dict). SQLModel/asyncpg returns UUID columns as asyncpg.pgproto.pgproto.UUID
    # which leaks into AuditEvent fields (actor_id, workflow_id, execution_id) and
    # AuditContextData extra fields (extra="allow" stores values without type coercion).
    # model_dump(mode="json") leaves these unrecognised types intact, causing:
    #   Exception: Invalid type <class 'asyncpg.pgproto.pgproto.UUID'> of value ...
    # The JSON round-trip guarantees only native JSON types reach the encoder.
    # See: https://github.com/open-telemetry/opentelemetry-python/issues/3389
    event_dict = json.loads(audit_event.model_dump_json())
    # Inject event source attribute for event type discrimination
    event_dict["audit.event_source"] = event_source.value
    audit_logger_otel.info("audit_event", **event_dict)


async def publish_outbox_events(
    session_factory: async_sessionmaker[AsyncSession] | None,
    batch_size: int | None = None,
) -> None:
    """Query outbox for unpublished events and emit them to the OTEL collector.

    This is the callback invoked by ``PeriodicWorker`` each cycle.

    Uses row-level locking (FOR UPDATE SKIP LOCKED) to prevent race conditions
    across multiple workers - each worker locks the rows it processes, and other
    workers skip already-locked rows.

    Args:
        session_factory: Session factory for database access
        batch_size: Optional adaptive batch size. If None, uses settings default.

    """
    if session_factory is None:
        logger.warning("SessionFactory not set. Unable to publish AuditOutboxRecord events.")
        return

    # Use provided batch_size or fall back to settings
    if batch_size is None:
        settings = get_settings()
        batch_size = settings.audit_outbox_batch_size

    logger.debug("Running AuditOutboxRecord export loop", batch_size=batch_size)

    async with session_factory() as main_session:
        result = await main_session.exec(
            select(AuditOutboxRecord)
            .order_by(AuditOutboxRecord.created_at)  # type: ignore[arg-type]
            .limit(batch_size)
            .with_for_update(skip_locked=True)
        )
        outbox_records = result.all()

        if not outbox_records:
            logger.debug("No AuditOutboxRecord records found.")
            return

        try:
            business_records = [obr for obr in outbox_records if obr.event_source == AuditEventSource.BUSINESS_EVENT]
            _handle_business_audit_records(business_records)

            crud_records = [obr for obr in outbox_records if obr.event_source == AuditEventSource.CRUD_EVENT]
            _handle_crud_audit_records(crud_records)

            logger.info("Deleting AuditOutboxRecords from outbox.", records=len(outbox_records))
            for outbox_record in outbox_records:
                await main_session.delete(outbox_record)

            await main_session.commit()
            logger.info("AuditOutboxWorker published events to OTEL", records=len(outbox_records))

        except Exception:
            logger.exception(
                "Failed to publish AuditEvents batch to OTEL",
                batch_size=len(outbox_records),
            )


# ------------------------------------------------------------------ #
# Module-level singleton
# ------------------------------------------------------------------ #


class AuditOutboxWorker(PeriodicWorker):
    """Periodic background worker that publishes audit events from the outbox.

    Extends :class:`PeriodicWorker` to poll the audit_outbox table, emit
    events to the OTEL collector, then delete them. Provides :meth:`write_to_outbox`
    for synchronous and asynchronous outbox writes. Uses a semaphore to limit
    concurrent writes and retries transient database errors.
    """

    def __init__(
        self,
        *,
        name: str,
        interval_seconds: float,
        session_factory: async_sessionmaker[AsyncSession] | None = None,
        write_session_factory: async_sessionmaker[AsyncSession] | None = None,
        cleanup_callback: Callable[[], Awaitable[None]] | None = None,
        coordinate: bool = True,
    ) -> None:
        """Initialize the periodic worker with the given configuration.

        Args:
            name: Worker name
            interval_seconds: Base poll interval
            session_factory: Session factory for worker SELECT/DELETE (isolated pool)
            write_session_factory: Session factory for async INSERT writes (main pool).
                If None, falls back to session_factory for backward compatibility.
            cleanup_callback: Optional cleanup callback
            coordinate: Whether to use advisory locks for coordination

        """
        settings = get_settings()

        self._enabled = settings.audit_enabled

        # Adaptive state machine for both poll interval and batch size
        self._adaptive_sm = AdaptiveOutboxStateMachine(
            base_interval=settings.audit_outbox_poll_interval_seconds,
            base_batch_size=settings.audit_outbox_batch_size,
        )

        super().__init__(
            name=name,
            interval_seconds=interval_seconds,
            callback=self._adaptive_callback,
            session_factory=session_factory,
            cleanup_callback=cleanup_callback,
            coordinate=coordinate,
        )

        # Separate session factory for async writes (uses main pool for capacity)
        # Worker SELECT/DELETE uses session_factory (isolated 5+2 pool)
        # Async INSERT writes use write_session_factory (main 10+20 pool)
        self._write_session_factory = write_session_factory

        self._pending: set[asyncio.Task[None]] = set()
        self._semaphore = asyncio.Semaphore(settings.audit_writer_max_concurrent_writes)
        self._max_retries = settings.audit_writer_max_retries
        self._base_delay = settings.audit_writer_base_delay_seconds

    async def _adaptive_callback(self, session_factory: async_sessionmaker[AsyncSession] | None) -> None:
        """Process outbox events and update adaptive parameters.

        Invoked by PeriodicWorker each cycle. Queries current backlog, calculates
        adaptive parameters (interval, batch size), processes events with the
        adaptive batch size, then updates the interval for the next cycle.

        If the backlog query fails (returns None), skips adaptive adjustment to avoid
        cooldown-then-speedup thrashing from transient DB errors.
        """
        if not self._enabled:
            logger.warning("Auditing is disabled. Skipping publishing.")
            return

        # Query current backlog to calculate adaptive parameters
        pending_count = await self._get_pending_outbox_count()

        # Skip adaptive adjustment on transient DB error (None signals unavailable)
        # Prevents cooldown→speedup thrashing: error returns None → skip update →
        # preserve previous state → next successful query resumes from current params
        if pending_count is None:
            logger.debug(
                "Adaptive: skipping adjustment (DB unavailable)",
                current_interval=self._interval_seconds,
                current_batch_size=self._adaptive_sm.current_batch_size,
            )
            return

        # Calculate next interval and batch size based on current backlog
        next_interval, batch_size = self._adaptive_sm.calculate_next_parameters(pending_count)

        # Process outbox events with adaptive batch size
        await publish_outbox_events(session_factory, batch_size)

        # Update interval for next cycle (batch size already tracked in state machine)
        self._interval_seconds = next_interval

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
        """Persist a single audit event to the database with retry on transient errors.

        Uses write_session_factory (main pool) instead of session_factory (worker pool)
        to avoid capacity mismatch with the semaphore limit.
        """
        if self._write_session_factory is None:
            logger.warning("SessionFactory not set. Unable to write AuditOutboxRecord to AuditOutbox database.")
            return

        logger.info("Writing AuditOutboxRecord to AuditOutbox database.")
        for attempt in range(self._max_retries + 1):
            try:
                async with self._write_session_factory() as session:
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

    async def _get_pending_outbox_count(self) -> int | None:
        """Get count of pending outbox records.

        Returns:
            Number of pending outbox records, or None if database is unavailable.
            None signals a transient error - caller should skip state updates to avoid
            cooldown-then-speedup thrashing.

        """
        if self._session_factory is None:
            return None

        try:
            async with self._session_factory() as session:
                result = await session.exec(select(func.count()).select_from(AuditOutboxRecord))
                return result.one()
        except (DatabaseError, OSError):  # OSError covers socket/network errors like gaierror
            # Database may be unavailable during shutdown or transient error
            logger.warning("Unable to query pending outbox count (database unavailable, likely during shutdown)")
            return None

    async def drain(self) -> None:
        """Wait for all in-flight writes to complete.

        Attempts to drain all pending audit events from the outbox to the OTEL collector.
        If the database becomes unavailable during shutdown, logs a warning and continues
        gracefully rather than raising an exception.

        """
        pending = list(self._pending)
        while pending:
            logger.info("Draining AuditEvent(s) to outbox.", records=len(pending))
            await asyncio.gather(*pending, return_exceptions=True)
            pending = list(self._pending)

        await asyncio.sleep(0.5)

        # Drain outbox records to OTEL (None = DB unavailable, exit gracefully)
        pending_count = await self._get_pending_outbox_count()
        while pending_count is not None and pending_count > 0:
            logger.info("Draining AuditOutboxRecord(s) to OTEL.", records=pending_count)
            await publish_outbox_events(self._session_factory)
            pending_count = await self._get_pending_outbox_count()

        if pending_count is None:
            logger.warning("Unable to drain outbox records (database unavailable during shutdown)")


@lru_cache(maxsize=1)
def get_outbox_worker() -> AuditOutboxWorker:
    """Return the application-wide audit-outbox PeriodicWorker.

    Uses separate session factories for isolation:
    - session_factory (audit_worker_session_factory): Worker SELECT/DELETE operations
      use dedicated 5+2 pool to isolate from main application traffic
    - write_session_factory (AsyncSessionLocal): Async INSERT writes from background
      tasks use main 10+20 pool to match semaphore capacity (100 concurrent writes)

    Implements adaptive polling and batch size that adjust dynamically based on backlog trends.
    """
    settings = get_settings()
    return AuditOutboxWorker(
        name="audit-outbox-worker",
        interval_seconds=settings.audit_outbox_poll_interval_seconds,
        session_factory=AuditWorkerAsyncSessionLocal,  # Worker SELECT/DELETE (5+2 pool)
        write_session_factory=AsyncSessionLocal,  # Async INSERT writes (10+20 pool)
        coordinate=True,
    )
