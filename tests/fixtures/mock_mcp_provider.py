"""Mock provider implementation for testing purposes."""

import random
from datetime import UTC, datetime
from typing import Any
from unittest.mock import Mock
from uuid import UUID, uuid4

from langchain_core.tools import BaseTool

from nexus.tool_manager.lib.exceptions import ToolNotFoundError, ToolRefreshError
from nexus.tool_manager.lib.providers.base import ToolProviderAdapter
from nexus.tool_manager.models import (
    Tool,
    ToolParameter,
    ToolParameterType,
    ToolProviderValidationResult,
    ToolSchema,
    ToolValidationResult,
)


class MockMCPProvider(ToolProviderAdapter):
    """Mock tool provider for testing core abstractions."""

    def __init__(
        self,
        base_url: str,  # noqa: ARG002
        api_key: str,  # noqa: ARG002
        provider_id: UUID | None = None,
        provider_name: str | None = "mcp-provider",
    ) -> None:
        """Initialize MCP provider with configuration.

        Args:
            base_url: URL of the MCP server
            api_key: Authentication key for the MCP server
            provider_id: Unique identifier for this provider instance (optional for factory)
            provider_name: Human-readable name for the provider (optional for factory)

        """
        self.provider_id = provider_id or uuid4()
        self.provider_name = provider_name

        # Mock tool schemas (separate from Tool models to match new design)
        self._tool_schemas = {
            "echo_tool": {
                "type": "object",
                "properties": {
                    "message": {
                        "type": "string",
                        "description": "Message to echo back",
                    },
                },
                "required": ["message"],
            },
            "calculator": {
                "type": "object",
                "properties": {
                    "operation": {
                        "type": "string",
                        "enum": ["add", "subtract", "multiply", "divide"],
                        "description": "Mathematical operation to perform",
                    },
                    "a": {
                        "type": "number",
                        "description": "First operand",
                    },
                    "b": {
                        "type": "number",
                        "description": "Second operand",
                    },
                },
                "required": ["operation", "a", "b"],
            },
            "file_reader": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Path to file to read",
                    },
                    "encoding": {
                        "type": "string",
                        "default": "utf-8",
                        "description": "File encoding",
                    },
                },
                "required": ["file_path"],
            },
            "random_number": {
                "type": "object",
                "properties": {
                    "min_value": {
                        "type": "integer",
                        "default": 0,
                        "description": "Minimum value (inclusive)",
                    },
                    "max_value": {
                        "type": "integer",
                        "default": 100,
                        "description": "Maximum value (inclusive)",
                    },
                },
            },
        }

        # Mock tool definitions
        self._mock_tools = [
            Tool(
                name="echo_tool",
                namespaced_name=f"{provider_name}::echo_tool",
                description="A simple tool that echoes input back",
                parameters=[
                    ToolParameter(
                        name="message",
                        type=ToolParameterType.STRING,
                        description="Message to echo back",
                        required=True,
                    ),
                ],
            ),
            Tool(
                name="calculator",
                namespaced_name=f"{provider_name}::calculator",
                description="Basic calculator tool for mathematical operations",
                parameters=[
                    ToolParameter(
                        name="operation",
                        type=ToolParameterType.STRING,
                        description="Mathematical operation to perform",
                        required=True,
                    ),
                    ToolParameter(
                        name="a",
                        type=ToolParameterType.NUMBER,
                        description="First operand",
                        required=True,
                    ),
                    ToolParameter(
                        name="b",
                        type=ToolParameterType.NUMBER,
                        description="Second operand",
                        required=True,
                    ),
                ],
            ),
            Tool(
                name="file_reader",
                namespaced_name=f"{provider_name}::file_reader",
                description="Tool for reading file contents",
                parameters=[
                    ToolParameter(
                        name="file_path",
                        type=ToolParameterType.STRING,
                        description="Path to file to read",
                        required=True,
                    ),
                    ToolParameter(
                        name="encoding",
                        type=ToolParameterType.STRING,
                        description="File encoding",
                        required=False,
                        default_value={"value": "utf-8"},
                    ),
                ],
            ),
            Tool(
                name="random_number",
                namespaced_name=f"{provider_name}::random_number",
                description="Generate a random number within specified range",
                parameters=[
                    ToolParameter(
                        name="min_value",
                        type=ToolParameterType.NUMBER,
                        description="Minimum value (inclusive)",
                        required=False,
                        default_value={"value": 0},
                    ),
                    ToolParameter(
                        name="max_value",
                        type=ToolParameterType.NUMBER,
                        description="Maximum value (inclusive)",
                        required=False,
                        default_value={"value": 100},
                    ),
                ],
            ),
        ]

    async def validate_connection(self) -> ToolProviderValidationResult:
        """Validate connection to the mock provider."""
        return ToolProviderValidationResult(
            valid=True,
            provider_type="mcp",
            validated_at=datetime.now(UTC),
        )

    async def refresh_tools(self) -> list[Tool]:
        """Refresh and discover tools from the mock provider."""
        # Return a single tool when refreshed
        # Note: Only set the metadata fields, not database fields like created_by, provider_id
        return [
            Tool(
                name="echo_tool",
                namespaced_name=f"{self.provider_name}::echo_tool",
                description="A simple tool that echoes input back",
                parameters=[
                    ToolParameter(
                        name="message",
                        type=ToolParameterType.STRING,
                        description="Message to echo back",
                        required=True,
                    ),
                ],
            ),
        ]

    async def get_base_tools(self) -> list[BaseTool]:
        """Get LangChain BaseTools from provider without conversion.

        Returns raw BaseTools for use in Agent Orchestrator without
        converting to Tool domain models.
        """
        # Create mock LangChain BaseTools
        mock_tools: list[BaseTool] = []
        for tool in self._mock_tools[:1]:  # Return just echo_tool for simplicity
            mock_tool = Mock(spec=BaseTool)
            mock_tool.name = tool.name
            mock_tool.description = tool.description
            mock_tools.append(mock_tool)

        return mock_tools

    async def get_tool_schema(self, tool_name: str) -> ToolSchema:
        """Get detailed schema for a specific tool."""
        # Find tool by name
        tool = None
        for mock_tool in self._mock_tools:
            if mock_tool.name == tool_name:
                tool = mock_tool
                break

        if not tool:
            msg = f"Tool '{tool_name}' not found in mock provider"
            raise ToolNotFoundError(msg)

        # Get schema from our tool schemas dictionary
        tool_schema = self._tool_schemas.get(tool_name, {})

        return ToolSchema(
            name=tool.name,
            description=tool.description or "No description available",
            input_schema=tool_schema.copy(),
        )

    async def validate_tool(self, tool_name: str, parameters: dict[str, Any] | None = None) -> ToolValidationResult:
        """Validate tool functionality and server communication."""
        start_time = datetime.now(UTC)

        try:
            # Find tool by name
            tool = None
            for mock_tool in self._mock_tools:
                if mock_tool.name == tool_name:
                    tool = mock_tool
                    break

            if not tool:
                msg = f"Tool '{tool_name}' not found in mock provider"
                raise ToolNotFoundError(msg)  # noqa: TRY301

            # Simulate tool execution based on tool type
            parameters = parameters or {}
            test_result = await self._simulate_tool_execution(tool_name, parameters)

            end_time = datetime.now(UTC)
            duration_ms = int((end_time - start_time).total_seconds() * 1000)

            return ToolValidationResult(
                success=True,
                duration_ms=duration_ms,
                status="success",
                message=f"Tool '{tool_name}' validation completed successfully",
                validation_output=test_result,
                validated_at=end_time,
            )

        except Exception as e:
            end_time = datetime.now(UTC)
            duration_ms = int((end_time - start_time).total_seconds() * 1000)

            return ToolValidationResult(
                success=False,
                duration_ms=duration_ms,
                status="failure",
                message=str(e),
                validated_at=end_time,
            )

    async def _simulate_tool_execution(self, tool_name: str, parameters: dict[str, Any]) -> dict[str, Any]:  # noqa: C901
        """Simulate tool execution and return mock results."""
        if tool_name == "echo_tool":
            message = parameters.get("message", "Hello, World!")
            return {
                "echoed_message": message,
                "timestamp": datetime.now(UTC).isoformat(),
            }

        if tool_name == "calculator":
            operation = parameters.get("operation", "add")
            a = parameters.get("a", 0)
            b = parameters.get("b", 0)

            if operation == "add":
                result = a + b
            elif operation == "subtract":
                result = a - b
            elif operation == "multiply":
                result = a * b
            elif operation == "divide":
                if b == 0:
                    msg = "Division by zero"
                    raise ToolRefreshError(msg)
                result = a / b
            else:
                msg = f"Unknown operation: {operation}"
                raise ToolRefreshError(msg)

            return {
                "operation": operation,
                "operands": {"a": a, "b": b},
                "result": result,
            }

        if tool_name == "file_reader":
            file_path = parameters.get("file_path", "/mock/file.txt")
            encoding = parameters.get("encoding", "utf-8")

            # Simulate file reading
            return {
                "file_path": file_path,
                "encoding": encoding,
                "content": f"Mock file content from {file_path}",
                "size_bytes": 42,
                "lines": 3,
            }

        if tool_name == "random_number":
            min_value = parameters.get("min_value", 0)
            max_value = parameters.get("max_value", 100)

            if min_value > max_value:
                msg = "min_value must be <= max_value"
                raise ToolRefreshError(msg)

            result = random.randint(min_value, max_value)  # noqa: S311
            return {
                "random_number": result,
                "range": {"min": min_value, "max": max_value},
                "seed_info": "Mock random generation",
            }

        msg = f"Unknown tool for execution simulation: {tool_name}"
        raise ToolRefreshError(msg)
