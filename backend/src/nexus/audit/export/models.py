"""Models for audit data export requests and responses."""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from uuid import UUID

from sqlmodel import Field, SQLModel

from nexus.audit.models.audit_event import ActorType, EventCategory, EventSeverity, EventStatus


class ExportStatus(StrEnum):
    """Status of an audit export job."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class ExportFormat(StrEnum):
    """Supported export file formats."""

    CSV = "csv"


@dataclass
class AuditExportInput:
    """Input parameters for the audit export Temporal activity."""

    export_id: str
    created_at_gte: str | None = None
    created_at_lte: str | None = None
    event_category: EventCategory | None = None
    event_severity: EventSeverity | None = None
    event_status: EventStatus | None = None
    event_action: str | None = None
    actor_id: str | None = None
    actor_type: ActorType | None = None
    source_component: str | None = None
    workflow_id: str | None = None
    activity_id: str | None = None
    execution_id: str | None = None
    export_format: ExportFormat = ExportFormat.CSV


@dataclass
class AuditExportResult:
    """Result of a completed audit export."""

    export_id: str
    file_path: str
    row_count: int
    status: ExportStatus = ExportStatus.COMPLETED
    error: str | None = None


class AuditExportCreate(SQLModel):
    """API request body for starting an audit export."""

    created_at_gte: datetime | None = Field(default=None, description="Export events created at or after this time")
    created_at_lte: datetime | None = Field(default=None, description="Export events created at or before this time")
    event_category: EventCategory | None = Field(default=None, description="Filter by event category")
    event_severity: EventSeverity | None = Field(default=None, description="Filter by severity level")
    event_status: EventStatus | None = Field(default=None, description="Filter by event status")
    event_action: str | None = Field(default=None, description="Filter by specific action")
    actor_id: UUID | None = Field(default=None, description="Filter by actor UUID")
    actor_type: ActorType | None = Field(default=None, description="Filter by actor type")
    source_component: str | None = Field(default=None, description="Filter by source component")
    workflow_id: UUID | None = Field(default=None, description="Filter by workflow UUID")
    activity_id: str | None = Field(default=None, description="Filter by activity ID")
    execution_id: UUID | None = Field(default=None, description="Filter by execution UUID")
    export_format: ExportFormat = Field(default=ExportFormat.CSV, description="Export file format")


class AuditExportRead(SQLModel):
    """API response for an audit export job."""

    id: UUID = Field(description="Unique identifier for this export job")
    status: ExportStatus = Field(description="Current status of the export job")
    file_name: str | None = Field(default=None, description="Name of the export file when completed")
    row_count: int | None = Field(default=None, description="Number of rows exported")
    error: str | None = Field(default=None, description="Error message if export failed")
