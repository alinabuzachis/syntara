from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="CurrentActivity")


@_attrs_define
class CurrentActivity:
    """Currently executing activity information.

    Attributes:
        activity_name (str): Name of the activity
        temporal_activity_id (str): Temporal activity ID
        iteration (int | None | Unset): Iteration number for loops
    """

    activity_name: str
    temporal_activity_id: str
    iteration: int | None | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        activity_name = self.activity_name

        temporal_activity_id = self.temporal_activity_id

        iteration: int | None | Unset
        if isinstance(self.iteration, Unset):
            iteration = UNSET
        else:
            iteration = self.iteration

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "activity_name": activity_name,
                "temporal_activity_id": temporal_activity_id,
            }
        )
        if iteration is not UNSET:
            field_dict["iteration"] = iteration

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        activity_name = d.pop("activity_name")

        temporal_activity_id = d.pop("temporal_activity_id")

        def _parse_iteration(data: object) -> int | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(int | None | Unset, data)

        iteration = _parse_iteration(d.pop("iteration", UNSET))

        current_activity = cls(
            activity_name=activity_name,
            temporal_activity_id=temporal_activity_id,
            iteration=iteration,
        )

        current_activity.additional_properties = d
        return current_activity

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
