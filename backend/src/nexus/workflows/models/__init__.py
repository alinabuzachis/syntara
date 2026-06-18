"""Workflow models package.

This package contains database models (SQLModel tables):
- Workflow: Workflow database model
- WorkflowVersion: WorkflowVersion database model
- Execution: Execution database model
- ActivityExecution: ActivityExecution database model
- WebhookTrigger: WebhookTrigger database model

And API request/response models (Pydantic):
- ActivitySignalPayload: Signal payload for activity signals
- SignalResponse: Response for signal operations

And WebSocket streaming models (Pydantic):
- ActivityData: Activity data for visualization messages
- JsonPatchOperation: JSON Patch operation for incremental updates
- ExecutionSnapshotMessage: Full execution snapshot message
- ActivityPatchMessage: Incremental activity update message

Usage:
    from nexus.workflows.models import Workflow, WorkflowVersion, Execution, ActivityExecution, WebhookTrigger
    from nexus.workflows.models import ActivitySignalPayload, SignalResponse
    from nexus.workflows.models import ActivityData, ExecutionSnapshotMessage, ActivityPatchMessage
"""

from .activity_execution import ActivityExecution, ActivityExecutionListResponse, ActivityStatus
from .execution import (
    TERMINAL_EXECUTION_STATUSES,
    ActivityData,
    Execution,
    ExecutionInclude,
    ExecutionListResponse,
    ExecutionStatus,
)
from .query_params import (
    ActivityListParams,
    ExecutionIncludeParams,
    ExecutionListParams,
    ExecutionStreamingQueryParams,
    WorkflowListParams,
)
from .signal import ActivitySignalPayload, SignalResponse
from .validation_finding import (
    DetailedValidationProblemDetail,
    ValidationCategory,
    ValidationFinding,
    ValidationResult,
    ValidationSeverity,
)
from .visualization import (
    ActivityPatchMessage,
    ExecutionSnapshotMessage,
    JsonPatchOperation,
)
from .webhook_trigger import WebhookTrigger, WebhookTriggerRead
from .workflow import (
    Workflow,
    WorkflowCreate,
    WorkflowListResponse,
    WorkflowRead,
    WorkflowReadWithVersion,
    WorkflowUpdate,
)
from .workflow_definition import WorkflowDefinition
from .workflow_validation_result import (
    ValidationIssue,
    WorkflowValidateRequest,
    WorkflowValidationProblemDetail,
    WorkflowValidationResult,
)
from .workflow_version import (
    PublishVersionRequest,
    WorkflowVersion,
    WorkflowVersionListResponse,
    WorkflowVersionRead,
    WorkflowVersionStatus,
)

__all__ = [
    "TERMINAL_EXECUTION_STATUSES",
    "ActivityData",
    "ActivityExecution",
    "ActivityExecutionListResponse",
    "ActivityListParams",
    "ActivityPatchMessage",
    "ActivitySignalPayload",
    "ActivityStatus",
    "DetailedValidationProblemDetail",
    "Execution",
    "ExecutionInclude",
    "ExecutionIncludeParams",
    "ExecutionListParams",
    "ExecutionListResponse",
    "ExecutionSnapshotMessage",
    "ExecutionStatus",
    "ExecutionStreamingQueryParams",
    "JsonPatchOperation",
    "PublishVersionRequest",
    "SignalResponse",
    "ValidationCategory",
    "ValidationFinding",
    "ValidationIssue",
    "ValidationResult",
    "ValidationSeverity",
    "WebhookTrigger",
    "WebhookTriggerRead",
    "Workflow",
    "WorkflowCreate",
    "WorkflowDefinition",
    "WorkflowListParams",
    "WorkflowListResponse",
    "WorkflowRead",
    "WorkflowReadWithVersion",
    "WorkflowUpdate",
    "WorkflowValidateRequest",
    "WorkflowValidationProblemDetail",
    "WorkflowValidationResult",
    "WorkflowVersion",
    "WorkflowVersionListResponse",
    "WorkflowVersionRead",
    "WorkflowVersionStatus",
]
