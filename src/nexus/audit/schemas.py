"""Audit event API request/response schemas.

Read-only schemas for the audit events domain.  There is no ``AuditEventCreate``
or ``AuditEventUpdate`` because events are produced by the emitter, not the API.
"""

from datetime import datetime
from typing import ClassVar
from uuid import UUID

from pydantic import ConfigDict
from sqlmodel import Field, SQLModel

from nexus.audit.models.structured_data import AuditDataUnion, BaseAuditData
from nexus.core.models.base.query_params import BaseListParams
from nexus.core.models.pagination import ResourcesResponse


class AuditEventRead(SQLModel):
    """Response schema for a single audit event (GET /audit-events/{id})."""

    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)  # type: ignore[assignment]

    id: UUID
    created_at: datetime
    event_category: str
    event_severity: str = "info"
    event_status: str | None = None
    event_action: str
    actor_id: UUID | None = None
    actor_type: str | None = None
    source_component: str
    workflow_id: UUID | None = None
    activity_id: str | None = None
    execution_id: UUID | None = None
    event_message: str
    structured_data: AuditDataUnion = Field(default_factory=BaseAuditData)


# ============================================================================
# List Response Type Alias
# ============================================================================

AuditEventListResponse = ResourcesResponse[AuditEventRead]


class AuditEventListParams(BaseListParams):
    """Query parameters for listing audit events."""
