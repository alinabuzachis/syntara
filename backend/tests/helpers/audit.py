"""Test fixtures and helpers for audit event tests."""

from typing import Any
from uuid import UUID

from sqlmodel.ext.asyncio.session import AsyncSession
from uuid_utils import uuid7 as _uuid7_native

from nexus.audit.models.audit_event_record import AuditEventRecord


def _uuid7() -> UUID:
    return UUID(str(_uuid7_native()))


class AuditEventsFactory:
    """Factory class for creating test audit event records with configurable properties."""

    def __init__(self, session: AsyncSession) -> None:
        """Initialize the AuditEventsFactory with a database session.

        Args:
            session: AsyncSession for database operations.

        """
        self.session = session

    async def create_event(self, **overrides: Any) -> AuditEventRecord:  # noqa: ANN401
        """Create and flush a single ``AuditEventRecord`` with defaults applied.

        Args:
            **overrides: Field values overriding the defaults.

        Returns:
            The persisted ``AuditEventRecord``.

        """
        defaults: dict[str, Any] = {
            "id": _uuid7(),
            "event_category": "user_action",
            "event_action": "test_action",
            "actor_type": "system",
            "source_component": "test_service",
            "event_message": "Test event",
            "structured_data": {"data_type": "context"},
        }
        defaults.update(overrides)
        record = AuditEventRecord(**defaults)
        self.session.add(record)
        await self.session.flush()
        return record

    async def create_events(
        self,
        count: int,
        *,
        event_action_prefix: str = "action",
        **overrides: Any,  # noqa: ANN401
    ) -> list[AuditEventRecord]:
        """Create ``count`` ``AuditEventRecord`` rows with a per-index ``event_action``.

        Args:
            count: Number of records to create.
            event_action_prefix: Prefix used to build the per-record ``event_action``
                value (``"{prefix}_{i}"``).
            **overrides: Field values shared across all created records.

        Returns:
            The created ``AuditEventRecord`` instances, in insertion order.

        """
        return [
            await self.create_event(
                **overrides,
                event_action=f"{event_action_prefix}_{i}",
            )
            for i in range(count)
        ]
