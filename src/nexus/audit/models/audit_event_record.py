"""Audit event database table model.

Provides the ``AuditEventRecord`` table model for persisting audit events
to a dedicated PostgreSQL database.  The model extends ``BaseResource`` to
reuse ``id``, ``created_at``, and cursor-pagination support from ``BaseService``.
"""

from typing import ClassVar
from uuid import UUID

from sqlmodel import Field

from nexus.audit.models.audit_event import AuditEvent
from nexus.audit.models.structured_data import AuditDataTypes, AuditDataUnion, BaseAuditData
from nexus.core.models.base.base_resource import BaseResource
from nexus.core.utils.sqlmodel import DiscriminatedJSONB


class AuditEventRecord(BaseResource, table=True):
    """Persisted audit event record.

    Maps ``AuditEvent`` (the in-memory envelope produced by the emitter) to a
    database row.  Enums are stored as plain strings to avoid PostgreSQL ENUM
    types and the migration overhead of ``ALTER TYPE`` when adding members.

    The ``id`` field (inherited from ``BaseResource``) is set to the original
    ``AuditEvent.event_id`` via :meth:`from_event`, so the primary key in the
    database matches the identifier used in structured logs.
    """

    __tablename__ = "audit_events"

    # -- Core identification ---------------------------------------------------
    event_category: str = Field(index=True, description="Category of the audit event")
    event_severity: str = Field(
        default="info", index=True, description="Severity level (info, warning, error, critical)"
    )
    event_status: str | None = Field(default=None, index=True, description="Status of the audited operation")
    event_action: str = Field(index=True, description="Specific action that occurred")

    # -- Actor and source ------------------------------------------------------
    actor_id: UUID | None = Field(default=None, index=True, description="User/system/service that performed action")
    actor_type: str | None = Field(default=None, description="Type of actor (user, system, service)")
    source_component: str = Field(description="Component that generated the event")

    # -- Context tracking ------------------------------------------------------
    workflow_id: UUID | None = Field(default=None, index=True, description="Workflow identifier")
    activity_id: str | None = Field(default=None, description="Activity identifier")
    execution_id: UUID | None = Field(default=None, index=True, description="Execution identifier")

    # -- Payload ---------------------------------------------------------------
    event_message: str = Field(description="Human-readable description of the event")
    structured_data: AuditDataTypes = Field(
        default_factory=BaseAuditData,
        sa_type=DiscriminatedJSONB(AuditDataUnion),  # type: ignore[arg-type, call-overload]
        description="Sanitised structured event data",
    )

    # -- BaseService integration -----------------------------------------------
    __filterable_fields__: ClassVar[list[str]] = [
        *BaseResource.__filterable_fields__,
        "event_category",
        "event_severity",
        "event_status",
        "event_action",
        "actor_id",
        "actor_type",
        "source_component",
        "workflow_id",
        "activity_id",
        "execution_id",
    ]

    __sortable_fields__: ClassVar[list[str]] = [
        *BaseResource.__sortable_fields__,
        "event_category",
        "event_severity",
        "event_status",
    ]

    # ------------------------------------------------------------------ #
    # Factory
    # ------------------------------------------------------------------ #

    @classmethod
    def from_event(cls, event: AuditEvent) -> "AuditEventRecord":
        """Create a record from an in-memory ``AuditEvent``.

        The ``event.event_id`` is used as the record's primary key so that the
        database row and the structured-log entry share the same identifier.
        """
        return cls(
            id=event.event_id,
            event_category=event.event_category,
            event_severity=event.event_severity,
            event_status=event.event_status,
            event_action=event.event_action,
            actor_id=event.actor_id,
            actor_type=event.actor_type,
            source_component=event.source_component,
            workflow_id=event.workflow_id,
            activity_id=event.activity_id,
            execution_id=event.execution_id,
            event_message=event.event_message,
            structured_data=event.structured_data,
        )
