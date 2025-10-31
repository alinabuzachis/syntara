"""Tests for WebSocket interceptor system."""

import logging
from typing import Any

import pytest

from nexus.core.websocket.interceptor import (
    InterceptorRegistry,
    ValidationInterceptor,
    WebSocketInterceptor,
    get_registry,
)


class MockInterceptor(WebSocketInterceptor):
    """Mock interceptor for testing."""

    def __init__(self) -> None:
        """Initialize mock interceptor with tracking."""
        self.bootstrap_started = False
        self.before_creation_calls: list[tuple[str, str]] = []
        self.after_creation_calls: list[tuple[str, str, bool]] = []
        self.bootstrap_completed = False
        self.bootstrap_results: dict[str, Any] | None = None

    def on_bootstrap_start(self, specs: dict[str, Any]) -> None:
        """Track bootstrap start."""
        self.bootstrap_started = True
        self.specs = specs

    def before_endpoint_creation(self, component_name: str, channel_name: str, _channel_config: dict[str, Any]) -> None:
        """Track before_endpoint_creation calls."""
        self.before_creation_calls.append((component_name, channel_name))

    def after_endpoint_creation(
        self,
        component_name: str,
        channel_name: str,
        _endpoint: object,
        *,
        success: bool,
        error: Exception | None = None,
    ) -> None:
        """Track after_endpoint_creation calls."""
        _ = error  # Unused in mock, available for future use
        self.after_creation_calls.append((component_name, channel_name, success))

    def on_bootstrap_complete(self, results: dict[str, Any]) -> None:
        """Track bootstrap complete."""
        self.bootstrap_completed = True
        self.bootstrap_results = results


class TestInterceptorRegistry:
    """Tests for InterceptorRegistry."""

    def test_register_interceptor(self) -> None:
        """Test registering an interceptor."""
        registry = InterceptorRegistry()
        interceptor = MockInterceptor()

        registry.register(interceptor)

        assert len(registry._interceptors) == 1  # noqa: SLF001 - Test needs to verify internal state
        assert registry._interceptors[0] is interceptor  # noqa: SLF001

    def test_on_bootstrap_start(self) -> None:
        """Test on_bootstrap_start lifecycle hook."""
        registry = InterceptorRegistry()
        interceptor = MockInterceptor()
        registry.register(interceptor)

        specs: dict[str, object] = {"example": {"channels": {}}}
        registry.on_bootstrap_start(specs)

        assert interceptor.bootstrap_started is True
        assert interceptor.specs == specs

    def test_before_endpoint_creation(self) -> None:
        """Test before_endpoint_creation lifecycle hook."""
        registry = InterceptorRegistry()
        interceptor = MockInterceptor()
        registry.register(interceptor)

        registry.before_endpoint_creation("example", "chat", {"address": "/ws/chat"})

        assert len(interceptor.before_creation_calls) == 1
        assert interceptor.before_creation_calls[0] == ("example", "chat")

    def test_after_endpoint_creation_success(self) -> None:
        """Test after_endpoint_creation with successful creation."""
        registry = InterceptorRegistry()
        interceptor = MockInterceptor()
        registry.register(interceptor)

        def mock_endpoint() -> None:
            """Mock endpoint for testing."""

        registry.after_endpoint_creation("example", "chat", mock_endpoint, success=True)

        assert len(interceptor.after_creation_calls) == 1
        assert interceptor.after_creation_calls[0] == ("example", "chat", True)

    def test_after_endpoint_creation_failure(self) -> None:
        """Test after_endpoint_creation with failed creation."""
        registry = InterceptorRegistry()
        interceptor = MockInterceptor()
        registry.register(interceptor)

        error = ValueError("Test error")
        registry.after_endpoint_creation("example", "chat", None, success=False, error=error)

        assert len(interceptor.after_creation_calls) == 1
        assert interceptor.after_creation_calls[0] == ("example", "chat", False)

    def test_on_bootstrap_complete(self) -> None:
        """Test on_bootstrap_complete lifecycle hook."""
        registry = InterceptorRegistry()
        interceptor = MockInterceptor()
        registry.register(interceptor)

        results = {
            "total_endpoints": 3,
            "success_count": 3,
            "failure_count": 0,
        }
        registry.on_bootstrap_complete(results)

        assert interceptor.bootstrap_completed is True
        assert interceptor.bootstrap_results == results

    def test_multiple_interceptors(self) -> None:
        """Test multiple interceptors are all called."""
        registry = InterceptorRegistry()
        interceptor1 = MockInterceptor()
        interceptor2 = MockInterceptor()

        registry.register(interceptor1)
        registry.register(interceptor2)

        specs: dict[str, object] = {"example": {}}
        registry.on_bootstrap_start(specs)

        assert interceptor1.bootstrap_started is True
        assert interceptor2.bootstrap_started is True

    def test_interceptor_error_handling(self) -> None:
        """Test that errors in one interceptor don't affect others."""

        class FailingInterceptor(WebSocketInterceptor):
            def on_bootstrap_start(self, _specs: dict[str, Any]) -> None:
                msg = "Test error"
                raise ValueError(msg)

        registry = InterceptorRegistry()
        failing = FailingInterceptor()
        working = MockInterceptor()

        registry.register(failing)
        registry.register(working)

        specs: dict[str, object] = {"example": {}}
        # Should not raise, error should be caught and logged
        registry.on_bootstrap_start(specs)

        # Working interceptor should still be called
        assert working.bootstrap_started is True


class TestValidationInterceptor:
    """Tests for ValidationInterceptor."""

    def test_initialization(self) -> None:
        """Test ValidationInterceptor initialization."""
        interceptor = ValidationInterceptor()

        assert interceptor.specs == {}
        assert interceptor.handler_modules == {}
        assert interceptor.component_names == []

    def test_on_bootstrap_start(self) -> None:
        """Test on_bootstrap_start collects specs."""
        interceptor = ValidationInterceptor()

        specs: dict[str, dict[str, object]] = {
            "example": {"channels": {"chat": {}}},
            "another": {"channels": {"coffee": {}}},
        }
        interceptor.on_bootstrap_start(specs)

        assert interceptor.specs == specs
        assert interceptor.component_names == ["example", "another"]

    def test_before_endpoint_creation(self) -> None:
        """Test before_endpoint_creation loads handler modules."""
        interceptor = ValidationInterceptor()

        # Call with "example" component which exists in the codebase
        interceptor.before_endpoint_creation("example", "chat", {"address": "/ws/chat"})

        # Verify that the handler module was loaded and stored
        assert "example" in interceptor.handler_modules
        assert interceptor.handler_modules["example"] is not None

    def test_on_bootstrap_complete(self, caplog: pytest.LogCaptureFixture) -> None:
        """Test on_bootstrap_complete runs validation."""
        caplog.set_level(logging.INFO)

        interceptor = ValidationInterceptor()

        # Set up minimal data for validation
        interceptor.component_names = []
        interceptor.specs = {}
        interceptor.handler_modules = {}

        results = {"total_endpoints": 0}
        interceptor.on_bootstrap_complete(results)

        # Should log that validation is running
        assert "Running channel mapping validation" in caplog.text


class TestGetRegistry:
    """Tests for get_registry function."""

    def test_get_registry_returns_singleton(self) -> None:
        """Test that get_registry returns the same instance."""
        registry1 = get_registry()
        registry2 = get_registry()

        assert registry1 is registry2
