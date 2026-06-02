"""Unit tests for AuditEventWriter."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from sqlalchemy.exc import DatabaseError, IntegrityError, OperationalError
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.audit.models.audit_event import AuditEvent, EventCategory
from nexus.audit.models.audit_event_record import AuditEventRecord
from nexus.audit.models.structured_data import AuditContextData
from nexus.audit.outbox.models import AuditEventSource, AuditOutboxRecord
from nexus.audit.outbox.worker import AuditOutboxWorker, publish_outbox_events

# ------------------------------------------------------------------ #
# Helpers
# ------------------------------------------------------------------ #


def _make_event(**overrides: object) -> AuditEvent:
    """Create a minimal AuditEvent for testing."""
    defaults = {
        "event_category": EventCategory.SYSTEM_OPERATION,
        "event_action": "test_action",
        "source_component": "test",
        "event_message": "test message",
        "structured_data": AuditContextData(data_type="test"),
    }
    defaults.update(overrides)
    return AuditEvent(**defaults)


# ------------------------------------------------------------------ #
# Enqueue
# ------------------------------------------------------------------ #


class TestAuditEventWriterEnqueue:
    """Test AuditEventWriter.enqueue method."""

    @pytest.mark.asyncio
    async def test_enqueue_creates_task(self, test_session_factory: async_sessionmaker[AsyncSession]) -> None:
        """Test that enqueue creates an asyncio task and persists the event."""
        worker = AuditOutboxWorker(
            name="audit-outbox-worker",
            interval_seconds=1,
            session_factory=test_session_factory,
            audit_session_factory=test_session_factory,
            audit_callback=publish_outbox_events,
            coordinate=True,
        )
        event = _make_event()

        worker.write_to_outbox(event)
        assert len(worker._pending) == 1

        await worker.drain()
        assert len(worker._pending) == 0

        # Patch AuditSessionLocal to use test database
        with patch("nexus.audit.outbox.worker.AuditSessionLocal", test_session_factory):
            await publish_outbox_events(test_session_factory, test_session_factory)

        async with test_session_factory() as session:
            result = await session.exec(select(AuditEventRecord).where(AuditEventRecord.id == event.event_id))
            assert result.one() is not None

    @pytest.mark.asyncio
    async def test_enqueue_task_removed_on_completion(
        self, test_session_factory: async_sessionmaker[AsyncSession]
    ) -> None:
        """Test that completed tasks are removed from pending set."""
        worker = AuditOutboxWorker(
            name="audit-outbox-worker",
            interval_seconds=1,
            session_factory=test_session_factory,
            audit_session_factory=test_session_factory,
            audit_callback=publish_outbox_events,
            coordinate=True,
        )
        event = _make_event()

        worker.write_to_outbox(event)
        assert len(worker._pending) == 1

        await worker.drain()

        assert len(worker._pending) == 0

    def test_enqueue_without_event_loop_logs_warning(self) -> None:
        """Test that enqueue logs a warning when no event loop is running."""
        worker = AuditOutboxWorker(
            name="audit-outbox-worker",
            interval_seconds=1,
            session_factory=MagicMock(),
            audit_session_factory=MagicMock(),
            audit_callback=publish_outbox_events,
            coordinate=True,
        )
        event = _make_event()

        with (
            patch("asyncio.create_task", side_effect=RuntimeError("no running event loop")),
            patch("nexus.audit.outbox.worker.logger") as mock_logger,
        ):
            worker.write_to_outbox(event)

            mock_logger.warning.assert_called_once_with(
                "audit_event_write_skipped_no_loop",
                event_id=str(event.event_id),
            )

        assert len(worker._pending) == 0

    @pytest.mark.asyncio
    async def test_enqueue_multiple_events(self, test_session_factory: async_sessionmaker[AsyncSession]) -> None:
        """Test enqueueing multiple events creates separate tasks."""
        worker = AuditOutboxWorker(
            name="audit-outbox-worker",
            interval_seconds=1,
            session_factory=test_session_factory,
            audit_session_factory=test_session_factory,
            audit_callback=publish_outbox_events,
            coordinate=True,
        )

        events = [_make_event() for _ in range(3)]
        for event in events:
            worker.write_to_outbox(event)

        assert len(worker._pending) == 3

        await worker.drain()
        assert len(worker._pending) == 0

        # Patch AuditSessionLocal to use test database
        with patch("nexus.audit.outbox.worker.AuditSessionLocal", test_session_factory):
            await publish_outbox_events(test_session_factory, test_session_factory)

        async with test_session_factory() as session:
            for event in events:
                result = await session.exec(select(AuditEventRecord).where(AuditEventRecord.id == event.event_id))
                assert result.one() is not None


# ------------------------------------------------------------------ #
# Write
# ------------------------------------------------------------------ #


class TestAuditEventWriterWrite:
    """Test AuditEventWriter._write method."""

    @pytest.mark.asyncio
    async def test_write_persists_record(self, test_session_factory: async_sessionmaker[AsyncSession]) -> None:
        """Test that _write creates a record and commits it."""
        worker = AuditOutboxWorker(
            name="audit-outbox-worker",
            interval_seconds=1,
            session_factory=test_session_factory,
            audit_session_factory=test_session_factory,
            audit_callback=publish_outbox_events,
            coordinate=True,
        )
        event = _make_event()

        await worker._write(event)

        # Patch AuditSessionLocal to use test database
        with patch("nexus.audit.outbox.worker.AuditSessionLocal", test_session_factory):
            await publish_outbox_events(test_session_factory, test_session_factory)

        async with test_session_factory() as session:
            result = await session.exec(select(AuditEventRecord).where(AuditEventRecord.id == event.event_id))
            record = result.one()
            assert record.event_action == "test_action"
            assert record.source_component == "test"
            assert record.event_category == "system_operation"

    @pytest.mark.asyncio
    async def test_write_handles_database_error(self) -> None:
        """Test that _write logs exceptions instead of raising."""
        mock_session = AsyncMock()
        mock_session.add = MagicMock()
        mock_session.commit.side_effect = Exception("DB connection lost")
        mock_session_factory = MagicMock()
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=None)

        worker = AuditOutboxWorker(
            name="audit-outbox-worker",
            interval_seconds=1,
            session_factory=mock_session_factory,
            audit_session_factory=mock_session_factory,
            audit_callback=publish_outbox_events,
            coordinate=True,
        )
        event = _make_event()

        with patch("nexus.audit.outbox.worker.logger") as mock_logger:
            await worker._write(event)

            mock_logger.exception.assert_called_once_with(
                "audit_event_write_failed",
                event_id=str(event.event_id),
                actor_id=None,
                event_category="system_operation",
                event_action="test_action",
                source_component="test",
                exc_type="Exception",
            )

    @pytest.mark.asyncio
    async def test_write_converts_event_to_record(self, test_session_factory: async_sessionmaker[AsyncSession]) -> None:
        """Test that _write correctly converts AuditEvent fields to record columns."""
        worker = AuditOutboxWorker(
            name="audit-outbox-worker",
            interval_seconds=1,
            session_factory=test_session_factory,
            audit_session_factory=test_session_factory,
            audit_callback=publish_outbox_events,
            coordinate=True,
        )
        event_id = uuid4()
        event = _make_event(event_id=event_id, event_action="specific_action")

        await worker._write(event)

        # Patch AuditSessionLocal to use test database
        with patch("nexus.audit.outbox.worker.AuditSessionLocal", test_session_factory):
            await publish_outbox_events(test_session_factory, test_session_factory)

        async with test_session_factory() as session:
            result = await session.exec(select(AuditEventRecord).where(AuditEventRecord.id == event_id))
            record = result.one()
            assert record.id == event_id
            assert record.event_action == "specific_action"
            assert record.source_component == "test"


# ------------------------------------------------------------------ #
# Drain
# ------------------------------------------------------------------ #


class TestAuditEventWriterDrain:
    """Test AuditEventWriter.drain method."""

    @pytest.mark.asyncio
    async def test_drain_waits_for_pending_tasks(self, test_session_factory: async_sessionmaker[AsyncSession]) -> None:
        """Test that drain blocks until all in-flight tasks complete."""
        completed: list[object] = []

        async def slow_write(event: AuditEvent) -> None:
            await asyncio.sleep(0.05)
            completed.append(event.event_id)

        worker = AuditOutboxWorker(
            name="audit-outbox-worker",
            interval_seconds=1,
            session_factory=test_session_factory,
            audit_session_factory=test_session_factory,
            audit_callback=publish_outbox_events,
            coordinate=True,
        )

        with patch.object(worker, "_write", side_effect=slow_write):
            for _ in range(3):
                worker.write_to_outbox(_make_event())

            # Tasks are still in-flight — not yet completed
            assert len(completed) == 0
            assert len(worker._pending) == 3

            await worker.drain()

        # All completed *because* drain waited
        assert len(completed) == 3

    @pytest.mark.asyncio
    async def test_drain_with_no_pending_tasks(self, test_session_factory: async_sessionmaker[AsyncSession]) -> None:
        """Test that drain completes immediately with no pending tasks."""
        worker = AuditOutboxWorker(
            name="audit-outbox-worker",
            interval_seconds=1,
            session_factory=test_session_factory,
            audit_session_factory=test_session_factory,
            audit_callback=publish_outbox_events,
            coordinate=True,
        )
        # Should not raise or hang
        await worker.drain()

    @pytest.mark.asyncio
    async def test_drain_handles_task_exceptions(self, test_session_factory: async_sessionmaker[AsyncSession]) -> None:
        """Test that drain handles exceptions in pending tasks gracefully."""
        worker = AuditOutboxWorker(
            name="audit-outbox-worker",
            interval_seconds=1,
            session_factory=test_session_factory,
            audit_session_factory=test_session_factory,
            audit_callback=publish_outbox_events,
            coordinate=True,
        )

        async def failing_write(event: AuditEvent) -> None:
            msg = "write failed"
            raise RuntimeError(msg)

        with patch.object(worker, "_write", side_effect=failing_write):
            worker.write_to_outbox(_make_event())

            # Should not raise despite task failure (return_exceptions=True)
            await worker.drain()


# ------------------------------------------------------------------ #
# Retry Logic
# ------------------------------------------------------------------ #


class TestAuditEventWriterRetry:
    """Test AuditEventWriter retry logic for transient database errors."""

    @pytest.mark.asyncio
    async def test_retry_succeeds_after_transient_error(self) -> None:
        """Test that write retries and succeeds after transient OperationalError."""
        mock_session = AsyncMock()
        mock_session.add = MagicMock()

        # Fail twice with OperationalError, then succeed
        call_count = 0

        async def commit_side_effect() -> None:
            nonlocal call_count
            call_count += 1
            if call_count <= 2:
                msg = "connection lost"
                raise OperationalError(msg, None, Exception(msg))

        mock_session.commit = AsyncMock(side_effect=commit_side_effect)
        mock_session_factory = MagicMock()
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=None)

        worker = AuditOutboxWorker(
            name="audit-outbox-worker",
            interval_seconds=1,
            session_factory=mock_session_factory,
            audit_session_factory=mock_session_factory,
            audit_callback=publish_outbox_events,
            coordinate=True,
        )
        event = _make_event()

        with patch("nexus.audit.outbox.worker.logger") as mock_logger:
            await worker._write(event)

            # Should log retry warnings
            assert mock_logger.warning.call_count == 2
            # First retry call
            mock_logger.warning.assert_any_call(
                "audit_event_write_retry",
                event_id=str(event.event_id),
                actor_id=None,
                event_category="system_operation",
                event_action="test_action",
                source_component="test",
                attempt=1,
                max_retries=3,
                delay=0.1,
                exc_type="OperationalError",
            )

        # Should have made 3 commit attempts (2 failures + 1 success)
        assert call_count == 3

    @pytest.mark.asyncio
    async def test_retry_fails_after_max_attempts(self) -> None:
        """Test that write logs failure after exhausting all retries."""
        mock_session = AsyncMock()
        mock_session.add = MagicMock()
        mock_session.commit.side_effect = DatabaseError("database unavailable", None, Exception("db error"))
        mock_session_factory = MagicMock()
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=None)

        worker = AuditOutboxWorker(
            name="audit-outbox-worker",
            interval_seconds=1,
            session_factory=mock_session_factory,
            audit_session_factory=mock_session_factory,
            audit_callback=publish_outbox_events,
            coordinate=True,
        )
        event = _make_event()

        with patch("nexus.audit.outbox.worker.logger") as mock_logger:
            await worker._write(event)

            # Should log 3 retry warnings (attempts 1, 2, 3)
            assert mock_logger.warning.call_count == 3

            # Should log final failure
            mock_logger.exception.assert_called_once_with(
                "audit_event_write_failed_all_retries",
                event_id=str(event.event_id),
                actor_id=None,
                event_category="system_operation",
                event_action="test_action",
                source_component="test",
                attempts=4,  # max_retries + 1
                exc_type="DatabaseError",
            )

    @pytest.mark.asyncio
    async def test_non_retryable_error_fails_immediately(self) -> None:
        """Test that non-retryable errors (IntegrityError) don't retry."""
        mock_session = AsyncMock()
        mock_session.add = MagicMock()
        mock_session.commit.side_effect = IntegrityError("constraint violation", None, Exception("constraint"))
        mock_session_factory = MagicMock()
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=None)

        worker = AuditOutboxWorker(
            name="audit-outbox-worker",
            interval_seconds=1,
            session_factory=mock_session_factory,
            audit_session_factory=mock_session_factory,
            audit_callback=publish_outbox_events,
            coordinate=True,
        )
        event = _make_event()

        with patch("nexus.audit.outbox.worker.logger") as mock_logger:
            await worker._write(event)

            # Should not log retry warnings (no retries)
            assert mock_logger.warning.call_count == 0

            # Should log immediate failure
            mock_logger.exception.assert_called_once_with(
                "audit_event_write_failed",
                event_id=str(event.event_id),
                actor_id=None,
                event_category="system_operation",
                event_action="test_action",
                source_component="test",
                exc_type="IntegrityError",
            )

        # Should have only attempted once
        assert mock_session.commit.call_count == 1


