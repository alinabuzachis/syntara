from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, Literal, TypeVar, cast

from attrs import define as _attrs_define

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.workflow_definition_edges_item import WorkflowDefinitionEdgesItem
    from ..models.workflow_definition_nodes_item import WorkflowDefinitionNodesItem
    from ..models.workflow_definition_triggers_item import WorkflowDefinitionTriggersItem


T = TypeVar("T", bound="WorkflowDefinition")


@_attrs_define
class WorkflowDefinition:
    """JSON Schema for graph-based workflow definitions in the Nexus Workflow Engine v2.

    Attributes:
        schema_version: Schema version that this workflow definition conforms to
        name: Workflow name
        description: Human-readable description of the workflow's purpose
        triggers: Trigger nodes that define how the workflow is initiated
        nodes: Execution and control nodes in the workflow graph
        edges: Directed edges connecting triggers and nodes in the workflow graph

        Attributes:
            schema_version (Literal['2.0.0']): Schema version that this workflow definition conforms to
            name (str): Workflow name
            triggers (list[WorkflowDefinitionTriggersItem]): Trigger nodes that define how the workflow is initiated. Must
                contain at least one trigger. Trigger nodes must be graph entry points (no incoming edges) — enforced by
                application-level validation.
            nodes (list[WorkflowDefinitionNodesItem]): Execution and control nodes in the workflow graph
            edges (list[WorkflowDefinitionEdgesItem]): List of directed edges connecting triggers and nodes in the workflow
                graph
            description (None | str | Unset): Human-readable description of the workflow's purpose
    """

    schema_version: Literal["2.0.0"]
    name: str
    triggers: list[WorkflowDefinitionTriggersItem]
    nodes: list[WorkflowDefinitionNodesItem]
    edges: list[WorkflowDefinitionEdgesItem]
    description: None | str | Unset = UNSET

    def to_dict(self) -> dict[str, Any]:
        schema_version = self.schema_version

        name = self.name

        triggers = []
        for triggers_item_data in self.triggers:
            triggers_item = triggers_item_data.to_dict()
            triggers.append(triggers_item)

        nodes = []
        for nodes_item_data in self.nodes:
            nodes_item = nodes_item_data.to_dict()
            nodes.append(nodes_item)

        edges = []
        for edges_item_data in self.edges:
            edges_item = edges_item_data.to_dict()
            edges.append(edges_item)

        description: None | str | Unset
        if isinstance(self.description, Unset):
            description = UNSET
        else:
            description = self.description

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "schema_version": schema_version,
                "name": name,
                "triggers": triggers,
                "nodes": nodes,
                "edges": edges,
            }
        )
        if description is not UNSET:
            field_dict["description"] = description

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.workflow_definition_edges_item import WorkflowDefinitionEdgesItem
        from ..models.workflow_definition_nodes_item import WorkflowDefinitionNodesItem
        from ..models.workflow_definition_triggers_item import WorkflowDefinitionTriggersItem

        d = dict(src_dict)
        schema_version = cast(Literal["2.0.0"], d.pop("schema_version"))
        if schema_version != "2.0.0":
            raise ValueError(f"schema_version must match const '2.0.0', got '{schema_version}'")

        name = d.pop("name")

        triggers = []
        _triggers = d.pop("triggers")
        for triggers_item_data in _triggers:
            triggers_item = WorkflowDefinitionTriggersItem.from_dict(triggers_item_data)

            triggers.append(triggers_item)

        nodes = []
        _nodes = d.pop("nodes")
        for nodes_item_data in _nodes:
            nodes_item = WorkflowDefinitionNodesItem.from_dict(nodes_item_data)

            nodes.append(nodes_item)

        edges = []
        _edges = d.pop("edges")
        for edges_item_data in _edges:
            edges_item = WorkflowDefinitionEdgesItem.from_dict(edges_item_data)

            edges.append(edges_item)

        def _parse_description(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        description = _parse_description(d.pop("description", UNSET))

        workflow_definition = cls(
            schema_version=schema_version,
            name=name,
            triggers=triggers,
            nodes=nodes,
            edges=edges,
            description=description,
        )

        return workflow_definition
