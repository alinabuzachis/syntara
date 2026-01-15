"""Tool Manager integration for Agent Orchestrator."""

from .tool_filtering import (
    enhance_namespaced_tools_with_metadata,
    filter_base_tools_by_enabled,
    identify_missing_tools,
    identify_unregistered_tools,
)
from .tool_manager_client import ToolManagerClient
from .tool_services import (
    ToolSynchronizer,
    report_tool_execution_failure,
)
from .types import NamespacedBaseTool

__all__ = [
    "NamespacedBaseTool",
    "ToolManagerClient",
    "ToolSynchronizer",
    "enhance_namespaced_tools_with_metadata",
    "filter_base_tools_by_enabled",
    "identify_missing_tools",
    "identify_unregistered_tools",
    "report_tool_execution_failure",
]
