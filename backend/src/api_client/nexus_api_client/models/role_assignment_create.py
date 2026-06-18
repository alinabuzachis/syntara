from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.role_principal_type import RolePrincipalType
from ..types import UNSET, Unset

T = TypeVar("T", bound="RoleAssignmentCreate")


@_attrs_define
class RoleAssignmentCreate:
    """Request body for creating a role assignment.

    Attributes:
        principal_type (RolePrincipalType): Discriminator for role assignment targets.
        principal_id (UUID):
        role_name (str):
        project_id (None | Unset | UUID):
    """

    principal_type: RolePrincipalType
    principal_id: UUID
    role_name: str
    project_id: None | Unset | UUID = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        principal_type = self.principal_type.value

        principal_id = str(self.principal_id)

        role_name = self.role_name

        project_id: None | str | Unset
        if isinstance(self.project_id, Unset):
            project_id = UNSET
        elif isinstance(self.project_id, UUID):
            project_id = str(self.project_id)
        else:
            project_id = self.project_id

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "principal_type": principal_type,
                "principal_id": principal_id,
                "role_name": role_name,
            }
        )
        if project_id is not UNSET:
            field_dict["project_id"] = project_id

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        principal_type = RolePrincipalType(d.pop("principal_type"))

        principal_id = UUID(d.pop("principal_id"))

        role_name = d.pop("role_name")

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

        role_assignment_create = cls(
            principal_type=principal_type,
            principal_id=principal_id,
            role_name=role_name,
            project_id=project_id,
        )

        role_assignment_create.additional_properties = d
        return role_assignment_create

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
