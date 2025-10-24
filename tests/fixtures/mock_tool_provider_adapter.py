"""Mock provider implementation for testing purposes."""

import asyncio
import random
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from nexus.tool_manager.lib.exceptions import ProviderError, ToolNotFoundError
from nexus.tool_manager.lib.providers.base import ToolProviderAdapter
from nexus.tool_manager.models import (
    ConnectionValidationResult,
    Tool,
    ToolParameter,
    ToolParameterType,
    ToolSchema,
    ToolValidationResult,
)


class MockProvider(ToolProviderAdapter):
    """Mock tool provider for testing core abstractions."""

    def __init__(
        self,
        provider_name: str = "mock_provider",
        *,
        simulate_timeout: bool = False,
        simulate_connection_error: bool = False,
        simulate_auth_failure: bool = False,
        response_delay_ms: int = 0,
    ) -> None:
        """Initialize mock provider with configurable behavior.

        Args:
            provider_name: Name of the mock provider
            simulate_timeout: Whether to simulate timeout errors
            simulate_connection_error: Whether to simulate connection errors
            simulate_auth_failure: Whether to simulate authentication failures
            response_delay_ms: Artificial delay in milliseconds for testing

        """
        self.provider_name = provider_name
        self.simulate_timeout = simulate_timeout
        self.simulate_connection_error = simulate_connection_error
        self.simulate_auth_failure = simulate_auth_failure
        self.response_delay_ms = response_delay_ms

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
                        tool_id=uuid4(),
                        name="message",
                        type=ToolParameterType.STRING,
                        description="Message to echo back",
                        required=True,
                        created_by=uuid4(),
                        updated_by=uuid4(),
                    ),
                ],
            ),
            Tool(
                name="calculator",
                namespaced_name=f"{provider_name}::calculator",
                description="Basic calculator tool for mathematical operations",
                parameters=[
                    ToolParameter(
                        tool_id=uuid4(),
                        name="operation",
                        type=ToolParameterType.STRING,
                        description="Mathematical operation to perform",
                        required=True,
                        created_by=uuid4(),
                        updated_by=uuid4(),
                    ),
                    ToolParameter(
                        tool_id=uuid4(),
                        name="a",
                        type=ToolParameterType.NUMBER,
                        description="First operand",
                        required=True,
                        created_by=uuid4(),
                        updated_by=uuid4(),
                    ),
                    ToolParameter(
                        tool_id=uuid4(),
                        name="b",
                        type=ToolParameterType.NUMBER,
                        description="Second operand",
                        required=True,
                        created_by=uuid4(),
                        updated_by=uuid4(),
                    ),
                ],
            ),
            Tool(
                name="file_reader",
                namespaced_name=f"{provider_name}::file_reader",
                description="Tool for reading file contents",
                parameters=[
                    ToolParameter(
                        tool_id=uuid4(),
                        name="file_path",
                        type=ToolParameterType.STRING,
                        description="Path to file to read",
                        required=True,
                        created_by=uuid4(),
                        updated_by=uuid4(),
                    ),
                    ToolParameter(
                        tool_id=uuid4(),
                        name="encoding",
                        type=ToolParameterType.STRING,
                        description="File encoding",
                        required=False,
                        default_value={"value": "utf-8"},
                        created_by=uuid4(),
                        updated_by=uuid4(),
                    ),
                ],
            ),
            Tool(
                name="random_number",
                namespaced_name=f"{provider_name}::random_number",
                description="Generate a random number within specified range",
                parameters=[
                    ToolParameter(
                        tool_id=uuid4(),
                        name="min_value",
                        type=ToolParameterType.NUMBER,
                        description="Minimum value (inclusive)",
                        required=False,
                        default_value={"value": 0},
                        created_by=uuid4(),
                        updated_by=uuid4(),
                    ),
                    ToolParameter(
                        tool_id=uuid4(),
                        name="max_value",
                        type=ToolParameterType.NUMBER,
                        description="Maximum value (inclusive)",
                        required=False,
                        default_value={"value": 100},
                        created_by=uuid4(),
                        updated_by=uuid4(),
                    ),
                ],
            ),
        ]

    async def _apply_delay(self) -> None:
        """Apply artificial delay if configured."""
        if self.response_delay_ms > 0:
            await asyncio.sleep(self.response_delay_ms / 1000.0)

    async def _check_error_conditions(self) -> None:
        """Check for simulated error conditions."""
        if self.simulate_timeout:
            msg = "Simulated timeout error"
            raise TimeoutError(msg)

        if self.simulate_connection_error:
            msg = "Simulated connection error"
            raise ConnectionError(msg)

        if self.simulate_auth_failure:
            msg = "Simulated authentication failure"
            raise ProviderError(msg)

    async def validate_connection(self) -> ConnectionValidationResult:
        """Validate connection to the mock provider."""
        await self._apply_delay()
        await self._check_error_conditions()

        return ConnectionValidationResult(
            valid=True,
            provider_type="mock",
            protocol_version="1.0.0",
            validated_at=datetime.now(UTC),
        )

    async def refresh_tools(self) -> list[Tool]:
        """Refresh and discover tools from the mock provider."""
        await self._apply_delay()
        await self._check_error_conditions()

        # Return copies of mock tools to avoid mutation issues
        return [
            Tool(
                name=tool.name,
                namespaced_name=tool.namespaced_name,
                description=tool.description,
                parameters=[
                    ToolParameter(
                        tool_id=uuid4(),
                        name=param.name,
                        type=param.type,
                        description=param.description,
                        required=param.required,
                        default_value=param.default_value,
                        created_by=uuid4(),
                        updated_by=uuid4(),
                    )
                    for param in tool.parameters
                ],
            )
            for tool in self._mock_tools
        ]

    async def get_tool_schema(self, tool_name: str) -> ToolSchema:
        """Get detailed schema for a specific tool."""
        await self._apply_delay()
        await self._check_error_conditions()

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
        await self._apply_delay()

        try:
            await self._check_error_conditions()

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

        except Exception as e:  # noqa: BLE001
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
                    raise ProviderError(msg)
                result = a / b
            else:
                msg = f"Unknown operation: {operation}"
                raise ProviderError(msg)

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
                raise ProviderError(msg)

            result = random.randint(min_value, max_value)  # noqa: S311
            return {
                "random_number": result,
                "range": {"min": min_value, "max": max_value},
                "seed_info": "Mock random generation",
            }

        msg = f"Unknown tool for execution simulation: {tool_name}"
        raise ProviderError(msg)

    def get_tool_names(self) -> list[str]:
        """Get list of available tool names (helper for testing)."""
        return [tool.name for tool in self._mock_tools]

    def get_tool_count(self) -> int:
        """Get count of available tools (helper for testing)."""
        return len(self._mock_tools)

    def set_error_simulation(
        self,
        *,
        timeout: bool = False,
        connection_error: bool = False,
        auth_failure: bool = False,
    ) -> None:
        """Configure error simulation for testing scenarios."""
        self.simulate_timeout = timeout
        self.simulate_connection_error = connection_error
        self.simulate_auth_failure = auth_failure

    def set_response_delay(self, delay_ms: int) -> None:
        """Set artificial response delay for testing."""
        self.response_delay_ms = max(0, delay_ms)
