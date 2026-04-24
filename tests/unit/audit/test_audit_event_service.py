"""Unit tests for AuditEventService (read operations)."""

import itertools

import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.audit.models.audit_event_record import AuditEventRecord
from nexus.audit.models.schemas import AuditEventListResponse
from nexus.audit.models.structured_data import AuditContextData
from nexus.audit.services.audit_event_service import AuditEventService
from nexus.core.models import User
from tests.helpers.audit import AuditEventsFactory

# ------------------------------------------------------------------ #
# Read operations (instance-level, DB-backed)
# ------------------------------------------------------------------ #


class TestAuditEventServiceList:
    """Test audit-event listing via BaseService.list_resources."""

    @pytest.mark.asyncio
    async def test_list_returns_events(
        self,
        test_db_session: AsyncSession,
        test_user: User,
        audit_events_factory: AuditEventsFactory,
    ) -> None:
        """Test listing returns inserted audit events."""
        await audit_events_factory.create_events(count=3)

        service = AuditEventService(test_db_session, test_user)
        response = await service.list_resources(
            model=AuditEventRecord,
            response_type=AuditEventListResponse,
        )

        assert len(response.resources) == 3

    @pytest.mark.asyncio
    async def test_list_empty_table(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test listing with no events returns empty list."""
        service = AuditEventService(test_db_session, test_user)
        response = await service.list_resources(
            model=AuditEventRecord,
            response_type=AuditEventListResponse,
        )

        assert len(response.resources) == 0

    @pytest.mark.asyncio
    async def test_list_respects_limit(
        self,
        test_db_session: AsyncSession,
        test_user: User,
        audit_events_factory: AuditEventsFactory,
    ) -> None:
        """Test that limit parameter constrains results."""
        await audit_events_factory.create_events(count=5)

        service = AuditEventService(test_db_session, test_user)
        response = await service.list_resources(
            model=AuditEventRecord,
            response_type=AuditEventListResponse,
            limit=2,
        )

        assert len(response.resources) == 2

    @pytest.mark.asyncio
    async def test_list_with_include_total(
        self,
        test_db_session: AsyncSession,
        test_user: User,
        audit_events_factory: AuditEventsFactory,
    ) -> None:
        """Test that include_total returns total count."""
        await audit_events_factory.create_events(count=4)

        service = AuditEventService(test_db_session, test_user)
        response = await service.list_resources(
            model=AuditEventRecord,
            response_type=AuditEventListResponse,
            limit=2,
            include_total=True,
        )

        assert len(response.resources) == 2
        assert response.total == 4

    @pytest.mark.asyncio
    async def test_list_cursor_pagination(
        self,
        test_db_session: AsyncSession,
        test_user: User,
        audit_events_factory: AuditEventsFactory,
    ) -> None:
        """Test cursor-based pagination returns next page."""
        await audit_events_factory.create_events(count=5)

        service = AuditEventService(test_db_session, test_user)

        # First page
        page1 = await service.list_resources(
            model=AuditEventRecord,
            response_type=AuditEventListResponse,
            limit=3,
        )
        assert len(page1.resources) == 3
        assert page1.next is not None

        # Second page
        page2 = await service.list_resources(
            model=AuditEventRecord,
            response_type=AuditEventListResponse,
            limit=3,
            cursor=page1.next,
        )
        assert len(page2.resources) == 2

        # No overlap
        page1_ids = {r.id for r in page1.resources}
        page2_ids = {r.id for r in page2.resources}
        assert page1_ids.isdisjoint(page2_ids)

    @pytest.mark.asyncio
    async def test_list_cursor_pagination_forward_and_backward(
        self,
        test_db_session: AsyncSession,
        test_user: User,
        audit_events_factory: AuditEventsFactory,
    ) -> None:
        """Test cursor pagination forward to last page, then backward to first page.

        Verifies that after paging forward and then backward to the first page,
        the next cursor is still present (allowing forward pagination again)
        while the prev cursor is None (indicating we're at the start).
        """
        # Create 7 events to get 4 pages with limit=2 (pages: 2,2,2,1)
        await audit_events_factory.create_events(count=7)

        service = AuditEventService(test_db_session, test_user)

        # Page 1: First page should have next, no prev
        page1 = await service.list_resources(
            model=AuditEventRecord,
            response_type=AuditEventListResponse,
            limit=2,
        )
        assert len(page1.resources) == 2
        assert page1.next is not None
        assert page1.prev is None

        # Page 2: Middle page should have both next and prev
        page2 = await service.list_resources(
            model=AuditEventRecord,
            response_type=AuditEventListResponse,
            limit=2,
            cursor=page1.next,
        )
        assert len(page2.resources) == 2
        assert page2.next is not None
        assert page2.prev is not None

        # Page 3: Another middle page
        page3 = await service.list_resources(
            model=AuditEventRecord,
            response_type=AuditEventListResponse,
            limit=2,
            cursor=page2.next,
        )
        assert len(page3.resources) == 2
        assert page3.next is not None
        assert page3.prev is not None

        # Page 4: Last page should have prev, no next
        page4 = await service.list_resources(
            model=AuditEventRecord,
            response_type=AuditEventListResponse,
            limit=2,
            cursor=page3.next,
        )
        assert len(page4.resources) == 1
        assert page4.next is None
        assert page4.prev is not None

        # Now paginate backward
        # Back to page 3
        back_to_page3 = await service.list_resources(
            model=AuditEventRecord,
            response_type=AuditEventListResponse,
            limit=2,
            cursor=page4.prev,
        )
        assert len(back_to_page3.resources) == 2
        assert back_to_page3.next is not None
        assert back_to_page3.prev is not None

        # Back to page 2
        back_to_page2 = await service.list_resources(
            model=AuditEventRecord,
            response_type=AuditEventListResponse,
            limit=2,
            cursor=back_to_page3.prev,
        )
        assert len(back_to_page2.resources) == 2
        assert back_to_page2.next is not None
        assert back_to_page2.prev is not None

        # Back to page 1: This is the critical assertion for the bug
        # After paging forward and backward, the first page should still have next cursor
        back_to_page1 = await service.list_resources(
            model=AuditEventRecord,
            response_type=AuditEventListResponse,
            limit=2,
            cursor=back_to_page2.prev,
        )
        assert len(back_to_page1.resources) == 2
        assert back_to_page1.prev is None, "First page should have no previous cursor"
        assert back_to_page1.next is not None, "First page should have next cursor (bug: this returns None)"

        # Verify we got the same resources as the original page 1
        back_to_page1_ids = {r.id for r in back_to_page1.resources}
        page1_ids = {r.id for r in page1.resources}
        assert back_to_page1_ids == page1_ids

    @pytest.mark.asyncio
    async def test_list_default_sort_is_created_at_desc(
        self,
        test_db_session: AsyncSession,
        test_user: User,
        audit_events_factory: AuditEventsFactory,
    ) -> None:
        """Test that default sort order is -created_at (newest first)."""
        from datetime import UTC, datetime, timedelta

        base = datetime(2025, 1, 1, tzinfo=UTC)
        for i in range(3):
            await audit_events_factory.create_event(
                event_action=f"action_{i}",
                created_at=base + timedelta(hours=i),
            )

        service = AuditEventService(test_db_session, test_user)
        response = await service.list_resources(
            model=AuditEventRecord,
            response_type=AuditEventListResponse,
        )

        # Timestamps should be in descending order (newest first)
        timestamps = [r.created_at for r in response.resources]
        assert all(a > b for a, b in itertools.pairwise(timestamps))

    @pytest.mark.asyncio
    async def test_list_response_contains_audit_event_read_objects(
        self,
        test_db_session: AsyncSession,
        test_user: User,
        audit_events_factory: AuditEventsFactory,
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
        await audit_events_factory.create_event(
            event_category="security_event",
            event_action="login",
            source_component="auth_service",
            event_message="User logged in",
            structured_data=stored_data,
        )

        service = AuditEventService(test_db_session, test_user)
        response = await service.list_resources(
            model=AuditEventRecord,
            response_type=AuditEventListResponse,
        )

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
    async def test_list_filter_by_event_category(
        self,
        test_db_session: AsyncSession,
        test_user: User,
        audit_events_factory: AuditEventsFactory,
    ) -> None:
        """Test filtering events by category."""
        await audit_events_factory.create_event(event_category="user_action")
        await audit_events_factory.create_event(event_category="system_operation")
        await audit_events_factory.create_event(event_category="user_action")

        service = AuditEventService(test_db_session, test_user)
        response = await service.list_resources(
            model=AuditEventRecord,
            response_type=AuditEventListResponse,
            query_params_items=[("event_category", "user_action")],
        )

        assert len(response.resources) == 2
        assert all(r.event_category == "user_action" for r in response.resources)

    @pytest.mark.asyncio
    async def test_list_filter_by_created_at_range(
        self,
        test_db_session: AsyncSession,
        test_user: User,
        audit_events_factory: AuditEventsFactory,
    ) -> None:
        """Test filtering events by inclusive ``created_at`` range via bracket operators."""
        from datetime import UTC, datetime, timedelta

        base = datetime(2025, 6, 1, tzinfo=UTC)
        for i in range(5):
            await audit_events_factory.create_event(
                event_action=f"action_{i}",
                created_at=base + timedelta(days=i),
            )

        service = AuditEventService(test_db_session, test_user)

        # Inclusive window spanning days 1..3 should return 3 events.
        window_from = (base + timedelta(days=1)).isoformat()
        window_to = (base + timedelta(days=3)).isoformat()
        response = await service.list_resources(
            model=AuditEventRecord,
            response_type=AuditEventListResponse,
            query_params_items=[("created_at[gte]", window_from), ("created_at[lte]", window_to)],
        )

        assert len(response.resources) == 3
        assert all(base + timedelta(days=1) <= r.created_at <= base + timedelta(days=3) for r in response.resources)
