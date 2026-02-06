"""Nexus API - A distributed multi-agent system.

Nexus enables coordinated AI agents to work together on complex tasks.
"""

# ===========================================================
# Import exception classes to trigger exception registration
# -----------------------------------------------------------
from nexus.agent_orchestrator.exceptions import LLMConfigurationError
from nexus.files.validators import ValidationError as FileValidationError
from nexus.tool_manager.lib.exceptions import (
    ProviderError,
    ProviderNameConflictError,
    ProviderNotFoundError,
    ToolManagerError,
    ToolNotFoundError,
)
from nexus.tool_manager.lib.exceptions import ValidationError as ToolValidationError
from nexus.workflows.exceptions import (
    ExecutionNotFoundError,
    TemporalUnavailableError,
    WorkflowDisabledError,
    WorkflowNameConflictError,
    WorkflowNotFoundError,
    WorkflowVersionNotFoundError,
)
from nexus.workflows.validators.workflow_definition import (
    ValidationError as WorkflowValidationError,
)
