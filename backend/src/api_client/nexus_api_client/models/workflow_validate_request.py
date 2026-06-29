from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.workflow_validate_request_workflow_definition import WorkflowValidateRequestWorkflowDefinition


T = TypeVar("T", bound="WorkflowValidateRequest")


@_attrs_define
class WorkflowValidateRequest:
    """Request body for the workflow validation endpoint.

    The definition is accepted as a raw dict so that structurally invalid
    definitions reach the application-level validator for richer error
    reporting with node-level attribution.

        Attributes:
            workflow_definition (WorkflowValidateRequestWorkflowDefinition): Workflow definition to validate
    """

    workflow_definition: WorkflowValidateRequestWorkflowDefinition

    def to_dict(self) -> dict[str, Any]:
        workflow_definition = self.workflow_definition.to_dict()

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "workflow_definition": workflow_definition,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.workflow_validate_request_workflow_definition import WorkflowValidateRequestWorkflowDefinition

        d = dict(src_dict)
        workflow_definition = WorkflowValidateRequestWorkflowDefinition.from_dict(d.pop("workflow_definition"))

        workflow_validate_request = cls(
            workflow_definition=workflow_definition,
        )

        return workflow_validate_request
