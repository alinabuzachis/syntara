from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="RetryPolicyParameters")


@_attrs_define
class RetryPolicyParameters:
    """Retry policy parameters for a node.

    Only applies to nodes whose settings class is NodeSettingsFull
    (http_request, aap_job_template, aap_workflow_job_template).

    All fields default to None — the engine merges with global catalog values
    (workflow_engine.retry_*) for any unset field. Set max_retries=0 to
    explicitly disable retry, overriding global defaults.

        Attributes:
            max_retries (int | None | Unset): Retries after initial attempt. 0 = no retry.
            initial_interval (int | None | Unset): Initial retry interval in seconds.
            max_interval (int | None | Unset): Maximum retry interval in seconds.
            backoff_coefficient (float | None | Unset): Multiplier per retry. 1.0 = fixed, >1.0 = exponential.
    """

    max_retries: int | None | Unset = UNSET
    initial_interval: int | None | Unset = UNSET
    max_interval: int | None | Unset = UNSET
    backoff_coefficient: float | None | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        max_retries: int | None | Unset
        if isinstance(self.max_retries, Unset):
            max_retries = UNSET
        else:
            max_retries = self.max_retries

        initial_interval: int | None | Unset
        if isinstance(self.initial_interval, Unset):
            initial_interval = UNSET
        else:
            initial_interval = self.initial_interval

        max_interval: int | None | Unset
        if isinstance(self.max_interval, Unset):
            max_interval = UNSET
        else:
            max_interval = self.max_interval

        backoff_coefficient: float | None | Unset
        if isinstance(self.backoff_coefficient, Unset):
            backoff_coefficient = UNSET
        else:
            backoff_coefficient = self.backoff_coefficient

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if max_retries is not UNSET:
            field_dict["max_retries"] = max_retries
        if initial_interval is not UNSET:
            field_dict["initial_interval"] = initial_interval
        if max_interval is not UNSET:
            field_dict["max_interval"] = max_interval
        if backoff_coefficient is not UNSET:
            field_dict["backoff_coefficient"] = backoff_coefficient

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)

        def _parse_max_retries(data: object) -> int | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(int | None | Unset, data)

        max_retries = _parse_max_retries(d.pop("max_retries", UNSET))

        def _parse_initial_interval(data: object) -> int | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(int | None | Unset, data)

        initial_interval = _parse_initial_interval(d.pop("initial_interval", UNSET))

        def _parse_max_interval(data: object) -> int | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(int | None | Unset, data)

        max_interval = _parse_max_interval(d.pop("max_interval", UNSET))

        def _parse_backoff_coefficient(data: object) -> float | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(float | None | Unset, data)

        backoff_coefficient = _parse_backoff_coefficient(d.pop("backoff_coefficient", UNSET))

        retry_policy_parameters = cls(
            max_retries=max_retries,
            initial_interval=initial_interval,
            max_interval=max_interval,
            backoff_coefficient=backoff_coefficient,
        )

        retry_policy_parameters.additional_properties = d
        return retry_policy_parameters

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
