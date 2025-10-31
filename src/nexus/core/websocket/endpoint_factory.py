"""WebSocket endpoint factory for dynamic endpoint generation.

This module provides functions to create WebSocket endpoints from AsyncAPI specifications
using YAML-first convention-based discovery.
"""

import asyncio
import inspect
import json
import logging
import uuid
from collections.abc import Callable
from contextvars import ContextVar
from pathlib import Path
from typing import Any

import yaml
from fastapi import WebSocket, WebSocketDisconnect

from nexus.core.websocket.connection import get_connection_manager
from nexus.core.websocket.discovery import HandlerNotFoundError, discover_handler
from nexus.core.websocket.hooks import discover_hooks
from nexus.core.websocket.schema_validator import ValidationError
from nexus.core.websocket.utils import normalize_channel_name

logger = logging.getLogger(__name__)

# Context variable to pass connection_id to handlers
_connection_id_context: ContextVar[str | None] = ContextVar("connection_id_context", default=None)


async def _send_error_response(websocket: WebSocket, error_dict: dict[str, Any], channel_name: str) -> bool:
    """Send error response to client.

    Args:
        websocket: WebSocket connection
        error_dict: Error response dictionary
        channel_name: Name of the channel

    Returns:
        True if error sent successfully, False if client disconnected

    """
    try:
        await websocket.send_json(error_dict)
        logger.warning("Error on channel '%s': %s", channel_name, error_dict.get("message"))
        return True
    except WebSocketDisconnect:
        logger.debug("Client disconnected before error response on channel '%s'", channel_name)
        return False


async def _receive_message(websocket: WebSocket, channel_name: str) -> dict[str, Any] | None:
    """Receive JSON message from WebSocket client.

    Args:
        websocket: WebSocket connection
        channel_name: Name of the channel

    Returns:
        Received message as dict, or None if client disconnected

    Raises:
        ValidationError: If the received data is not valid JSON

    """
    try:
        return await websocket.receive_json()  # type: ignore[no-any-return]
    except WebSocketDisconnect:
        logger.debug("Client disconnected during receive on channel '%s'", channel_name)
        return None
    except json.JSONDecodeError as e:
        logger.warning("Invalid JSON on channel '%s': %s", channel_name, e)
        msg = f"Invalid JSON format: {e.msg}"
        raise ValidationError(error_type="INVALID_REQUEST", message=msg) from e
    except Exception:
        logger.exception("Error receiving message on channel '%s'", channel_name)
        return None


def scan_handler_specs() -> dict[str, Path]:
    """Scan for AsyncAPI YAML specs in the WebSocket directory.

    This function scans src/nexus/ws/ for .yaml files and returns them
    as handler specifications. The channel name is derived from the YAML filename.

    Convention-based discovery:
    - example.yaml → channel "example"
    - example.py (optional) → handler logic

    Returns:
        Dictionary mapping handler names to their spec paths

    Examples:
        >>> specs = scan_handler_specs()
        >>> "example" in specs
        True
        >>> isinstance(specs["example"], Path)
        True

    """
    # Find the ws directory
    current_file = Path(__file__)
    ws_dir = current_file.parent.parent.parent / "ws"

    if not ws_dir.exists():
        logger.warning("WebSocket handlers directory not found: %s", ws_dir)
        return {}

    spec_paths: dict[str, Path] = {}

    # Scan all YAML files
    for spec_file in ws_dir.glob("*.yaml"):
        # Channel name is the file stem (without extension)
        channel_name = spec_file.stem
        spec_paths[channel_name] = spec_file.resolve()

    logger.info("Discovered %d AsyncAPI spec(s)", len(spec_paths))
    return spec_paths


