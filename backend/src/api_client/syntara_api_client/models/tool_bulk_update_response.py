from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

T = TypeVar("T", bound="ToolBulkUpdateResponse")


@_attrs_define
class ToolBulkUpdateResponse:
    """Response model for bulk tool update.

    Attributes:
        updated_count (int): Number of tools updated
        skipped_count (int): Number of tool IDs not found or not in scope
        updated_at (datetime.datetime): Timestamp of the update
    """

    updated_count: int
    skipped_count: int
    updated_at: datetime.datetime
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        updated_count = self.updated_count

        skipped_count = self.skipped_count

        updated_at = self.updated_at.isoformat()

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "updated_count": updated_count,
                "skipped_count": skipped_count,
                "updated_at": updated_at,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        updated_count = d.pop("updated_count")

        skipped_count = d.pop("skipped_count")

        updated_at = isoparse(d.pop("updated_at"))

        tool_bulk_update_response = cls(
            updated_count=updated_count,
            skipped_count=skipped_count,
            updated_at=updated_at,
        )

        tool_bulk_update_response.additional_properties = d
        return tool_bulk_update_response

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
