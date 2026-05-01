"""Audit event database table model.

Provides the ``AuditEventRecord`` table model for persisting audit events
to a dedicated PostgreSQL database.  The model extends ``BaseResource`` to
reuse ``id``, ``created_at``, and cursor-pagination support from ``BaseService``.
"""

from typing import ClassVar
from uuid import UUID

from sqlalchemy import Index, String, text
from sqlmodel import Field

from nexus.audit.models.audit_event import ActorType, AuditEvent, EventCategory, EventSeverity, EventStatus
from nexus.audit.models.structured_data import AuditContextData
from nexus.core.constants import FieldLimits
from nexus.core.models.base.base_resource import BaseResource
from nexus.core.utils.sqlmodel import DiscriminatedJSONB, postgres_enum_column


class AuditEventRecord(BaseResource, table=True):
    """Persisted audit event record.

    Maps ``AuditEvent`` (the in-memory envelope produced by the emitter) to a
    database row. Enum fields use PostgreSQL ENUM types for type safety and
    efficient storage, managed through Alembic migrations.

    The ``id`` field (inherited from ``BaseResource``) is set to the original
    ``AuditEvent.event_id`` via :meth:`from_event`, so the primary key in the
    database matches the identifier used in structured logs.
    """

    __tablename__ = "audit_events"

    # -- Core identification ---------------------------------------------------
    event_category: EventCategory = Field(
        sa_column=postgres_enum_column(
            EventCategory,
            "eventcategory",
            index=True,
        ),
        description="Category of the audit event",
    )
    event_severity: EventSeverity = Field(
        default=EventSeverity.INFO,
        sa_column=postgres_enum_column(
            EventSeverity,
            "eventseverity",
            index=True,
            server_default=text("'info'::eventseverity"),
        ),
        description="Severity level (info, warning, error, critical)",
    )
    event_status: EventStatus | None = Field(
        default=None,
        sa_column=postgres_enum_column(
            EventStatus,
            "eventstatus",
            nullable=True,
            index=True,
        ),
        description="Status of the audited operation",
    )
    event_action: str = Field(index=True, description="Specific action that occurred")

    # -- Actor and source ------------------------------------------------------
    actor_id: UUID | None = Field(default=None, index=True, description="User/system/service that performed action")
    actor_type: ActorType | None = Field(
        default=None,
        sa_column=postgres_enum_column(
            ActorType,
            "actortype",
            nullable=True,
        ),
        description="Type of actor (user, system, service)",
    )
    actor_username: str | None = Field(
        default=None,
        sa_type=String(FieldLimits.NAME_MAX_LENGTH),  # type: ignore[call-overload]
        description="Username of the actor",
        index=True,
    )
    source_component: str = Field(description="Component that generated the event")
    resource_urn: str | None = Field(
        default=None,
        sa_type=String(1024),  # type: ignore[call-overload]
        description="RFC 8141 compliant URN identifying the resource",
        index=True,
    )
    resource_name: str | None = Field(
        default=None,
        sa_type=String(FieldLimits.NAME_MAX_LENGTH),  # type: ignore[call-overload]
        description="Human-readable name of the resource at event creation time",
        index=True,
    )

    # -- Context tracking ------------------------------------------------------
    workflow_id: UUID | None = Field(default=None, index=True, description="Workflow identifier")
    activity_id: str | None = Field(default=None, description="Activity identifier")
    execution_id: UUID | None = Field(default=None, index=True, description="Execution identifier")

    # -- Payload ---------------------------------------------------------------
    event_message: str = Field(description="Human-readable description of the event")
    structured_data: AuditContextData = Field(
        sa_type=DiscriminatedJSONB(AuditContextData),  # type: ignore[call-overload]
        description="Sanitised structured event data",
    )

    # -- BaseService integration -----------------------------------------------
    # ``created_at`` (inherited from BaseResource) supports bracket-operator
    # range filtering (``?created_at[gte]=...&created_at[lte]=...``) out of
    # the box — no audit-specific range fields are needed.
    __filterable_fields__: ClassVar[list[str]] = [
        *BaseResource.__filterable_fields__,
        "event_category",
        "event_severity",
        "event_status",
        "event_action",
        "actor_id",
        "actor_type",
        "actor_username",
        "source_component",
        "resource_urn",
        "resource_name",
        "workflow_id",
        "activity_id",
        "execution_id",
    ]

    __sortable_fields__: ClassVar[list[str]] = [
        *BaseResource.__sortable_fields__,
        "event_category",
        "event_severity",
        "event_status",
        "actor_type",
        "actor_username",
        "resource_name",
    ]

    # Composite indexes for efficient filtering + sorting queries
    # Common pattern: filter by field + sort by created_at DESC + cursor pagination
    __table_args__ = (
        # actor_id queries with date ordering (e.g., "show me user X's events")
        Index("ix_audit_events_actor_id_created_at_id", "actor_id", "created_at", "id"),
        # actor_name queries with date ordering (e.g., "show me events by username 'alice'")
        Index("ix_audit_events_actor_username_created_at_id", "actor_username", "created_at", "id"),
        # event_category queries with date ordering (e.g., "show me workflow events")
        Index("ix_audit_events_event_category_created_at_id", "event_category", "created_at", "id"),
        # workflow_id queries with date ordering (e.g., "show me workflow X's events")
        Index("ix_audit_events_workflow_id_created_at_id", "workflow_id", "created_at", "id"),
        # execution_id queries with date ordering (e.g., "show me execution X's events")
        Index("ix_audit_events_execution_id_created_at_id", "execution_id", "created_at", "id"),
        # activity_id queries with date ordering (e.g., "show me activity X's events")
        Index("ix_audit_events_activity_id_created_at_id", "activity_id", "created_at", "id"),
        # event_severity queries with date ordering (e.g., "show me errors/warnings")
        Index("ix_audit_events_event_severity_created_at_id", "event_severity", "created_at", "id"),
        # resource_urn queries with date ordering (e.g., "show me events for resource URN X")
        Index("ix_audit_events_resource_urn_created_at_id", "resource_urn", "created_at", "id"),
        # resource_name queries with date ordering (e.g., "show me events for resource name 'hello-world'")
        Index("ix_audit_events_resource_name_created_at_id", "resource_name", "created_at", "id"),
    )

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
            actor_username=event.actor_username,
            source_component=event.source_component,
            resource_urn=event.resource_urn,
            resource_name=event.resource_name,
            workflow_id=event.workflow_id,
            activity_id=event.activity_id,
            execution_id=event.execution_id,
            event_message=event.event_message,
            structured_data=event.structured_data,
        )
