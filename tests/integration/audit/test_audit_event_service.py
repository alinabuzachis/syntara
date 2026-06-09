"""Unit tests for AuditEventService (read operations)."""

import itertools
import logging
from typing import Any
from uuid import uuid4

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
        _uuid: str = str(uuid4())
        await audit_events_factory.create_events(count=3, event_action_prefix=_uuid)

        service = AuditEventService(test_db_session, test_user)
        response = await service.list_resources(
            model=AuditEventRecord,
            response_type=AuditEventListResponse,
            query_params_items=[("event_action[contains]", _uuid)],
        )

        assert len(response.resources) == 3

    @pytest.mark.asyncio
    async def test_list_empty_table(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test listing with no additional events returns only baseline."""
        _uuid: str = str(uuid4())
        service = AuditEventService(test_db_session, test_user)
        response = await service.list_resources(
            model=AuditEventRecord,
            response_type=AuditEventListResponse,
            query_params_items=[("event_action[contains]", _uuid)],
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
        _uuid: str = str(uuid4())
        await audit_events_factory.create_events(count=4, event_action_prefix=_uuid)

        service = AuditEventService(test_db_session, test_user)
        response = await service.list_resources(
            model=AuditEventRecord,
            response_type=AuditEventListResponse,
            query_params_items=[("event_action[contains]", _uuid)],
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
        _uuid: str = str(uuid4())
        await audit_events_factory.create_events(count=5, event_action_prefix=_uuid)

        service = AuditEventService(test_db_session, test_user)

        # Collect all pages
        all_ids: set[object] = set()
        cursor = None
        while True:
            page = await service.list_resources(
                model=AuditEventRecord,
                response_type=AuditEventListResponse,
                query_params_items=[("event_action[contains]", _uuid)],
                limit=3,
                cursor=cursor,
            )
            page_ids = {r.id for r in page.resources}
            assert page_ids.isdisjoint(all_ids)  # no overlap
            all_ids.update(page_ids)
            cursor = page.next
            if cursor is None:
                break

        assert len(all_ids) == 5

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
        # Need enough events so we have multiple pages even with baseline.
        # Create 7 fresh events; total = baseline + 7.
        _uuid: str = str(uuid4())
        await audit_events_factory.create_events(count=7, event_action_prefix=_uuid)

        service = AuditEventService(test_db_session, test_user)

        # Page forward through ALL pages, collecting page1 IDs for later comparison.
        pages: list[AuditEventListResponse] = []
        cursor = None
        while True:
            page = await service.list_resources(
                model=AuditEventRecord,
                response_type=AuditEventListResponse,
                query_params_items=[("event_action[contains]", _uuid)],
                limit=2,
                cursor=cursor,
            )
            pages.append(page)
            cursor = page.next
            if cursor is None:
                break

        # Verify total coverage
        all_ids = {r.id for p in pages for r in p.resources}
        assert len(all_ids) == 7

        # Last page should have no next
        assert pages[-1].next is None
        assert pages[-1].prev is not None

        # Now paginate backward from last page to first
        cursor = pages[-1].prev
        while cursor is not None:
            back_page = await service.list_resources(
                model=AuditEventRecord,
                response_type=AuditEventListResponse,
                query_params_items=[("event_action[contains]", _uuid)],
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
    async def test_list_clamps_limit_to_max_items_per_page(
        self,
        test_db_session: AsyncSession,
        test_user: User,
        audit_events_factory: AuditEventsFactory,
    ) -> None:
        """Internal callers passing limit > MAX_ITEMS_PER_PAGE get clamped."""
        from nexus.core.constants import FieldLimits

        overshoot = FieldLimits.MAX_ITEMS_PER_PAGE + 16
        await audit_events_factory.create_events(count=overshoot)

        service = AuditEventService(test_db_session, test_user)
        response = await service.list_resources(
            model=AuditEventRecord,
            response_type=AuditEventListResponse,
            limit=overshoot,
        )

        assert len(response.resources) <= FieldLimits.MAX_ITEMS_PER_PAGE
        assert response.next is not None

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

        _uuid: str = str(uuid4())
        base = datetime(2025, 6, 1, tzinfo=UTC)
        for i in range(5):
            await audit_events_factory.create_event(
                event_action=_uuid,
                created_at=base + timedelta(days=i),
            )

        service = AuditEventService(test_db_session, test_user)

        # Inclusive window spanning days 1..3 should return 3 events.
        window_from = (base + timedelta(days=1)).isoformat()
        window_to = (base + timedelta(days=3)).isoformat()
        response = await service.list_resources(
            model=AuditEventRecord,
            response_type=AuditEventListResponse,
            query_params_items=[
                ("event_action", _uuid),
                ("created_at[gte]", window_from),
                ("created_at[lte]", window_to),
            ],
        )

        assert len(response.resources) == 3
        assert all(base + timedelta(days=1) <= r.created_at <= base + timedelta(days=3) for r in response.resources)


# ------------------------------------------------------------------ #
# Telemetry / structured logging
# ------------------------------------------------------------------ #


class TestAuditEventServiceTelemetry:
    """Test structured debug logging emitted by BaseService.list_resources."""

    _BASE_LOGGER = "nexus.core.services.base"

    @pytest.mark.asyncio
    async def test_list_resources_logs_query_context(
        self,
        test_db_session: AsyncSession,
        test_user: User,
        audit_events_factory: AuditEventsFactory,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        """list_resources emits a list_query_start debug log with query parameters."""
        await audit_events_factory.create_events(count=2)

        service = AuditEventService(test_db_session, test_user)
        with caplog.at_level(logging.DEBUG, logger=self._BASE_LOGGER):
            await service.list_resources(
                model=AuditEventRecord,
                response_type=AuditEventListResponse,
                limit=10,
                query_params_items=[("event_category", "user_action")],
            )

        assert any("list_query_start" in r.message for r in caplog.records)

    @pytest.mark.asyncio
    async def test_list_resources_logs_result_count(
        self,
        test_db_session: AsyncSession,
        test_user: User,
        audit_events_factory: AuditEventsFactory,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        """list_resources emits a list_query_complete debug log with result_count."""
        await audit_events_factory.create_events(count=3)

        service = AuditEventService(test_db_session, test_user)
        with caplog.at_level(logging.DEBUG, logger=self._BASE_LOGGER):
            await service.list_resources(
                model=AuditEventRecord,
                response_type=AuditEventListResponse,
                limit=50,
            )

        complete_records = [r for r in caplog.records if "list_query_complete" in r.message]
        assert len(complete_records) == 1

    @pytest.mark.asyncio
    async def test_list_resources_logs_query_failed_on_error(
        self,
        test_db_session: AsyncSession,
        test_user: User,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        """list_resources emits list_query_failed and re-raises on exception."""
        from unittest.mock import patch

        service = AuditEventService(test_db_session, test_user)

        with (
            patch.object(
                service,
                "_validate_query_params",
                side_effect=RuntimeError("db gone"),
            ),
            caplog.at_level(logging.DEBUG, logger=self._BASE_LOGGER),
            pytest.raises(RuntimeError, match="db gone"),
        ):
            await service.list_resources(
                model=AuditEventRecord,
                response_type=AuditEventListResponse,
                limit=10,
            )

        failed_records = [r for r in caplog.records if "list_query_failed" in r.message]
        assert len(failed_records) == 1


# ------------------------------------------------------------------ #
# Export file path security
# ------------------------------------------------------------------ #


class TestGetExportFilePathSecurity:
    """Test path traversal and file access protection in get_export_file_path.

    UUID format validation is now enforced at the router layer (FastAPI path
    parameter type `UUID`), so the service only receives valid UUIDs.
    The `is_relative_to` guard inside the service remains as defense-in-depth.
    """

    @pytest.mark.asyncio
    async def test_valid_uuid_nonexistent_file_raises_not_found(
        self,
        test_db_session: AsyncSession,
        test_user: User,
        tmp_path: Any,  # noqa: ANN401
        override_settings: Any,  # noqa: ANN401
    ) -> None:
        """Valid UUID for non-existent file raises AuditExportNotFoundError.

        When the file is absent, get_export_file_path consults Temporal.
        A non-RUNNING status (e.g. FAILED) must produce AuditExportNotFoundError.
        """
        from unittest.mock import AsyncMock, MagicMock, patch
        from uuid import uuid4

        from nexus.audit.exceptions import AuditExportNotFoundError

        export_id = uuid4()
        service = AuditEventService(test_db_session, test_user)

        handle = AsyncMock()
        status_mock = MagicMock()
        status_mock.name = "FAILED"
        desc = MagicMock()
        desc.status = status_mock
        handle.describe.return_value = desc

        mock_client = AsyncMock()
        mock_client.get_workflow_handle = MagicMock(return_value=handle)

        with (
            override_settings(audit_export_dir=str(tmp_path)),
            patch(
                "nexus.audit.services.audit_event_service._get_temporal_client",
                new=AsyncMock(return_value=mock_client),
            ),
            pytest.raises(AuditExportNotFoundError) as exc_info,
        ):
            await service.get_export_file_path(export_id)

        assert exc_info.value.export_id == str(export_id)

    @pytest.mark.asyncio
    async def test_valid_uuid_nonexistent_file_raises_not_ready_when_running(
        self,
        test_db_session: AsyncSession,
        test_user: User,
        tmp_path: Any,  # noqa: ANN401
        override_settings: Any,  # noqa: ANN401
    ) -> None:
        """Valid UUID for non-existent file raises AuditExportNotReadyError when still running."""
        from unittest.mock import AsyncMock, MagicMock, patch
        from uuid import uuid4

        from nexus.audit.exceptions import AuditExportNotReadyError

        export_id = uuid4()
        service = AuditEventService(test_db_session, test_user)

        handle = AsyncMock()
        status_mock = MagicMock()
        status_mock.name = "RUNNING"
        desc = MagicMock()
        desc.status = status_mock
        handle.describe.return_value = desc

        mock_client = AsyncMock()
        mock_client.get_workflow_handle = MagicMock(return_value=handle)

        with (
            override_settings(audit_export_dir=str(tmp_path)),
            patch(
                "nexus.audit.services.audit_event_service._get_temporal_client",
                new=AsyncMock(return_value=mock_client),
            ),
            pytest.raises(AuditExportNotReadyError) as exc_info,
        ):
            await service.get_export_file_path(export_id)

        assert exc_info.value.export_id == str(export_id)

    @pytest.mark.asyncio
    async def test_valid_uuid_existing_file_returns_path(
        self,
        test_db_session: AsyncSession,
        test_user: User,
        tmp_path: Any,  # noqa: ANN401
        override_settings: Any,  # noqa: ANN401
    ) -> None:
        """Valid UUID with existing export file returns correct path without calling Temporal."""
        from uuid import uuid4

        export_id = uuid4()
        csv_file = tmp_path / f"audit-export-{export_id}.csv"
        csv_file.write_text("test,data\n1,2\n")

        service = AuditEventService(test_db_session, test_user)

        with override_settings(audit_export_dir=str(tmp_path)):
            result = await service.get_export_file_path(export_id)

        assert result == csv_file
        assert result.is_file()


class TestGetExportStatusSecurity:
    """Test security behaviour of get_export_status.

    UUID format validation is now enforced at the router layer (FastAPI path
    parameter type `UUID`), so invalid-string rejection is covered by the
    integration tests for the route endpoints.
    """
