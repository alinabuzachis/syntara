"""Unit tests for MockProvider fixture.

Tests cover:
- MockProvider implementation of ToolProviderAdapter protocol
- Error simulation capabilities
- Tool discovery and validation
- Connection validation
- Configuration options and behavior
"""

import asyncio
from datetime import UTC, datetime
from typing import Any

import pytest

from nexus.tool_manager.lib.exceptions import ProviderError, ToolNotFoundError
from nexus.tool_manager.models import (
    ConnectionValidationResult,
    ToolSchema,
    ToolValidationResult,
)
from tests.fixtures import MockProvider


class TestMockProvider:
    """Test suite for MockProvider implementation."""

    def test_mock_provider_initialization_defaults(self) -> None:
        """Test MockProvider initialization with default values."""
        provider = MockProvider()

        assert provider.provider_name == "mock_provider"
        assert provider.simulate_timeout is False
        assert provider.simulate_connection_error is False
        assert provider.simulate_auth_failure is False
        assert provider.response_delay_ms == 0

    def test_mock_provider_initialization_custom(self) -> None:
        """Test MockProvider initialization with custom values."""
        provider = MockProvider(
            provider_name="custom_mock",
            simulate_timeout=True,
            simulate_connection_error=True,
            simulate_auth_failure=True,
            response_delay_ms=500,
        )

        assert provider.provider_name == "custom_mock"
        assert provider.simulate_timeout is True
        assert provider.simulate_connection_error is True
        assert provider.simulate_auth_failure is True
        assert provider.response_delay_ms == 500

    @pytest.mark.asyncio
    async def test_validate_connection_success(self) -> None:
        """Test successful connection validation."""
        provider = MockProvider()

        result = await provider.validate_connection()

        assert isinstance(result, ConnectionValidationResult)
        assert result.valid is True
        assert result.provider_type == "mock"
        assert result.protocol_version == "1.0.0"
        assert isinstance(result.validated_at, datetime)
        assert result.error is None

    @pytest.mark.asyncio
    async def test_validate_connection_timeout_error(self) -> None:
        """Test connection validation with timeout simulation."""
        provider = MockProvider(simulate_timeout=True)

        with pytest.raises(TimeoutError, match="Simulated timeout error"):
            await provider.validate_connection()

    @pytest.mark.asyncio
    async def test_validate_connection_connection_error(self) -> None:
        """Test connection validation with connection error simulation."""
        provider = MockProvider(simulate_connection_error=True)

        with pytest.raises(ConnectionError, match="Simulated connection error"):
            await provider.validate_connection()

    @pytest.mark.asyncio
    async def test_validate_connection_auth_failure(self) -> None:
        """Test connection validation with authentication failure simulation."""
        provider = MockProvider(simulate_auth_failure=True)

        with pytest.raises(ProviderError, match="Simulated authentication failure"):
            await provider.validate_connection()

    @pytest.mark.asyncio
    async def test_validate_connection_with_delay(self) -> None:
        """Test connection validation with artificial delay."""
        provider = MockProvider(response_delay_ms=100)

        start_time = datetime.now(UTC)
        result = await provider.validate_connection()
        end_time = datetime.now(UTC)

        # Should have taken at least 100ms
        duration_ms = (end_time - start_time).total_seconds() * 1000
        assert duration_ms >= 90  # Allow some tolerance for timing

        assert result.valid is True

    @pytest.mark.asyncio
    async def test_refresh_tools_success(self) -> None:
        """Test successful tool refresh."""
        provider = MockProvider()

        tools = await provider.refresh_tools()

        assert isinstance(tools, list)
        assert len(tools) == 4  # MockProvider defines 4 tools

        # Check tool names
        tool_names = {tool.name for tool in tools}
        expected_names = {"echo_tool", "calculator", "file_reader", "random_number"}
        assert tool_names == expected_names

        # Check namespaced names
        for tool in tools:
            assert tool.namespaced_name.startswith("mock_provider::")
            assert tool.name in tool.namespaced_name

    @pytest.mark.asyncio
    async def test_refresh_tools_with_custom_provider_name(self) -> None:
        """Test tool refresh with custom provider name."""
        provider = MockProvider(provider_name="custom_test")

        tools = await provider.refresh_tools()

        # All tools should have custom provider name in namespaced name
        for tool in tools:
            assert tool.namespaced_name.startswith("custom_test::")

    @pytest.mark.asyncio
    async def test_refresh_tools_error_conditions(self) -> None:
        """Test tool refresh with various error conditions."""
        # Test timeout
        provider = MockProvider(simulate_timeout=True)
        with pytest.raises(TimeoutError):
            await provider.refresh_tools()

        # Test connection error
        provider = MockProvider(simulate_connection_error=True)
        with pytest.raises(ConnectionError):
            await provider.refresh_tools()

        # Test auth failure
        provider = MockProvider(simulate_auth_failure=True)
        with pytest.raises(ProviderError):
            await provider.refresh_tools()

    @pytest.mark.asyncio
    async def test_get_tool_schema_success(self) -> None:
        """Test successful tool schema retrieval."""
        provider = MockProvider()

        # Test echo_tool schema
        schema = await provider.get_tool_schema("echo_tool")

        assert isinstance(schema, ToolSchema)
        assert schema.name == "echo_tool"
        assert schema.description == "A simple tool that echoes input back"
        assert isinstance(schema.input_schema, dict)
        assert "message" in schema.input_schema.get("properties", {})

    @pytest.mark.asyncio
    async def test_get_tool_schema_all_tools(self) -> None:
        """Test schema retrieval for all available tools."""
        provider = MockProvider()
        expected_tools = ["echo_tool", "calculator", "file_reader", "random_number"]

        for tool_name in expected_tools:
            schema = await provider.get_tool_schema(tool_name)
            assert schema.name == tool_name
            assert isinstance(schema.input_schema, dict)
            assert schema.description is not None

    @pytest.mark.asyncio
    async def test_get_tool_schema_not_found(self) -> None:
        """Test tool schema retrieval for non-existent tool."""
        provider = MockProvider()

        with pytest.raises(ToolNotFoundError, match="Tool 'nonexistent' not found in mock provider"):
            await provider.get_tool_schema("nonexistent")

    @pytest.mark.asyncio
    async def test_validate_tool_success(self) -> None:
        """Test successful tool validation."""
        provider = MockProvider()

        result = await provider.validate_tool("echo_tool", {"message": "test"})

        assert isinstance(result, ToolValidationResult)
        assert result.success is True
        assert result.status == "success"
        assert result.duration_ms >= 0
        assert isinstance(result.validated_at, datetime)
        assert result.validation_output is not None
        assert "echoed_message" in result.validation_output

    @pytest.mark.asyncio
    async def test_validate_tool_all_tools(self) -> None:
        """Test validation for all available tools."""
        provider = MockProvider()

        test_cases: list[tuple[str, dict[str, Any]]] = [
            ("echo_tool", {"message": "hello"}),
            ("calculator", {"operation": "add", "a": 5, "b": 3}),
            ("file_reader", {"file_path": "/test/file.txt"}),
            ("random_number", {"min_value": 1, "max_value": 10}),
        ]

        for tool_name, params in test_cases:
            result = await provider.validate_tool(tool_name, params)
            assert result.success is True
            assert result.status == "success"
            assert result.validation_output is not None

    @pytest.mark.asyncio
    async def test_validate_tool_without_parameters(self) -> None:
        """Test tool validation without providing parameters."""
        provider = MockProvider()

        # Should work with None parameters (uses defaults)
        result = await provider.validate_tool("echo_tool", None)
        assert result.success is True

        # Should work with empty dict
        result = await provider.validate_tool("echo_tool", {})
        assert result.success is True

    @pytest.mark.asyncio
    async def test_validate_tool_not_found(self) -> None:
        """Test tool validation for non-existent tool."""
        provider = MockProvider()

        result = await provider.validate_tool("nonexistent")

        assert result.success is False
        assert result.status == "failure"
        assert "not found" in result.message.lower()

    @pytest.mark.asyncio
    async def test_validate_tool_calculator_operations(self) -> None:
        """Test calculator tool validation with different operations."""
        provider = MockProvider()

        test_cases = [
            ({"operation": "add", "a": 10, "b": 5}, 15),
            ({"operation": "subtract", "a": 10, "b": 3}, 7),
            ({"operation": "multiply", "a": 4, "b": 6}, 24),
            ({"operation": "divide", "a": 15, "b": 3}, 5),
        ]

        for params, expected_result in test_cases:
            result = await provider.validate_tool("calculator", params)
            assert result.success is True
            assert result.validation_output["result"] == expected_result

    @pytest.mark.asyncio
    async def test_validate_tool_calculator_division_by_zero(self) -> None:
        """Test calculator tool validation with division by zero."""
        provider = MockProvider()

        result = await provider.validate_tool(
            "calculator",
            {
                "operation": "divide",
                "a": 10,
                "b": 0,
            },
        )

        assert result.success is False
        assert result.status == "failure"
        assert "division by zero" in result.message.lower()

    @pytest.mark.asyncio
    async def test_validate_tool_random_number_validation(self) -> None:
        """Test random number tool validation with invalid range."""
        provider = MockProvider()

        # Test invalid range (min > max)
        result = await provider.validate_tool(
            "random_number",
            {
                "min_value": 100,
                "max_value": 50,
            },
        )

        assert result.success is False
        assert result.status == "failure"
        assert "min_value must be <= max_value" in result.message

    def test_helper_methods(self) -> None:
        """Test MockProvider helper methods."""
        provider = MockProvider()

        # Test get_tool_names
        tool_names = provider.get_tool_names()
        assert isinstance(tool_names, list)
        assert len(tool_names) == 4
        assert "echo_tool" in tool_names
        assert "calculator" in tool_names

        # Test get_tool_count
        assert provider.get_tool_count() == 4

    def test_error_simulation_configuration(self) -> None:
        """Test error simulation configuration methods."""
        provider = MockProvider()

        # Test set_error_simulation
        provider.set_error_simulation(
            timeout=True,
            connection_error=True,
            auth_failure=True,
        )

        assert provider.simulate_timeout is True
        assert provider.simulate_connection_error is True
        assert provider.simulate_auth_failure is True

        # Test resetting errors
        provider.set_error_simulation(
            timeout=False,
            connection_error=False,
            auth_failure=False,
        )

        assert provider.simulate_timeout is False
        assert provider.simulate_connection_error is False  # type: ignore[unreachable]
        assert provider.simulate_auth_failure is False

    def test_response_delay_configuration(self) -> None:
        """Test response delay configuration."""
        provider = MockProvider()

        # Test set_response_delay
        provider.set_response_delay(250)
        assert provider.response_delay_ms == 250

        # Test negative delay (should be clamped to 0)
        provider.set_response_delay(-100)
        assert provider.response_delay_ms == 0

    @pytest.mark.asyncio
    async def test_concurrent_operations(self) -> None:
        """Test concurrent operations on MockProvider."""
        provider = MockProvider()

        # Create multiple concurrent validation tasks
        tasks = [provider.validate_tool("echo_tool", {"message": f"test_{i}"}) for i in range(10)]

        # Run concurrently
        results = await asyncio.gather(*tasks)

        # All should succeed
        assert len(results) == 10
        for result in results:
            assert result.success is True
            assert result.status == "success"

    @pytest.mark.asyncio
    async def test_tool_schema_consistency(self) -> None:
        """Test consistency between refresh_tools and get_tool_schema."""
        provider = MockProvider()

        # Get tools from refresh
        tools = await provider.refresh_tools()

        # For each tool, verify schema consistency
        for tool in tools:
            schema = await provider.get_tool_schema(tool.name)

            # Names should match
            assert schema.name == tool.name

            # Schema should have proper structure
            assert isinstance(schema.input_schema, dict)

            # For tools with known schemas, verify they're returned correctly
            if tool.name in ["echo_tool", "calculator", "file_reader"]:
                assert schema.input_schema.get("type") == "object"
                assert "properties" in schema.input_schema

    @pytest.mark.asyncio
    async def test_tool_parameters_match_schema(self) -> None:
        """Test that tool parameters match the schema properties."""
        provider = MockProvider()

        tools = await provider.refresh_tools()

        for tool in tools:
            # Get the schema from the provider
            schema = await provider.get_tool_schema(tool.name)

            if schema.input_schema and "properties" in schema.input_schema:
                schema_properties = set(schema.input_schema["properties"].keys())
                param_names = {param.name for param in tool.parameters}

                # Parameter names should match schema properties
                assert param_names == schema_properties
