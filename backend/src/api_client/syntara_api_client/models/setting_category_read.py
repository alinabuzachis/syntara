from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="SettingCategoryRead")


@_attrs_define
class SettingCategoryRead:
    """Read schema for a setting category.

    Attributes:
        slug (str):
        name (str):
        description (None | str):
        group_names (list[str]):
        display_order (int | Unset):  Default: 0.
    """

    slug: str
    name: str
    description: None | str
    group_names: list[str]
    display_order: int | Unset = 0
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        slug = self.slug

        name = self.name

        description: None | str
        description = self.description

        group_names = self.group_names

        display_order = self.display_order

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "slug": slug,
                "name": name,
                "description": description,
                "group_names": group_names,
            }
        )
        if display_order is not UNSET:
            field_dict["display_order"] = display_order

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        slug = d.pop("slug")

        name = d.pop("name")

        def _parse_description(data: object) -> None | str:
            if data is None:
                return data
            return cast(None | str, data)

        description = _parse_description(d.pop("description"))

        group_names = cast(list[str], d.pop("group_names"))

        display_order = d.pop("display_order", UNSET)

        setting_category_read = cls(
            slug=slug,
            name=name,
            description=description,
            group_names=group_names,
            display_order=display_order,
        )

        setting_category_read.additional_properties = d
        return setting_category_read

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
