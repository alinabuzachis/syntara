"""Unit tests for audit export activity."""

import csv
from collections.abc import AsyncGenerator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.audit.export.activity import (
    _CSV_COLUMNS,
    _LLM_CATEGORIES,
    _LLM_PAYLOAD_KEYS,
    _build_query,
    _row_to_csv,
    _sanitize_csv_cell,
    _scrub_llm_payload,
    execute_audit_export,
)
from nexus.audit.export.models import AuditExportInput, ExportStatus
from nexus.audit.models.audit_event import EventCategory
from nexus.audit.models.audit_event_record import AuditEventRecord
from tests.helpers.audit import AuditEventsFactory

# ============================================================================
# Query building
# ============================================================================


class TestBuildQuery:
    """Tests for _build_query filter construction."""

    def test_no_filters_returns_base_query(self) -> None:
        params = AuditExportInput(export_id="test")
        stmt = _build_query(params)
        assert stmt.whereclause is None

    def test_created_at_gte_filter(self) -> None:
        params = AuditExportInput(export_id="test", created_at_gte="2025-01-01T00:00:00")
        stmt = _build_query(params)
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        assert "created_at >=" in compiled

    def test_created_at_lte_filter(self) -> None:
        params = AuditExportInput(export_id="test", created_at_lte="2025-12-31T23:59:59")
        stmt = _build_query(params)
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        assert "created_at <=" in compiled

    def test_created_at_range(self) -> None:
        params = AuditExportInput(
            export_id="test",
            created_at_gte="2025-01-01T00:00:00",
            created_at_lte="2025-12-31T23:59:59",
        )
        stmt = _build_query(params)
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        assert "created_at >=" in compiled
        assert "created_at <=" in compiled

    @pytest.mark.parametrize(
        ("field", "value"),
        [
            ("event_category", "user_action"),
            ("event_severity", "warning"),
            ("event_status", "success"),
            ("actor_type", "user"),
        ],
    )
    def test_enum_filters(self, field: str, value: str) -> None:
        params = AuditExportInput(export_id="test", **{field: value})  # type: ignore[arg-type]
        stmt = _build_query(params)
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        assert field in compiled
        assert value in compiled

    @pytest.mark.parametrize("field", ["event_action", "source_component"])
    def test_string_filters(self, field: str) -> None:
        params = AuditExportInput(export_id="test", **{field: "test_value"})  # type: ignore[arg-type]
        stmt = _build_query(params)
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        assert field in compiled

    @pytest.mark.parametrize("field", ["actor_id", "workflow_id", "execution_id"])
    def test_uuid_filters(self, field: str) -> None:
        test_uuid = str(uuid4())
        params = AuditExportInput(export_id="test", **{field: test_uuid})  # type: ignore[arg-type]
        stmt = _build_query(params)
        # literal_binds cannot render UUID values; check the column name appears
        # as a bind-parameter placeholder in the generated WHERE clause instead.
        compiled = str(stmt.compile())
        assert field in compiled

    def test_activity_id_filter(self) -> None:
        params = AuditExportInput(export_id="test", activity_id="act-abc-123")
        stmt = _build_query(params)
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        assert "activity_id" in compiled

    def test_multiple_filters_combined(self) -> None:
        params = AuditExportInput(
            export_id="test",
            created_at_gte="2025-01-01T00:00:00",
            event_category=EventCategory.USER_ACTION,
            event_action="login",
            actor_id=str(uuid4()),
        )
        stmt = _build_query(params)
        compiled = str(stmt.compile())
        assert "created_at >=" in compiled
        assert "event_action" in compiled


# ============================================================================
# CSV row conversion
# ============================================================================


