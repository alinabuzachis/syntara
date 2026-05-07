from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.***REMOVED*** import TestExecutionCreatePreResolvedNodes
    from ..models.test_execution_create_trigger_inputs import TestExecutionCreateTriggerInputs


T = TypeVar("T", bound="TestExecutionCreate")


@_attrs_define
class TestExecutionCreate:
    """Request body for POST /workflows/{workflow_id}/test.

    Attributes:
        target_node_id (str): The node to execute for real
        pre_resolved_nodes (TestExecutionCreatePreResolvedNodes | Unset): Mock outputs for predecessor nodes. Keys are
            node IDs.
        trigger_inputs (TestExecutionCreateTriggerInputs | Unset): Input data for the trigger node
    """

    target_node_id: str
    pre_resolved_nodes: TestExecutionCreatePreResolvedNodes | Unset = UNSET
    trigger_inputs: TestExecutionCreateTriggerInputs | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        target_node_id = self.target_node_id

        pre_resolved_nodes: dict[str, Any] | Unset = UNSET
        if not isinstance(self.pre_resolved_nodes, Unset):
            pre_resolved_nodes = self.pre_resolved_nodes.to_dict()

        trigger_inputs: dict[str, Any] | Unset = UNSET
        if not isinstance(self.trigger_inputs, Unset):
            trigger_inputs = self.trigger_inputs.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "target_node_id": target_node_id,
            }
        )
        if pre_resolved_nodes is not UNSET:
            field_dict["pre_resolved_nodes"] = pre_resolved_nodes
        if trigger_inputs is not UNSET:
            field_dict["trigger_inputs"] = trigger_inputs

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.***REMOVED*** import TestExecutionCreatePreResolvedNodes
        from ..models.test_execution_create_trigger_inputs import TestExecutionCreateTriggerInputs

        d = dict(src_dict)
        target_node_id = d.pop("target_node_id")

        _pre_resolved_nodes = d.pop("pre_resolved_nodes", UNSET)
        pre_resolved_nodes: TestExecutionCreatePreResolvedNodes | Unset
        if isinstance(_pre_resolved_nodes, Unset):
            pre_resolved_nodes = UNSET
        else:
            pre_resolved_nodes = TestExecutionCreatePreResolvedNodes.from_dict(_pre_resolved_nodes)

        _trigger_inputs = d.pop("trigger_inputs", UNSET)
        trigger_inputs: TestExecutionCreateTriggerInputs | Unset
        if isinstance(_trigger_inputs, Unset):
            trigger_inputs = UNSET
        else:
            trigger_inputs = TestExecutionCreateTriggerInputs.from_dict(_trigger_inputs)

        test_execution_create = cls(
            target_node_id=target_node_id,
            pre_resolved_nodes=pre_resolved_nodes,
            trigger_inputs=trigger_inputs,
        )

        test_execution_create.additional_properties = d
        return test_execution_create

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
