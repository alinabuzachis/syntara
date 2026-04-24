from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

from ..types import UNSET, Unset

T = TypeVar("T", bound="ProjectRoleAssignmentRead")


@_attrs_define
class ProjectRoleAssignmentRead:
    """Response body for a project role assignment.

    Attributes:
        id (UUID):
        user_id (UUID):
        project_id (UUID):
        role_name (str):
        username (str | Unset):  Default: ''.
        created_at (datetime.datetime | None | Unset):
    """

    id: UUID
    user_id: UUID
    project_id: UUID
    role_name: str
    username: str | Unset = ""
    created_at: datetime.datetime | None | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        id = str(self.id)

        user_id = str(self.user_id)

        project_id = str(self.project_id)

        role_name = self.role_name

        username = self.username

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
                "user_id": user_id,
                "project_id": project_id,
                "role_name": role_name,
            }
        )
        if username is not UNSET:
            field_dict["username"] = username
        if created_at is not UNSET:
            field_dict["created_at"] = created_at

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        id = UUID(d.pop("id"))

        user_id = UUID(d.pop("user_id"))

        project_id = UUID(d.pop("project_id"))

        role_name = d.pop("role_name")

        username = d.pop("username", UNSET)

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

        project_role_assignment_read = cls(
            id=id,
            user_id=user_id,
            project_id=project_id,
            role_name=role_name,
            username=username,
            created_at=created_at,
        )

        project_role_assignment_read.additional_properties = d
        return project_role_assignment_read

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
