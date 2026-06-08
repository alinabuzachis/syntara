from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="PercentileStats")


@_attrs_define
class PercentileStats:
    """Percentile breakdown for a collection of values.

    Attributes:
        count (int): Number of observations
        min_ (float): Minimum value
        max_ (float): Maximum value
        mean (float): Arithmetic mean
        median (float): 50th percentile (p50)
        p90 (float): 90th percentile
        p95 (float): 95th percentile
        p99 (float): 99th percentile
        sum_ (float): Sum of all values
    """

    count: int
    min_: float
    max_: float
    mean: float
    median: float
    p90: float
    p95: float
    p99: float
    sum_: float

    def to_dict(self) -> dict[str, Any]:
        count = self.count

        min_ = self.min_

        max_ = self.max_

        mean = self.mean

        median = self.median

        p90 = self.p90

        p95 = self.p95

        p99 = self.p99

        sum_ = self.sum_

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "count": count,
                "min": min_,
                "max": max_,
                "mean": mean,
                "median": median,
                "p90": p90,
                "p95": p95,
                "p99": p99,
                "sum": sum_,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        count = d.pop("count")

        min_ = d.pop("min")

        max_ = d.pop("max")

        mean = d.pop("mean")

        median = d.pop("median")

        p90 = d.pop("p90")

        p95 = d.pop("p95")

        p99 = d.pop("p99")

        sum_ = d.pop("sum")

        percentile_stats = cls(
            count=count,
            min_=min_,
            max_=max_,
            mean=mean,
            median=median,
            p90=p90,
            p95=p95,
            p99=p99,
            sum_=sum_,
        )

        return percentile_stats
