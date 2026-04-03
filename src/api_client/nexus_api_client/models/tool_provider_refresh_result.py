from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from dateutil.parser import isoparse

T = TypeVar("T", bound="ToolProviderRefreshResult")


@_attrs_define
class ToolProviderRefreshResult:
    """Result of refreshing tools from a tool provider.

    Attributes:
        refreshed_count: Number of new tools discovered and added
        updated_count: Number of existing tools that were updated
        disabled_count: Number of tools that were disabled (not found in provider)
        refreshed_at: Timestamp when refresh operation was performed

        Attributes:
            refreshed_count (int):
            updated_count (int):
            disabled_count (int):
            refreshed_at (datetime.datetime):
    """

    refreshed_count: int
    updated_count: int
    disabled_count: int
    refreshed_at: datetime.datetime

    def to_dict(self) -> dict[str, Any]:
        refreshed_count = self.refreshed_count

        updated_count = self.updated_count

        disabled_count = self.disabled_count

        refreshed_at = self.refreshed_at.isoformat()

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "refreshed_count": refreshed_count,
                "updated_count": updated_count,
                "disabled_count": disabled_count,
                "refreshed_at": refreshed_at,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        refreshed_count = d.pop("refreshed_count")

        updated_count = d.pop("updated_count")

        disabled_count = d.pop("disabled_count")

        refreshed_at = isoparse(d.pop("refreshed_at"))

        tool_provider_refresh_result = cls(
            refreshed_count=refreshed_count,
            updated_count=updated_count,
            disabled_count=disabled_count,
            refreshed_at=refreshed_at,
        )

        return tool_provider_refresh_result
