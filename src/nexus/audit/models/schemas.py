"""Audit event API request/response schemas.

Read-only schemas for the audit events domain.  There is no ``AuditEventCreate``
or ``AuditEventUpdate`` because events are produced by the emitter, not the API.
"""

from uuid import UUID

from sqlmodel import Field

from nexus.audit.models.audit_event import ActorType, EventCategory, EventSeverity, EventStatus
from nexus.audit.models.structured_data import AuditDataUnion, BaseAuditData
from nexus.core.models.base.base_resource import BaseResource
from nexus.core.models.base.query_params import BaseListParams
from nexus.core.models.pagination import ResourcesResponse

# Date-range filtering on ``created_at`` uses the bracket-operator syntax
# inherited from BaseResource (e.g. ``?created_at[gte]=...&created_at[lte]=...``)
# rather than bespoke ``created_from`` / ``created_to`` params.


class AuditEventRead(BaseResource):
    """Structured audit event representing a tracked system activity, user action, or operational occurrence."""

    event_category: EventCategory
    event_severity: EventSeverity = EventSeverity.INFO
    event_status: EventStatus | None = Field(default=None, description="Status of the audited operation")
    event_action: str = Field(description="Specific action that occurred")
    actor_id: UUID | None = Field(default=None, description="User, system, or service that performed the action")
    actor_type: ActorType | None = Field(default=None, description="Type of actor (user|system|service)")
    source_component: str = Field(description="Component that generated the event")
    workflow_id: UUID | None = Field(default=None, description="Workflow identifier for workflow-scoped events")
    activity_id: str | None = Field(default=None, description="Activity identifier for activity-level events")
    execution_id: UUID | None = Field(default=None, description="Execution identifier for execution tracing")
    event_message: str = Field(description="Human-readable description of the event")
    structured_data: AuditDataUnion = Field(
        default_factory=BaseAuditData,
        description="Structured event data (sanitized), discriminated by ``data_type``.",
    )


class AuditEventListResponse(ResourcesResponse[AuditEventRead]):
    """Paginated list response for audit events."""


class AuditEventListParams(BaseListParams):
    """Query parameters for listing audit events."""

    event_category: EventCategory | None = Field(
        default=None,
        description="Filter by event category",
    )
    event_severity: EventSeverity | None = Field(
        default=None,
        description="Filter by event severity level",
    )
    event_status: EventStatus | None = Field(
        default=None,
        description="Filter by event status",
    )
    event_action: str | None = Field(
        default=None,
        description="Filter by specific action",
    )
    actor_id: UUID | None = Field(
        default=None,
        description="Filter by actor UUID",
    )
    actor_type: ActorType | None = Field(
        default=None,
        description="Filter by actor type",
    )
    source_component: str | None = Field(
        default=None,
        description="Filter by source component",
    )
    workflow_id: UUID | None = Field(
        default=None,
        description="Filter by workflow UUID",
    )
    activity_id: str | None = Field(
        default=None,
        description="Filter by activity identifier",
    )
    execution_id: UUID | None = Field(
        default=None,
        description="Filter by execution UUID",
    )
