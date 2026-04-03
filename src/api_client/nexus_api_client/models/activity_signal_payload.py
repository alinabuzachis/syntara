from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
    from ..models.activity_signal_payload_signal_data import ActivitySignalPayloadSignalData


T = TypeVar("T", bound="ActivitySignalPayload")


@_attrs_define
class ActivitySignalPayload:
    """Generic signal payload for sending arbitrary data to a specific activity within a running workflow execution.

    Attributes:
        signal_data (ActivitySignalPayloadSignalData): Arbitrary JSON data to send to the activity. The structure
            depends on what the activity expects to receive.
    """

    signal_data: ActivitySignalPayloadSignalData
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        signal_data = self.signal_data.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "signal_data": signal_data,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.activity_signal_payload_signal_data import ActivitySignalPayloadSignalData

        d = dict(src_dict)
        signal_data = ActivitySignalPayloadSignalData.from_dict(d.pop("signal_data"))

        activity_signal_payload = cls(
            signal_data=signal_data,
        )

        activity_signal_payload.additional_properties = d
        return activity_signal_payload

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
