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
    from ..models.workflow_version_read_workflow_definition import WorkflowVersionReadWorkflowDefinition


T = TypeVar("T", bound="WorkflowVersionRead")


@_attrs_define
class WorkflowVersionRead:
    """Schema for workflow version response (GET /workflows/{id}/versions/{version}).

    WorkflowVersion entities are read-only and managed automatically by the system.

    Note: deleted_at and deleted_by are None since soft-deleted versions are excluded from queries.

        Attributes:
            id (UUID):
            workflow_id (UUID):
            version (int):
            schema_version (str):
            workflow_definition (WorkflowVersionReadWorkflowDefinition):
            created_by (UUID):
            created_at (datetime.datetime):
            updated_at (datetime.datetime):
            change_description (None | str | Unset):
            deleted_at (datetime.datetime | None | Unset):
            deleted_by (None | Unset | UUID):
    """

    id: UUID
    workflow_id: UUID
    version: int
    schema_version: str
    workflow_definition: WorkflowVersionReadWorkflowDefinition
    created_by: UUID
    created_at: datetime.datetime
    updated_at: datetime.datetime
    change_description: None | str | Unset = UNSET
    deleted_at: datetime.datetime | None | Unset = UNSET
    deleted_by: None | Unset | UUID = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        id = str(self.id)

        workflow_id = str(self.workflow_id)

        version = self.version

        schema_version = self.schema_version

        workflow_definition = self.workflow_definition.to_dict()

        created_by = str(self.created_by)

        created_at = self.created_at.isoformat()

        updated_at = self.updated_at.isoformat()

        change_description: None | str | Unset
        if isinstance(self.change_description, Unset):
            change_description = UNSET
        else:
            change_description = self.change_description

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
                "id": id,
                "workflow_id": workflow_id,
                "version": version,
                "schema_version": schema_version,
                "workflow_definition": workflow_definition,
                "created_by": created_by,
                "created_at": created_at,
                "updated_at": updated_at,
            }
        )
        if change_description is not UNSET:
            field_dict["change_description"] = change_description
        if deleted_at is not UNSET:
            field_dict["deleted_at"] = deleted_at
        if deleted_by is not UNSET:
            field_dict["deleted_by"] = deleted_by

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.workflow_version_read_workflow_definition import WorkflowVersionReadWorkflowDefinition

        d = dict(src_dict)
        id = UUID(d.pop("id"))

        workflow_id = UUID(d.pop("workflow_id"))

        version = d.pop("version")

        schema_version = d.pop("schema_version")

        workflow_definition = WorkflowVersionReadWorkflowDefinition.from_dict(d.pop("workflow_definition"))

        created_by = UUID(d.pop("created_by"))

        created_at = isoparse(d.pop("created_at"))

        updated_at = isoparse(d.pop("updated_at"))

        def _parse_change_description(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        change_description = _parse_change_description(d.pop("change_description", UNSET))

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

        workflow_version_read = cls(
            id=id,
            workflow_id=workflow_id,
            version=version,
            schema_version=schema_version,
            workflow_definition=workflow_definition,
            created_by=created_by,
            created_at=created_at,
            updated_at=updated_at,
            change_description=change_description,
            deleted_at=deleted_at,
            deleted_by=deleted_by,
        )

        workflow_version_read.additional_properties = d
        return workflow_version_read

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
