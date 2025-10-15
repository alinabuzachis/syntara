"""Tests for provider factory functionality."""

import threading
import time

import pytest

from nexus_tool_manager.lib.providers.base import ToolProviderAdapter
from nexus_tool_manager.lib.providers.factory import ProviderFactory
from tests.fixtures.mock_provider import MockProvider

# Test constants
THREAD_COUNT_5 = 5
THREAD_COUNT_10 = 10
THREAD_SLEEP_DELAY = 0.01


class TestProviderFactory:
    """Test cases for ProviderFactory class."""

    def test_factory_initialization(self) -> None:
        """Test factory initializes with empty registry."""
        factory = ProviderFactory()
        assert factory.get_registered_provider_types() == []
        assert not factory.is_registered("mock")

    def test_register_provider_success(self) -> None:
        """Test successful provider registration."""
        factory = ProviderFactory()
        factory.register_provider_type("mock", MockProvider)

        assert factory.is_registered("mock")
        assert "mock" in factory.get_registered_provider_types()

    def test_register_provider_duplicate_error(self) -> None:
        """Test registering duplicate provider type raises error."""
        factory = ProviderFactory()
        factory.register_provider_type("mock", MockProvider)

        with pytest.raises(ValueError, match="Provider type 'mock' is already registered"):
            factory.register_provider_type("mock", MockProvider)

    def test_register_provider_invalid_type_error(self) -> None:
        """Test registering with invalid type raises error."""
        factory = ProviderFactory()

        # Empty string
        with pytest.raises(ValueError, match="Provider type must be a non-empty string"):
            factory.register_provider_type("", MockProvider)

        # None
        with pytest.raises(ValueError, match="Provider type must be a non-empty string"):
            factory.register_provider_type(None, MockProvider)  # type: ignore[arg-type]

        # Non-callable provider class
        with pytest.raises(TypeError, match="Provider class must be callable"):
            factory.register_provider_type("invalid", "not_callable")  # type: ignore[arg-type]

    def test_create_provider_success(self) -> None:
        """Test successful provider creation."""
        factory = ProviderFactory()
        factory.register_provider_type("mock", MockProvider)

        provider = factory.create_provider_instance("mock", provider_name="test_provider")

        assert isinstance(provider, MockProvider)
        assert isinstance(provider, ToolProviderAdapter)
        assert provider.provider_name == "test_provider"

    def test_create_provider_unregistered_error(self) -> None:
        """Test creating unregistered provider type raises error."""
        factory = ProviderFactory()

        with pytest.raises(ValueError, match="Unknown provider type 'unknown'"):
            factory.create_provider_instance("unknown")

    def test_create_provider_invalid_type_error(self) -> None:
        """Test creating provider with invalid type raises error."""
        factory = ProviderFactory()

        with pytest.raises(ValueError, match="Provider type must be a non-empty string"):
            factory.create_provider_instance("")

    def test_create_provider_construction_error(self) -> None:
        """Test provider construction error handling."""
        factory = ProviderFactory()

        # Mock class that raises error on construction
        class FailingProvider:
            def __init__(self) -> None:
                msg = "Construction failed"
                raise RuntimeError(msg)

        factory.register_provider_type(
            "failing",
            FailingProvider,  # type: ignore[arg-type]
        )

        with pytest.raises(ValueError, match="Failed to create provider instance"):
            factory.create_provider_instance("failing")

    def test_create_provider_invalid_implementation(self) -> None:
        """Test provider that doesn't implement protocol raises error."""
        factory = ProviderFactory()

        # Mock class that doesn't implement ToolProviderAdapter
        class InvalidProvider:
            pass

        factory.register_provider_type(
            "invalid",
            InvalidProvider,  # type: ignore[arg-type]
        )

        with pytest.raises(
            TypeError,
            match="Provider class for 'invalid' must implement ToolProviderAdapter",
        ):
            factory.create_provider_instance("invalid")

    def test_get_registered_types_sorted(self) -> None:
        """Test get_registered_types returns sorted list."""
        factory = ProviderFactory()
        factory.register_provider_type("z_provider", MockProvider)
        factory.register_provider_type("a_provider", MockProvider)
        factory.register_provider_type("m_provider", MockProvider)

        types = factory.get_registered_provider_types()
        assert types == ["a_provider", "m_provider", "z_provider"]

    def test_unregister_provider_success(self) -> None:
        """Test successful provider unregistration."""
        factory = ProviderFactory()
        factory.register_provider_type("mock", MockProvider)

        assert factory.is_registered("mock")
        factory.unregister_provider_type("mock")
        assert not factory.is_registered("mock")

    def test_unregister_provider_not_registered_error(self) -> None:
        """Test unregistering non-existent provider raises error."""
        factory = ProviderFactory()

        with pytest.raises(ValueError, match="Provider type 'nonexistent' is not registered"):
            factory.unregister_provider_type("nonexistent")

    def test_thread_safety(self) -> None:
        """Test factory operations are thread-safe."""
        factory = ProviderFactory()
        results = []
        errors = []

        def register_provider_worker(provider_id: str) -> None:
            try:
                factory.register_provider_type(f"provider_{provider_id}", MockProvider)
                results.append(f"registered_{provider_id}")
            except Exception as e:  # noqa: BLE001
                errors.append(str(e))

        def create_provider_worker(provider_id: str) -> None:
            try:
                # Wait a bit to ensure registration happens first
                time.sleep(THREAD_SLEEP_DELAY)
                _ = factory.create_provider_instance(f"provider_{provider_id}")
                results.append(f"created_{provider_id}")
            except Exception as e:  # noqa: BLE001
                errors.append(str(e))

        # Start multiple threads for registration and creation
        threads = []
        for i in range(THREAD_COUNT_5):
            t1 = threading.Thread(target=register_provider_worker, args=[str(i)])
            t2 = threading.Thread(target=create_provider_worker, args=[str(i)])
            threads.extend([t1, t2])

        for thread in threads:
            thread.start()

        for thread in threads:
            thread.join()

        # Check results
        assert len(errors) == 0, f"Errors occurred: {errors}"
        assert len(results) == THREAD_COUNT_10  # 5 registrations + 5 creations
