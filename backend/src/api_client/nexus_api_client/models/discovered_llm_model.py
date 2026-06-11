from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="DiscoveredLLMModel")


@_attrs_define
class DiscoveredLLMModel:
    """A model discovered from an LLM provider during health check.

    Attributes:
        id (str):
        name (str):
        description (None | str | Unset):
        input_token_price_cents_per_million (int | None | Unset):
        output_token_price_cents_per_million (int | None | Unset):
    """

    id: str
    name: str
    description: None | str | Unset = UNSET
    input_token_price_cents_per_million: int | None | Unset = UNSET
    output_token_price_cents_per_million: int | None | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        name = self.name

        description: None | str | Unset
        if isinstance(self.description, Unset):
            description = UNSET
        else:
            description = self.description

        input_token_price_cents_per_million: int | None | Unset
        if isinstance(self.input_token_price_cents_per_million, Unset):
            input_token_price_cents_per_million = UNSET
        else:
            input_token_price_cents_per_million = self.input_token_price_cents_per_million

        output_token_price_cents_per_million: int | None | Unset
        if isinstance(self.output_token_price_cents_per_million, Unset):
            output_token_price_cents_per_million = UNSET
        else:
            output_token_price_cents_per_million = self.output_token_price_cents_per_million

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "id": id,
                "name": name,
            }
        )
        if description is not UNSET:
            field_dict["description"] = description
        if input_token_price_cents_per_million is not UNSET:
            field_dict["input_token_price_cents_per_million"] = input_token_price_cents_per_million
        if output_token_price_cents_per_million is not UNSET:
            field_dict["output_token_price_cents_per_million"] = output_token_price_cents_per_million

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        id = d.pop("id")

        name = d.pop("name")

        def _parse_description(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        description = _parse_description(d.pop("description", UNSET))

        def _parse_input_token_price_cents_per_million(data: object) -> int | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(int | None | Unset, data)

        input_token_price_cents_per_million = _parse_input_token_price_cents_per_million(
            d.pop("input_token_price_cents_per_million", UNSET)
        )

        def _parse_output_token_price_cents_per_million(data: object) -> int | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(int | None | Unset, data)

        output_token_price_cents_per_million = _parse_output_token_price_cents_per_million(
            d.pop("output_token_price_cents_per_million", UNSET)
        )

        discovered_llm_model = cls(
            id=id,
            name=name,
            description=description,
            input_token_price_cents_per_million=input_token_price_cents_per_million,
            output_token_price_cents_per_million=output_token_price_cents_per_million,
        )

        discovered_llm_model.additional_properties = d
        return discovered_llm_model

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
