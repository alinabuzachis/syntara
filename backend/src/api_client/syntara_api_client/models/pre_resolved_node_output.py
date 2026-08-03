from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.pre_resolved_node_output_control_type_0 import PreResolvedNodeOutputControlType0
    from ..models.pre_resolved_node_output_output import PreResolvedNodeOutputOutput


T = TypeVar("T", bound="PreResolvedNodeOutput")


@_attrs_define
class PreResolvedNodeOutput:
    """Typed structure for a single pre-resolved node's mock output.

    Attributes:
        output (PreResolvedNodeOutputOutput | Unset): Mock output data for the node
        control (None | PreResolvedNodeOutputControlType0 | Unset): Control data for condition/loop routing (e.g.,
            next_port)
    """

    output: PreResolvedNodeOutputOutput | Unset = UNSET
    control: None | PreResolvedNodeOutputControlType0 | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        from ..models.pre_resolved_node_output_control_type_0 import PreResolvedNodeOutputControlType0

        output: dict[str, Any] | Unset = UNSET
        if not isinstance(self.output, Unset):
            output = self.output.to_dict()

        control: dict[str, Any] | None | Unset
        if isinstance(self.control, Unset):
            control = UNSET
        elif isinstance(self.control, PreResolvedNodeOutputControlType0):
            control = self.control.to_dict()
        else:
            control = self.control

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if output is not UNSET:
            field_dict["output"] = output
        if control is not UNSET:
            field_dict["control"] = control

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.pre_resolved_node_output_control_type_0 import PreResolvedNodeOutputControlType0
        from ..models.pre_resolved_node_output_output import PreResolvedNodeOutputOutput

        d = dict(src_dict)
        _output = d.pop("output", UNSET)
        output: PreResolvedNodeOutputOutput | Unset
        if isinstance(_output, Unset):
            output = UNSET
        else:
            output = PreResolvedNodeOutputOutput.from_dict(_output)

        def _parse_control(data: object) -> None | PreResolvedNodeOutputControlType0 | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                control_type_0 = PreResolvedNodeOutputControlType0.from_dict(data)

                return control_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | PreResolvedNodeOutputControlType0 | Unset, data)

        control = _parse_control(d.pop("control", UNSET))

        pre_resolved_node_output = cls(
            output=output,
            control=control,
        )

        pre_resolved_node_output.additional_properties = d
        return pre_resolved_node_output

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
