from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

from ..types import UNSET, Unset

T = TypeVar("T", bound="RoleAssignmentRead")


@_attrs_define
class RoleAssignmentRead:
    """Response body for a role assignment.

    Attributes:
        id (UUID):
        principal_type (str):
        principal_id (UUID):
        principal_name (str):
        role_name (str):
        role_description (None | str | Unset):
        role_policies (list[str] | Unset):
        project_id (None | Unset | UUID):
        project_name (None | str | Unset):
        is_builtin (bool | Unset):  Default: False.
        created_at (datetime.datetime | None | Unset):
    """

    id: UUID
    principal_type: str
    principal_id: UUID
    principal_name: str
    role_name: str
    role_description: None | str | Unset = UNSET
    role_policies: list[str] | Unset = UNSET
    project_id: None | Unset | UUID = UNSET
    project_name: None | str | Unset = UNSET
    is_builtin: bool | Unset = False
    created_at: datetime.datetime | None | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        id = str(self.id)

        principal_type = self.principal_type

        principal_id = str(self.principal_id)

        principal_name = self.principal_name

        role_name = self.role_name

        role_description: None | str | Unset
        if isinstance(self.role_description, Unset):
            role_description = UNSET
        else:
            role_description = self.role_description

        role_policies: list[str] | Unset = UNSET
        if not isinstance(self.role_policies, Unset):
            role_policies = self.role_policies

        project_id: None | str | Unset
        if isinstance(self.project_id, Unset):
            project_id = UNSET
        elif isinstance(self.project_id, UUID):
            project_id = str(self.project_id)
        else:
            project_id = self.project_id

        project_name: None | str | Unset
        if isinstance(self.project_name, Unset):
            project_name = UNSET
        else:
            project_name = self.project_name

        is_builtin = self.is_builtin

        created_at: None | str | Unset
        if isinstance(self.created_at, Unset):
            created_at = UNSET
        elif isinstance(self.created_at, datetime.datetime):
            created_at = self.created_at.isoformat()
        else:
            created_at = self.created_at

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "id": id,
                "principal_type": principal_type,
                "principal_id": principal_id,
                "principal_name": principal_name,
                "role_name": role_name,
            }
        )
        if role_description is not UNSET:
            field_dict["role_description"] = role_description
        if role_policies is not UNSET:
            field_dict["role_policies"] = role_policies
        if project_id is not UNSET:
            field_dict["project_id"] = project_id
        if project_name is not UNSET:
            field_dict["project_name"] = project_name
        if is_builtin is not UNSET:
            field_dict["is_builtin"] = is_builtin
        if created_at is not UNSET:
            field_dict["created_at"] = created_at

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        id = UUID(d.pop("id"))

        principal_type = d.pop("principal_type")

        principal_id = UUID(d.pop("principal_id"))

        principal_name = d.pop("principal_name")

        role_name = d.pop("role_name")

        def _parse_role_description(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        role_description = _parse_role_description(d.pop("role_description", UNSET))

        role_policies = cast(list[str], d.pop("role_policies", UNSET))

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

        def _parse_project_name(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        project_name = _parse_project_name(d.pop("project_name", UNSET))

        is_builtin = d.pop("is_builtin", UNSET)

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

        role_assignment_read = cls(
            id=id,
            principal_type=principal_type,
            principal_id=principal_id,
            principal_name=principal_name,
            role_name=role_name,
            role_description=role_description,
            role_policies=role_policies,
            project_id=project_id,
            project_name=project_name,
            is_builtin=is_builtin,
            created_at=created_at,
        )

        role_assignment_read.additional_properties = d
        return role_assignment_read

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
