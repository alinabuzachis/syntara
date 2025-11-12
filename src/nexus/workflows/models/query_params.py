"""Query parameter models for workflow-related endpoints."""

from nexus.core.models.base import BaseListParams


class WorkflowListParams(BaseListParams):
    """Query parameters for workflow list endpoint."""

    # Allow filtering by workflow-specific fields
    # Note: Additional query parameters are handled by the service layer
    # for complex filtering operations like created_by, is_enabled, etc.


class ExecutionListParams(BaseListParams):
    """Query parameters for execution list endpoint."""

    # Allow filtering by execution-specific fields
    # Note: Additional query parameters are handled by the service layer
    # for complex filtering operations like workflow_id, status, etc.
