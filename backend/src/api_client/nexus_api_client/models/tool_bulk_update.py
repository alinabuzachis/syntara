from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar
from uuid import UUID

from attrs import define as _attrs_define

T = TypeVar("T", bound="ToolBulkUpdate")


@_attrs_define
class ToolBulkUpdate:
    """Request model for bulk updating tool status.

    Attributes:
        tool_ids: List of tool UUIDs to update (max 50)
        enabled: Enable or disable the Tool.

        Attributes:
            tool_ids (list[UUID]): List of tool UUIDs to update (max 50)
            enabled (bool): Enable/disable the Tool
    """

    tool_ids: list[UUID]
    enabled: bool

    def to_dict(self) -> dict[str, Any]:
        tool_ids = []
        for tool_ids_item_data in self.tool_ids:
            tool_ids_item = str(tool_ids_item_data)
            tool_ids.append(tool_ids_item)

        enabled = self.enabled

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "tool_ids": tool_ids,
                "enabled": enabled,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        tool_ids = []
        _tool_ids = d.pop("tool_ids")
        for tool_ids_item_data in _tool_ids:
            tool_ids_item = UUID(tool_ids_item_data)

            tool_ids.append(tool_ids_item)

        enabled = d.pop("enabled")

        tool_bulk_update = cls(
            tool_ids=tool_ids,
            enabled=enabled,
        )

        return tool_bulk_update
