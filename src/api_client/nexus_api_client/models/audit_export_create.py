from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

from ..models.actor_type import ActorType
from ..models.event_category import EventCategory
from ..models.event_severity import EventSeverity
from ..models.event_status import EventStatus
from ..models.export_format import ExportFormat
from ..types import UNSET, Unset

T = TypeVar("T", bound="AuditExportCreate")


@_attrs_define
class AuditExportCreate:
    """API request body for starting an audit export.

    Attributes:
        created_at_gte (datetime.datetime | None | Unset): Export events created at or after this time
        created_at_lte (datetime.datetime | None | Unset): Export events created at or before this time
        event_category (EventCategory | None | Unset): Filter by event category
        event_severity (EventSeverity | None | Unset): Filter by severity level
        event_status (EventStatus | None | Unset): Filter by event status
        event_action (None | str | Unset): Filter by specific action
        actor_id (None | Unset | UUID): Filter by actor UUID
        actor_type (ActorType | None | Unset): Filter by actor type
        source_component (None | str | Unset): Filter by source component
        workflow_id (None | Unset | UUID): Filter by workflow UUID
        activity_id (None | str | Unset): Filter by activity ID
        execution_id (None | Unset | UUID): Filter by execution UUID
        export_format (ExportFormat | Unset): Supported export file formats.
    """

    created_at_gte: datetime.datetime | None | Unset = UNSET
    created_at_lte: datetime.datetime | None | Unset = UNSET
    event_category: EventCategory | None | Unset = UNSET
    event_severity: EventSeverity | None | Unset = UNSET
    event_status: EventStatus | None | Unset = UNSET
    event_action: None | str | Unset = UNSET
    actor_id: None | Unset | UUID = UNSET
    actor_type: ActorType | None | Unset = UNSET
    source_component: None | str | Unset = UNSET
    workflow_id: None | Unset | UUID = UNSET
    activity_id: None | str | Unset = UNSET
    execution_id: None | Unset | UUID = UNSET
    export_format: ExportFormat | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        created_at_gte: None | str | Unset
        if isinstance(self.created_at_gte, Unset):
            created_at_gte = UNSET
        elif isinstance(self.created_at_gte, datetime.datetime):
            created_at_gte = self.created_at_gte.isoformat()
        else:
            created_at_gte = self.created_at_gte

        created_at_lte: None | str | Unset
        if isinstance(self.created_at_lte, Unset):
            created_at_lte = UNSET
        elif isinstance(self.created_at_lte, datetime.datetime):
            created_at_lte = self.created_at_lte.isoformat()
        else:
            created_at_lte = self.created_at_lte

        event_category: None | str | Unset
        if isinstance(self.event_category, Unset):
            event_category = UNSET
        elif isinstance(self.event_category, EventCategory):
            event_category = self.event_category.value
        else:
            event_category = self.event_category

        event_severity: None | str | Unset
        if isinstance(self.event_severity, Unset):
            event_severity = UNSET
        elif isinstance(self.event_severity, EventSeverity):
            event_severity = self.event_severity.value
        else:
            event_severity = self.event_severity

        event_status: None | str | Unset
        if isinstance(self.event_status, Unset):
            event_status = UNSET
        elif isinstance(self.event_status, EventStatus):
            event_status = self.event_status.value
        else:
            event_status = self.event_status

        event_action: None | str | Unset
        if isinstance(self.event_action, Unset):
            event_action = UNSET
        else:
            event_action = self.event_action

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

        source_component: None | str | Unset
        if isinstance(self.source_component, Unset):
            source_component = UNSET
        else:
            source_component = self.source_component

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

        export_format: str | Unset = UNSET
        if not isinstance(self.export_format, Unset):
            export_format = self.export_format.value

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if created_at_gte is not UNSET:
            field_dict["created_at_gte"] = created_at_gte
        if created_at_lte is not UNSET:
            field_dict["created_at_lte"] = created_at_lte
        if event_category is not UNSET:
            field_dict["event_category"] = event_category
        if event_severity is not UNSET:
            field_dict["event_severity"] = event_severity
        if event_status is not UNSET:
            field_dict["event_status"] = event_status
        if event_action is not UNSET:
            field_dict["event_action"] = event_action
        if actor_id is not UNSET:
            field_dict["actor_id"] = actor_id
        if actor_type is not UNSET:
            field_dict["actor_type"] = actor_type
        if source_component is not UNSET:
            field_dict["source_component"] = source_component
        if workflow_id is not UNSET:
            field_dict["workflow_id"] = workflow_id
        if activity_id is not UNSET:
            field_dict["activity_id"] = activity_id
        if execution_id is not UNSET:
            field_dict["execution_id"] = execution_id
        if export_format is not UNSET:
            field_dict["export_format"] = export_format

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)

        def _parse_created_at_gte(data: object) -> datetime.datetime | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                created_at_gte_type_0 = isoparse(data)

                return created_at_gte_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(datetime.datetime | None | Unset, data)

        created_at_gte = _parse_created_at_gte(d.pop("created_at_gte", UNSET))

        def _parse_created_at_lte(data: object) -> datetime.datetime | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                created_at_lte_type_0 = isoparse(data)

                return created_at_lte_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(datetime.datetime | None | Unset, data)

        created_at_lte = _parse_created_at_lte(d.pop("created_at_lte", UNSET))

        def _parse_event_category(data: object) -> EventCategory | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                event_category_type_0 = EventCategory(data)

                return event_category_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(EventCategory | None | Unset, data)

        event_category = _parse_event_category(d.pop("event_category", UNSET))

        def _parse_event_severity(data: object) -> EventSeverity | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                event_severity_type_0 = EventSeverity(data)

                return event_severity_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(EventSeverity | None | Unset, data)

        event_severity = _parse_event_severity(d.pop("event_severity", UNSET))

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

        def _parse_event_action(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        event_action = _parse_event_action(d.pop("event_action", UNSET))

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

        def _parse_source_component(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        source_component = _parse_source_component(d.pop("source_component", UNSET))

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

        _export_format = d.pop("export_format", UNSET)
        export_format: ExportFormat | Unset
        if isinstance(_export_format, Unset):
            export_format = UNSET
        else:
            export_format = ExportFormat(_export_format)

        audit_export_create = cls(
            created_at_gte=created_at_gte,
            created_at_lte=created_at_lte,
            event_category=event_category,
            event_severity=event_severity,
            event_status=event_status,
            event_action=event_action,
            actor_id=actor_id,
            actor_type=actor_type,
            source_component=source_component,
            workflow_id=workflow_id,
            activity_id=activity_id,
            execution_id=execution_id,
            export_format=export_format,
        )

        audit_export_create.additional_properties = d
        return audit_export_create

    @property
    def additional_keys(self) -> list[str]:
        return list(self.additional_properties.keys())

    def __getitem__(self, key: str) -> Any:
        return self.additional_properties[key]

    def __setitem__(self, key: str, value: Any) -> None:
        self.additional_properties[key] = value

    def __delitem__(self, key: str) -> None:
        del self.additional_properties[key]

    def __contains__(self, key: str) -> bool:
        return key in self.additional_properties
