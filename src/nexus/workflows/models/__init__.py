"""Workflow models package.

This package contains database models (SQLModel tables):
- Workflow: Workflow database model
- WorkflowVersion: WorkflowVersion database model
- Execution: Execution database model
- ActivityExecution: ActivityExecution database model

And API request/response models (Pydantic):
- ActivitySignalPayload: Signal payload for activity signals
- SignalResponse: Response for signal operations

And WebSocket streaming models (Pydantic):
- ActivityData: Activity data for visualization messages
- JsonPatchOperation: JSON Patch operation for incremental updates
- ExecutionSnapshotMessage: Full execution snapshot message
- ActivityPatchMessage: Incremental activity update message

Usage:
    from nexus.workflows.models import Workflow, WorkflowVersion, Execution, ActivityExecution
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
from .visualization import (
    ActivityPatchMessage,
    ExecutionSnapshotMessage,
    JsonPatchOperation,
)
from .workflow import (
    Workflow,
    WorkflowCreate,
    WorkflowListResponse,
    WorkflowRead,
    WorkflowReadWithVersion,
    WorkflowUpdate,
)
from .workflow_version import WorkflowVersion

__all__ = [
    "TERMINAL_EXECUTION_STATUSES",
    "ActivityData",
    "ActivityExecution",
    "ActivityExecutionListResponse",
    "ActivityListParams",
    "ActivityPatchMessage",
    "ActivitySignalPayload",
    "ActivityStatus",
    "Execution",
    "ExecutionInclude",
    "ExecutionIncludeParams",
    "ExecutionListParams",
    "ExecutionListResponse",
    "ExecutionSnapshotMessage",
    "ExecutionStatus",
    "ExecutionStreamingQueryParams",
    "JsonPatchOperation",
    "SignalResponse",
    "Workflow",
    "WorkflowCreate",
    "WorkflowListParams",
    "WorkflowListResponse",
    "WorkflowRead",
    "WorkflowReadWithVersion",
    "WorkflowUpdate",
    "WorkflowVersion",
]
