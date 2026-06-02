from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Literal, TypeVar, cast

from attrs import define as _attrs_define

from ..types import UNSET, Unset

T = TypeVar("T", bound="MCPServerConfiguration")


@_attrs_define
class MCPServerConfiguration:
    """Configuration for MCP (Model Context Protocol) server integrations.

    Attributes:
        base_url (str): Base URL for the MCP server
        integration_type (Literal['mcp_server'] | Unset):  Default: 'mcp_server'.
    """

    base_url: str
    integration_type: Literal["mcp_server"] | Unset = "mcp_server"

    def to_dict(self) -> dict[str, Any]:
        base_url = self.base_url

        integration_type = self.integration_type

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "base_url": base_url,
            }
        )
        if integration_type is not UNSET:
            field_dict["integration_type"] = integration_type

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        base_url = d.pop("base_url")

        integration_type = cast(Literal["mcp_server"] | Unset, d.pop("integration_type", UNSET))
        if integration_type != "mcp_server" and not isinstance(integration_type, Unset):
            raise ValueError(f"integration_type must match const 'mcp_server', got '{integration_type}'")

        mcp_server_configuration = cls(
            base_url=base_url,
            integration_type=integration_type,
        )

        return mcp_server_configuration