class TestRowToCsv:
    """Tests for _row_to_csv conversion."""

    def _make_record(self, **overrides: Any) -> AuditEventRecord:  # noqa: ANN401
        defaults: dict[str, Any] = {
            "id": uuid4(),
            "event_category": "user_action",
            "event_action": "test_action",
            "actor_type": "system",
            "source_component": "test_service",
            "event_message": "Test event",
            "structured_data": {"data_type": "context"},
        }
        defaults.update(overrides)
        return AuditEventRecord(**defaults)

    def test_all_fields_present(self) -> None:
        record = self._make_record(
            actor_id=uuid4(),
            workflow_id=uuid4(),
            execution_id=uuid4(),
            activity_id="act-1",
        )
        row = _row_to_csv(record)
        assert len(row) == len(_CSV_COLUMNS)

    def test_none_fields_become_empty_string(self) -> None:
        record = self._make_record(actor_id=None, workflow_id=None, execution_id=None)
        row = _row_to_csv(record)
        col_index = {col: i for i, col in enumerate(_CSV_COLUMNS)}
        assert row[col_index["actor_id"]] == ""
        assert row[col_index["workflow_id"]] == ""

    def test_actor_identity_fields_exported(self) -> None:
        """actor_username, resource_urn, resource_name must appear in every row (Jira AC)."""
        record = self._make_record(
            actor_username="jdoe",
            resource_urn="urn:nexus:workflow:abc-123",
            resource_name="my-workflow",
        )
        row = _row_to_csv(record)
        col_index = {col: i for i, col in enumerate(_CSV_COLUMNS)}
        assert "actor_username" in col_index
        assert "resource_urn" in col_index
        assert "resource_name" in col_index
        assert row[col_index["actor_username"]] == "jdoe"
        assert row[col_index["resource_urn"]] == "urn:nexus:workflow:abc-123"
        assert row[col_index["resource_name"]] == "my-workflow"

    def test_actor_identity_fields_null_when_absent(self) -> None:
        record = self._make_record(actor_username=None, resource_urn=None, resource_name=None)
        row = _row_to_csv(record)
        col_index = {col: i for i, col in enumerate(_CSV_COLUMNS)}
        assert row[col_index["actor_username"]] == ""
        assert row[col_index["resource_urn"]] == ""
        assert row[col_index["resource_name"]] == ""

    def test_column_order_matches_csv_columns(self) -> None:
        record = self._make_record(event_action="specific_action", source_component="specific_comp")
        row = _row_to_csv(record)
        dumped = record.model_dump(mode="json")
        for i, col in enumerate(_CSV_COLUMNS):
            raw = dumped.get(col, "")
            expected = str(raw) if raw is not None else ""
            assert row[i] == expected


# ============================================================================
# CSV injection protection (CWE-1236)
# ============================================================================


class TestSanitizeCsvCell:
    """Tests for _sanitize_csv_cell — CWE-1236 formula injection prevention."""

    @pytest.mark.parametrize(
        "prefix",
        ["=", "+", "-", "@", "\t", "\r"],
    )
    def test_formula_prefix_is_escaped(self, prefix: str) -> None:
        dangerous = f'{prefix}HYPERLINK("http://evil.com")'
        result = _sanitize_csv_cell(dangerous)
        assert result.startswith("'")
        assert result[1:] == dangerous

    @pytest.mark.parametrize(
        "safe",
        ["normal text", "user@example.com", "2025-01-01", "SomeAction", "123"],
    )
    def test_safe_values_are_unchanged(self, safe: str) -> None:
        assert _sanitize_csv_cell(safe) == safe

    def test_empty_string_is_unchanged(self) -> None:
        assert _sanitize_csv_cell("") == ""

    def test_row_to_csv_sanitizes_event_message(self) -> None:
        record_with_formula = TestRowToCsv()._make_record(event_message='=HYPERLINK("http://evil.com")')
        row = _row_to_csv(record_with_formula)
        msg_index = list(_CSV_COLUMNS).index("event_message")
        assert row[msg_index].startswith("'=")

    def test_row_to_csv_sanitizes_event_action(self) -> None:
        record = TestRowToCsv()._make_record(event_action="+cmd|' /C calc'!A0")
        row = _row_to_csv(record)
        action_index = list(_CSV_COLUMNS).index("event_action")
        assert row[action_index].startswith("'+")

    def test_row_to_csv_sanitizes_source_component(self) -> None:
        record = TestRowToCsv()._make_record(source_component="-2+3+cmd|' /C calc'!A0")
        row = _row_to_csv(record)
        comp_index = list(_CSV_COLUMNS).index("source_component")
        assert row[comp_index].startswith("'-")

    def test_non_string_fields_are_not_sanitized(self) -> None:
        """Non-string values (UUID, datetime, dict) pass through str() without prefix check."""
        record = TestRowToCsv()._make_record()
        row = _row_to_csv(record)
        id_index = list(_CSV_COLUMNS).index("id")
        assert not row[id_index].startswith("'")


