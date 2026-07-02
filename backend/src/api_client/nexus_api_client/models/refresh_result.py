from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

from ..types import UNSET, Unset

T = TypeVar("T", bound="RefreshResult")


@_attrs_define
class RefreshResult:
    """Result returned by POST /integrations/{id}/refresh.

    Field names use ``tools_*`` for both MCP and LLM refreshes. For MCP
    servers, ``tools_disabled_count`` reflects tools soft-disabled as MISSING.
    For LLM providers, it reflects models hard-deleted from the database.

        Attributes:
            tools_synced_count (int): Number of new resource records created
            tools_updated_count (int): Number of existing resource records updated
            tools_disabled_count (int): Number of resource records removed or disabled
            refreshed_at (datetime.datetime | None | Unset): Timestamp when the refresh completed
    """

    tools_synced_count: int
    tools_updated_count: int
    tools_disabled_count: int
    refreshed_at: datetime.datetime | None | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        tools_synced_count = self.tools_synced_count

        tools_updated_count = self.tools_updated_count

        tools_disabled_count = self.tools_disabled_count

        refreshed_at: None | str | Unset
        if isinstance(self.refreshed_at, Unset):
            refreshed_at = UNSET
        elif isinstance(self.refreshed_at, datetime.datetime):
            refreshed_at = self.refreshed_at.isoformat()
        else:
            refreshed_at = self.refreshed_at

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "tools_synced_count": tools_synced_count,
                "tools_updated_count": tools_updated_count,
                "tools_disabled_count": tools_disabled_count,
            }
        )
        if refreshed_at is not UNSET:
            field_dict["refreshed_at"] = refreshed_at

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        tools_synced_count = d.pop("tools_synced_count")

        tools_updated_count = d.pop("tools_updated_count")

        tools_disabled_count = d.pop("tools_disabled_count")

        def _parse_refreshed_at(data: object) -> datetime.datetime | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                refreshed_at_type_0 = isoparse(data)

                return refreshed_at_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(datetime.datetime | None | Unset, data)

        refreshed_at = _parse_refreshed_at(d.pop("refreshed_at", UNSET))

        refresh_result = cls(
            tools_synced_count=tools_synced_count,
            tools_updated_count=tools_updated_count,
            tools_disabled_count=tools_disabled_count,
            refreshed_at=refreshed_at,
        )

        refresh_result.additional_properties = d
        return refresh_result

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
