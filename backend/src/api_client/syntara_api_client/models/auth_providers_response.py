from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.auth_provider_info import AuthProviderInfo


T = TypeVar("T", bound="AuthProvidersResponse")


@_attrs_define
class AuthProvidersResponse:
    """Response for the public providers listing endpoint.

    Attributes:
        resources (list[AuthProviderInfo] | Unset): Enabled identity providers
    """

    resources: list[AuthProviderInfo] | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        resources: list[dict[str, Any]] | Unset = UNSET
        if not isinstance(self.resources, Unset):
            resources = []
            for resources_item_data in self.resources:
                resources_item = resources_item_data.to_dict()
                resources.append(resources_item)

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if resources is not UNSET:
            field_dict["resources"] = resources

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.auth_provider_info import AuthProviderInfo

        d = dict(src_dict)
        _resources = d.pop("resources", UNSET)
        resources: list[AuthProviderInfo] | Unset = UNSET
        if _resources is not UNSET:
            resources = []
            for resources_item_data in _resources:
                resources_item = AuthProviderInfo.from_dict(resources_item_data)

                resources.append(resources_item)

        auth_providers_response = cls(
            resources=resources,
        )

        auth_providers_response.additional_properties = d
        return auth_providers_response

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
