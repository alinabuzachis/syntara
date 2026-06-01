from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="RevocationResponse")


@_attrs_define
class RevocationResponse:
    """Response schema for revocation operations.

    Attributes:
        message (str):
        sessions_revoked (int | None | Unset):
    """

    message: str
    sessions_revoked: int | None | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        message = self.message

        sessions_revoked: int | None | Unset
        if isinstance(self.sessions_revoked, Unset):
            sessions_revoked = UNSET
        else:
            sessions_revoked = self.sessions_revoked

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "message": message,
            }
        )
        if sessions_revoked is not UNSET:
            field_dict["sessions_revoked"] = sessions_revoked

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        message = d.pop("message")

        def _parse_sessions_revoked(data: object) -> int | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(int | None | Unset, data)

        sessions_revoked = _parse_sessions_revoked(d.pop("sessions_revoked", UNSET))

        revocation_response = cls(
            message=message,
            sessions_revoked=sessions_revoked,
        )

        revocation_response.additional_properties = d
        return revocation_response

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
