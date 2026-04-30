"""Unit tests for AuditEventService (read operations)."""

import itertools

import pytest
from sqlmodel import func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.audit.models.audit_event_record import AuditEventRecord
from nexus.audit.models.schemas import AuditEventListResponse
from nexus.audit.models.structured_data import AuditContextData
from nexus.audit.services.audit_event_service import AuditEventService
from nexus.core.models import User
from tests.helpers.audit import AuditEventsFactory


async def _count_existing_events(session: AsyncSession) -> int:
    """Return the number of audit events already in the database (e.g. from seeding)."""
    result = await session.exec(select(func.count()).select_from(AuditEventRecord))
    return result.one()


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
        baseline = await _count_existing_events(test_db_session)
        await audit_events_factory.create_events(count=3)

        service = AuditEventService(test_db_session, test_user)
        response = await service.list_resources(
            model=AuditEventRecord,
            response_type=AuditEventListResponse,
            limit=baseline + 3,
        )

        assert len(response.resources) == baseline + 3

    @pytest.mark.asyncio
    async def test_list_empty_table(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test listing with no additional events returns only baseline."""
        baseline = await _count_existing_events(test_db_session)
        service = AuditEventService(test_db_session, test_user)
        response = await service.list_resources(
            model=AuditEventRecord,
            response_type=AuditEventListResponse,
            limit=baseline + 10,
        )

        assert len(response.resources) == baseline

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
        baseline = await _count_existing_events(test_db_session)
        await audit_events_factory.create_events(count=4)

        service = AuditEventService(test_db_session, test_user)
        response = await service.list_resources(
            model=AuditEventRecord,
            response_type=AuditEventListResponse,
            limit=2,
            include_total=True,
        )

        assert len(response.resources) == 2
        assert response.total == baseline + 4

    @pytest.mark.asyncio
    async def test_list_cursor_pagination(
        self,
        test_db_session: AsyncSession,
        test_user: User,
        audit_events_factory: AuditEventsFactory,
    ) -> None:
        """Test cursor-based pagination returns next page."""
        baseline = await _count_existing_events(test_db_session)
        await audit_events_factory.create_events(count=5)
        total = baseline + 5

        service = AuditEventService(test_db_session, test_user)

        # Collect all pages
        all_ids: set[object] = set()
        cursor = None
        while True:
            page = await service.list_resources(
                model=AuditEventRecord,
                response_type=AuditEventListResponse,
                limit=3,
                cursor=cursor,
            )
            page_ids = {r.id for r in page.resources}
            assert page_ids.isdisjoint(all_ids)  # no overlap
            all_ids.update(page_ids)
            cursor = page.next
            if cursor is None:
                break

        assert len(all_ids) == total

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
        baseline = await _count_existing_events(test_db_session)
        # Need enough events so we have multiple pages even with baseline.
        # Create 7 fresh events; total = baseline + 7.
        await audit_events_factory.create_events(count=7)
        total = baseline + 7

        service = AuditEventService(test_db_session, test_user)

        # Page forward through ALL pages, collecting page1 IDs for later comparison.
        pages: list[AuditEventListResponse] = []
        cursor = None
        while True:
            page = await service.list_resources(
                model=AuditEventRecord,
                response_type=AuditEventListResponse,
                limit=2,
                cursor=cursor,
            )
            pages.append(page)
            cursor = page.next
            if cursor is None:
                break

        # Verify total coverage
        all_ids = {r.id for p in pages for r in p.resources}
        assert len(all_ids) == total

        # Last page should have no next
        assert pages[-1].next is None
        assert pages[-1].prev is not None

        # Now paginate backward from last page to first
        cursor = pages[-1].prev
        while cursor is not None:
            back_page = await service.list_resources(
                model=AuditEventRecord,
                response_type=AuditEventListResponse,
                limit=2,
                cursor=cursor,
            )
            cursor = back_page.prev

        # We've reached the first page again
        assert back_page.prev is None, "First page should have no previous cursor"
        assert back_page.next is not None, "First page should have next cursor"

        # Verify first-page IDs match
        back_to_page1_ids = {r.id for r in back_page.resources}
        page1_ids = {r.id for r in pages[0].resources}
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

        # Find the event we just created (there may be pre-existing ones)
        matching = [r for r in response.resources if r.event_action == "login" and r.event_category == "security_event"]
        assert len(matching) == 1
        resource = matching[0]
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
        # Use unique action names so we can identify our events
        await audit_events_factory.create_event(event_category="user_action", event_action="cat_filter_1")
        await audit_events_factory.create_event(event_category="system_operation", event_action="cat_filter_2")
        await audit_events_factory.create_event(event_category="user_action", event_action="cat_filter_3")

        service = AuditEventService(test_db_session, test_user)
        response = await service.list_resources(
            model=AuditEventRecord,
            response_type=AuditEventListResponse,
            limit=200,
            query_params_items=[("event_category", "user_action")],
        )

        # At least the 2 we created; there may be pre-existing user_action events
        our_events = [r for r in response.resources if r.event_action in ("cat_filter_1", "cat_filter_3")]
        assert len(our_events) == 2
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
