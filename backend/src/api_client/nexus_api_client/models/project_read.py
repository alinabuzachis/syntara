from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from dateutil.parser import isoparse

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.project_read_labels import ProjectReadLabels


T = TypeVar("T", bound="ProjectRead")


@_attrs_define
class ProjectRead:
    """Response body for a project.

    Attributes:
        name (str):
        id (UUID | Unset): Unique identifier for the resource Example: 550e8400-e29b-41d4-a716-446655440000.
        created_at (datetime.datetime | Unset): Timestamp when resource was created Example: 2025-10-09T12:00:00Z.
        updated_at (datetime.datetime | Unset): Timestamp when resource was last updated Example: 2025-10-09T12:30:00Z.
        labels (ProjectReadLabels | Unset): Key-value pairs for resource labeling and filtering Example: {'environment':
            'production', 'region': 'us-east-1', 'team': 'platform'}.
        description (None | str | Unset):
        is_default (bool | Unset):  Default: False.
        is_builtin (bool | Unset):  Default: False.
    """

    name: str
    id: UUID | Unset = UNSET
    created_at: datetime.datetime | Unset = UNSET
    updated_at: datetime.datetime | Unset = UNSET
    labels: ProjectReadLabels | Unset = UNSET
    description: None | str | Unset = UNSET
    is_default: bool | Unset = False
    is_builtin: bool | Unset = False

    def to_dict(self) -> dict[str, Any]:
        name = self.name

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

        description: None | str | Unset
        if isinstance(self.description, Unset):
            description = UNSET
        else:
            description = self.description

        is_default = self.is_default

        is_builtin = self.is_builtin

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "name": name,
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
        if description is not UNSET:
            field_dict["description"] = description
        if is_default is not UNSET:
            field_dict["is_default"] = is_default
        if is_builtin is not UNSET:
            field_dict["is_builtin"] = is_builtin

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.project_read_labels import ProjectReadLabels

        d = dict(src_dict)
        name = d.pop("name")

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
        labels: ProjectReadLabels | Unset
        if isinstance(_labels, Unset):
            labels = UNSET
        else:
            labels = ProjectReadLabels.from_dict(_labels)

        def _parse_description(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        description = _parse_description(d.pop("description", UNSET))

        is_default = d.pop("is_default", UNSET)

        is_builtin = d.pop("is_builtin", UNSET)

        project_read = cls(
            name=name,
            id=id,
            created_at=created_at,
            updated_at=updated_at,
            labels=labels,
            description=description,
            is_default=is_default,
            is_builtin=is_builtin,
        )

        return project_read
