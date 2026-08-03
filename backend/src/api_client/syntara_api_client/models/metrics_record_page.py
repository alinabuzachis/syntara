from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.metric_record import MetricRecord


T = TypeVar("T", bound="MetricsRecordPage")


@_attrs_define
class MetricsRecordPage:
    """Paginated list of raw metric records.

    Attributes:
        total (int): Total matching records (before pagination)
        limit (int): Page size used
        offset (int): Offset used
        records (list[MetricRecord] | Unset):
    """

    total: int
    limit: int
    offset: int
    records: list[MetricRecord] | Unset = UNSET

    def to_dict(self) -> dict[str, Any]:
        total = self.total

        limit = self.limit

        offset = self.offset

        records: list[dict[str, Any]] | Unset = UNSET
        if not isinstance(self.records, Unset):
            records = []
            for records_item_data in self.records:
                records_item = records_item_data.to_dict()
                records.append(records_item)

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "total": total,
                "limit": limit,
                "offset": offset,
            }
        )
        if records is not UNSET:
            field_dict["records"] = records

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.metric_record import MetricRecord

        d = dict(src_dict)
        total = d.pop("total")

        limit = d.pop("limit")

        offset = d.pop("offset")

        _records = d.pop("records", UNSET)
        records: list[MetricRecord] | Unset = UNSET
        if _records is not UNSET:
            records = []
            for records_item_data in _records:
                records_item = MetricRecord.from_dict(records_item_data)

                records.append(records_item)

        metrics_record_page = cls(
            total=total,
            limit=limit,
            offset=offset,
            records=records,
        )

        return metrics_record_page
