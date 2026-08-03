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
    from ..models.role_read_labels import RoleReadLabels


T = TypeVar("T", bound="RoleRead")


@_attrs_define
class RoleRead:
    """Response body for a role.

    Attributes:
        id (UUID):
        name (str):
        is_system_scoped (bool): True when the role is not scoped to a specific project.
        description (None | str | Unset):
        policies (list[str] | Unset):
        is_builtin (bool | Unset):  Default: False.
        project_id (None | Unset | UUID):
        scope (str | Unset):  Default: 'system'.
        labels (RoleReadLabels | Unset):
        created_at (datetime.datetime | None | Unset):
        updated_at (datetime.datetime | None | Unset):
    """

    id: UUID
    name: str
    is_system_scoped: bool
    description: None | str | Unset = UNSET
    policies: list[str] | Unset = UNSET
    is_builtin: bool | Unset = False
    project_id: None | Unset | UUID = UNSET
    scope: str | Unset = "system"
    labels: RoleReadLabels | Unset = UNSET
    created_at: datetime.datetime | None | Unset = UNSET
    updated_at: datetime.datetime | None | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        id = str(self.id)

        name = self.name

        is_system_scoped = self.is_system_scoped

        description: None | str | Unset
        if isinstance(self.description, Unset):
            description = UNSET
        else:
            description = self.description

        policies: list[str] | Unset = UNSET
        if not isinstance(self.policies, Unset):
            policies = self.policies

        is_builtin = self.is_builtin

        project_id: None | str | Unset
        if isinstance(self.project_id, Unset):
            project_id = UNSET
        elif isinstance(self.project_id, UUID):
            project_id = str(self.project_id)
        else:
            project_id = self.project_id

        scope = self.scope

        labels: dict[str, Any] | Unset = UNSET
        if not isinstance(self.labels, Unset):
            labels = self.labels.to_dict()

        created_at: None | str | Unset
        if isinstance(self.created_at, Unset):
            created_at = UNSET
        elif isinstance(self.created_at, datetime.datetime):
            created_at = self.created_at.isoformat()
        else:
            created_at = self.created_at

        updated_at: None | str | Unset
        if isinstance(self.updated_at, Unset):
            updated_at = UNSET
        elif isinstance(self.updated_at, datetime.datetime):
            updated_at = self.updated_at.isoformat()
        else:
            updated_at = self.updated_at

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "id": id,
                "name": name,
                "is_system_scoped": is_system_scoped,
            }
        )
        if description is not UNSET:
            field_dict["description"] = description
        if policies is not UNSET:
            field_dict["policies"] = policies
        if is_builtin is not UNSET:
            field_dict["is_builtin"] = is_builtin
        if project_id is not UNSET:
            field_dict["project_id"] = project_id
        if scope is not UNSET:
            field_dict["scope"] = scope
        if labels is not UNSET:
            field_dict["labels"] = labels
        if created_at is not UNSET:
            field_dict["created_at"] = created_at
        if updated_at is not UNSET:
            field_dict["updated_at"] = updated_at

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.role_read_labels import RoleReadLabels

        d = dict(src_dict)
        id = UUID(d.pop("id"))

        name = d.pop("name")

        is_system_scoped = d.pop("is_system_scoped")

        def _parse_description(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        description = _parse_description(d.pop("description", UNSET))

        policies = cast(list[str], d.pop("policies", UNSET))

        is_builtin = d.pop("is_builtin", UNSET)

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

        scope = d.pop("scope", UNSET)

        _labels = d.pop("labels", UNSET)
        labels: RoleReadLabels | Unset
        if isinstance(_labels, Unset):
            labels = UNSET
        else:
            labels = RoleReadLabels.from_dict(_labels)

        def _parse_created_at(data: object) -> datetime.datetime | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                created_at_type_0 = isoparse(data)

                return created_at_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(datetime.datetime | None | Unset, data)

        created_at = _parse_created_at(d.pop("created_at", UNSET))

        def _parse_updated_at(data: object) -> datetime.datetime | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                updated_at_type_0 = isoparse(data)

                return updated_at_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(datetime.datetime | None | Unset, data)

        updated_at = _parse_updated_at(d.pop("updated_at", UNSET))

        role_read = cls(
            id=id,
            name=name,
            is_system_scoped=is_system_scoped,
            description=description,
            policies=policies,
            is_builtin=is_builtin,
            project_id=project_id,
            scope=scope,
            labels=labels,
            created_at=created_at,
            updated_at=updated_at,
        )

        role_read.additional_properties = d
        return role_read

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
