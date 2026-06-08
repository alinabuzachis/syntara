"""Temporal activity for exporting audit events to CSV."""

from __future__ import annotations

import csv
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import Select, select
from temporalio import activity

from nexus.audit.export.models import AuditExportInput, AuditExportResult, ExportStatus
from nexus.audit.models.audit_event import EventCategory
from nexus.audit.models.audit_event_record import AuditEventRecord
from nexus.core.config.base import get_settings
from nexus.core.database.audit_session import AuditSessionLocal

_CSV_COLUMNS: list[str] = [
    "id",
    "created_at",
    "event_category",
    "event_severity",
    "event_status",
    "event_action",
    "actor_id",
    "actor_type",
    "actor_username",
    "resource_urn",
    "resource_name",
    "source_component",
    "workflow_id",
    "activity_id",
    "execution_id",
    "event_message",
    "structured_data",
]

_ENUM_FILTERS: frozenset[str] = frozenset({"event_category", "event_severity", "event_status", "actor_type"})


def _build_query(params: AuditExportInput) -> Any:  # noqa: ANN401
    created_at_col = AuditEventRecord.__table__.c.created_at  # type: ignore[attr-defined]
    id_col = AuditEventRecord.__table__.c.id  # type: ignore[attr-defined]
    # Secondary sort on id ensures deterministic page boundaries when created_at values tie.
    stmt: Select[tuple[AuditEventRecord]] = select(AuditEventRecord).order_by(created_at_col.asc(), id_col.asc())

    if params.created_at_gte:
        stmt = stmt.where(created_at_col >= datetime.fromisoformat(params.created_at_gte))
    if params.created_at_lte:
        stmt = stmt.where(created_at_col <= datetime.fromisoformat(params.created_at_lte))

    for field_name in ("event_action", "source_component", "activity_id"):
        value = getattr(params, field_name, None)
        if value is not None:
            stmt = stmt.where(getattr(AuditEventRecord, field_name) == value)

    for field_name in _ENUM_FILTERS:
        value = getattr(params, field_name, None)
        if value is not None:
            stmt = stmt.where(getattr(AuditEventRecord, field_name) == value)

    for field_name in ("actor_id", "workflow_id", "execution_id"):
        value = getattr(params, field_name, None)
        if value is not None:
            stmt = stmt.where(getattr(AuditEventRecord, field_name) == value)

    return stmt


_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")

# LLM event categories that may contain prompt/response payloads in structured_data.
# These keys are scrubbed before export to comply with the Jira AC:
# "Full LLM prompt/response content excluded — metadata only".
_LLM_CATEGORIES: frozenset[EventCategory] = frozenset(
    {
        EventCategory.LLM_INTERACTION,
        EventCategory.LLM_TOOL_CALL,
        EventCategory.LLM_REASONING,
    }
)
_LLM_PAYLOAD_KEYS: frozenset[str] = frozenset({"prompt", "response", "content"})


def _sanitize_csv_cell(value: str) -> str:
    """Prevent CSV formula injection (CWE-1236) by prefixing formula-trigger characters."""
    if value.startswith(_FORMULA_PREFIXES):
        return "'" + value
    return value


def _scrub_llm_payload(data: Any, record: AuditEventRecord) -> Any:  # noqa: ANN401
    """Remove LLM prompt/response payload keys from structured_data for LLM event categories."""
    if record.event_category not in _LLM_CATEGORIES:
        return data
    if not isinstance(data, dict):
        return data
    return {k: v for k, v in data.items() if k not in _LLM_PAYLOAD_KEYS}


def _row_to_csv(record: AuditEventRecord) -> list[str]:
    dumped: dict[str, Any] = record.model_dump(mode="json")
    cells: list[str] = []
    for col in _CSV_COLUMNS:
        raw = dumped.get(col, "")
        if col == "structured_data":
            raw = _scrub_llm_payload(raw, record)
        value = str(raw) if raw is not None else ""
        cells.append(_sanitize_csv_cell(value))
    return cells


@activity.defn(name="audit_export")
async def execute_audit_export(input_data: AuditExportInput) -> AuditExportResult:
    """Export audit events to a CSV file.

    Streams rows from the audit database in batches to keep memory usage
    bounded regardless of result-set size.
    """
    settings = get_settings()
    export_dir = Path(settings.audit_export_dir)
    batch_size = settings.audit_export_batch_size

    # Write to a .tmp file during export so the final filename is only visible
    # after an atomic rename on success.
    tmp_path = export_dir / f"audit-export-{input_data.export_id}.csv.tmp"
    final_path = export_dir / f"audit-export-{input_data.export_id}.csv"

    row_count = 0
    try:
        export_dir.mkdir(parents=True, exist_ok=True)
        with tmp_path.open("w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(_CSV_COLUMNS)

            stmt = _build_query(input_data)
            offset = 0

            async with AuditSessionLocal() as session:
                while True:
                    page = stmt.offset(offset).limit(batch_size)
                    result = await session.execute(page)
                    records = result.scalars().all()

                    if not records:
                        break

                    for record in records:
                        writer.writerow(_row_to_csv(record))
                        row_count += 1

                    offset += len(records)

                    if len(records) < batch_size:
                        break

        tmp_path.rename(final_path)

        return AuditExportResult(
            export_id=input_data.export_id,
            file_path=str(final_path),
            row_count=row_count,
        )

    except Exception as e:  # noqa: BLE001
        activity.logger.error("Audit export failed", exc_info=e)
        if tmp_path.exists():
            tmp_path.unlink()
        return AuditExportResult(
            export_id=input_data.export_id,
            file_path="",
            row_count=0,
            status=ExportStatus.FAILED,
            error="Export failed. See server logs for details.",
        )
