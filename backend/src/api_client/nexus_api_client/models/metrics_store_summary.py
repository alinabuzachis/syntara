from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from dateutil.parser import isoparse

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.metrics_store_summary_counters import MetricsStoreSummaryCounters
    from ..models.metrics_store_summary_metric_type_counts import MetricsStoreSummaryMetricTypeCounts


T = TypeVar("T", bound="MetricsStoreSummary")


@_attrs_define
class MetricsStoreSummary:
    """High-level summary of the in-memory metrics store.

    Attributes:
        total_records (int): Total records currently stored
        retention_seconds (int): Configured retention in seconds
        max_records (int): Configured capacity limit
        counters (MetricsStoreSummaryCounters | Unset): Internal named counters (requests, errors, cache_hits, …)
        metric_type_counts (MetricsStoreSummaryMetricTypeCounts | Unset): Record count per MetricType
        oldest_record_at (datetime.datetime | None | Unset): Timestamp of the oldest stored record
        newest_record_at (datetime.datetime | None | Unset): Timestamp of the newest stored record
    """

    total_records: int
    retention_seconds: int
    max_records: int
    counters: MetricsStoreSummaryCounters | Unset = UNSET
    metric_type_counts: MetricsStoreSummaryMetricTypeCounts | Unset = UNSET
    oldest_record_at: datetime.datetime | None | Unset = UNSET
    newest_record_at: datetime.datetime | None | Unset = UNSET

    def to_dict(self) -> dict[str, Any]:
        total_records = self.total_records

        retention_seconds = self.retention_seconds

        max_records = self.max_records

        counters: dict[str, Any] | Unset = UNSET
        if not isinstance(self.counters, Unset):
            counters = self.counters.to_dict()

        metric_type_counts: dict[str, Any] | Unset = UNSET
        if not isinstance(self.metric_type_counts, Unset):
            metric_type_counts = self.metric_type_counts.to_dict()

        oldest_record_at: None | str | Unset
        if isinstance(self.oldest_record_at, Unset):
            oldest_record_at = UNSET
        elif isinstance(self.oldest_record_at, datetime.datetime):
            oldest_record_at = self.oldest_record_at.isoformat()
        else:
            oldest_record_at = self.oldest_record_at

        newest_record_at: None | str | Unset
        if isinstance(self.newest_record_at, Unset):
            newest_record_at = UNSET
        elif isinstance(self.newest_record_at, datetime.datetime):
            newest_record_at = self.newest_record_at.isoformat()
        else:
            newest_record_at = self.newest_record_at

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "total_records": total_records,
                "retention_seconds": retention_seconds,
                "max_records": max_records,
            }
        )
        if counters is not UNSET:
            field_dict["counters"] = counters
        if metric_type_counts is not UNSET:
            field_dict["metric_type_counts"] = metric_type_counts
        if oldest_record_at is not UNSET:
            field_dict["oldest_record_at"] = oldest_record_at
        if newest_record_at is not UNSET:
            field_dict["newest_record_at"] = newest_record_at

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.metrics_store_summary_counters import MetricsStoreSummaryCounters
        from ..models.metrics_store_summary_metric_type_counts import MetricsStoreSummaryMetricTypeCounts

        d = dict(src_dict)
        total_records = d.pop("total_records")

        retention_seconds = d.pop("retention_seconds")

        max_records = d.pop("max_records")

        _counters = d.pop("counters", UNSET)
        counters: MetricsStoreSummaryCounters | Unset
        if isinstance(_counters, Unset):
            counters = UNSET
        else:
            counters = MetricsStoreSummaryCounters.from_dict(_counters)

        _metric_type_counts = d.pop("metric_type_counts", UNSET)
        metric_type_counts: MetricsStoreSummaryMetricTypeCounts | Unset
        if isinstance(_metric_type_counts, Unset):
            metric_type_counts = UNSET
        else:
            metric_type_counts = MetricsStoreSummaryMetricTypeCounts.from_dict(_metric_type_counts)

        def _parse_oldest_record_at(data: object) -> datetime.datetime | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                oldest_record_at_type_0 = isoparse(data)

                return oldest_record_at_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(datetime.datetime | None | Unset, data)

        oldest_record_at = _parse_oldest_record_at(d.pop("oldest_record_at", UNSET))

        def _parse_newest_record_at(data: object) -> datetime.datetime | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                newest_record_at_type_0 = isoparse(data)

                return newest_record_at_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(datetime.datetime | None | Unset, data)

        newest_record_at = _parse_newest_record_at(d.pop("newest_record_at", UNSET))

        metrics_store_summary = cls(
            total_records=total_records,
            retention_seconds=retention_seconds,
            max_records=max_records,
            counters=counters,
            metric_type_counts=metric_type_counts,
            oldest_record_at=oldest_record_at,
            newest_record_at=newest_record_at,
        )

        return metrics_store_summary
