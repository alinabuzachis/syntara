from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Literal, TypeVar, cast

from attrs import define as _attrs_define

from ..types import UNSET, Unset

T = TypeVar("T", bound="MCPConfiguration")


@_attrs_define
class MCPConfiguration:
    """Configuration for MCP (Model Context Protocol) providers.

    Attributes:
        base_url (str): Base URL for the MCP provider
        provider_type (Literal['mcp'] | Unset):  Default: 'mcp'.
        api_key (None | str | Unset): API key for authentication (optional)
    """

    base_url: str
    provider_type: Literal["mcp"] | Unset = "mcp"
    api_key: None | str | Unset = UNSET

    def to_dict(self) -> dict[str, Any]:
        base_url = self.base_url

        provider_type = self.provider_type

        api_key: None | str | Unset
        if isinstance(self.api_key, Unset):
            api_key = UNSET
        else:
            api_key = self.api_key

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "base_url": base_url,
            }
        )
        if provider_type is not UNSET:
            field_dict["provider_type"] = provider_type
        if api_key is not UNSET:
            field_dict["api_key"] = api_key

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        base_url = d.pop("base_url")

        provider_type = cast(Literal["mcp"] | Unset, d.pop("provider_type", UNSET))
        if provider_type != "mcp" and not isinstance(provider_type, Unset):
            raise ValueError(f"provider_type must match const 'mcp', got '{provider_type}'")

        def _parse_api_key(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        api_key = _parse_api_key(d.pop("api_key", UNSET))

        mcp_configuration = cls(
            base_url=base_url,
            provider_type=provider_type,
            api_key=api_key,
        )

        return mcp_configuration
