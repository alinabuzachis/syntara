from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.switch_case import SwitchCase


T = TypeVar("T", bound="SwitchNodeParameters")


@_attrs_define
class SwitchNodeParameters:
    """Parameters for switch (multi-branch) control nodes.

    Attributes:
        cases (list[SwitchCase]): Ordered list of cases
        default_port (None | str | Unset): Port to route to when no case matches
    """

    cases: list[SwitchCase]
    default_port: None | str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        cases = []
        for cases_item_data in self.cases:
            cases_item = cases_item_data.to_dict()
            cases.append(cases_item)

        default_port: None | str | Unset
        if isinstance(self.default_port, Unset):
            default_port = UNSET
        else:
            default_port = self.default_port

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "cases": cases,
            }
        )
        if default_port is not UNSET:
            field_dict["default_port"] = default_port

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.switch_case import SwitchCase

        d = dict(src_dict)
        cases = []
        _cases = d.pop("cases")
        for cases_item_data in _cases:
            cases_item = SwitchCase.from_dict(cases_item_data)

            cases.append(cases_item)

        def _parse_default_port(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        default_port = _parse_default_port(d.pop("default_port", UNSET))

        switch_node_parameters = cls(
            cases=cases,
            default_port=default_port,
        )

        switch_node_parameters.additional_properties = d
        return switch_node_parameters

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
