"""Tool execution failure retry and auto-disable logic for FR-009 compliance.

This module provides retry policy configuration and failure handling for LangGraph
ToolNode integration. Uses LangGraph's built-in retry_policy instead of custom retry
mechanisms for proper integration with StateGraph execution.
"""

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID

from langchain_core.messages.tool import ToolMessage
from langgraph.prebuilt.tool_node import ToolCallRequest
from langgraph.types import Command

from nexus.agent_orchestrator.tool_manager.tool_manager_client import ToolManagerClient
from nexus.agent_orchestrator.utils import retry_with_backoff
from nexus.core.config.base import get_settings
from nexus.tool_manager.models.tool import ToolStatus

logger = logging.getLogger(__name__)

# Constants
MAX_ERROR_MESSAGE_LENGTH = 500


def _create_error_tool_message(error: Exception, tool_call_id: str, tool_name: str) -> ToolMessage:
    """Create a standardized error ToolMessage.

    Args:
        error: The exception that occurred during tool execution
        tool_call_id: ID of the tool call that failed
        tool_name: Name of the tool that failed

    Returns:
        ToolMessage containing the error information

    """
    return ToolMessage(
        content=f"Tool execution failed: {error.__class__.__name__}: {error!s}",
        tool_call_id=tool_call_id,
        name=tool_name,
        status="error",
    )


def _extract_tool_id_from_metadata(base_tool: Any, tool_name: str) -> UUID | None:  # noqa: ANN401
    """Extract and validate tool_id from BaseTool metadata.

    Args:
        base_tool: The BaseTool instance
        tool_name: Name of the tool for logging

    Returns:
        UUID if valid tool_id found, None otherwise

    """
    if not base_tool or not hasattr(base_tool, "metadata") or not isinstance(base_tool.metadata, dict):
        logger.error(
            "BaseTool missing metadata - this indicates a bug in tool synchronization: tool_name=%s", tool_name
        )
        return None

    tool_id_value = base_tool.metadata.get("tool_id")
    if not tool_id_value:
        logger.error(
            "BaseTool metadata missing tool_id - this indicates a bug in tool synchronization: tool_name=%s",
            tool_name,
        )
        return None

    try:
        tool_id = UUID(str(tool_id_value))
        logger.debug("Extracted tool_id from metadata: %s", tool_id)
        return tool_id
    except (ValueError, TypeError):
        logger.exception(
            "Invalid tool_id format in metadata - this indicates a bug in tool synchronization: "
            "tool_name=%s, tool_id=%s",
            tool_name,
            tool_id_value,
        )
        return None


def create_tool_awrapper() -> Callable[
    [ToolCallRequest, Callable[[ToolCallRequest], Awaitable[ToolMessage | Command[Any]]]],
    Awaitable[ToolMessage | Command[Any]],
]:
    """Create an async tool call wrapper that handles failures with tool context.

    This wrapper intercepts tool execution, provides access to the actual BaseTool,
    and handles failures with proper tool auto-disable functionality.

    Returns:
        An async ToolCallWrapper function for use with ToolNode awrap_tool_call

    """

    @retry_with_backoff
    async def _execute(
        request: ToolCallRequest, execute: Callable[[ToolCallRequest], Awaitable[ToolMessage | Command[Any]]]
    ) -> ToolMessage | Command[Any]:
        # Execute async function
        return await execute(request)

    async def tool_awrapper(
        request: ToolCallRequest,
        execute: Callable[[ToolCallRequest], Awaitable[ToolMessage | Command[Any]]],
    ) -> ToolMessage | Command[Any]:
        """Execute tools and handle failures asynchronously.

        Args:
            request: ToolCallRequest containing tool info and arguments
            execute: Original async tool execution function

        Returns:
            ToolMessage or Command result from tool execution

        """
        try:
            # Execute the tool normally
            return await _execute(request, execute)
        except Exception as error:
            # Extract tool info from request
            tool_name = request.tool_call["name"]
            tool_call_id = request.tool_call["id"]
            base_tool = request.tool

            # Handle the error and extract tool_id for disabling
            logger.exception(
                "Tool execution failed during wrapped call: tool_name=%s",
                tool_name,
            )

            # Extract and validate tool_id from BaseTool metadata
            tool_id = _extract_tool_id_from_metadata(base_tool, tool_name)
            if tool_id is not None:
                # In async context, we're already in the correct event loop
                await _disable_tool_by_id(tool_id, error)

            # Return standardized error message
            return _create_error_tool_message(error, tool_call_id or "unknown", tool_name)

    return tool_awrapper