# ============================================================================
# LLM payload scrubbing (#8)
# ============================================================================


class TestScrubLlmPayload:
    """Tests for _scrub_llm_payload — LLM content exclusion (Jira AC)."""

    def _make_record(self, event_category: str = "user_action", **kwargs: Any) -> AuditEventRecord:  # noqa: ANN401
        defaults: dict[str, Any] = {
            "id": uuid4(),
            "event_category": event_category,
            "event_action": "test_action",
            "actor_type": "system",
            "source_component": "test_service",
            "event_message": "Test event",
            "structured_data": {"data_type": "context"},
        }
        defaults.update(kwargs)
        return AuditEventRecord(**defaults)

    @pytest.mark.parametrize("llm_category", sorted(c.value for c in _LLM_CATEGORIES))
    def test_llm_payload_keys_scrubbed_for_llm_categories(self, llm_category: str) -> None:
        record = self._make_record(event_category=llm_category)
        data = {"prompt": "tell me a secret", "response": "here it is", "content": "...", "model": "gpt-5"}
        result = _scrub_llm_payload(data, record)
        for key in _LLM_PAYLOAD_KEYS:
            assert key not in result
        assert result.get("model") == "gpt-5"

    @pytest.mark.parametrize("non_llm_category", ["user_action", "system_operation", "workflow_event"])
    def test_non_llm_categories_are_unchanged(self, non_llm_category: str) -> None:
        record = self._make_record(event_category=non_llm_category)
        data = {"prompt": "some prompt", "response": "some response", "extra": "value"}
        result = _scrub_llm_payload(data, record)
        assert result == data

    def test_non_dict_structured_data_is_unchanged(self) -> None:
        record = self._make_record(event_category=EventCategory.LLM_INTERACTION.value)
        assert _scrub_llm_payload(None, record) is None
        assert _scrub_llm_payload("raw string", record) == "raw string"

    def test_row_to_csv_scrubs_llm_payload_in_structured_data(self) -> None:
        record = self._make_record(
            event_category=EventCategory.LLM_INTERACTION.value,
            structured_data={"data_type": "llm_context", "prompt": "secret prompt", "model": "gpt-5", "tokens": 42},
        )
        row = _row_to_csv(record)
        sd_index = list(_CSV_COLUMNS).index("structured_data")
        serialized = row[sd_index]
        assert "secret prompt" not in serialized
        assert "model" in serialized

    def test_row_to_csv_preserves_structured_data_for_non_llm(self) -> None:
        record = self._make_record(
            event_category="user_action",
            structured_data={"data_type": "user_context", "extra_detail": "this is not llm data"},
        )
        row = _row_to_csv(record)
        sd_index = list(_CSV_COLUMNS).index("structured_data")
        serialized = row[sd_index]
        assert "this is not llm data" in serialized


# ============================================================================
# Full activity execution
# ============================================================================


def _read_csv(path: Path) -> list[list[str]]:
    with path.open() as f:
        return list(csv.reader(f))