def create_websocket_endpoint(  # noqa: C901, PLR0915
    channel_name: str, spec_path: str | Path
) -> Callable[[WebSocket], Any]:
    """Create a WebSocket endpoint handler for a channel.

    This function generates a complete WebSocket endpoint that:
    1. Accepts the WebSocket connection
    2. Generates a unique connection ID
    3. Registers the connection with the connection manager
    4. Optionally starts background tasks (e.g., on_connect_{channel_name})
    5. Enters a message receive/hook/handle/hook/send loop
    6. Handles errors and cleanup

    Args:
        channel_name: Name of the channel (e.g., "coffee", "chat")
        spec_path: Path to the AsyncAPI specification file

    Returns:
        Async function compatible with FastAPI WebSocket route

    Examples:
        >>> endpoint = create_websocket_endpoint("coffee", "example.yaml")
        >>> # Use with: router.add_websocket_route("/ws/example/v1/coffee", endpoint)

    """
    spec_path = Path(spec_path)

    # Extract component name from spec filename (e.g., "example.yaml" → "example")
    component_name = spec_path.stem

    # Load the spec to get message type information
    with spec_path.open() as f:
        spec = yaml.safe_load(f)

    # Get the channel definition
    channels = spec.get("channels", {})
    if channel_name not in channels:
        msg = f"Channel '{channel_name}' not found in spec"
        raise ValueError(msg)

    channel_def = channels[channel_name]
    messages = channel_def.get("messages", {})

    # Determine request message type
    # Convention: look for *Request pattern
    request_msg_type: str | None = None

    for msg_name in messages:
        # Get actual message name from components
        msg_ref = messages[msg_name].get("$ref", "")
        if msg_ref.startswith("#/components/messages/"):
            actual_msg_name = msg_ref.split("/")[-1]
            if actual_msg_name.endswith("Request"):
                request_msg_type = actual_msg_name
                break  # Found what we need

    if not request_msg_type:
        msg = f"No request message type found for channel '{channel_name}'"
        raise ValueError(msg)

    # Discover the handler module for this component and channel
    try:
        handler_module = discover_handler(component_name, channel_name)
    except HandlerNotFoundError:
        logger.exception(
            "Handler not found for component '%s', channel '%s'",
            component_name,
            channel_name,
        )
        raise

    # Discover hooks from handler module
    hooks = discover_hooks(handler_module, spec_path)

    # Get the channel-specific handler function
    normalized_channel_name = normalize_channel_name(channel_name)
    handler_func_name = f"handle_{normalized_channel_name}"
    handler_func = getattr(handler_module, handler_func_name)

    # Detect if handler accepts connection_id parameter (with or without underscore prefix)
    handler_sig = inspect.signature(handler_func)
    handler_accepts_connection_id = (
        "connection_id" in handler_sig.parameters or "_connection_id" in handler_sig.parameters
    )

    # Check for optional on_connect background task
    on_connect_func_name = f"on_connect_{normalized_channel_name}"
    on_connect_func = getattr(handler_module, on_connect_func_name, None)

    connection_manager = get_connection_manager()

    async def websocket_endpoint(websocket: WebSocket) -> None:  # noqa: C901, PLR0912, PLR0915
        """WebSocket endpoint handler.

        Args:
            websocket: FastAPI WebSocket connection

        """
        # Accept the connection
        await websocket.accept()

        # Generate unique connection ID
        connection_id = str(uuid.uuid4())

        # Get client address
        client_host = websocket.client.host if websocket.client else "unknown"
        client_port = websocket.client.port if websocket.client else 0
        client_address = f"{client_host}:{client_port}"

        # Register connection
        connection_manager.add_connection(connection_id, client_address, channel_name)

        # Set connection_id in context so handlers can access it
        _connection_id_context.set(connection_id)

        # Start background task if on_connect handler exists
        background_task: asyncio.Task[None] | None = None
        if on_connect_func is not None and callable(on_connect_func):
            background_task = asyncio.create_task(on_connect_func(websocket, connection_id))
            logger.debug(
                "Started background task for channel '%s', connection '%s'",
                channel_name,
                connection_id,
            )

        try:
            # Message loop
            while True:
                # Receive message from client (as dict)
                try:
                    raw_message = await _receive_message(websocket, channel_name)
                    if raw_message is None:
                        break
                except ValidationError as e:
                    # Handle JSON decode errors (invalid JSON format)
                    error_response = await hooks.on_validation_error(e, channel_name)
                    if not await _send_error_response(websocket, error_response, channel_name):
                        break
                    continue

                # Hook: before_receive (validation)  # noqa: ERA001
                try:
                    validated_message = await hooks.before_receive(raw_message, request_msg_type, channel_name)
                except ValidationError as e:
                    error_response = await hooks.on_validation_error(e, channel_name)
                    if not await _send_error_response(websocket, error_response, channel_name):
                        break
                    continue

                # Hook: after_receive (additional processing)
                try:
                    processed_message = await hooks.after_receive(validated_message, channel_name)
                except Exception as e:
                    logger.exception("Error in after_receive hook on channel '%s'", channel_name)
                    error_response = await hooks.on_handler_error(e, channel_name)
                    if not await _send_error_response(websocket, error_response, channel_name):
                        break
                    continue

                # Handle message with channel-specific handler
                try:
                    # Call handler with or without connection_id based on signature
                    if handler_accepts_connection_id:
                        handler_response = await handler_func(processed_message, connection_id)
                    else:
                        handler_response = await handler_func(processed_message)
                except Exception as e:
                    logger.exception("Handler error on channel '%s'", channel_name)
                    error_response = await hooks.on_handler_error(e, channel_name)
                    if not await _send_error_response(websocket, error_response, channel_name):
                        break
                    continue

                # Hook: before_send (finalize response)
                try:
                    final_response = await hooks.before_send(handler_response, channel_name)
                except Exception as e:
                    logger.exception("Error in before_send hook on channel '%s'", channel_name)
                    error_response = await hooks.on_handler_error(e, channel_name)
                    if not await _send_error_response(websocket, error_response, channel_name):
                        break
                    continue

                # Send response to client
                try:
                    await websocket.send_json(final_response)
                except WebSocketDisconnect:
                    logger.debug("Client disconnected during send on channel '%s'", channel_name)
                    break

        except WebSocketDisconnect:
            logger.debug("Client disconnected from channel '%s'", channel_name)
        except Exception:
            logger.exception("Unexpected error on channel '%s'", channel_name)
        finally:
            # Cancel background task if it exists
            if background_task is not None:
                background_task.cancel()
                try:
                    await background_task
                except asyncio.CancelledError:
                    logger.debug(
                        "Background task cancelled for channel '%s', connection '%s'",
                        channel_name,
                        connection_id,
                    )
                except Exception:
                    logger.exception(
                        "Error while cancelling background task for channel '%s'",
                        channel_name,
                    )

            # Clean up connection
            connection_manager.remove_connection(connection_id)

    return websocket_endpoint


def get_current_connection_id() -> str | None:
    """Get the connection_id for the current WebSocket handler context.

    This function can be called from within WebSocket message handlers
    to retrieve the connection_id that's been set by the endpoint factory.

    Returns:
        The connection_id string if available, None otherwise

    Examples:
        >>> def handle_my_channel(message: dict) -> dict:
        ...     connection_id = get_current_connection_id()
        ...     if connection_id:
        ...         # Use connection_id for per-connection state management
        ...         pass
        ...     return {}

    """
    return _connection_id_context.get()
