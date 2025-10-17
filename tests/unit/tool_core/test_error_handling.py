"""Tests for error handling scenarios in tool management."""

from uuid import uuid4

import pytest

from nexus.tool_manager.lib.tool_core import (
    Provider,
    ProviderError,
    ProviderNotFoundError,
    Tool,
    ToolManagerError,
    ToolNotFoundError,
    ValidationError,
    refresh_tools,
    register_provider,
    validate_provider_connection,
)
from tests.fixtures.mock_provider import MockProvider
from tests.fixtures.mock_provider_repository import MockProviderRepository
from tests.fixtures.mock_tool_repository import MockToolRepository

# Test constants
DIVISION_NUMERATOR = 10
DIVISION_BY_ZERO = 0
CALCULATOR_OPERANDS_A = 1
CALCULATOR_OPERANDS_B = 2


class TestExceptions:
    """Test cases for custom exceptions."""

    def test_tool_manager_error_base(self) -> None:
        """Test base ToolManagerError exception."""
        error = ToolManagerError("Base error message")
        assert str(error) == "Base error message"
        assert isinstance(error, Exception)

    def test_provider_error_inheritance(self) -> None:
        """Test ProviderError inherits from ToolManagerError."""
        error = ProviderError("Provider specific error")
        assert str(error) == "Provider specific error"
        assert isinstance(error, ToolManagerError)
        assert isinstance(error, Exception)

    def test_tool_not_found_error_inheritance(self) -> None:
        """Test ToolNotFoundError inherits from ToolManagerError."""
        error = ToolNotFoundError("Tool not found")
        assert str(error) == "Tool not found"
        assert isinstance(error, ToolManagerError)

    def test_validation_error_inheritance(self) -> None:
        """Test ValidationError inherits from ToolManagerError."""
        error = ValidationError("Validation failed")
        assert str(error) == "Validation failed"
        assert isinstance(error, ToolManagerError)

    def test_provider_not_found_error_inheritance(self) -> None:
        """Test ProviderNotFoundError inherits from ToolManagerError."""
        error = ProviderNotFoundError("Provider not found")
        assert str(error) == "Provider not found"
        assert isinstance(error, ToolManagerError)


class TestProviderErrorHandling:
    """Test cases for provider-related error scenarios."""

    @pytest.mark.asyncio
    async def test_timeout_error_handling(self) -> None:
        """Test handling of provider timeout errors."""
        repo = MockProviderRepository()
        adapter = MockProvider()
        adapter.set_error_simulation(timeout=True)

        # Create test provider
        provider = Provider(name="timeout_provider", provider_type="mock")
        created_provider = await repo.create(provider)

        # Validation should raise TimeoutError
        with pytest.raises(TimeoutError):
            await validate_provider_connection(created_provider.id, repo, adapter)

    @pytest.mark.asyncio
    async def test_connection_error_handling(self) -> None:
        """Test handling of provider connection errors."""
        repo = MockProviderRepository()
        adapter = MockProvider()
        adapter.set_error_simulation(connection_error=True)

        # Create test provider
        provider = Provider(name="connection_error_provider", provider_type="mock")
        created_provider = await repo.create(provider)

        # Validation should raise ConnectionError
        with pytest.raises(ConnectionError):
            await validate_provider_connection(created_provider.id, repo, adapter)

    @pytest.mark.asyncio
    async def test_auth_failure_handling(self) -> None:
        """Test handling of provider authentication failures."""
        repo = MockProviderRepository()
        adapter = MockProvider()
        adapter.set_error_simulation(auth_failure=True)

        # Create test provider
        provider = Provider(name="auth_failure_provider", provider_type="mock")
        created_provider = await repo.create(provider)

        # Validation should raise ProviderError
        with pytest.raises(ProviderError):
            await validate_provider_connection(created_provider.id, repo, adapter)

    @pytest.mark.asyncio
    async def test_duplicate_provider_registration(self) -> None:
        """Test error handling for duplicate provider registration."""
        repo = MockProviderRepository()

        # Register first provider
        await register_provider(
            name="duplicate_provider",
            description="First provider",
            provider_type="mock",
            configuration={},
            provider_repo=repo,
        )

        # Attempt to register duplicate
        with pytest.raises(ValidationError, match="Provider with name 'duplicate_provider' already exists"):
            await register_provider(
                name="duplicate_provider",
                description="Second provider",
                provider_type="mock",
                configuration={},
                provider_repo=repo,
            )


