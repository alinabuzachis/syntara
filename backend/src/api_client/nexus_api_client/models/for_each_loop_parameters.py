from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Literal, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="ForEachLoopParameters")


@_attrs_define
class ForEachLoopParameters:
    """Parameters for for_each loop nodes.

    Attributes:
        type_ (Literal['for_each']):
        items (str): Array expression to iterate over
        max_iterations (int | None | Unset): Maximum items to process
    """

    type_: Literal["for_each"]
    items: str
    max_iterations: int | None | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        type_ = self.type_

        items = self.items

        max_iterations: int | None | Unset
        if isinstance(self.max_iterations, Unset):
            max_iterations = UNSET
        else:
            max_iterations = self.max_iterations

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "type": type_,
                "items": items,
            }
        )
        if max_iterations is not UNSET:
            field_dict["max_iterations"] = max_iterations

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        type_ = cast(Literal["for_each"], d.pop("type"))
        if type_ != "for_each":
            raise ValueError(f"type must match const 'for_each', got '{type_}'")

        items = d.pop("items")

        def _parse_max_iterations(data: object) -> int | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(int | None | Unset, data)

        max_iterations = _parse_max_iterations(d.pop("max_iterations", UNSET))

        for_each_loop_parameters = cls(
            type_=type_,
            items=items,
            max_iterations=max_iterations,
        )

        for_each_loop_parameters.additional_properties = d
        return for_each_loop_parameters

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