# ------------------------------------------------------------------ #
# Semaphore
# ------------------------------------------------------------------ #


class TestAuditEventWriterSemaphore:
    """Test AuditEventWriter semaphore for limiting concurrent writes."""

    @pytest.mark.asyncio
    async def test_semaphore_limits_concurrent_writes(
        self, test_session_factory: async_sessionmaker[AsyncSession], override_settings
    ) -> None:
        """Test that semaphore limits concurrent database operations."""
        with override_settings(audit_writer_max_concurrent_writes=2):
            worker = AuditOutboxWorker(
                name="audit-outbox-worker",
                interval_seconds=1,
                session_factory=test_session_factory,
                audit_session_factory=test_session_factory,
                audit_callback=publish_outbox_events,
                coordinate=True,
            )

            # Track concurrent execution
            concurrent_count = 0
            max_concurrent = 0
            lock = asyncio.Lock()

            original_write = worker._write

            async def tracked_write(event: AuditEvent) -> None:
                nonlocal concurrent_count, max_concurrent
                async with lock:
                    concurrent_count += 1
                    max_concurrent = max(max_concurrent, concurrent_count)

                # Simulate slow write
                await asyncio.sleep(0.05)

                await original_write(event)

                async with lock:
                    concurrent_count -= 1

            with patch.object(worker, "_write", side_effect=tracked_write):
                # Enqueue more events than semaphore limit
                for _ in range(5):
                    worker.write_to_outbox(_make_event())

                await worker.drain()

            # Max concurrent should not exceed semaphore limit
            assert max_concurrent <= 2

    @pytest.mark.asyncio
    async def test_custom_semaphore_limit(self, override_settings) -> None:
        """Test that settings control the semaphore limit."""
        with override_settings(audit_writer_max_concurrent_writes=50):
            worker = AuditOutboxWorker(
                name="audit-outbox-worker",
                interval_seconds=1,
                session_factory=MagicMock(),
                audit_session_factory=MagicMock(),
                audit_callback=publish_outbox_events,
                coordinate=True,
            )
            assert worker._semaphore._value == 50


