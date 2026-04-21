"""Unit tests for AuditEventWriter."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.audit.models.audit_event import AuditEvent, EventCategory
from nexus.audit.models.audit_event_record import AuditEventRecord
from nexus.audit.models.structured_data import BaseAuditData
from nexus.audit.services.writer import AuditEventWriter

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
        "structured_data": BaseAuditData(),
    }
    defaults.update(overrides)
    return AuditEvent(**defaults)


def _session_factory(test_db_engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """Create an async session factory from the test database engine."""
    return async_sessionmaker(test_db_engine, class_=AsyncSession, expire_on_commit=False)


# ------------------------------------------------------------------ #
# Enqueue
# ------------------------------------------------------------------ #


class TestAuditEventWriterEnqueue:
    """Test AuditEventWriter.enqueue method."""

    @pytest.mark.asyncio
    async def test_enqueue_creates_task(self, test_db_engine: AsyncEngine) -> None:
        """Test that enqueue creates an asyncio task and persists the event."""
        factory = _session_factory(test_db_engine)
        writer = AuditEventWriter(factory)
        event = _make_event()

        writer.enqueue(event)
        assert len(writer._pending) == 1

        await writer.drain()
        assert len(writer._pending) == 0

        async with factory() as session:
            result = await session.exec(select(AuditEventRecord).where(AuditEventRecord.id == event.event_id))
            assert result.one() is not None

    @pytest.mark.asyncio
    async def test_enqueue_task_removed_on_completion(self, test_db_engine: AsyncEngine) -> None:
        """Test that completed tasks are removed from pending set."""
        writer = AuditEventWriter(_session_factory(test_db_engine))
        event = _make_event()

        writer.enqueue(event)
        assert len(writer._pending) == 1

        await writer.drain()

        assert len(writer._pending) == 0

    def test_enqueue_without_event_loop_logs_warning(self) -> None:
        """Test that enqueue logs a warning when no event loop is running."""
        writer = AuditEventWriter(MagicMock())
        event = _make_event()

        with (
            patch("asyncio.create_task", side_effect=RuntimeError("no running event loop")),
            patch("nexus.audit.services.writer.logger") as mock_logger,
        ):
            writer.enqueue(event)

            mock_logger.warning.assert_called_once_with(
                "audit_event_write_skipped_no_loop",
                event_id=str(event.event_id),
            )

        assert len(writer._pending) == 0

    @pytest.mark.asyncio
    async def test_enqueue_multiple_events(self, test_db_engine: AsyncEngine) -> None:
        """Test enqueueing multiple events creates separate tasks."""
        factory = _session_factory(test_db_engine)
        writer = AuditEventWriter(factory)

        events = [_make_event() for _ in range(3)]
        for event in events:
            writer.enqueue(event)

        assert len(writer._pending) == 3

        await writer.drain()
        assert len(writer._pending) == 0

        async with factory() as session:
            for event in events:
                result = await session.exec(select(AuditEventRecord).where(AuditEventRecord.id == event.event_id))
                assert result.one() is not None


# ------------------------------------------------------------------ #
# Write
# ------------------------------------------------------------------ #


class TestAuditEventWriterWrite:
    """Test AuditEventWriter._write method."""

    @pytest.mark.asyncio
    async def test_write_persists_record(self, test_db_engine: AsyncEngine) -> None:
        """Test that _write creates a record and commits it."""
        factory = _session_factory(test_db_engine)
        writer = AuditEventWriter(factory)
        event = _make_event()

        await writer._write(event)

        async with factory() as session:
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

        writer = AuditEventWriter(mock_session_factory)
        event = _make_event()

        with patch("nexus.audit.services.writer.logger") as mock_logger:
            await writer._write(event)

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
    async def test_write_converts_event_to_record(self, test_db_engine: AsyncEngine) -> None:
        """Test that _write correctly converts AuditEvent fields to record columns."""
        factory = _session_factory(test_db_engine)
        writer = AuditEventWriter(factory)
        event_id = uuid4()
        event = _make_event(event_id=event_id, event_action="specific_action")

        await writer._write(event)

        async with factory() as session:
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
    async def test_drain_waits_for_pending_tasks(self) -> None:
        """Test that drain blocks until all in-flight tasks complete."""
        completed: list[object] = []

        async def slow_write(event: AuditEvent) -> None:
            await asyncio.sleep(0.05)
            completed.append(event.event_id)

        writer = AuditEventWriter(MagicMock())

        with patch.object(writer, "_write", side_effect=slow_write):
            for _ in range(3):
                writer.enqueue(_make_event())

            # Tasks are still in-flight — not yet completed
            assert len(completed) == 0
            assert len(writer._pending) == 3

            await writer.drain()

        # All completed *because* drain waited
        assert len(completed) == 3

    @pytest.mark.asyncio
    async def test_drain_with_no_pending_tasks(self) -> None:
        """Test that drain completes immediately with no pending tasks."""
        writer = AuditEventWriter(MagicMock())
        # Should not raise or hang
        await writer.drain()

    @pytest.mark.asyncio
    async def test_drain_handles_task_exceptions(self) -> None:
        """Test that drain handles exceptions in pending tasks gracefully."""
        writer = AuditEventWriter(MagicMock())

        async def failing_write(event: AuditEvent) -> None:
            msg = "write failed"
            raise RuntimeError(msg)

        with patch.object(writer, "_write", side_effect=failing_write):
            writer.enqueue(_make_event())

            # Should not raise despite task failure (return_exceptions=True)
            await writer.drain()
