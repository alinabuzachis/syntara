from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.execution_create_input_data import ExecutionCreateInputData


T = TypeVar("T", bound="ExecutionCreate")


@_attrs_define
class ExecutionCreate:
    """Schema for creating a new execution (POST /executions).

    Excludes auto-generated fields: id, created_at, created_by (set by backend).

        Attributes:
            workflow_id (UUID): Workflow ID to execute
            trigger_node_id (str): Trigger node ID to start from
            input_data (ExecutionCreateInputData | Unset): Input data for workflow execution
            use_published (bool | Unset): If true, run the published version instead of the current version Default: False.
    """

    workflow_id: UUID
    trigger_node_id: str
    input_data: ExecutionCreateInputData | Unset = UNSET
    use_published: bool | Unset = False
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        workflow_id = str(self.workflow_id)

        trigger_node_id = self.trigger_node_id

        input_data: dict[str, Any] | Unset = UNSET
        if not isinstance(self.input_data, Unset):
            input_data = self.input_data.to_dict()

        use_published = self.use_published

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "workflow_id": workflow_id,
                "trigger_node_id": trigger_node_id,
            }
        )
        if input_data is not UNSET:
            field_dict["input_data"] = input_data
        if use_published is not UNSET:
            field_dict["use_published"] = use_published

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.execution_create_input_data import ExecutionCreateInputData

        d = dict(src_dict)
        workflow_id = UUID(d.pop("workflow_id"))

        trigger_node_id = d.pop("trigger_node_id")

        _input_data = d.pop("input_data", UNSET)
        input_data: ExecutionCreateInputData | Unset
        if isinstance(_input_data, Unset):
            input_data = UNSET
        else:
            input_data = ExecutionCreateInputData.from_dict(_input_data)

        use_published = d.pop("use_published", UNSET)

        execution_create = cls(
            workflow_id=workflow_id,
            trigger_node_id=trigger_node_id,
            input_data=input_data,
            use_published=use_published,
        )

        execution_create.additional_properties = d
        return execution_create

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