# ------------------------------------------------------------------ #
# Malformed Record Handling
# ------------------------------------------------------------------ #


class TestMalformedRecordHandling:
    """Test handling of malformed audit outbox records."""

    @pytest.mark.asyncio
    async def test_business_event_malformed_record_dropped(
        self, test_session_factory: async_sessionmaker[AsyncSession]
    ) -> None:
        """Test that malformed business events are logged and dropped during publish."""
        # Create valid events
        valid_event_1 = _make_event(event_action="action_1")
        valid_event_2 = _make_event(event_action="action_2")

        # Create a malformed event ID to track
        malformed_event_id = uuid4()

        # Create outbox records
        valid_outbox_1 = AuditOutboxRecord(
            event_source=AuditEventSource.BUSINESS_EVENT,
            event_payload=valid_event_1.model_dump(mode="json"),
        )
        valid_outbox_2 = AuditOutboxRecord(
            event_source=AuditEventSource.BUSINESS_EVENT,
            event_payload=valid_event_2.model_dump(mode="json"),
        )

        # Create malformed record (missing required fields)
        malformed_outbox = AuditOutboxRecord(
            event_source=AuditEventSource.BUSINESS_EVENT,
            event_payload={"event_id": str(malformed_event_id), "event_action": "malformed", "invalid": "data"},
        )

        # Persist to business database
        async with test_session_factory() as session:
            session.add_all([valid_outbox_1, malformed_outbox, valid_outbox_2])
            await session.commit()

        # Mock logger to capture warnings
        with patch("nexus.audit.outbox.worker.logger") as mock_logger:
            # Publish events
            with patch("nexus.audit.outbox.worker.AuditSessionLocal", test_session_factory):
                await publish_outbox_events(test_session_factory, test_session_factory)

            # Verify warning was logged for malformed record
            mock_logger.warning.assert_called_once()
            call_args = mock_logger.warning.call_args
            assert call_args[0][0] == "Dropped malformed AuditOutboxRecord record."
            assert "id" in call_args[1]

        # Verify only valid records were written to audit database
        async with test_session_factory() as session:
            # Query for all three event IDs
            result = await session.exec(
                select(AuditEventRecord).filter(
                    AuditEventRecord.id.in_([valid_event_1.event_id, valid_event_2.event_id, malformed_event_id])  # type: ignore[attr-defined]
                )
            )
            records = result.all()

            # Should have exactly 2 records (malformed one dropped)
            assert len(records) == 2

            # Verify they're the valid ones (malformed one should not be present)
            record_ids = {r.id for r in records}
            assert record_ids == {valid_event_1.event_id, valid_event_2.event_id}
            assert malformed_event_id not in record_ids

        # Verify all outbox records were deleted (including malformed)
        async with test_session_factory() as session:
            result = await session.exec(select(AuditOutboxRecord))  # type: ignore[arg-type]
            remaining = result.all()
            assert len(remaining) == 0

    @pytest.mark.asyncio
    async def test_crud_event_malformed_record_dropped(
        self, test_session_factory: async_sessionmaker[AsyncSession]
    ) -> None:
        """Test that malformed CRUD events are logged and dropped during publish."""
        # Create valid events
        valid_event_1 = _make_event(event_action="crud_action_1")
        valid_event_2 = _make_event(event_action="crud_action_2")

        # Create a malformed event ID to track
        malformed_event_id = uuid4()

        # Create outbox records
        valid_outbox_1 = AuditOutboxRecord(
            event_source=AuditEventSource.CRUD_EVENT,
            event_payload=valid_event_1.model_dump(mode="json"),
        )
        valid_outbox_2 = AuditOutboxRecord(
            event_source=AuditEventSource.CRUD_EVENT,
            event_payload=valid_event_2.model_dump(mode="json"),
        )

        # Create malformed record (missing required fields)
        malformed_outbox = AuditOutboxRecord(
            event_source=AuditEventSource.CRUD_EVENT,
            event_payload={"event_id": str(malformed_event_id), "event_category": "invalid", "missing_fields": True},
        )

        # Persist to business database
        async with test_session_factory() as session:
            session.add_all([valid_outbox_1, malformed_outbox, valid_outbox_2])
            await session.commit()

        # Mock logger and OTEL emitter to capture calls
        with (
            patch("nexus.audit.outbox.worker.logger") as mock_logger,
            patch("nexus.audit.outbox.worker._emit_otel_log_entry") as mock_emit_otel,
        ):
            # Publish events
            with patch("nexus.audit.outbox.worker.AuditSessionLocal", test_session_factory):
                await publish_outbox_events(test_session_factory, test_session_factory)

            # Verify warning was logged for malformed record
            mock_logger.warning.assert_called_once()
            call_args = mock_logger.warning.call_args
            assert call_args[0][0] == "Dropped malformed AuditOutboxRecord record."
            assert "id" in call_args[1]

            # Verify only 2 events were emitted to OTEL (malformed one dropped)
            assert mock_emit_otel.call_count == 2

            # Verify the emitted events are the valid ones (malformed one should not be present)
            emitted_event_ids = {call[0][0].event_id for call in mock_emit_otel.call_args_list}
            assert emitted_event_ids == {valid_event_1.event_id, valid_event_2.event_id}
            assert malformed_event_id not in emitted_event_ids

        # Verify all outbox records were deleted (including malformed)
        async with test_session_factory() as session:
            result = await session.exec(select(AuditOutboxRecord))
            remaining = result.all()
            assert len(remaining) == 0
