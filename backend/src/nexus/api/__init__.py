"""Nexus API - A distributed multi-agent system.

Nexus enables coordinated AI agents to work together on complex tasks.
"""

# ===========================================================
# Import exception classes to trigger exception registration
# -----------------------------------------------------------
from nexus.agent_orchestrator.exceptions import LLMConfigurationError
from nexus.approvals.exceptions import ApprovalAlreadyDecidedError, ApprovalAlreadyRequestedError, ApprovalNotFoundError
from nexus.core.exceptions import SafeValueError
from nexus.files.exceptions import FileValidationError
from nexus.tool_manager.exceptions import (
    ProviderNameConflictError,
    ProviderNotFoundError,
    ToolBulkUpdateValidationError,
    ToolManagerError,
    ToolNotFoundError,
    ToolRefreshError,
)
from nexus.workflows.exceptions import (
    ExecutionNotFoundError,
    TemporalUnavailableError,
    WorkflowNameConflictError,
    WorkflowNotFoundError,
    WorkflowNotPublishedError,
    WorkflowValidationError,
    WorkflowVersionNotFoundError,
)
