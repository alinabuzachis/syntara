from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.integration_status import IntegrationStatus
from ..types import UNSET, Unset

T = TypeVar("T", bound="IntegrationStatusPatch")


@_attrs_define
class IntegrationStatusPatch:
    """Schema for service-to-service status updates (not user-facing).

    Used by internal components (e.g. agent orchestrator) to update
    enabled/validation_status/validation_error together in a single call.

        Attributes:
            enabled (bool | None | Unset): Whether the integration is active
            validation_status (IntegrationStatus | None | Unset): Validation status of the integration
            validation_error (None | str | Unset): Error message from last validation attempt
    """

    enabled: bool | None | Unset = UNSET
    validation_status: IntegrationStatus | None | Unset = UNSET
    validation_error: None | str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        enabled: bool | None | Unset
        if isinstance(self.enabled, Unset):
            enabled = UNSET
        else:
            enabled = self.enabled

        validation_status: None | str | Unset
        if isinstance(self.validation_status, Unset):
            validation_status = UNSET
        elif isinstance(self.validation_status, IntegrationStatus):
            validation_status = self.validation_status.value
        else:
            validation_status = self.validation_status

        validation_error: None | str | Unset
        if isinstance(self.validation_error, Unset):
            validation_error = UNSET
        else:
            validation_error = self.validation_error

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if enabled is not UNSET:
            field_dict["enabled"] = enabled
        if validation_status is not UNSET:
            field_dict["validation_status"] = validation_status
        if validation_error is not UNSET:
            field_dict["validation_error"] = validation_error

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)

        def _parse_enabled(data: object) -> bool | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(bool | None | Unset, data)

        enabled = _parse_enabled(d.pop("enabled", UNSET))

        def _parse_validation_status(data: object) -> IntegrationStatus | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                validation_status_type_0 = IntegrationStatus(data)

                return validation_status_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(IntegrationStatus | None | Unset, data)

        validation_status = _parse_validation_status(d.pop("validation_status", UNSET))

        def _parse_validation_error(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        validation_error = _parse_validation_error(d.pop("validation_error", UNSET))

        integration_status_patch = cls(
            enabled=enabled,
            validation_status=validation_status,
            validation_error=validation_error,
        )

        integration_status_patch.additional_properties = d
        return integration_status_patch

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
