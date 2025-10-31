"""WebSocket core functionality for Nexus.

This package provides dynamic WebSocket message handling using AsyncAPI specifications.
Uses a hook-based system for message validation and processing with plain Python dicts.
"""

from nexus.core.websocket.connection import (
    ConnectionInfo,
    WebSocketConnectionManager,
    get_connection_manager,
)
from nexus.core.websocket.discovery import (
    HandlerNotFoundError,
    clear_handler_cache,
    discover_handler,
    is_handler_cached,
)
from nexus.core.websocket.endpoint_factory import (
    create_websocket_endpoint,
    scan_handler_specs,
)
from nexus.core.websocket.hooks import WebSocketHooks, discover_hooks
from nexus.core.websocket.schema_validator import (
    ValidationError,
    clear_validator_cache,
    validate_message,
)

__all__ = [
    "ConnectionInfo",
    "HandlerNotFoundError",
    "ValidationError",
    "WebSocketConnectionManager",
    "WebSocketHooks",
    "clear_handler_cache",
    "clear_validator_cache",
    "create_websocket_endpoint",
    "discover_handler",
    "discover_hooks",
    "get_connection_manager",
    "is_handler_cached",
    "scan_handler_specs",
    "validate_message",
]
