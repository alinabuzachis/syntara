"""Type definitions for the Tool Manager module."""

from langchain_core.tools import BaseTool

from nexus.tool_manager.models.tool import ToolWithParameters

# Type alias for namespaced tool: (namespaced_name, BaseTool)
NamespacedBaseTool = tuple[str, BaseTool]

# Type alias for tool discovery results: (enabled_tools, disabled_tools)
ToolDiscoveryResult = tuple[list[ToolWithParameters], list[ToolWithParameters]]
