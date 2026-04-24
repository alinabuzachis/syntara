from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

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
            email (str): Unique email address
            full_name (str): User's display name
            password (str): Plaintext password (will be hashed)
            is_active (bool | Unset): Account activation status Default: True.
    """

    username: str
    email: str
    full_name: str
    password: str
    is_active: bool | Unset = True
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        username = self.username

        email = self.email

        full_name = self.full_name

        password = self.password

        is_active = self.is_active

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "username": username,
                "email": email,
                "full_name": full_name,
                "password": password,
            }
        )
        if is_active is not UNSET:
            field_dict["is_active"] = is_active

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        username = d.pop("username")

        email = d.pop("email")

        full_name = d.pop("full_name")

        password = d.pop("password")

        is_active = d.pop("is_active", UNSET)

        user_create = cls(
            username=username,
            email=email,
            full_name=full_name,
            password=password,
            is_active=is_active,
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
