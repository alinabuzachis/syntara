"""Shared exception classes for workflows module.

This module contains all custom exceptions used across workflow services,
following DRY principle by centralizing exception definitions.
"""

from uuid import UUID

from nexus.core.exception_registry import fastapi_exception
from nexus.core.exceptions import NexusError
from nexus.workflows.error_handlers import (
    execution_not_found_handler,
    temporal_unavailable_handler,
    validation_error_handler,
    workflow_disabled_handler,
    workflow_name_conflict_handler,
    workflow_not_found_handler,
    workflow_version_not_found_handler,
)


class WorkflowError(NexusError):
    """Base exception for all workflow errors."""


@fastapi_exception(handler=validation_error_handler)
class WorkflowValidationError(WorkflowError):
    """Workflow validation error."""


@fastapi_exception(handler=workflow_not_found_handler)
class WorkflowNotFoundError(WorkflowError):
    """Raised when a workflow is not found."""

    def __init__(self, workflow_id: UUID) -> None:
        """Initialize exception with workflow ID."""
        self.workflow_id = workflow_id
        super().__init__(f"Workflow {workflow_id} not found")


@fastapi_exception(handler=workflow_name_conflict_handler)
class WorkflowNameConflictError(WorkflowError):
    """Raised when a workflow name already exists."""

    def __init__(self, name: str) -> None:
        """Initialize exception with workflow name."""
        self.name = name
        super().__init__(f"Workflow with name '{name}' already exists")


@fastapi_exception(handler=workflow_version_not_found_handler)
class WorkflowVersionNotFoundError(WorkflowError):
    """Raised when a workflow version is not found."""

    def __init__(self, workflow_id: UUID, version: int) -> None:
        """Initialize exception with workflow ID and version."""
        self.workflow_id = workflow_id
        self.version = version
        super().__init__(f"Workflow {workflow_id} version {version} not found")


@fastapi_exception(handler=workflow_disabled_handler)
class WorkflowDisabledError(WorkflowError):
    """Raised when attempting to execute a disabled workflow."""

    def __init__(self, workflow_id: UUID) -> None:
        """Initialize exception with workflow ID."""
        self.workflow_id = workflow_id
        super().__init__(f"Workflow {workflow_id} is disabled")


@fastapi_exception(handler=execution_not_found_handler)
class ExecutionNotFoundError(WorkflowError):
    """Raised when an execution is not found."""

    def __init__(self, execution_id: UUID) -> None:
        """Initialize exception with execution ID."""
        self.execution_id = execution_id
        super().__init__(f"Execution {execution_id} not found")


@fastapi_exception(handler=temporal_unavailable_handler)
class TemporalUnavailableError(WorkflowError):
    """Raised when Temporal service is unavailable."""

    def __init__(self, operation: str = "operation") -> None:
        """Initialize exception with operation description.

        Args:
            operation: Description of the operation that failed

        """
        self.operation = operation
        super().__init__(f"Temporal service unavailable - cannot perform {operation}")
