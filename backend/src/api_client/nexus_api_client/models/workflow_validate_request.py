from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.workflow_definition import WorkflowDefinition


T = TypeVar("T", bound="WorkflowValidateRequest")


@_attrs_define
class WorkflowValidateRequest:
    """Request body for the workflow validation endpoint.

    Attributes:
        workflow_definition: The workflow definition to validate

        Attributes:
            workflow_definition (WorkflowDefinition): JSON Schema for graph-based workflow definitions in the Nexus Workflow
                Engine v2.

                Attributes:
                    schema_version: Schema version that this workflow definition conforms to
                    name: Workflow name
                    description: Human-readable description of the workflow's purpose
                    triggers: Trigger nodes that define how the workflow is initiated
                    nodes: Execution and control nodes in the workflow graph
                    edges: Directed edges connecting triggers and nodes in the workflow graph
    """

    workflow_definition: WorkflowDefinition

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
        from ..models.workflow_definition import WorkflowDefinition

        d = dict(src_dict)
        workflow_definition = WorkflowDefinition.from_dict(d.pop("workflow_definition"))

        workflow_validate_request = cls(
            workflow_definition=workflow_definition,
        )

        return workflow_validate_request
