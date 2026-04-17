"""Unit tests for AuditEventService (read operations)."""

import itertools
from uuid import uuid4

import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.audit.models import AuditContextData
from nexus.audit.models.audit_event_record import AuditEventRecord
from nexus.audit.services.audit_event_service import AuditEventService
from nexus.core.models import User

# ------------------------------------------------------------------ #
# Helpers
# ------------------------------------------------------------------ #


async def _insert_record(session: AsyncSession, **overrides: object) -> AuditEventRecord:
    """Insert an AuditEventRecord directly into the database."""
    defaults: dict[str, object] = {
        "id": uuid4(),
        "event_category": "user_action",
        "event_action": "test_action",
        "actor_type": "system",
        "source_component": "test_service",
        "event_message": "Test event",
        "structured_data": {"data_type": "base"},
    }
    defaults.update(overrides)
    record = AuditEventRecord(**defaults)
    session.add(record)
    await session.flush()
    return record


# ------------------------------------------------------------------ #
# Read operations (instance-level, DB-backed)
# ------------------------------------------------------------------ #


class TestAuditEventServiceList:
    """Test AuditEventService.list_audit_events."""

    @pytest.mark.asyncio
    async def test_list_returns_events(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test listing returns inserted audit events."""
        for i in range(3):
            await _insert_record(test_db_session, event_action=f"action_{i}")

        service = AuditEventService(test_db_session, test_user)
        response = await service.list_audit_events()

        assert len(response.resources) == 3

    @pytest.mark.asyncio
    async def test_list_empty_table(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test listing with no events returns empty list."""
        service = AuditEventService(test_db_session, test_user)
        response = await service.list_audit_events()

        assert len(response.resources) == 0

    @pytest.mark.asyncio
    async def test_list_respects_limit(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test that limit parameter constrains results."""
        for i in range(5):
            await _insert_record(test_db_session, event_action=f"action_{i}")

        service = AuditEventService(test_db_session, test_user)
        response = await service.list_audit_events(limit=2)

        assert len(response.resources) == 2

    @pytest.mark.asyncio
    async def test_list_with_include_total(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test that include_total returns total count."""
        for i in range(4):
            await _insert_record(test_db_session, event_action=f"action_{i}")

        service = AuditEventService(test_db_session, test_user)
        response = await service.list_audit_events(limit=2, include_total=True)

        assert len(response.resources) == 2
        assert response.total == 4

    @pytest.mark.asyncio
    async def test_list_cursor_pagination(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test cursor-based pagination returns next page."""
        for i in range(5):
            await _insert_record(test_db_session, event_action=f"action_{i}")

        service = AuditEventService(test_db_session, test_user)

        # First page
        page1 = await service.list_audit_events(limit=3)
        assert len(page1.resources) == 3
        assert page1.next is not None

        # Second page
        page2 = await service.list_audit_events(limit=3, cursor=page1.next)
        assert len(page2.resources) == 2

        # No overlap
        page1_ids = {r.id for r in page1.resources}
        page2_ids = {r.id for r in page2.resources}
        assert page1_ids.isdisjoint(page2_ids)

    @pytest.mark.asyncio
    async def test_list_default_sort_is_created_at_desc(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test that default sort order is -created_at (newest first)."""
        from datetime import UTC, datetime, timedelta

        base = datetime(2025, 1, 1, tzinfo=UTC)
        for i in range(3):
            await _insert_record(
                test_db_session,
                event_action=f"action_{i}",
                created_at=base + timedelta(hours=i),
            )

        service = AuditEventService(test_db_session, test_user)
        response = await service.list_audit_events()

        # Timestamps should be in descending order (newest first)
        timestamps = [r.created_at for r in response.resources]
        assert all(a > b for a, b in itertools.pairwise(timestamps))

    @pytest.mark.asyncio
    async def test_list_response_contains_audit_event_read_objects(
        self, test_db_session: AsyncSession, test_user: User
    ) -> None:
        """Test that list response contains AuditEventRead schema objects."""
        stored_data = {
            "data_type": "context",
            "username": "testuser",
            "count": 42,
            "active": True,
            "tags": ["admin", "staff"],
            "nested": {"key": "val", "deep": {"level": 3}},
            "nullable_field": None,
        }
        await _insert_record(
            test_db_session,
            event_category="security_event",
            event_action="login",
            source_component="auth_service",
            event_message="User logged in",
            structured_data=stored_data,
        )

        service = AuditEventService(test_db_session, test_user)
        response = await service.list_audit_events()

        assert len(response.resources) == 1
        resource = response.resources[0]
        assert resource.event_category == "security_event"
        assert resource.event_action == "login"
        assert resource.source_component == "auth_service"
        assert resource.event_message == "User logged in"
        assert resource.id is not None

        # Verify structured_data is discriminated to the typed variant and preserves extras
        sd = resource.structured_data
        assert isinstance(sd, AuditContextData)
        dumped = sd.model_dump()
        assert dumped["username"] == "testuser"
        assert isinstance(dumped["username"], str)
        assert isinstance(dumped["count"], int)
        assert isinstance(dumped["active"], bool)
        assert isinstance(dumped["tags"], list)
        assert dumped["tags"] == ["admin", "staff"]
        assert isinstance(dumped["nested"], dict)
        assert dumped["nested"]["deep"]["level"] == 3
        assert dumped["nullable_field"] is None

    @pytest.mark.asyncio
    async def test_list_filter_by_event_category(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test filtering events by category."""
        await _insert_record(test_db_session, event_category="user_action")
        await _insert_record(test_db_session, event_category="system_operation")
        await _insert_record(test_db_session, event_category="user_action")

        service = AuditEventService(test_db_session, test_user)
        response = await service.list_audit_events(
            query_params_items=[("event_category", "user_action")],
        )

        assert len(response.resources) == 2
        assert all(r.event_category == "user_action" for r in response.resources)
