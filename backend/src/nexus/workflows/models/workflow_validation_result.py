"""Workflow validation result models."""

from typing import ClassVar

from pydantic import ConfigDict, Field
from sqlmodel import SQLModel

from nexus.workflows.models.workflow_definition import WorkflowDefinition


class ValidationIssue(SQLModel):
    """A single validation issue found in a workflow definition.

    Attributes:
        message: Human-readable description of the issue
        node_id: ID of the node/trigger related to this issue, if applicable

    """

    message: str
    node_id: str | None = None

    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")  # type: ignore[assignment]


class WorkflowValidationResult(SQLModel):
    """Result of validating a workflow definition.

    Attributes:
        valid: True when no errors were found (warnings don't block)
        errors: Issues that prevent the workflow from being enabled
        warnings: Informational issues that don't block enabling

    """

    valid: bool
    errors: list[ValidationIssue] = Field(default_factory=list)
    warnings: list[ValidationIssue] = Field(default_factory=list)

    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")  # type: ignore[assignment]


class WorkflowValidationProblemDetail(SQLModel):
    """RFC 9457 Problem Details with a validation_result extension.

    Attributes:
        type: URI reference identifying the problem type
        title: Short, human-readable summary of the problem
        detail: Human-readable explanation specific to this occurrence
        code: Machine-readable error code
        retryable: Whether this error can be retried
        instance: Optional URI reference identifying the specific occurrence
        validation_result: Structured validation errors and warnings

    """

    type: str
    title: str
    detail: str
    code: str
    retryable: bool
    instance: str | None = None
    validation_result: WorkflowValidationResult

    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")  # type: ignore[assignment]


class WorkflowValidateRequest(SQLModel):
    """Request body for the workflow validation endpoint.

    Attributes:
        workflow_definition: The workflow definition to validate

    """

    workflow_definition: WorkflowDefinition

    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")  # type: ignore[assignment]
