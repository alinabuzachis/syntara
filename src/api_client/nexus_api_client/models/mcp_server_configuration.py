from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, Literal, TypeVar, cast

from attrs import define as _attrs_define

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.discovered_tool import DiscoveredTool


T = TypeVar("T", bound="MCPServerConfiguration")


@_attrs_define
class MCPServerConfiguration:
    """Full MCP configuration including system-managed discovery results.

    Attributes:
        base_url (str): Base URL for the MCP server
        discovered_tools (list[DiscoveredTool] | None | Unset): Tools discovered during the last successful health check
        integration_type (Literal['mcp_server'] | Unset):  Default: 'mcp_server'.
    """

    base_url: str
    discovered_tools: list[DiscoveredTool] | None | Unset = UNSET
    integration_type: Literal["mcp_server"] | Unset = "mcp_server"

    def to_dict(self) -> dict[str, Any]:
        base_url = self.base_url

        discovered_tools: list[dict[str, Any]] | None | Unset
        if isinstance(self.discovered_tools, Unset):
            discovered_tools = UNSET
        elif isinstance(self.discovered_tools, list):
            discovered_tools = []
            for discovered_tools_type_0_item_data in self.discovered_tools:
                discovered_tools_type_0_item = discovered_tools_type_0_item_data.to_dict()
                discovered_tools.append(discovered_tools_type_0_item)

        else:
            discovered_tools = self.discovered_tools

        integration_type = self.integration_type

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "base_url": base_url,
            }
        )
        if discovered_tools is not UNSET:
            field_dict["discovered_tools"] = discovered_tools
        if integration_type is not UNSET:
            field_dict["integration_type"] = integration_type

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.discovered_tool import DiscoveredTool

        d = dict(src_dict)
        base_url = d.pop("base_url")

        def _parse_discovered_tools(data: object) -> list[DiscoveredTool] | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, list):
                    raise TypeError()
                discovered_tools_type_0 = []
                _discovered_tools_type_0 = data
                for discovered_tools_type_0_item_data in _discovered_tools_type_0:
                    discovered_tools_type_0_item = DiscoveredTool.from_dict(discovered_tools_type_0_item_data)

                    discovered_tools_type_0.append(discovered_tools_type_0_item)

                return discovered_tools_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(list[DiscoveredTool] | None | Unset, data)

        discovered_tools = _parse_discovered_tools(d.pop("discovered_tools", UNSET))

        integration_type = cast(Literal["mcp_server"] | Unset, d.pop("integration_type", UNSET))
        if integration_type != "mcp_server" and not isinstance(integration_type, Unset):
            raise ValueError(f"integration_type must match const 'mcp_server', got '{integration_type}'")

        mcp_server_configuration = cls(
            base_url=base_url,
            discovered_tools=discovered_tools,
            integration_type=integration_type,
        )

        return mcp_server_configuration
