"""WebSocket endpoint bootstrap interceptor system.

This module provides a flexible interceptor pattern for hooking into the
WebSocket endpoint creation lifecycle during application bootstrap.
"""

import logging
from typing import TYPE_CHECKING, Any

from nexus.core.websocket import channel_validator, discovery

if TYPE_CHECKING:
    from types import ModuleType

logger = logging.getLogger(__name__)


class WebSocketInterceptor:
    """Base class for WebSocket bootstrap interceptors.

    Interceptors can hook into various phases of the WebSocket endpoint
    creation lifecycle to perform validation, logging, metrics, or other
    cross-cutting concerns.
    """

    def on_bootstrap_start(self, specs: dict[str, Any]) -> None:
        """Handle WebSocket bootstrap start event.

        Args:
            specs: Dictionary mapping component names to their loaded AsyncAPI specs

        """

    def before_endpoint_creation(self, component_name: str, channel_name: str, channel_config: dict[str, Any]) -> None:
        """Handle event before WebSocket endpoint creation.

        Args:
            component_name: Name of the component (e.g., 'example')
            channel_name: Name of the channel (e.g., 'chat')
            channel_config: Channel configuration from AsyncAPI spec

        """

    def after_endpoint_creation(
        self, component_name: str, channel_name: str, endpoint: object, *, success: bool, error: Exception | None = None
    ) -> None:
        """Handle event after WebSocket endpoint creation attempt.

        Args:
            component_name: Name of the component
            channel_name: Name of the channel
            endpoint: The created endpoint (if successful)
            success: Whether endpoint creation succeeded
            error: Exception raised during creation (if any)

        """

    def on_bootstrap_complete(self, results: dict[str, Any]) -> None:
        """Handle WebSocket bootstrap completion event.

        Args:
            results: Summary of bootstrap results including successes and failures

        """


class InterceptorRegistry:
    """Registry for managing and executing WebSocket interceptors."""

    def __init__(self) -> None:
        """Initialize the interceptor registry."""
        self._interceptors: list[WebSocketInterceptor] = []

    def register(self, interceptor: WebSocketInterceptor) -> None:
        """Register an interceptor.

        Args:
            interceptor: The interceptor to register

        """
        self._interceptors.append(interceptor)
        logger.debug("Registered interceptor: %s", interceptor.__class__.__name__)

    def on_bootstrap_start(self, specs: dict[str, Any]) -> None:
        """Execute on_bootstrap_start for all registered interceptors.

        Args:
            specs: Dictionary mapping component names to their AsyncAPI specs

        """
        for interceptor in self._interceptors:
            try:
                interceptor.on_bootstrap_start(specs)
            except Exception:
                logger.exception("Error in %s.on_bootstrap_start", interceptor.__class__.__name__)

    def before_endpoint_creation(self, component_name: str, channel_name: str, channel_config: dict[str, Any]) -> None:
        """Execute before_endpoint_creation for all registered interceptors.

        Args:
            component_name: Name of the component
            channel_name: Name of the channel
            channel_config: Channel configuration from AsyncAPI spec

        """
        for interceptor in self._interceptors:
            try:
                interceptor.before_endpoint_creation(component_name, channel_name, channel_config)
            except Exception:
                logger.exception("Error in %s.before_endpoint_creation", interceptor.__class__.__name__)

    def after_endpoint_creation(
        self, component_name: str, channel_name: str, endpoint: object, *, success: bool, error: Exception | None = None
    ) -> None:
        """Execute after_endpoint_creation for all registered interceptors.

        Args:
            component_name: Name of the component
            channel_name: Name of the channel
            endpoint: The created endpoint (if successful)
            success: Whether endpoint creation succeeded
            error: Exception raised during creation (if any)

        """
        for interceptor in self._interceptors:
            try:
                interceptor.after_endpoint_creation(
                    component_name, channel_name, endpoint, success=success, error=error
                )
            except Exception:
                logger.exception("Error in %s.after_endpoint_creation", interceptor.__class__.__name__)

    def on_bootstrap_complete(self, results: dict[str, Any]) -> None:
        """Execute on_bootstrap_complete for all registered interceptors.

        Args:
            results: Summary of bootstrap results

        """
        for interceptor in self._interceptors:
            try:
                interceptor.on_bootstrap_complete(results)
            except Exception:
                logger.exception("Error in %s.on_bootstrap_complete", interceptor.__class__.__name__)


# Global registry instance
_registry = InterceptorRegistry()


def get_registry() -> InterceptorRegistry:
    """Get the global interceptor registry.

    Returns:
        The global InterceptorRegistry instance

    """
    return _registry


class ValidationInterceptor(WebSocketInterceptor):
    """Interceptor that validates channel mappings during bootstrap.

    This interceptor validates that:
    - Channel names follow snake_case convention
    - All handle_* and on_connect_* functions have corresponding channels
    - Channels have corresponding handler functions (warning only)
    """

    def __init__(self) -> None:
        """Initialize the validation interceptor."""
        self.specs: dict[str, dict[str, Any]] = {}
        self.handler_modules: dict[str, ModuleType] = {}
        self.component_names: list[str] = []

    def on_bootstrap_start(self, specs: dict[str, Any]) -> None:
        """Collect all AsyncAPI specs for validation.

        Args:
            specs: Dictionary mapping component names to their AsyncAPI specs

        """
        self.specs = specs.copy()
        self.component_names = list(specs.keys())
        logger.debug("ValidationInterceptor: Starting validation for %d components", len(specs))

    def before_endpoint_creation(
        self, component_name: str, _channel_name: str, _channel_config: dict[str, Any]
    ) -> None:
        """Load handler module for later validation.

        Args:
            component_name: Name of the component
            _channel_name: Name of the channel (unused in validation)
            _channel_config: Channel configuration from AsyncAPI spec (unused in validation)

        """
        # Load handler module if not already loaded
        if component_name not in self.handler_modules:
            module = discovery.load_handler_module(component_name)
            if module is not None:
                self.handler_modules[component_name] = module

    def on_bootstrap_complete(self, _results: dict[str, Any]) -> None:
        """Run comprehensive validation after all endpoints are created.

        Args:
            _results: Summary of bootstrap results (unused in current validation)

        """
        logger.info("Running channel mapping validation...")

        validation_results = []
        total_errors = 0
        total_warnings = 0

        for component_name in self.component_names:
            spec = self.specs.get(component_name)
            handler_module = self.handler_modules.get(component_name)

            if not spec:
                logger.warning("No spec found for component '%s'", component_name)
                continue

            if not handler_module:
                logger.warning("No handler module found for component '%s'", component_name)
                continue

            # Get spec path for error reporting
            spec_path = f"{component_name}.yaml"

            # Validate this component
            result = channel_validator.validate_channel_mappings(
                component_name=component_name, spec=spec, spec_path=spec_path, handler_module=handler_module
            )

            validation_results.append(result)
            total_errors += len(result.errors)
            total_warnings += len(result.warnings)

        # Log summary
        if total_errors > 0 or total_warnings > 0:
            logger.info(
                "Channel validation complete: %d error(s), %d warning(s) across %d component(s)",
                total_errors,
                total_warnings,
                len(validation_results),
            )
        else:
            logger.info(
                "Channel validation complete: All %d component(s) validated successfully", len(validation_results)
            )
