"""Workflow definition schema models for v2 workflows.

This module provides the Pydantic model for workflow definitions that conform to
the Nexus Workflow Engine v2 schema.
"""

from typing import Any, Literal

from pydantic import Field
from sqlmodel import SQLModel


class WorkflowDefinition(SQLModel):
    """JSON Schema for graph-based workflow definitions in the Nexus Workflow Engine v2.

    Attributes:
        schema_version: Schema version that this workflow definition conforms to
        name: Workflow name
        description: Human-readable description of the workflow's purpose
        triggers: Trigger nodes that define how the workflow is initiated
        nodes: Execution and control nodes in the workflow graph
        edges: Directed edges connecting triggers and nodes in the workflow graph

    """

    model_config = {"extra": "forbid"}

    schema_version: Literal["2.0.0"] = Field(
        ...,
        description="Schema version that this workflow definition conforms to",
    )
    name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Workflow name",
    )
    description: str | None = Field(
        None,
        min_length=1,
        max_length=1000,
        description="Human-readable description of the workflow's purpose",
    )
    triggers: list[dict[str, Any]] = Field(
        ...,
        min_length=1,
        description="Trigger nodes that define how the workflow is initiated. "
        "Must contain at least one trigger. "
        "Trigger nodes must be graph entry points (no incoming edges) — "
        "enforced by application-level validation.",
    )
    nodes: list[dict[str, Any]] = Field(
        ...,
        description="Execution and control nodes in the workflow graph",
    )
    edges: list[dict[str, Any]] = Field(
        ...,
        description="List of directed edges connecting triggers and nodes in the workflow graph",
    )
