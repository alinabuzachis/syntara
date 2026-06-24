from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.converge_strategy import ConvergeStrategy
from ..types import UNSET, Unset

T = TypeVar("T", bound="ConvergeNodeParameters")


@_attrs_define
class ConvergeNodeParameters:
    """Parameters for converge (synchronization) control nodes.

    Attributes:
        strategy (ConvergeStrategy | None | Unset): Convergence strategy
        n_required (int | None | Unset): Branches required when strategy is 'any'
        wait_duration (int | None | Unset): Wait timeout in seconds
    """

    strategy: ConvergeStrategy | None | Unset = UNSET
    n_required: int | None | Unset = UNSET
    wait_duration: int | None | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        strategy: None | str | Unset
        if isinstance(self.strategy, Unset):
            strategy = UNSET
        elif isinstance(self.strategy, ConvergeStrategy):
            strategy = self.strategy.value
        else:
            strategy = self.strategy

        n_required: int | None | Unset
        if isinstance(self.n_required, Unset):
            n_required = UNSET
        else:
            n_required = self.n_required

        wait_duration: int | None | Unset
        if isinstance(self.wait_duration, Unset):
            wait_duration = UNSET
        else:
            wait_duration = self.wait_duration

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if strategy is not UNSET:
            field_dict["strategy"] = strategy
        if n_required is not UNSET:
            field_dict["n_required"] = n_required
        if wait_duration is not UNSET:
            field_dict["wait_duration"] = wait_duration

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)

        def _parse_strategy(data: object) -> ConvergeStrategy | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                strategy_type_0 = ConvergeStrategy(data)

                return strategy_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(ConvergeStrategy | None | Unset, data)

        strategy = _parse_strategy(d.pop("strategy", UNSET))

        def _parse_n_required(data: object) -> int | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(int | None | Unset, data)

        n_required = _parse_n_required(d.pop("n_required", UNSET))

        def _parse_wait_duration(data: object) -> int | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(int | None | Unset, data)

        wait_duration = _parse_wait_duration(d.pop("wait_duration", UNSET))

        converge_node_parameters = cls(
            strategy=strategy,
            n_required=n_required,
            wait_duration=wait_duration,
        )

        converge_node_parameters.additional_properties = d
        return converge_node_parameters

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
