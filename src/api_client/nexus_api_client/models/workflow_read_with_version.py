from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.workflow_read_with_version_labels import WorkflowReadWithVersionLabels
    from ..models.workflow_version_read import WorkflowVersionRead


T = TypeVar("T", bound="WorkflowReadWithVersion")


@_attrs_define
class WorkflowReadWithVersion:
    """Schema for workflow response with current version details.

    Used when retrieving a single workflow to include the active workflow definition.

        Attributes:
            name (str): Workflow name
            id (UUID):
            current_version (int):
            is_enabled (bool):
            created_by (UUID):
            created_at (datetime.datetime):
            updated_at (datetime.datetime):
            version (WorkflowVersionRead): Schema for workflow version response (GET /workflows/{id}/versions/{version}).

                WorkflowVersion entities are read-only and managed automatically by the system.

                Note: deleted_at and deleted_by are None since soft-deleted versions are excluded from queries.
            description (None | str | Unset): Workflow description
            labels (WorkflowReadWithVersionLabels | Unset): Workflow labels
            project_id (None | Unset | UUID):
            deleted_at (datetime.datetime | None | Unset):
            deleted_by (None | Unset | UUID):
    """

    name: str
    id: UUID
    current_version: int
    is_enabled: bool
    created_by: UUID
    created_at: datetime.datetime
    updated_at: datetime.datetime
    version: WorkflowVersionRead
    description: None | str | Unset = UNSET
    labels: WorkflowReadWithVersionLabels | Unset = UNSET
    project_id: None | Unset | UUID = UNSET
    deleted_at: datetime.datetime | None | Unset = UNSET
    deleted_by: None | Unset | UUID = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        name = self.name

        id = str(self.id)

        current_version = self.current_version

        is_enabled = self.is_enabled

        created_by = str(self.created_by)

        created_at = self.created_at.isoformat()

        updated_at = self.updated_at.isoformat()

        version = self.version.to_dict()

        description: None | str | Unset
        if isinstance(self.description, Unset):
            description = UNSET
        else:
            description = self.description

        labels: dict[str, Any] | Unset = UNSET
        if not isinstance(self.labels, Unset):
            labels = self.labels.to_dict()

        project_id: None | str | Unset
        if isinstance(self.project_id, Unset):
            project_id = UNSET
        elif isinstance(self.project_id, UUID):
            project_id = str(self.project_id)
        else:
            project_id = self.project_id

        deleted_at: None | str | Unset
        if isinstance(self.deleted_at, Unset):
            deleted_at = UNSET
        elif isinstance(self.deleted_at, datetime.datetime):
            deleted_at = self.deleted_at.isoformat()
        else:
            deleted_at = self.deleted_at

        deleted_by: None | str | Unset
        if isinstance(self.deleted_by, Unset):
            deleted_by = UNSET
        elif isinstance(self.deleted_by, UUID):
            deleted_by = str(self.deleted_by)
        else:
            deleted_by = self.deleted_by

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "name": name,
                "id": id,
                "current_version": current_version,
                "is_enabled": is_enabled,
                "created_by": created_by,
                "created_at": created_at,
                "updated_at": updated_at,
                "version": version,
            }
        )
        if description is not UNSET:
            field_dict["description"] = description
        if labels is not UNSET:
            field_dict["labels"] = labels
        if project_id is not UNSET:
            field_dict["project_id"] = project_id
        if deleted_at is not UNSET:
            field_dict["deleted_at"] = deleted_at
        if deleted_by is not UNSET:
            field_dict["deleted_by"] = deleted_by

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.workflow_read_with_version_labels import WorkflowReadWithVersionLabels
        from ..models.workflow_version_read import WorkflowVersionRead

        d = dict(src_dict)
        name = d.pop("name")

        id = UUID(d.pop("id"))

        current_version = d.pop("current_version")

        is_enabled = d.pop("is_enabled")

        created_by = UUID(d.pop("created_by"))

        created_at = isoparse(d.pop("created_at"))

        updated_at = isoparse(d.pop("updated_at"))

        version = WorkflowVersionRead.from_dict(d.pop("version"))

        def _parse_description(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        description = _parse_description(d.pop("description", UNSET))

        _labels = d.pop("labels", UNSET)
        labels: WorkflowReadWithVersionLabels | Unset
        if isinstance(_labels, Unset):
            labels = UNSET
        else:
            labels = WorkflowReadWithVersionLabels.from_dict(_labels)

        def _parse_project_id(data: object) -> None | Unset | UUID:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                project_id_type_0 = UUID(data)

                return project_id_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | Unset | UUID, data)

        project_id = _parse_project_id(d.pop("project_id", UNSET))

        def _parse_deleted_at(data: object) -> datetime.datetime | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                deleted_at_type_0 = isoparse(data)

                return deleted_at_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(datetime.datetime | None | Unset, data)

        deleted_at = _parse_deleted_at(d.pop("deleted_at", UNSET))

        def _parse_deleted_by(data: object) -> None | Unset | UUID:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                deleted_by_type_0 = UUID(data)

                return deleted_by_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | Unset | UUID, data)

        deleted_by = _parse_deleted_by(d.pop("deleted_by", UNSET))

        workflow_read_with_version = cls(
            name=name,
            id=id,
            current_version=current_version,
            is_enabled=is_enabled,
            created_by=created_by,
            created_at=created_at,
            updated_at=updated_at,
            version=version,
            description=description,
            labels=labels,
            project_id=project_id,
            deleted_at=deleted_at,
            deleted_by=deleted_by,
        )

        workflow_read_with_version.additional_properties = d
        return workflow_read_with_version

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
