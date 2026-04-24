from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

from ..types import UNSET, Unset

T = TypeVar("T", bound="UserRead")


@_attrs_define
class UserRead:
    """Schema for user response (GET /users/{id}).

    Includes all user fields except sensitive data (password_hash, preferences).

        Attributes:
            id (UUID):
            username (str):
            email (str):
            full_name (str):
            is_active (bool):
            created_at (datetime.datetime):
            updated_at (datetime.datetime):
            last_login (datetime.datetime | None | Unset):
    """

    id: UUID
    username: str
    email: str
    full_name: str
    is_active: bool
    created_at: datetime.datetime
    updated_at: datetime.datetime
    last_login: datetime.datetime | None | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        id = str(self.id)

        username = self.username

        email = self.email

        full_name = self.full_name

        is_active = self.is_active

        created_at = self.created_at.isoformat()

        updated_at = self.updated_at.isoformat()

        last_login: None | str | Unset
        if isinstance(self.last_login, Unset):
            last_login = UNSET
        elif isinstance(self.last_login, datetime.datetime):
            last_login = self.last_login.isoformat()
        else:
            last_login = self.last_login

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "id": id,
                "username": username,
                "email": email,
                "full_name": full_name,
                "is_active": is_active,
                "created_at": created_at,
                "updated_at": updated_at,
            }
        )
        if last_login is not UNSET:
            field_dict["last_login"] = last_login

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        id = UUID(d.pop("id"))

        username = d.pop("username")

        email = d.pop("email")

        full_name = d.pop("full_name")

        is_active = d.pop("is_active")

        created_at = isoparse(d.pop("created_at"))

        updated_at = isoparse(d.pop("updated_at"))

        def _parse_last_login(data: object) -> datetime.datetime | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                last_login_type_0 = isoparse(data)

                return last_login_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(datetime.datetime | None | Unset, data)

        last_login = _parse_last_login(d.pop("last_login", UNSET))

        user_read = cls(
            id=id,
            username=username,
            email=email,
            full_name=full_name,
            is_active=is_active,
            created_at=created_at,
            updated_at=updated_at,
            last_login=last_login,
        )

        user_read.additional_properties = d
        return user_read

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
