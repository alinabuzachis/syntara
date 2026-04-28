from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="UserCreate")


@_attrs_define
class UserCreate:
    """Schema for creating a new local user (POST /users).

    Excludes auto-generated fields: id, created_at, updated_at, last_login, preferences.

        Attributes:
            username (str): Unique username
            full_name (str): User's display name
            password (str): Plaintext password (will be hashed)
            email (None | str | Unset): Email address
            is_enabled (bool | Unset): Whether the user account is enabled Default: True.
    """

    username: str
    full_name: str
    password: str
    email: None | str | Unset = UNSET
    is_enabled: bool | Unset = True
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        username = self.username

        full_name = self.full_name

        password = self.password

        email: None | str | Unset
        if isinstance(self.email, Unset):
            email = UNSET
        else:
            email = self.email

        is_enabled = self.is_enabled

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "username": username,
                "full_name": full_name,
                "password": password,
            }
        )
        if email is not UNSET:
            field_dict["email"] = email
        if is_enabled is not UNSET:
            field_dict["is_enabled"] = is_enabled

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        username = d.pop("username")

        full_name = d.pop("full_name")

        password = d.pop("password")

        def _parse_email(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        email = _parse_email(d.pop("email", UNSET))

        is_enabled = d.pop("is_enabled", UNSET)

        user_create = cls(
            username=username,
            full_name=full_name,
            password=password,
            email=email,
            is_enabled=is_enabled,
        )

        user_create.additional_properties = d
        return user_create

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
