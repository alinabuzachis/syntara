from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from dateutil.parser import isoparse

from ..models.tool_parameter_type import ToolParameterType
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.tool_parameter_default_value_type_0 import ToolParameterDefaultValueType0
    from ..models.tool_parameter_example_value_type_0 import ToolParameterExampleValueType0
    from ..models.tool_parameter_labels import ToolParameterLabels


T = TypeVar("T", bound="ToolParameter")


@_attrs_define
class ToolParameter:
    """Tool parameter definition stored in database.

    Represents a parameter that a tool accepts, with its type, validation rules,
    and example values.

    Inherits from BaseResource:
        id: UUID primary key
        created_at: Creation timestamp
        updated_at: Last update timestamp
        labels: Optional key-value metadata

        Attributes:
            tool_id (UUID):
            name (str): Parameter name
            type_ (ToolParameterType): Parameter types for tools.
            description (str): Parameter description
            required (bool): Whether this parameter is required
            id (UUID | Unset): Unique identifier for the resource
            created_at (datetime.datetime | Unset): Timestamp when resource was created
            updated_at (datetime.datetime | Unset): Timestamp when resource was last updated
            labels (ToolParameterLabels | Unset): Key-value pairs for resource labeling and filtering
            default_value (None | ToolParameterDefaultValueType0 | Unset): Default value for the parameter
            example_value (None | ToolParameterExampleValueType0 | Unset): Example value for the parameter
    """

    tool_id: UUID
    name: str
    type_: ToolParameterType
    description: str
    required: bool
    id: UUID | Unset = UNSET
    created_at: datetime.datetime | Unset = UNSET
    updated_at: datetime.datetime | Unset = UNSET
    labels: ToolParameterLabels | Unset = UNSET
    default_value: None | ToolParameterDefaultValueType0 | Unset = UNSET
    example_value: None | ToolParameterExampleValueType0 | Unset = UNSET

    def to_dict(self) -> dict[str, Any]:
        from ..models.tool_parameter_default_value_type_0 import ToolParameterDefaultValueType0
        from ..models.tool_parameter_example_value_type_0 import ToolParameterExampleValueType0

        tool_id = str(self.tool_id)

        name = self.name

        type_ = self.type_.value

        description = self.description

        required = self.required

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

        default_value: dict[str, Any] | None | Unset
        if isinstance(self.default_value, Unset):
            default_value = UNSET
        elif isinstance(self.default_value, ToolParameterDefaultValueType0):
            default_value = self.default_value.to_dict()
        else:
            default_value = self.default_value

        example_value: dict[str, Any] | None | Unset
        if isinstance(self.example_value, Unset):
            example_value = UNSET
        elif isinstance(self.example_value, ToolParameterExampleValueType0):
            example_value = self.example_value.to_dict()
        else:
            example_value = self.example_value

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "tool_id": tool_id,
                "name": name,
                "type": type_,
                "description": description,
                "required": required,
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
        if default_value is not UNSET:
            field_dict["default_value"] = default_value
        if example_value is not UNSET:
            field_dict["example_value"] = example_value

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.tool_parameter_default_value_type_0 import ToolParameterDefaultValueType0
        from ..models.tool_parameter_example_value_type_0 import ToolParameterExampleValueType0
        from ..models.tool_parameter_labels import ToolParameterLabels

        d = dict(src_dict)
        tool_id = UUID(d.pop("tool_id"))

        name = d.pop("name")

        type_ = ToolParameterType(d.pop("type"))

        description = d.pop("description")

        required = d.pop("required")

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
        labels: ToolParameterLabels | Unset
        if isinstance(_labels, Unset):
            labels = UNSET
        else:
            labels = ToolParameterLabels.from_dict(_labels)

        def _parse_default_value(data: object) -> None | ToolParameterDefaultValueType0 | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                default_value_type_0 = ToolParameterDefaultValueType0.from_dict(data)

                return default_value_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | ToolParameterDefaultValueType0 | Unset, data)

        default_value = _parse_default_value(d.pop("default_value", UNSET))

        def _parse_example_value(data: object) -> None | ToolParameterExampleValueType0 | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                example_value_type_0 = ToolParameterExampleValueType0.from_dict(data)

                return example_value_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | ToolParameterExampleValueType0 | Unset, data)

        example_value = _parse_example_value(d.pop("example_value", UNSET))

        tool_parameter = cls(
            tool_id=tool_id,
            name=name,
            type_=type_,
            description=description,
            required=required,
            id=id,
            created_at=created_at,
            updated_at=updated_at,
            labels=labels,
            default_value=default_value,
            example_value=example_value,
        )

        return tool_parameter
