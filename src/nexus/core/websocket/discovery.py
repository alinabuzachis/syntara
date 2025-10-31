"""Handler auto-discovery for WebSocket channels.

This module provides dynamic handler discovery based on component and channel names from AsyncAPI specs.
Handlers are loaded from src/nexus/ws/{component_name}.py and channel-specific functions
are discovered within the module (e.g., handle_{channel_name}).

If no handler file exists, a default empty handler is created automatically.
"""

import importlib
import importlib.util
import logging
import types
from pathlib import Path
from types import ModuleType
from typing import Any

from .utils import normalize_channel_name

logger = logging.getLogger(__name__)


class HandlerNotFoundError(Exception):
    """Raised when a handler module cannot be found or loaded."""

    def __init__(self, channel_name: str, message: str, details: dict[str, Any] | None = None) -> None:
        """Initialize handler not found error.

        Args:
            channel_name: Name of the channel
            message: Human-readable error message
            details: Optional additional error details

        """
        self.channel_name = channel_name
        self.message = message
        self.details = details
        super().__init__(message)


def _create_default_handler() -> ModuleType:
    """Create a default empty handler module.

    Returns:
        Module with a default handle_message function that returns empty dict

    """
    module = types.ModuleType("default_handler")

    async def handle_message(_message: dict[str, Any]) -> dict[str, Any]:
        """Return an empty response.

        Args:
            _message: Input message dict (unused)

        Returns:
            Empty response dict

        """
        return {}

    module.handle_message = handle_message  # type: ignore[attr-defined]
    return module


class HandlerRegistry:
    """Cache for dynamically loaded handler modules."""

    def __init__(self) -> None:
        """Initialize the handler registry with empty cache."""
        self._handlers: dict[str, ModuleType] = {}

    @staticmethod
    def _raise_spec_error(channel_name: str, handler_path: Path) -> None:
        """Raise error when module spec creation fails.

        Args:
            channel_name: Name of the channel
            handler_path: Path to the handler file

        Raises:
            HandlerNotFoundError: Always raised with spec creation error details

        """
        msg = f"Failed to create module spec for channel '{channel_name}'"
        raise HandlerNotFoundError(
            channel_name=channel_name,
            message=msg,
            details={"handler_path": str(handler_path)},
        )

    def discover_handler(self, component_name: str, channel_name: str) -> ModuleType:
        """Discover and load a handler module for the given component and channel.

        Handlers are expected to be located at src/nexus/ws/{component_name}.py
        and should implement channel-specific functions:
        - async def handle_{channel_name}(message: dict) -> dict
        - async def on_connect_{channel_name}(websocket, connection_id) -> None (optional)

        If no handler file exists, a default empty handler is created.

        Args:
            component_name: Name of the component (e.g., "example")
            channel_name: Name of the channel (e.g., "coffee", "chat")

        Returns:
            Loaded handler module (or default handler if file doesn't exist)

        Examples:
            >>> registry = HandlerRegistry()
            >>> handler = registry.discover_handler("example", "coffee")
            >>> # Use handler.handle_coffee(message)

        """
        # Create cache key from component and channel
        cache_key = f"{component_name}:{channel_name}"

        # Return cached handler if available
        if cache_key in self._handlers:
            return self._handlers[cache_key]

        # Construct path to handler module
        # Assuming this file is at: src/nexus/core/websocket/discovery.py
        # We need to find: src/nexus/ws/{component_name}.py
        current_file = Path(__file__)
        nexus_root = current_file.parent.parent.parent  # Go up to src/nexus/
        handler_path = nexus_root / "ws" / f"{component_name}.py"

        # Check if handler file exists
        if not handler_path.exists():
            logger.info(
                "No handler file found for component '%s', using default empty handler",
                component_name,
            )
            module = _create_default_handler()
            self._handlers[cache_key] = module
            return module

        # Load the module dynamically
        try:
            module_name = f"nexus.ws.{component_name}"
            spec = importlib.util.spec_from_file_location(module_name, handler_path)
            if spec is None or spec.loader is None:
                self._raise_spec_error(channel_name, handler_path)

            # After the check above, spec and spec.loader are guaranteed to be non-None
            module = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
            spec.loader.exec_module(module)  # type: ignore[union-attr]

        except Exception as e:
            msg = f"Failed to load handler module for component '{component_name}': {e!s}"
            raise HandlerNotFoundError(
                channel_name=channel_name,
                message=msg,
                details={"handler_path": str(handler_path), "error": str(e)},
            ) from e

        # Look for channel-specific handler function
        # Normalize channel name: replace hyphens with underscores for Python identifiers
        normalized_channel_name = normalize_channel_name(channel_name)
        handler_func_name = f"handle_{normalized_channel_name}"
        if not hasattr(module, handler_func_name):
            logger.warning(
                "Handler for channel '%s' in component '%s' missing '%s', using default",
                channel_name,
                component_name,
                handler_func_name,
            )
            module = _create_default_handler()
            self._handlers[cache_key] = module
            return module

        # Verify handler function is callable
        handler_func = getattr(module, handler_func_name)
        if not callable(handler_func):
            logger.warning(
                "Handler '%s' for channel '%s' is not callable, using default",
                handler_func_name,
                channel_name,
            )
            module = _create_default_handler()
            self._handlers[cache_key] = module
            return module

        # Cache and return
        self._handlers[cache_key] = module
        return module

    def clear_cache(self) -> None:
        """Clear all cached handler modules.

        Useful for testing or when handlers are updated at runtime.
        """
        self._handlers.clear()

    def is_cached(self, component_name: str, channel_name: str) -> bool:
        """Check if a handler is already cached.

        Args:
            component_name: Name of the component
            channel_name: Name of the channel

        Returns:
            True if handler is cached, False otherwise

        """
        cache_key = f"{component_name}:{channel_name}"
        return cache_key in self._handlers


