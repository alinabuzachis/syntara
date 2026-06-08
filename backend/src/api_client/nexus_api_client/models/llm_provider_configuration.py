from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Literal, TypeVar, cast

from attrs import define as _attrs_define

from ..types import UNSET, Unset

T = TypeVar("T", bound="LLMProviderConfiguration")


@_attrs_define
class LLMProviderConfiguration:
    """Configuration for LLM provider integrations (OpenAI-compatible endpoints).

    Attributes:
        base_url (str): Base URL for the LLM provider API
        integration_type (Literal['llm_provider'] | Unset):  Default: 'llm_provider'.
        provider_hint (None | str | Unset): Hint indicating the LLM provider backend (e.g. openai, azure, ollama)
    """

    base_url: str
    integration_type: Literal["llm_provider"] | Unset = "llm_provider"
    provider_hint: None | str | Unset = UNSET

    def to_dict(self) -> dict[str, Any]:
        base_url = self.base_url

        integration_type = self.integration_type

        provider_hint: None | str | Unset
        if isinstance(self.provider_hint, Unset):
            provider_hint = UNSET
        else:
            provider_hint = self.provider_hint

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "base_url": base_url,
            }
        )
        if integration_type is not UNSET:
            field_dict["integration_type"] = integration_type
        if provider_hint is not UNSET:
            field_dict["provider_hint"] = provider_hint

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        base_url = d.pop("base_url")

        integration_type = cast(Literal["llm_provider"] | Unset, d.pop("integration_type", UNSET))
        if integration_type != "llm_provider" and not isinstance(integration_type, Unset):
            raise ValueError(f"integration_type must match const 'llm_provider', got '{integration_type}'")

        def _parse_provider_hint(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        provider_hint = _parse_provider_hint(d.pop("provider_hint", UNSET))

        llm_provider_configuration = cls(
            base_url=base_url,
            integration_type=integration_type,
            provider_hint=provider_hint,
        )

        return llm_provider_configuration
