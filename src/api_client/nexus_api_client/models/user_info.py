from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="UserInfo")


@_attrs_define
class UserInfo:
    """Current user information derived from access token claims.

    Attributes:
        id (str): User UUID
        username (str): Username
        email (str): User email
        groups (list[str] | Unset): Group memberships
        rp_logout_enabled (bool | Unset): Whether RP-initiated logout is enabled for this user's current session
            Default: False.
    """

    id: str
    username: str
    email: str
    groups: list[str] | Unset = UNSET
    rp_logout_enabled: bool | Unset = False
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        username = self.username

        email = self.email

        groups: list[str] | Unset = UNSET
        if not isinstance(self.groups, Unset):
            groups = self.groups

        rp_logout_enabled = self.rp_logout_enabled

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "id": id,
                "username": username,
                "email": email,
            }
        )
        if groups is not UNSET:
            field_dict["groups"] = groups
        if rp_logout_enabled is not UNSET:
            field_dict["rp_logout_enabled"] = rp_logout_enabled

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        id = d.pop("id")

        username = d.pop("username")

        email = d.pop("email")

        groups = cast(list[str], d.pop("groups", UNSET))

        rp_logout_enabled = d.pop("rp_logout_enabled", UNSET)

        user_info = cls(
            id=id,
            username=username,
            email=email,
            groups=groups,
            rp_logout_enabled=rp_logout_enabled,
        )

        user_info.additional_properties = d
        return user_info

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
