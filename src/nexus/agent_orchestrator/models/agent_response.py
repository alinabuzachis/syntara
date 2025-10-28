"""SQLModel schemas for agent responses.

Defines response models for different agent types.
"""

from typing import Any, Literal

from sqlmodel import Field, SQLModel


class GenericAgentResponse(SQLModel):
    """Response model for GenericAgent.

    Used when GenericAgent answers an information query directly
    without generating a workflow.
    """

    type: Literal["answer"] = Field(
        default="answer",
        description="Response type (always 'answer' for GenericAgent)",
    )
    content: str = Field(
        ...,
        description="LLM-generated answer to the user's query",
    )
    response_metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Additional metadata about the response",
        alias="metadata",
    )


class WorkflowResponse(SQLModel):
    """Response model for WorkflowGeneratorAgent.

    Used when WorkflowGeneratorAgent creates a workflow.
    """

    type: Literal["workflow"] = Field(
        default="workflow",
        description="Response type (always 'workflow' for WorkflowGeneratorAgent)",
    )
    workflow_id: str = Field(
        ...,
        description="Unique identifier for the generated workflow",
    )
    content: str = Field(
        ...,
        description="Workflow definition or description",
    )
    response_metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Additional metadata about the workflow",
        alias="metadata",
    )
