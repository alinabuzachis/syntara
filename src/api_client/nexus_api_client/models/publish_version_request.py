from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="PublishVersionRequest")


@_attrs_define
class PublishVersionRequest:
    """Request body for publishing a workflow version.

    Attributes:
        publish_name (None | str | Unset): Optional name for this published version
        change_description (None | str | Unset): Description of changes in this version
    """

    publish_name: None | str | Unset = UNSET
    change_description: None | str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        publish_name: None | str | Unset
        if isinstance(self.publish_name, Unset):
            publish_name = UNSET
        else:
            publish_name = self.publish_name

        change_description: None | str | Unset
        if isinstance(self.change_description, Unset):
            change_description = UNSET
        else:
            change_description = self.change_description

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if publish_name is not UNSET:
            field_dict["publish_name"] = publish_name
        if change_description is not UNSET:
            field_dict["change_description"] = change_description

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)

        def _parse_publish_name(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        publish_name = _parse_publish_name(d.pop("publish_name", UNSET))

        def _parse_change_description(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        change_description = _parse_change_description(d.pop("change_description", UNSET))

        publish_version_request = cls(
            publish_name=publish_name,
            change_description=change_description,
        )

        publish_version_request.additional_properties = d
        return publish_version_request

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
