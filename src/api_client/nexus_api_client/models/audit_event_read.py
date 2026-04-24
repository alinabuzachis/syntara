from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from dateutil.parser import isoparse

from ..models.actor_type import ActorType
from ..models.event_category import EventCategory
from ..models.event_severity import EventSeverity
from ..models.event_status import EventStatus
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.audit_context_data import AuditContextData
    from ..models.audit_event_read_labels import AuditEventReadLabels


T = TypeVar("T", bound="AuditEventRead")


@_attrs_define
class AuditEventRead:
    """Structured audit event representing a tracked system activity, user action, or operational occurrence.

    Attributes:
        event_category (EventCategory): Categories for different types of audit events.
        event_action (str): Specific action that occurred
        source_component (str): Component that generated the event
        event_message (str): Human-readable description of the event
        structured_data (AuditContextData): Universal structured data for all audit events.

            Accepts arbitrary extra fields so callers may pass domain-specific context.
            All audit events use this single structured data type.

            The data_type field serves as a discriminator for UI/frontend purposes,
            allowing different audit event types to be distinguished and rendered appropriately.
        id (UUID | Unset): Unique identifier for the resource Example: 550e8400-e29b-41d4-a716-446655440000.
        created_at (datetime.datetime | Unset): Timestamp when resource was created Example: 2025-10-09T12:00:00Z.
        updated_at (datetime.datetime | Unset): Timestamp when resource was last updated Example: 2025-10-09T12:30:00Z.
        labels (AuditEventReadLabels | Unset): Key-value pairs for resource labeling and filtering Example:
            {'environment': 'production', 'region': 'us-east-1', 'team': 'platform'}.
        event_severity (EventSeverity | Unset): Severity levels for audit events.
        event_status (EventStatus | None | Unset): Status of the audited operation
        actor_id (None | Unset | UUID): User, system, or service that performed the action
        actor_type (ActorType | None | Unset): Type of actor (user|system|service)
        actor_username (None | str | Unset): Username of the actor
        workflow_id (None | Unset | UUID): Workflow identifier for workflow-scoped events
        activity_id (None | str | Unset): Activity identifier for activity-level events
        execution_id (None | Unset | UUID): Execution identifier for execution tracing
    """

    event_category: EventCategory
    event_action: str
    source_component: str
    event_message: str
    structured_data: AuditContextData
    id: UUID | Unset = UNSET
    created_at: datetime.datetime | Unset = UNSET
    updated_at: datetime.datetime | Unset = UNSET
    labels: AuditEventReadLabels | Unset = UNSET
    event_severity: EventSeverity | Unset = UNSET
    event_status: EventStatus | None | Unset = UNSET
    actor_id: None | Unset | UUID = UNSET
    actor_type: ActorType | None | Unset = UNSET
    actor_username: None | str | Unset = UNSET
    workflow_id: None | Unset | UUID = UNSET
    activity_id: None | str | Unset = UNSET
    execution_id: None | Unset | UUID = UNSET

    def to_dict(self) -> dict[str, Any]:
        event_category = self.event_category.value

        event_action = self.event_action

        source_component = self.source_component

        event_message = self.event_message

        structured_data = self.structured_data.to_dict()

        id: str | Unset = UNSET
        if not isinstance(self.id, Unset):
            id = str(self.id)

        created_at: str | Unset = UNSET
        if not isinstance(self.created_at, Unset):
            created_at = self.created_at.isoformat()

        updated_at: str | Unset = UNSET
        if not isinstance(self.updated_at, Unset):
            updated_at = self.updated_at.isoformat()

        labels: dict[str, Any] | Unset = UNSET
        if not isinstance(self.labels, Unset):
            labels = self.labels.to_dict()

        event_severity: str | Unset = UNSET
        if not isinstance(self.event_severity, Unset):
            event_severity = self.event_severity.value

        event_status: None | str | Unset
        if isinstance(self.event_status, Unset):
            event_status = UNSET
        elif isinstance(self.event_status, EventStatus):
            event_status = self.event_status.value
        else:
            event_status = self.event_status

        actor_id: None | str | Unset
        if isinstance(self.actor_id, Unset):
            actor_id = UNSET
        elif isinstance(self.actor_id, UUID):
            actor_id = str(self.actor_id)
        else:
            actor_id = self.actor_id

        actor_type: None | str | Unset
        if isinstance(self.actor_type, Unset):
            actor_type = UNSET
        elif isinstance(self.actor_type, ActorType):
            actor_type = self.actor_type.value
        else:
            actor_type = self.actor_type

        actor_username: None | str | Unset
        if isinstance(self.actor_username, Unset):
            actor_username = UNSET
        else:
            actor_username = self.actor_username

        workflow_id: None | str | Unset
        if isinstance(self.workflow_id, Unset):
            workflow_id = UNSET
        elif isinstance(self.workflow_id, UUID):
            workflow_id = str(self.workflow_id)
        else:
            workflow_id = self.workflow_id

        activity_id: None | str | Unset
        if isinstance(self.activity_id, Unset):
            activity_id = UNSET
        else:
            activity_id = self.activity_id

        execution_id: None | str | Unset
        if isinstance(self.execution_id, Unset):
            execution_id = UNSET
        elif isinstance(self.execution_id, UUID):
            execution_id = str(self.execution_id)
        else:
            execution_id = self.execution_id

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "event_category": event_category,
                "event_action": event_action,
                "source_component": source_component,
                "event_message": event_message,
                "structured_data": structured_data,
            }
        )
        if id is not UNSET:
            field_dict["id"] = id
        if created_at is not UNSET:
            field_dict["created_at"] = created_at
        if updated_at is not UNSET:
            field_dict["updated_at"] = updated_at
        if labels is not UNSET:
            field_dict["labels"] = labels
        if event_severity is not UNSET:
            field_dict["event_severity"] = event_severity
        if event_status is not UNSET:
            field_dict["event_status"] = event_status
        if actor_id is not UNSET:
            field_dict["actor_id"] = actor_id
        if actor_type is not UNSET:
            field_dict["actor_type"] = actor_type
        if actor_username is not UNSET:
            field_dict["actor_username"] = actor_username
        if workflow_id is not UNSET:
            field_dict["workflow_id"] = workflow_id
        if activity_id is not UNSET:
            field_dict["activity_id"] = activity_id
        if execution_id is not UNSET:
            field_dict["execution_id"] = execution_id

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.audit_context_data import AuditContextData
        from ..models.audit_event_read_labels import AuditEventReadLabels

        d = dict(src_dict)
        event_category = EventCategory(d.pop("event_category"))

        event_action = d.pop("event_action")

        source_component = d.pop("source_component")

        event_message = d.pop("event_message")

        structured_data = AuditContextData.from_dict(d.pop("structured_data"))

        _id = d.pop("id", UNSET)
        id: UUID | Unset
        if isinstance(_id, Unset):
            id = UNSET
        else:
            id = UUID(_id)

        _created_at = d.pop("created_at", UNSET)
        created_at: datetime.datetime | Unset
        if isinstance(_created_at, Unset):
            created_at = UNSET
        else:
            created_at = isoparse(_created_at)

        _updated_at = d.pop("updated_at", UNSET)
        updated_at: datetime.datetime | Unset
        if isinstance(_updated_at, Unset):
            updated_at = UNSET
        else:
            updated_at = isoparse(_updated_at)

        _labels = d.pop("labels", UNSET)
        labels: AuditEventReadLabels | Unset
        if isinstance(_labels, Unset):
            labels = UNSET
        else:
            labels = AuditEventReadLabels.from_dict(_labels)

        _event_severity = d.pop("event_severity", UNSET)
        event_severity: EventSeverity | Unset
        if isinstance(_event_severity, Unset):
            event_severity = UNSET
        else:
            event_severity = EventSeverity(_event_severity)

        def _parse_event_status(data: object) -> EventStatus | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                event_status_type_0 = EventStatus(data)

                return event_status_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(EventStatus | None | Unset, data)

        event_status = _parse_event_status(d.pop("event_status", UNSET))

        def _parse_actor_id(data: object) -> None | Unset | UUID:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                actor_id_type_0 = UUID(data)

                return actor_id_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | Unset | UUID, data)

        actor_id = _parse_actor_id(d.pop("actor_id", UNSET))

        def _parse_actor_type(data: object) -> ActorType | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                actor_type_type_0 = ActorType(data)

                return actor_type_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(ActorType | None | Unset, data)

        actor_type = _parse_actor_type(d.pop("actor_type", UNSET))

        def _parse_actor_username(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        actor_username = _parse_actor_username(d.pop("actor_username", UNSET))

        def _parse_workflow_id(data: object) -> None | Unset | UUID:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                workflow_id_type_0 = UUID(data)

                return workflow_id_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | Unset | UUID, data)

        workflow_id = _parse_workflow_id(d.pop("workflow_id", UNSET))

        def _parse_activity_id(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        activity_id = _parse_activity_id(d.pop("activity_id", UNSET))

        def _parse_execution_id(data: object) -> None | Unset | UUID:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                execution_id_type_0 = UUID(data)

                return execution_id_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | Unset | UUID, data)

        execution_id = _parse_execution_id(d.pop("execution_id", UNSET))

        audit_event_read = cls(
            event_category=event_category,
            event_action=event_action,
            source_component=source_component,
            event_message=event_message,
            structured_data=structured_data,
            id=id,
            created_at=created_at,
            updated_at=updated_at,
            labels=labels,
            event_severity=event_severity,
            event_status=event_status,
            actor_id=actor_id,
            actor_type=actor_type,
            actor_username=actor_username,
            workflow_id=workflow_id,
            activity_id=activity_id,
            execution_id=execution_id,
        )

        return audit_event_read