class TestExecuteAuditExport:
    """Tests for the execute_audit_export Temporal activity."""

    @pytest.fixture(autouse=True)
    async def _setup_export(
        self,
        test_db_session: AsyncSession,
        override_settings: Any,  # noqa: ANN401
        tmp_path: Path,
    ) -> AsyncGenerator[None, None]:
        self._tmp_path = tmp_path

        # Create a factory that returns the test session so all operations
        # share the same transaction context
        class TestSessionFactory:
            def __call__(self) -> AsyncSession:
                return test_db_session

        session_patcher = patch(
            "nexus.audit.export.activity.AuditSessionLocal",
            new=TestSessionFactory(),
        )
        session_patcher.start()
        with override_settings(
            audit_export_dir=str(tmp_path),
            audit_export_batch_size=5000,
        ):
            yield
        session_patcher.stop()

    @pytest.mark.asyncio
    async def test_empty_db_produces_header_only_csv(self) -> None:
        inp = AuditExportInput(export_id="empty-test")
        result = await execute_audit_export(inp)
        assert result.status == ExportStatus.COMPLETED
        assert result.row_count == 0
        csv_path = Path(result.file_path)
        assert csv_path.exists()
        rows = _read_csv(csv_path)
        assert len(rows) == 1
        assert rows[0] == list(_CSV_COLUMNS)

    @pytest.mark.asyncio
    async def test_exports_all_matching_rows(
        self,
        audit_events_factory: AuditEventsFactory,
    ) -> None:
        await audit_events_factory.create_events(count=5)
        await audit_events_factory.session.commit()

        inp = AuditExportInput(export_id="all-rows")
        result = await execute_audit_export(inp)

        assert result.status == ExportStatus.COMPLETED
        assert result.row_count == 5
        rows = _read_csv(Path(result.file_path))
        assert len(rows) == 6  # header + 5 data rows

    @pytest.mark.asyncio
    async def test_filters_only_export_matching(
        self,
        audit_events_factory: AuditEventsFactory,
    ) -> None:
        await audit_events_factory.create_events(count=3, event_category="user_action")
        await audit_events_factory.create_events(count=2, event_category="system_operation")
        await audit_events_factory.session.commit()

        inp = AuditExportInput(export_id="filtered", event_category=EventCategory.USER_ACTION)
        result = await execute_audit_export(inp)

        assert result.status == ExportStatus.COMPLETED
        assert result.row_count == 3

    @pytest.mark.asyncio
    async def test_batching(
        self,
        audit_events_factory: AuditEventsFactory,
        override_settings: Any,  # noqa: ANN401
    ) -> None:
        await audit_events_factory.create_events(count=5)
        await audit_events_factory.session.commit()

        with override_settings(audit_export_batch_size=2):
            inp = AuditExportInput(export_id="batch-test")
            result = await execute_audit_export(inp)

        assert result.status == ExportStatus.COMPLETED
        assert result.row_count == 5

    @pytest.mark.asyncio
    async def test_csv_header_matches_columns(
        self,
        audit_events_factory: AuditEventsFactory,
    ) -> None:
        await audit_events_factory.create_event()
        await audit_events_factory.session.commit()

        inp = AuditExportInput(export_id="header-test")
        result = await execute_audit_export(inp)

        rows = _read_csv(Path(result.file_path))
        assert rows[0] == list(_CSV_COLUMNS)

    @pytest.mark.asyncio
    async def test_orders_by_created_at_ascending(
        self,
        audit_events_factory: AuditEventsFactory,
    ) -> None:
        base = datetime(2025, 6, 1, tzinfo=UTC)
        for i in [2, 0, 1]:
            await audit_events_factory.create_event(
                event_action=f"action_{i}",
                created_at=base + timedelta(hours=i),
            )
        await audit_events_factory.session.commit()

        inp = AuditExportInput(export_id="order-test")
        result = await execute_audit_export(inp)

        rows = _read_csv(Path(result.file_path))
        timestamps = [row[_CSV_COLUMNS.index("created_at")] for row in rows[1:]]
        assert timestamps == sorted(timestamps)

    @pytest.mark.asyncio
    async def test_failure_deletes_partial_file(self) -> None:
        export_id = "fail-test"
        tmp_path = self._tmp_path / f"audit-export-{export_id}.csv.tmp"
        final_path = self._tmp_path / f"audit-export-{export_id}.csv"

        with patch("nexus.audit.export.activity.AuditSessionLocal") as mock_factory:
            mock_session = AsyncMock()
            mock_session.execute.side_effect = RuntimeError("DB exploded")
            mock_ctx = AsyncMock()
            mock_ctx.__aenter__.return_value = mock_session
            mock_ctx.__aexit__.return_value = None
            mock_factory.return_value = mock_ctx

            inp = AuditExportInput(export_id=export_id)
            result = await execute_audit_export(inp)

        assert result.status == ExportStatus.FAILED
        assert result.error == "Export failed. See server logs for details."
        assert not tmp_path.exists(), "temp file should be cleaned up on failure"
        assert not final_path.exists(), "final file should never appear on failure"

    @pytest.mark.asyncio
    async def test_failure_returns_sanitized_error(self) -> None:
        """Internal exception detail must not leak to callers (security hardening)."""
        original_exc = ValueError("bad query: password=s3cr3t host=db.internal")
        with patch("nexus.audit.export.activity.AuditSessionLocal") as mock_factory:
            mock_session = AsyncMock()
            mock_session.execute.side_effect = original_exc
            mock_ctx = AsyncMock()
            mock_ctx.__aenter__.return_value = mock_session
            mock_ctx.__aexit__.return_value = None
            mock_factory.return_value = mock_ctx

            inp = AuditExportInput(export_id="err-test")
            result = await execute_audit_export(inp)

        assert result.status == ExportStatus.FAILED
        assert result.error == "Export failed. See server logs for details."
        assert "bad query" not in (result.error or "")
        assert result.row_count == 0

    @pytest.mark.asyncio
    async def test_failure_logs_original_exception(self) -> None:
        """Original exception must be logged server-side for debuggability."""
        original_exc = RuntimeError("internal detail")
        with (
            patch("nexus.audit.export.activity.AuditSessionLocal") as mock_factory,
            patch("nexus.audit.export.activity.activity.logger") as mock_logger,
        ):
            mock_session = AsyncMock()
            mock_session.execute.side_effect = original_exc
            mock_ctx = AsyncMock()
            mock_ctx.__aenter__.return_value = mock_session
            mock_ctx.__aexit__.return_value = None
            mock_factory.return_value = mock_ctx

            inp = AuditExportInput(export_id="log-test")
            await execute_audit_export(inp)

        mock_logger.error.assert_called_once()
        call_kwargs = mock_logger.error.call_args
        assert call_kwargs.kwargs.get("exc_info") is original_exc

    @pytest.mark.asyncio
    async def test_file_naming(
        self,
        audit_events_factory: AuditEventsFactory,
    ) -> None:
        await audit_events_factory.create_event()
        await audit_events_factory.session.commit()
        export_id = "naming-test"

        inp = AuditExportInput(export_id=export_id)
        result = await execute_audit_export(inp)

        assert result.file_path == str(self._tmp_path / f"audit-export-{export_id}.csv")

    @pytest.mark.asyncio
    async def test_mkdir_failure_returns_failed_result(self) -> None:
        """PermissionError from mkdir must be caught and returned as a failed result, not raised (#9)."""
        with patch("nexus.audit.export.activity.Path.mkdir", side_effect=PermissionError("no write")):
            inp = AuditExportInput(export_id="mkdir-fail-test")
            result = await execute_audit_export(inp)

        assert result.status == ExportStatus.FAILED
        assert result.error == "Export failed. See server logs for details."
