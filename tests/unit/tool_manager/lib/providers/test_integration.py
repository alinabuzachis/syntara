"""Integration tests for provider factory and adapters.

Tests cover:
- Factory and provider integration
- Provider lifecycle management
- End-to-end provider operations
- Error handling across components
"""

import asyncio
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import TYPE_CHECKING, Any, cast

import pytest

from nexus.tool_manager.lib.providers.factory import ProviderFactory
from tests.fixtures import MockProvider

if TYPE_CHECKING:
    from collections.abc import Coroutine

    from nexus.tool_manager.models.tool import Tool


class TestProviderIntegration:
    """Test suite for provider factory and adapter integration."""

    def test_factory_provider_registration_and_creation(self) -> None:
        """Test complete flow from registration to provider creation."""
        factory = ProviderFactory()

        # Register MockProvider
        factory.register_provider_type("mock", MockProvider)

        # Create instance with custom configuration
        provider = factory.create_provider_instance(
            "mock",
            provider_name="integration_test",
            response_delay_ms=50,
        )

        # Verify correct type and configuration
        assert isinstance(provider, MockProvider)
        assert provider.provider_name == "integration_test"
        assert provider.response_delay_ms == 50

    @pytest.mark.asyncio
    async def test_factory_created_provider_functionality(self) -> None:
        """Test that factory-created providers work correctly."""
        factory = ProviderFactory()
        factory.register_provider_type("mock", MockProvider)

        # Create provider instance
        provider = factory.create_provider_instance("mock")

        # Test connection validation
        connection_result = await provider.validate_connection()
        assert connection_result.valid is True
        assert connection_result.provider_type == "mock"

        # Test tool refresh
        tools = await provider.refresh_tools()
        assert len(tools) > 0

        # Test tool schema retrieval
        first_tool = tools[0]
        schema = await provider.get_tool_schema(first_tool.name)
        assert schema.name == first_tool.name

        # Test tool validation
        validation_result = await provider.validate_tool(first_tool.name)
        assert validation_result.success is True

    def test_multiple_provider_types_registration(self) -> None:
        """Test registering and creating multiple provider types."""
        factory = ProviderFactory()

        # Create different provider classes
        class MockProviderTypeA(MockProvider):
            provider_type = "type_a"

        class MockProviderTypeB(MockProvider):
            provider_type = "type_b"

        # Register multiple types
        factory.register_provider_type("type_a", MockProviderTypeA)
        factory.register_provider_type("type_b", MockProviderTypeB)

        # Create instances of each type
        provider_a = factory.create_provider_instance("type_a", provider_name="provider_a")
        provider_b = factory.create_provider_instance("type_b", provider_name="provider_b")

        # Verify correct types
        assert isinstance(provider_a, MockProviderTypeA)
        assert isinstance(provider_b, MockProviderTypeB)
        assert provider_a.provider_name == "provider_a"
        assert provider_b.provider_name == "provider_b"

    @pytest.mark.asyncio
    async def test_provider_error_simulation_through_factory(self) -> None:
        """Test error simulation with factory-created providers."""
        factory = ProviderFactory()
        factory.register_provider_type("mock", MockProvider)

        # Create provider with error simulation
        provider = factory.create_provider_instance(
            "mock",
            simulate_timeout=True,
        )

        # Should raise timeout error
        with pytest.raises(TimeoutError):
            await provider.validate_connection()

    def test_factory_provider_lifecycle(self) -> None:
        """Test complete provider lifecycle through factory."""
        factory = ProviderFactory()

        # Initially no types registered
        assert len(factory.get_registered_provider_types()) == 0

        # Register provider type
        factory.register_provider_type("lifecycle_test", MockProvider)
        assert factory.is_registered("lifecycle_test")

        # Create multiple instances
        provider1 = factory.create_provider_instance("lifecycle_test", provider_name="instance1")
        provider2 = factory.create_provider_instance("lifecycle_test", provider_name="instance2")

        # Both should be valid but different instances
        assert provider1 is not provider2
        assert cast("MockProvider", provider1).provider_name == "instance1"
        assert cast("MockProvider", provider2).provider_name == "instance2"

        # Unregister type
        factory.unregister_provider_type("lifecycle_test")
        assert not factory.is_registered("lifecycle_test")

        # Can't create new instances after unregistering
        with pytest.raises(ValueError, match="Unknown provider type"):
            factory.create_provider_instance("lifecycle_test")

        # But existing instances still work (they're independent)
        assert cast("MockProvider", provider1).provider_name == "instance1"
        assert cast("MockProvider", provider2).provider_name == "instance2"

    @pytest.mark.asyncio
    async def test_concurrent_provider_operations(self) -> None:
        """Test concurrent operations with multiple provider instances."""
        factory = ProviderFactory()
        factory.register_provider_type("concurrent", MockProvider)

        # Create multiple provider instances
        providers = [factory.create_provider_instance("concurrent", provider_name=f"provider_{i}") for i in range(5)]

        # Run concurrent operations
        tasks: list[Coroutine[Any, Any, Any]] = []
        for provider in providers:
            tasks.append(provider.validate_connection())
            tasks.append(provider.refresh_tools())

        # Wait for all to complete
        results = await asyncio.gather(*tasks)

        # Should have results from all operations
        assert len(results) == 10  # 5 providers * 2 operations each

        # Check connection results (every other result)
        for i in range(0, 10, 2):
            connection_result = results[i]
            assert connection_result.valid is True

        # Check tool refresh results (every other result, offset by 1)
        for i in range(1, 10, 2):
            tools: list[Tool] = results[i]
            assert len(tools) > 0

    def test_factory_error_handling_integration(self) -> None:
        """Test error handling across factory and provider components."""
        factory = ProviderFactory()

        # Test provider registration error handling
        with pytest.raises(ValueError, match="Provider type must be a non-empty string"):
            factory.register_provider_type("", MockProvider)

        with pytest.raises(TypeError, match="Provider class must be callable"):
            factory.register_provider_type("test", "not_callable")  # type: ignore[arg-type]

        # Test provider creation error handling
        with pytest.raises(ValueError, match="Unknown provider type"):
            factory.create_provider_instance("nonexistent")

        # Register valid provider
        factory.register_provider_type("valid", MockProvider)

        # Test duplicate registration
        with pytest.raises(ValueError, match="already registered"):
            factory.register_provider_type("valid", MockProvider)

        # Test successful creation after registration
        provider = factory.create_provider_instance("valid")
        assert isinstance(provider, MockProvider)

    @pytest.mark.asyncio
    async def test_provider_configuration_persistence(self) -> None:
        """Test that provider configuration persists correctly."""
        factory = ProviderFactory()
        factory.register_provider_type("configurable", MockProvider)

        # Create provider with specific configuration
        provider = factory.create_provider_instance(
            "configurable",
            provider_name="config_test",
            simulate_timeout=False,
            simulate_connection_error=False,
            response_delay_ms=100,
        )

        # Verify configuration
        mock_provider = cast("MockProvider", provider)
        assert mock_provider.provider_name == "config_test"
        assert mock_provider.simulate_timeout is False
        assert mock_provider.simulate_connection_error is False
        assert mock_provider.response_delay_ms == 100

        # Test that provider operations work with this configuration
        connection_result = await provider.validate_connection()
        assert connection_result.valid is True

        # Verify delay is applied (timing test)
        start_time = time.time()
        await provider.validate_connection()
        elapsed_time = time.time() - start_time

        # Should take at least 100ms due to delay setting
        assert elapsed_time >= 0.09  # Allow some tolerance

    def test_factory_thread_safety_with_provider_creation(self) -> None:
        """Test thread safety when creating providers concurrently."""
        factory = ProviderFactory()
        factory.register_provider_type("thread_safe", MockProvider)

        created_providers = []
        creation_errors = []

        def create_provider_with_config(thread_id: int) -> None:
            try:
                instance = factory.create_provider_instance(
                    "thread_safe",
                    provider_name=f"thread_{thread_id}",
                )
                created_providers.append(instance)
            except (ValueError, TypeError) as e:
                creation_errors.append(e)

        # Create providers from multiple threads
        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(create_provider_with_config, i) for i in range(20)]

            for future in as_completed(futures):
                future.result()

        # Should have no errors and 20 providers
        assert len(creation_errors) == 0
        assert len(created_providers) == 20

        # All should have unique names
        provider_names = {cast("MockProvider", p).provider_name for p in created_providers}
        assert len(provider_names) == 20  # All unique names

        # All should be correct type
        for provider in created_providers:
            assert isinstance(provider, MockProvider)