class TestToolErrorHandling:
    """Test cases for tool-related error scenarios."""

    @pytest.mark.asyncio
    async def test_tool_not_found_in_provider(self) -> None:
        """Test error handling when tool not found in provider."""
        adapter = MockProvider()

        # Test with non-existent tool name
        with pytest.raises(ToolNotFoundError, match="Tool 'nonexistent_tool' not found"):
            await adapter.get_tool_schema("nonexistent_tool")

    @pytest.mark.asyncio
    async def test_tool_validation_not_found_in_provider(self) -> None:
        """Test error handling when validating non-existent tool."""
        adapter = MockProvider()

        # Validate tool that doesn't exist
        result = await adapter.validate_tool("nonexistent_tool", {})

        assert result.success is False
        assert result.status == "failure"
        assert "not found" in result.message.lower()

    @pytest.mark.asyncio
    async def test_tool_execution_error_simulation(self) -> None:
        """Test error handling during tool execution."""
        adapter = MockProvider()

        # Validate calculator with division by zero
        result = await adapter.validate_tool(
            "calculator",
            {
                "operation": "divide",
                "a": DIVISION_NUMERATOR,
                "b": DIVISION_BY_ZERO,
            },
        )

        assert result.success is False
        assert result.status == "failure"
        assert "Division by zero" in result.message

    @pytest.mark.asyncio
    async def test_tool_validation_errors(self) -> None:
        """Test tool parameter validation errors."""
        adapter = MockProvider()

        # Validate calculator with invalid operation
        result = await adapter.validate_tool(
            "calculator",
            {
                "operation": "invalid_op",
                "a": CALCULATOR_OPERANDS_A,
                "b": CALCULATOR_OPERANDS_B,
            },
        )

        assert result.success is False
        assert result.status == "failure"
        assert "Unknown operation" in result.message


class TestRepositoryErrorHandling:
    """Test cases for repository-related error scenarios."""

    @pytest.mark.asyncio
    async def test_provider_repository_not_found_error(self) -> None:
        """Test provider repository not found errors."""
        repo = MockProviderRepository()

        # Get by non-existent ID
        result = await repo.get_by_id(uuid4())
        assert result is None

        # Get by non-existent name
        result = await repo.get_by_name("nonexistent_provider")
        assert result is None

    @pytest.mark.asyncio
    async def test_tool_repository_not_found_error(self) -> None:
        """Test tool repository not found errors."""
        repo = MockToolRepository()

        # Get by non-existent ID
        result = await repo.get_by_id(uuid4())
        assert result is None

        # Get by non-existent namespaced name
        result = await repo.get_by_namespaced_name("nonexistent::tool")
        assert result is None

    @pytest.mark.asyncio
    async def test_provider_repository_duplicate_name_error(self) -> None:
        """Test provider repository duplicate name handling."""
        repo = MockProviderRepository()

        # Create first provider
        provider1 = Provider(name="duplicate_name", provider_type="mock")
        await repo.create(provider1)

        # Try to create second provider with same name
        provider2 = Provider(name="duplicate_name", provider_type="mock")

        with pytest.raises(ValidationError, match="Provider with name 'duplicate_name' already exists"):
            await repo.create(provider2)

    @pytest.mark.asyncio
    async def test_tool_repository_duplicate_namespaced_name_error(self) -> None:
        """Test tool repository duplicate namespaced name handling."""
        repo = MockToolRepository()

        # Create first tool
        tool1 = Tool(name="tool", namespaced_name="provider::tool")
        await repo.create(tool1)

        # Try to create second tool with same namespaced name
        tool2 = Tool(name="tool", namespaced_name="provider::tool")

        with pytest.raises(ValidationError, match="Tool with namespaced name 'provider::tool' already exists"):
            await repo.create(tool2)

    @pytest.mark.asyncio
    async def test_repository_update_not_found_errors(self) -> None:
        """Test repository update operations with non-existent entities."""
        provider_repo = MockProviderRepository()
        tool_repo = MockToolRepository()

        # Try to update non-existent provider
        non_existent_provider = Provider(id=uuid4(), name="nonexistent")
        with pytest.raises(ProviderNotFoundError):
            await provider_repo.update(non_existent_provider)

        # Try to update non-existent tool
        non_existent_tool = Tool(id=uuid4(), name="nonexistent")
        with pytest.raises(ToolNotFoundError):
            await tool_repo.update(non_existent_tool)


class TestErrorPropagation:
    """Test cases for error propagation through function layers."""

    @pytest.mark.asyncio
    async def test_provider_validation_error_propagation(self) -> None:
        """Test that provider validation errors are properly propagated."""
        repo = MockProviderRepository()

        # Create provider
        provider = Provider(name="error_provider", provider_type="mock")
        created_provider = await repo.create(provider)

        # Create adapter that simulates various errors
        expected_error: type[TimeoutError | ConnectionError | ProviderError] | None = None
        for error_type in ["timeout", "connection_error", "auth_failure"]:
            adapter = MockProvider()
            if error_type == "timeout":
                adapter.set_error_simulation(timeout=True)
                expected_error = TimeoutError
            elif error_type == "connection_error":
                adapter.set_error_simulation(connection_error=True)
                expected_error = ConnectionError
            else:  # auth_failure
                adapter.set_error_simulation(auth_failure=True)
                expected_error = ProviderError

            # Error should propagate through validation function
            with pytest.raises(expected_error):
                await validate_provider_connection(created_provider.id, repo, adapter)

    @pytest.mark.asyncio
    async def test_tool_refresh_error_propagation(self) -> None:
        """Test that tool refresh errors are properly propagated."""
        provider_repo = MockProviderRepository()
        tool_repo = MockToolRepository()

        # Create provider
        provider = Provider(name="refresh_error_provider", provider_type="mock")
        created_provider = await provider_repo.create(provider)

        # Create adapter that simulates connection error
        adapter = MockProvider()
        adapter.set_error_simulation(connection_error=True)

        # Error should propagate through refresh function
        with pytest.raises(ConnectionError):
            await refresh_tools(created_provider.id, provider_repo, tool_repo, adapter)
