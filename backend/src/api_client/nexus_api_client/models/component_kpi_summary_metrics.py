from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
    from ..models.component_kpi_summary_metrics_additional_property_type_1 import (
        ComponentKPISummaryMetricsAdditionalPropertyType1,
    )
    from ..models.percentile_stats import PercentileStats


T = TypeVar("T", bound="ComponentKPISummaryMetrics")


@_attrs_define
class ComponentKPISummaryMetrics:
    """Metric name → stats, scalar value, or distribution map"""

    additional_properties: dict[
        str, ComponentKPISummaryMetricsAdditionalPropertyType1 | float | int | PercentileStats
    ] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        from ..models.component_kpi_summary_metrics_additional_property_type_1 import (
            ComponentKPISummaryMetricsAdditionalPropertyType1,
        )
        from ..models.percentile_stats import PercentileStats

        field_dict: dict[str, Any] = {}
        for prop_name, prop in self.additional_properties.items():
            if isinstance(prop, PercentileStats):
                field_dict[prop_name] = prop.to_dict()
            elif isinstance(prop, ComponentKPISummaryMetricsAdditionalPropertyType1):
                field_dict[prop_name] = prop.to_dict()
            else:
                field_dict[prop_name] = prop

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.component_kpi_summary_metrics_additional_property_type_1 import (
            ComponentKPISummaryMetricsAdditionalPropertyType1,
        )
        from ..models.percentile_stats import PercentileStats

        d = dict(src_dict)
        component_kpi_summary_metrics = cls()

        additional_properties = {}
        for prop_name, prop_dict in d.items():

            def _parse_additional_property(
                data: object,
            ) -> ComponentKPISummaryMetricsAdditionalPropertyType1 | float | int | PercentileStats:
                try:
                    if not isinstance(data, dict):
                        raise TypeError()
                    additional_property_type_0 = PercentileStats.from_dict(data)

                    return additional_property_type_0
                except (TypeError, ValueError, AttributeError, KeyError):
                    pass
                try:
                    if not isinstance(data, dict):
                        raise TypeError()
                    additional_property_type_1 = ComponentKPISummaryMetricsAdditionalPropertyType1.from_dict(data)

                    return additional_property_type_1
                except (TypeError, ValueError, AttributeError, KeyError):
                    pass
                return cast(ComponentKPISummaryMetricsAdditionalPropertyType1 | float | int | PercentileStats, data)

            additional_property = _parse_additional_property(prop_dict)

            additional_properties[prop_name] = additional_property

        component_kpi_summary_metrics.additional_properties = additional_properties
        return component_kpi_summary_metrics

    @property
    def additional_keys(self) -> list[str]:
        return list(self.additional_properties.keys())

    def __getitem__(
        self, key: str
    ) -> ComponentKPISummaryMetricsAdditionalPropertyType1 | float | int | PercentileStats:
        return self.additional_properties[key]

    def __setitem__(
        self, key: str, value: ComponentKPISummaryMetricsAdditionalPropertyType1 | float | int | PercentileStats
    ) -> None:
        self.additional_properties[key] = value

    def __delitem__(self, key: str) -> None:
        del self.additional_properties[key]

    def __contains__(self, key: str) -> bool:
        return key in self.additional_properties