def create_tool_wrapper(
    loop: asyncio.AbstractEventLoop | None = None,
) -> Callable[[ToolCallRequest, Callable[[ToolCallRequest], ToolMessage | Command[Any]]], ToolMessage | Command[Any]]:
    """Create a synchronous tool call wrapper that handles failures with tool context.

    This wrapper intercepts tool execution, provides access to the actual BaseTool,
    and handles failures with proper tool auto-disable functionality for synchronous tools.

    Args:
        loop: Optional event loop to use for tool disable operations

    Returns:
        A sync ToolCallWrapper function for use with ToolNode wrap_tool_call

    """

    def _execute_sync(
        request: ToolCallRequest, execute: Callable[[ToolCallRequest], ToolMessage | Command[Any]]
    ) -> ToolMessage | Command[Any]:
        """Execute synchronous tool with retry logic."""
        # For sync tools, we use a simplified retry approach
        # since we can't use the async retry_with_backoff decorator
        settings = get_settings()
        max_retries = settings.adapter_max_retries

        for attempt in range(max_retries + 1):
            try:
                return execute(request)
            except Exception:
                if attempt < max_retries:
                    # Simple exponential backoff for sync retry
                    backoff_time = settings.adapter_initial_backoff_seconds * (
                        settings.adapter_backoff_growth_factor**attempt
                    )
                    backoff_time = min(backoff_time, settings.adapter_max_backoff_seconds)
                    time.sleep(backoff_time)
                    continue
                # Final attempt failed, re-raise the error
                raise

        # This should never be reached, but satisfy type checker
        unexpected_end_msg = "Unexpected end of retry loop"
        raise RuntimeError(unexpected_end_msg)

    def tool_wrapper(
        request: ToolCallRequest, execute: Callable[[ToolCallRequest], ToolMessage | Command[Any]]
    ) -> ToolMessage | Command[Any]:
        """Execute tools and handle failures synchronously.

        Args:
            request: ToolCallRequest containing tool info and arguments
            execute: Original sync tool execution function

        Returns:
            ToolMessage result from tool execution

        """
        try:
            # Execute the tool normally with retry
            return _execute_sync(request, execute)
        except Exception as error:
            # Extract tool info from request
            tool_name = request.tool_call["name"]
            tool_call_id = request.tool_call["id"]
            base_tool = request.tool

            logger.exception(
                "Tool execution failed during wrapped call: tool_name=%s",
                tool_name,
            )

            # Extract and validate tool_id from BaseTool metadata
            tool_id = _extract_tool_id_from_metadata(base_tool, tool_name)
            if tool_id is not None:
                # In sync context, use the provided loop or fallback
                _schedule_tool_disable_by_id(tool_id, error, loop)

            # Return standardized error message
            return _create_error_tool_message(error, tool_call_id or "unknown", tool_name)

    return tool_wrapper


def _schedule_tool_disable_by_id(
    tool_id: UUID, error: Exception, loop: asyncio.AbstractEventLoop | None = None
) -> None:
    """Schedule tool disable operation with explicit event loop for sync contexts.

    Args:
        tool_id: ID of the tool to disable
        error: The exception that occurred
        loop: Optional event loop to use for scheduling

    """
    if loop:
        # Use the provided loop to schedule the task
        try:
            task = asyncio.run_coroutine_threadsafe(_disable_tool_by_id(tool_id, error), loop)
            logger.info("Successfully auto-disabled failed tool using provided event loop: tool_id=%s", tool_id)
            # Don't wait for completion to avoid blocking tool execution
            _ = task
        except RuntimeError:
            logger.warning(
                "Failed to schedule tool auto-disable operation on provided event loop: tool_id=%s, error=%s",
                tool_id,
                f"{error.__class__.__name__}: {error!s}",
            )
    else:
        # No loop provided - create a new event loop to run the async operation
        try:
            asyncio.run(_disable_tool_by_id(tool_id, error))
            logger.info("Successfully auto-disabled failed tool using new event loop: tool_id=%s", tool_id)
        except RuntimeError as e:
            logger.warning(
                "Failed to run tool auto-disable operation (no event loop): tool_id=%s, error=%s, details=%s",
                tool_id,
                f"{error.__class__.__name__}: {error!s}",
                str(e),
            )


async def _disable_tool_by_id(tool_id: UUID, error: Exception) -> None:
    """Disable tool by ID after failure.

    This method directly disables the tool using the Tool Manager API.

    Args:
        tool_id: ID of the tool to disable
        error: The exception that caused the failure

    """
    try:
        settings = get_settings()
        async with ToolManagerClient(
            base_url=str(settings.tool_manager_base_url),
            timeout=settings.tool_manager_timeout_seconds,
            max_connections=settings.tool_manager_max_connections,
            max_keepalive_connections=settings.tool_manager_max_keepalive_connections,
        ) as client:
            error_message = f"Tool execution failed: {error.__class__.__name__}: {error!s}"
            if len(error_message) > MAX_ERROR_MESSAGE_LENGTH:
                error_message = error_message[:497] + "..."

            await client.update_tool_status(
                tool_id=tool_id,
                status=ToolStatus.ERROR,
                refresh_error=error_message,
            )

            logger.info("Successfully auto-disabled failed tool: tool_id=%s", tool_id)

    except Exception:
        logger.exception(
            "Failed to auto-disable tool after execution failure: tool_id=%s, error=%s",
            tool_id,
            f"{error.__class__.__name__}: {error!s}",
        )
