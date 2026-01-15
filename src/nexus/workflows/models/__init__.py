"""Workflow models package.

This package contains database models (SQLModel tables):
- Workflow: Workflow database model
- WorkflowVersion: WorkflowVersion database model
- Execution: Execution database model
- ActivityExecution: ActivityExecution database model

And API request/response models (Pydantic):
- ActivitySignalPayload: Signal payload for activity signals
- SignalResponse: Response for signal operations

Usage:
    from nexus.workflows.models import Workflow, WorkflowVersion, Execution, ActivityExecution
    from nexus.workflows.models import ActivitySignalPayload, SignalResponse
"""

from .activity_execution import ActivityExecution, ActivityStatus
from .execution import Execution, ExecutionListResponse, ExecutionStatus
from .query_params import ExecutionListParams, WorkflowListParams
from .signal import ActivitySignalPayload, SignalResponse
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
    "ActivityExecution",
    "ActivitySignalPayload",
    "ActivityStatus",
    "Execution",
    "ExecutionListParams",
    "ExecutionListResponse",
    "ExecutionStatus",
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