# Global registry instance
_registry = HandlerRegistry()


def discover_handler(component_name: str, channel_name: str) -> ModuleType:
    """Discover and load a handler module for a WebSocket channel.

    This is the primary API for loading handler modules. Handlers are cached
    globally for performance.

    Handlers should:
    - Be located at src/nexus/ws/{component_name}.py
    - Implement: async def handle_{channel_name}(message: dict) -> dict
    - Optionally implement: async def on_connect_{channel_name}(websocket, connection_id) -> None

    If no handler file exists, a default empty handler is created automatically.

    Args:
        component_name: Name of the component (e.g., "example")
        channel_name: Name of the channel (e.g., "coffee", "chat")

    Returns:
        Loaded handler module with channel-specific handler functions

    Examples:
        >>> handler = discover_handler("example", "coffee")
        >>> response = await handler.handle_coffee({"input": "test"})

    """
    return _registry.discover_handler(component_name, channel_name)


def clear_handler_cache() -> None:
    """Clear the global handler cache.

    Useful for testing or when handlers are updated at runtime.
    """
    _registry.clear_cache()


def is_handler_cached(component_name: str, channel_name: str) -> bool:
    """Check if a handler module is already cached.

    Args:
        component_name: Name of the component
        channel_name: Name of the channel

    Returns:
        True if handler is cached, False otherwise

    Examples:
        >>> is_handler_cached("example", "coffee")
        False
        >>> discover_handler("example", "coffee")
        >>> is_handler_cached("example", "coffee")
        True

    """
    return _registry.is_cached(component_name, channel_name)


def get_handler_module_path(component_name: str) -> Path:
    """Get the expected path for a handler module.

    Args:
        component_name: Name of the component

    Returns:
        Path to the handler module file

    Examples:
        >>> path = get_handler_module_path("example")
        >>> str(path).endswith("src/nexus/ws/example.py")
        True

    """
    current_file = Path(__file__)
    nexus_root = current_file.parent.parent.parent  # Go up to src/nexus/
    return nexus_root / "ws" / f"{component_name}.py"


def load_handler_module(component_name: str) -> ModuleType | None:
    """Load a handler module without caching.

    This function loads the handler module directly without going through
    the handler registry cache. Useful for validation and inspection.

    Args:
        component_name: Name of the component

    Returns:
        Loaded module, or None if the file doesn't exist

    Examples:
        >>> module = load_handler_module("example")
        >>> module is not None
        True

    """
    handler_path = get_handler_module_path(component_name)

    if not handler_path.exists():
        return None

    try:
        module_name = f"nexus.ws.{component_name}"
        spec = importlib.util.spec_from_file_location(module_name, handler_path)
        if spec is None or spec.loader is None:
            logger.error("Failed to create module spec for component '%s'", component_name)
            return None

        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    except Exception:
        logger.exception("Failed to load handler module for component '%s'", component_name)
        return None
