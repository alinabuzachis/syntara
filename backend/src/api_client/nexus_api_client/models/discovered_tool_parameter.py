from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="DiscoveredToolParameter")


@_attrs_define
class DiscoveredToolParameter:
    """A parameter belonging to a discovered tool.

    Attributes:
        name (str):
        type_ (str | Unset):  Default: 'string'.
        description (str | Unset):  Default: ''.
        required (bool | Unset):  Default: False.
    """

    name: str
    type_: str | Unset = "string"
    description: str | Unset = ""
    required: bool | Unset = False
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        name = self.name

        type_ = self.type_

        description = self.description

        required = self.required

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "name": name,
            }
        )
        if type_ is not UNSET:
            field_dict["type"] = type_
        if description is not UNSET:
            field_dict["description"] = description
        if required is not UNSET:
            field_dict["required"] = required

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        name = d.pop("name")

        type_ = d.pop("type", UNSET)

        description = d.pop("description", UNSET)

        required = d.pop("required", UNSET)

        discovered_tool_parameter = cls(
            name=name,
            type_=type_,
            description=description,
            required=required,
        )

        discovered_tool_parameter.additional_properties = d
        return discovered_tool_parameter

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
