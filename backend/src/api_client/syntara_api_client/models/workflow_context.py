from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.previous_step_context import PreviousStepContext
    from ..models.workflow_context_inputs import WorkflowContextInputs


T = TypeVar("T", bound="WorkflowContext")


@_attrs_define
class WorkflowContext:
    """Workflow Context for approvers.

    Essential context for approvers to make a decision.
    Contains workflow identification, inputs, and the output from the immediately
    preceding activity.

        Attributes:
            workflow_version_id (UUID): ID of the workflow version being executed
            workflow_name (str): Name of the workflow
            inputs (WorkflowContextInputs): Original workflow input parameters (structure varies per workflow)
            previous_step (None | PreviousStepContext | Unset): Previous step context and output
    """

    workflow_version_id: UUID
    workflow_name: str
    inputs: WorkflowContextInputs
    previous_step: None | PreviousStepContext | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        from ..models.previous_step_context import PreviousStepContext

        workflow_version_id = str(self.workflow_version_id)

        workflow_name = self.workflow_name

        inputs = self.inputs.to_dict()

        previous_step: dict[str, Any] | None | Unset
        if isinstance(self.previous_step, Unset):
            previous_step = UNSET
        elif isinstance(self.previous_step, PreviousStepContext):
            previous_step = self.previous_step.to_dict()
        else:
            previous_step = self.previous_step

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "workflow_version_id": workflow_version_id,
                "workflow_name": workflow_name,
                "inputs": inputs,
            }
        )
        if previous_step is not UNSET:
            field_dict["previous_step"] = previous_step

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.previous_step_context import PreviousStepContext
        from ..models.workflow_context_inputs import WorkflowContextInputs

        d = dict(src_dict)
        workflow_version_id = UUID(d.pop("workflow_version_id"))

        workflow_name = d.pop("workflow_name")

        inputs = WorkflowContextInputs.from_dict(d.pop("inputs"))

        def _parse_previous_step(data: object) -> None | PreviousStepContext | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                previous_step_type_0 = PreviousStepContext.from_dict(data)

                return previous_step_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | PreviousStepContext | Unset, data)

        previous_step = _parse_previous_step(d.pop("previous_step", UNSET))

        workflow_context = cls(
            workflow_version_id=workflow_version_id,
            workflow_name=workflow_name,
            inputs=inputs,
            previous_step=previous_step,
        )

        workflow_context.additional_properties = d
        return workflow_context

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
