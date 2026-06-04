"""Unit tests for audit export models."""

import pytest
from pydantic import ValidationError

from nexus.audit.export.models import (
    AuditExportCreate,
    AuditExportInput,
    AuditExportRead,
    AuditExportResult,
    ExportFormat,
    ExportStatus,
)


class TestExportEnums:
    """Tests for export enum types."""

    def test_export_status_values(self) -> None:
        assert set(ExportStatus) == {
            ExportStatus.PENDING,
            ExportStatus.RUNNING,
            ExportStatus.COMPLETED,
            ExportStatus.FAILED,
        }
        assert ExportStatus.PENDING.value == "pending"
        assert ExportStatus.RUNNING.value == "running"
        assert ExportStatus.COMPLETED.value == "completed"
        assert ExportStatus.FAILED.value == "failed"

    def test_export_format_values(self) -> None:
        assert set(ExportFormat) == {ExportFormat.CSV}
        assert ExportFormat.CSV.value == "csv"


class TestAuditExportInput:
    """Tests for the Temporal activity input dataclass."""

    def test_defaults(self) -> None:
        inp = AuditExportInput(export_id="test-123")
        assert inp.export_id == "test-123"
        assert inp.export_format == "csv"
        assert inp.created_at_gte is None
        assert inp.created_at_lte is None
        assert inp.event_category is None
        assert inp.event_severity is None
        assert inp.event_status is None
        assert inp.event_action is None
        assert inp.actor_id is None
        assert inp.actor_type is None
        assert inp.source_component is None
        assert inp.workflow_id is None
        assert inp.execution_id is None


class TestAuditExportResult:
    """Tests for the Temporal activity result dataclass."""

    def test_defaults(self) -> None:
        result = AuditExportResult(export_id="test-123", file_path="/data/exports/test.csv", row_count=10)
        assert result.status == ExportStatus.COMPLETED
        assert result.error is None

    def test_failed_result(self) -> None:
        result = AuditExportResult(
            export_id="test-123",
            file_path="",
            row_count=0,
            status=ExportStatus.FAILED,
            error="DB connection lost",
        )
        assert result.status == ExportStatus.FAILED
        assert result.error == "DB connection lost"


class TestAuditExportCreate:
    """Tests for the API request SQLModel."""

    def test_minimal_request(self) -> None:
        req = AuditExportCreate.model_validate({})
        assert req.export_format == ExportFormat.CSV
        assert req.created_at_gte is None
        assert req.event_category is None

    def test_request_with_valid_enum(self) -> None:
        req = AuditExportCreate.model_validate({"event_category": "user_action"})
        assert req.event_category is not None
        assert req.event_category.value == "user_action"

    def test_request_rejects_invalid_enum(self) -> None:
        with pytest.raises(ValidationError):
            AuditExportCreate.model_validate({"event_category": "not_a_category"})


class TestAuditExportRead:
    """Tests for the API response SQLModel."""

    def test_round_trip(self) -> None:
        from uuid import uuid4

        export_id = uuid4()
        data = {
            "id": str(export_id),
            "status": "completed",
            "file_name": f"audit-export-{export_id}.csv",
            "row_count": 42,
            "error": None,
        }
        resp = AuditExportRead.model_validate(data)
        dumped = resp.model_dump()
        assert dumped["id"] == export_id
        assert dumped["status"] == "completed"
        assert dumped["file_name"] == f"audit-export-{export_id}.csv"
        assert dumped["row_count"] == 42
        assert dumped["error"] is None

    def test_minimal_response(self) -> None:
        from uuid import uuid4

        resp = AuditExportRead.model_validate({"id": str(uuid4()), "status": "running"})
        assert resp.file_name is None
        assert resp.row_count is None
        assert resp.error is None
