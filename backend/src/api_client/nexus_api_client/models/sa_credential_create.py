from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.service_account_credential_type import ServiceAccountCredentialType
from ..types import UNSET, Unset

T = TypeVar("T", bound="SACredentialCreate")


@_attrs_define
class SACredentialCreate:
    """Schema for creating a new service account credential.

    Attributes:
        credential_type (ServiceAccountCredentialType): Type of credential issued for a service account.
        grace_period_seconds (int | Unset): Duration (seconds) old secret remains valid after rotation Default: 3600.
    """

    credential_type: ServiceAccountCredentialType
    grace_period_seconds: int | Unset = 3600
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        credential_type = self.credential_type.value

        grace_period_seconds = self.grace_period_seconds

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "credential_type": credential_type,
            }
        )
        if grace_period_seconds is not UNSET:
            field_dict["grace_period_seconds"] = grace_period_seconds

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        credential_type = ServiceAccountCredentialType(d.pop("credential_type"))

        grace_period_seconds = d.pop("grace_period_seconds", UNSET)

        sa_credential_create = cls(
            credential_type=credential_type,
            grace_period_seconds=grace_period_seconds,
        )

        sa_credential_create.additional_properties = d
        return sa_credential_create

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
