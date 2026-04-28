from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="AuthProviderInfo")


@_attrs_define
class AuthProviderInfo:
    """Public identity provider info for the login page.

    Attributes:
        id (str): Provider UUID
        name (str): Provider display name
        provider_type (str): Provider type (e.g. oidc)
        provider_template (None | str | Unset): Provider template (e.g. microsoft_entra, aap)
    """

    id: str
    name: str
    provider_type: str
    provider_template: None | str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        name = self.name

        provider_type = self.provider_type

        provider_template: None | str | Unset
        if isinstance(self.provider_template, Unset):
            provider_template = UNSET
        else:
            provider_template = self.provider_template

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "id": id,
                "name": name,
                "provider_type": provider_type,
            }
        )
        if provider_template is not UNSET:
            field_dict["provider_template"] = provider_template

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        id = d.pop("id")

        name = d.pop("name")

        provider_type = d.pop("provider_type")

        def _parse_provider_template(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        provider_template = _parse_provider_template(d.pop("provider_template", UNSET))

        auth_provider_info = cls(
            id=id,
            name=name,
            provider_type=provider_type,
            provider_template=provider_template,
        )

        auth_provider_info.additional_properties = d
        return auth_provider_info

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
