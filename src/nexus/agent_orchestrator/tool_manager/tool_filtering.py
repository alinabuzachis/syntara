"""Tool filtering logic for matching LangChain BaseTools with Tool Manager tools.

This module provides filtering functionality to match LangChain BaseTools retrieved
from MCP servers with ToolWithParameters from Tool Manager using namespaced_name matching.
"""

import logging

from langchain_core.tools import BaseTool

from nexus.agent_orchestrator.tool_manager.types import NamespacedBaseTool
from nexus.tool_manager.models.tool import ToolStatus, ToolWithParameters

logger = logging.getLogger(__name__)


def filter_base_tools_by_enabled(
    namespaced_tools: list[NamespacedBaseTool],
    enabled_tools: list[ToolWithParameters],
) -> list[NamespacedBaseTool]:
    """Filter NamespacedBaseTools by enabled ToolWithParameters using namespaced_name.

    Args:
        namespaced_tools: List of NamespacedTool from MCP servers
        enabled_tools: List of enabled ToolWithParameters from Tool Manager

    Returns:
        List of NamespacedBaseTools that match enabled ToolWithParameters

    """
    if not namespaced_tools or not enabled_tools:
        return []

    # Create a set of enabled tool names for O(1) lookup
    enabled_names = {tool.namespaced_name for tool in enabled_tools}

    filtered_tools = []
    for namespaced_name, base_tool in namespaced_tools:
        if namespaced_name in enabled_names:
            filtered_tools.append((namespaced_name, base_tool))
            logger.debug("Including enabled tool: %s", namespaced_name)
        else:
            logger.debug("Excluding tool (not enabled or not registered): %s", namespaced_name)

    logger.info("Filtered %d tools from %d base tools", len(filtered_tools), len(namespaced_tools))
    return filtered_tools


def enhance_namespaced_tools_with_metadata(
    namespaced_tools: list[NamespacedBaseTool],
    enabled_tools: list[ToolWithParameters],
) -> list[BaseTool]:
    """Enhance NamespacedBaseTools with metadata from Tool Manager (optimized version).

    This function is optimized to work with NamespacedBaseTools to avoid regenerating
    namespace names during metadata enhancement.

    Args:
        namespaced_tools: List of NamespacedBaseTools (namespaced_name, BaseTool)
        enabled_tools: List of enabled ToolWithParameters from Tool Manager

    Returns:
        List of BaseTools enhanced with metadata

    """
    if not namespaced_tools or not enabled_tools:
        return [base_tool for _, base_tool in namespaced_tools]

    # Create a mapping of namespaced_name to tool IDs for O(1) lookup
    # This avoids the need to regenerate namespace names from enabled_tools
    namespaced_name_to_id = {tool.namespaced_name: tool.id for tool in enabled_tools}

    enhanced_tools = []
    for namespaced_name, base_tool in namespaced_tools:
        if namespaced_name in namespaced_name_to_id:
            tool_id = namespaced_name_to_id[namespaced_name]

            # Add tool_id to BaseTool metadata for failure handling
            if not hasattr(base_tool, "metadata") or base_tool.metadata is None:
                base_tool.metadata = {}
            base_tool.metadata["tool_id"] = str(tool_id)

            logger.debug("Enhanced tool with metadata: %s (tool_id=%s)", namespaced_name, tool_id)
        else:
            logger.warning("Could not find tool_id for tool: %s", namespaced_name)

        enhanced_tools.append(base_tool)

    logger.info("Enhanced %d tools with metadata", len(enhanced_tools))
    return enhanced_tools


def identify_missing_tools(
    namespaced_tools: list[NamespacedBaseTool],
    enabled_tools: list[ToolWithParameters],
) -> list[ToolWithParameters]:
    """Identify ToolWithParameters that are missing from MCP server BaseTools.

    Args:
        namespaced_tools: List of NamespacedTool from MCP servers
        enabled_tools: List of enabled ToolWithParameters from Tool Manager

    Returns:
        List of ToolWithParameters that are missing from MCP servers

    """
    if not enabled_tools:
        return []

    # Create a set of namespaced tool names for O(1) lookup
    namespaced_names = {namespaced_name for namespaced_name, _ in namespaced_tools} if namespaced_tools else set()

    missing_tools = []
    for enabled_tool in enabled_tools:
        if enabled_tool.namespaced_name not in namespaced_names:
            missing_tools.append(enabled_tool)
            logger.debug("Tool missing from MCP server: %s", enabled_tool.namespaced_name)

    logger.info("Identified %d tools missing from MCP servers", len(missing_tools))
    return missing_tools


def identify_unregistered_tools(
    namespaced_tools: list[NamespacedBaseTool],
    enabled_tools: list[ToolWithParameters],
) -> list[BaseTool]:
    """Identify BaseTools that are not registered in Tool Manager.

    Args:
        namespaced_tools: List of NamespacedTool from MCP servers
        enabled_tools: List of enabled ToolWithParameters from Tool Manager

    Returns:
        List of BaseTools that are not registered in Tool Manager

    """
    if not namespaced_tools:
        return []

    # Create a set of enabled tool names for O(1) lookup
    enabled_names = {tool.namespaced_name for tool in enabled_tools} if enabled_tools else set()

    unregistered_tools = []
    for namespaced_name, base_tool in namespaced_tools:
        if namespaced_name not in enabled_names:
            unregistered_tools.append(base_tool)
            logger.debug("Unregistered tool found in MCP server: %s", namespaced_name)

    logger.info("Identified %d unregistered tools in MCP servers", len(unregistered_tools))
    return unregistered_tools


def identify_re_enableable_tools(
    namespaced_tools: list[NamespacedBaseTool],
    disabled_tools: list[ToolWithParameters],
) -> list[ToolWithParameters]:
    """Identify disabled ToolWithParameters that are now available on MCP servers.

    Only re-enables tools that were automatically disabled by the system (status=MISSING),
    not tools that were manually disabled by users (status=AVAILABLE).

    Args:
        namespaced_tools: List of NamespacedTool from MCP servers
        disabled_tools: List of disabled ToolWithParameters from Tool Manager

    Returns:
        List of disabled ToolWithParameters that can now be re-enabled

    """
    if not disabled_tools or not namespaced_tools:
        return []

    # Create a set of namespaced tool names for O(1) lookup
    namespaced_names = {namespaced_name for namespaced_name, _ in namespaced_tools}

    re_enableable_tools = []
    for disabled_tool in disabled_tools:
        # Only re-enable tools that were automatically disabled (MISSING status)
        # Do NOT re-enable manually disabled tools (AVAILABLE status)
        if disabled_tool.namespaced_name in namespaced_names and disabled_tool.status == ToolStatus.MISSING:
            re_enableable_tools.append(disabled_tool)
            logger.debug("Previously missing tool now available on MCP server: %s", disabled_tool.namespaced_name)
        elif disabled_tool.namespaced_name in namespaced_names and disabled_tool.status == ToolStatus.AVAILABLE:
            logger.debug("Skipping manually disabled tool (will not auto re-enable): %s", disabled_tool.namespaced_name)

    logger.info("Identified %d automatically disabled tools that can be re-enabled", len(re_enableable_tools))
    return re_enableable_tools
