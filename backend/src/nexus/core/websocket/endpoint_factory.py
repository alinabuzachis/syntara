"""WebSocket endpoint factory for dynamic endpoint generation.

This module provides functions to create WebSocket endpoints from AsyncAPI specifications
using YAML-first convention-based discovery.
"""

import asyncio
import importlib.util
import inspect
import json
import types
import uuid
from collections.abc import Callable
from contextvars import ContextVar
from importlib.resources import files
from pathlib import Path
from typing import Any

import structlog
import yaml
from fastapi import WebSocket, WebSocketDisconnect

from nexus.core.exceptions import SafeValueError
from nexus.core.websocket.connection import get_connection_manager
from nexus.core.websocket.hooks import WebSocketHooks, discover_hooks
from nexus.core.websocket.manager import get_connection_lifecycle_manager
from nexus.core.websocket.schema_validator import ValidationError
from nexus.core.websocket.utils import is_receive_only_channel, normalize_channel_name

logger = structlog.stdlib.get_logger(__name__)

# Context variable to pass connection_id to handlers
_connection_id_context: ContextVar[str | None] = ContextVar("connection_id_context", default=None)

# Global cache of loaded specs (component_name -> spec_dict)
# Used by validation to avoid re-loading spec files
_SPEC_CACHE: dict[str, dict[str, Any]] = {}

# Global cache of loaded handler modules (component_name -> channel_name -> module)
# Populated during spec scanning.
_HANDLER_MODULE_CACHE: dict[str, dict[str, types.ModuleType]] = {}


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
        logger.warning("Error on channel", channel=channel_name, message=error_dict.get("message"))
        return True
    except WebSocketDisconnect:
        logger.debug("Client disconnected before error response on channel", channel=channel_name)
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
        logger.debug("Client disconnected during receive on channel", channel=channel_name)
        return None
    except json.JSONDecodeError as e:
        logger.warning("Invalid JSON on channel", channel=channel_name, error=str(e))
        msg = f"Invalid JSON format: {e.msg}"
        raise ValidationError(error_type="INVALID_REQUEST", message=msg) from e
    except Exception:
        logger.exception("Error receiving message on channel", channel=channel_name)
        return None


def _handler_to_spec_path(component_name: str, handler_stem: str) -> Path:
    """Derive spec file path from handler file name.

    Uses automatic mapping convention:
    src/nexus/{component}/ws/{handler}.py -> schemas/{component}/websocket-{handler}.{yaml|yml|json}

    Supports .yaml, .yml, and .json extensions (checks in that order).

    Args:
        component_name: Name of the component (e.g., 'example')
        handler_stem: Handler filename without extension (e.g., 'example')

    Returns:
        Path to the expected spec file (prefers .yaml, then .yml, then .json)

    """
    # Access schemas from package resources
    schemas_package = files("nexus").joinpath("schemas").joinpath(component_name)

    # Try different extensions in order
    for ext in [".yaml", ".yml", ".json"]:
        spec_name = f"websocket-{handler_stem}{ext}"
        try:
            spec_resource = schemas_package.joinpath(spec_name)
            # Try to resolve the path - if it exists, return it
            # Note: we need to convert to Path for compatibility with existing code
            spec_path = Path(str(spec_resource))
            if spec_resource.is_file():
                return spec_path
        except (FileNotFoundError, AttributeError):
            continue

    # Return .yaml as default (for error messages)
    return Path(str(schemas_package.joinpath(f"websocket-{handler_stem}.yaml")))


def _spec_to_handler_path(spec_path: Path, project_root: Path) -> tuple[str, str, Path]:
    """Derive handler file path from spec file path.

    Args:
        spec_path: Path to spec file (e.g., schemas/example/websocket-example.yaml)
        project_root: Root directory of the project

    Returns:
        Tuple of (component_name, handler_stem, expected_handler_path)

    Raises:
        ValueError: If spec path doesn't follow websocket-*.{yaml|yml|json} naming convention

    """
    component_name = spec_path.parent.name
    filename = spec_path.stem  # websocket-example

    if not filename.startswith("websocket-"):
        logger.error(
            "Spec file doesn't follow websocket-*.{{yaml|yml|json}} convention",
            component=component_name,
            spec_path=spec_path,
        )
        msg = "Invalid WebSocket configuration. See server logs for details."
        raise SafeValueError(msg)

    handler_stem = filename[len("websocket-") :]  # example
    handler_path = project_root / "src" / "nexus" / component_name / "ws" / f"{handler_stem}.py"

    return component_name, handler_stem, handler_path


def _find_orphan_specs(project_root: Path, components_with_ws: set[str]) -> list[tuple[Path, str, Path]]:
    """Find spec files that don't have corresponding handler files.

    Only checks specs for components that have a ws/ directory.

    Args:
        project_root: Root directory of the project
        components_with_ws: Set of component names that have ws/ directories

    Returns:
        List of (spec_path, component_name, expected_handler_path) tuples for orphan specs

    """
    orphans: list[tuple[Path, str, Path]] = []
    # Access schemas from package resources
    schemas_package = files("nexus").joinpath("schemas")

    try:
        # Iterate through schema subdirectories
        for component_name in components_with_ws:
            component_schemas = schemas_package.joinpath(component_name)
            try:
                # Check if component has a schemas directory
                for resource in component_schemas.iterdir():
                    resource_path = Path(str(resource))
                    if resource_path.name.startswith("websocket-") and resource_path.suffix in [
                        ".yaml",
                        ".yml",
                        ".json",
                    ]:
                        try:
                            _component_name, _handler_stem, expected_handler_path = _spec_to_handler_path(
                                resource_path, project_root
                            )
                        except ValueError as e:
                            logger.warning("Skipping malformed spec path", error=str(e))
                            continue

                        if not expected_handler_path.exists():
                            orphans.append((resource_path, component_name, expected_handler_path))
            except (FileNotFoundError, AttributeError):
                # Component has no schemas directory
                continue
    except (FileNotFoundError, AttributeError):
        # Schemas package doesn't exist
        return orphans

    return orphans


def _validate_no_duplicate_channels(
    component_name: str, specs: dict[Path, tuple[Any, dict[str, Any]]]
) -> dict[str, Path]:
    """Validate there are no duplicate channels across specs and track their sources.

    Args:
        component_name: Name of the component
        specs: Dict of {py_file: (module, spec_dict)}

    Returns:
        Dict mapping channel names to the file that defined them

    Raises:
        ValueError: If duplicate channel names found

    """
    merged_channels: dict[str, Path] = {}
    for py_file, (_module, spec) in specs.items():
        for channel_name in spec.get("channels", {}):
            if channel_name in merged_channels:
                msg = (
                    f"Duplicate channel '{channel_name}' in component '{component_name}' "
                    f"found in both {merged_channels[channel_name].name} and {py_file.name}"
                )
                raise SafeValueError(msg)
            merged_channels[channel_name] = py_file
    return merged_channels


def _merge_operations(component_name: str, specs: dict[Path, tuple[Any, dict[str, Any]]]) -> dict[str, Any]:
    """Merge operations from all specs, keeping first on duplicates.

    Args:
        component_name: Name of the component for logging
        specs: Dict of {py_file: (module, spec_dict)}

    Returns:
        Merged operations dictionary

    """
    merged: dict[str, Any] = {}
    for py_file, (_module, spec) in specs.items():
        for op_name, op_def in spec.get("operations", {}).items():
            if op_name in merged:
                logger.warning(
                    "Duplicate operation in component from file, keeping first",
                    operation=op_name,
                    component=component_name,
                    filename=py_file.name,
                )
            else:
                merged[op_name] = op_def
    return merged


def _merge_components_section(specs: dict[Path, tuple[Any, dict[str, Any]]]) -> dict[str, Any]:
    """Merge components/messages and components/schemas from all specs.

    Args:
        specs: Dict of {py_file: (module, spec_dict)}

    Returns:
        Merged components dictionary (may be empty)

    """
    messages: dict[str, Any] = {}
    schemas: dict[str, Any] = {}

    for _module, spec in specs.values():
        components = spec.get("components", {})
        for msg_name, msg_def in components.get("messages", {}).items():
            if msg_name not in messages:
                messages[msg_name] = msg_def
        for schema_name, schema_def in components.get("schemas", {}).items():
            if schema_name not in schemas:
                schemas[schema_name] = schema_def

    result: dict[str, Any] = {}
    if messages:
        result["messages"] = messages
    if schemas:
        result["schemas"] = schemas
    return result


def _collect_channels(specs: dict[Path, tuple[Any, dict[str, Any]]]) -> dict[str, Any]:
    """Collect all channels from specs into a single dictionary.

    Args:
        specs: Dict of {py_file: (module, spec_dict)}

    Returns:
        Merged channels dictionary

    """
    channels: dict[str, Any] = {}
    for _module, spec in specs.values():
        channels.update(spec.get("channels", {}))
    return channels


def _merge_component_specs(component_name: str, specs: dict[Path, tuple[Any, dict[str, Any]]]) -> dict[str, Any]:
    """Merge multiple AsyncAPI specs for a component.

    Args:
        component_name: Name of the component
        specs: Dict of {py_file: (module, spec_dict)}

    Returns:
        Merged AsyncAPI spec dictionary

    Raises:
        ValueError: If no specs provided or duplicate channel names found

    """
    if not specs:
        msg = f"No specs to merge for component '{component_name}'"
        raise SafeValueError(msg)

    if len(specs) == 1:
        _, spec = next(iter(specs.values()))
        return spec

    # Validate no duplicate channels
    _validate_no_duplicate_channels(component_name, specs)

    # Use first spec's metadata as base
    _first_py_file, (_first_module, first_spec) = next(iter(specs.items()))
    merged: dict[str, Any] = {
        "asyncapi": first_spec.get("asyncapi", "3.0.0"),
        "info": first_spec.get("info", {}),
        "servers": first_spec.get("servers", {}),
        "channels": _collect_channels(specs),
    }

    # Merge operations
    operations = _merge_operations(component_name, specs)
    if operations:
        merged["operations"] = operations

    # Merge components
    components = _merge_components_section(specs)
    if components:
        merged["components"] = components

    logger.info(
        "Merged spec(s) for component with total channels",
        spec_count=len(specs),
        component=component_name,
        channel_count=len(merged["channels"]),
    )

    return merged


def _load_module_from_file(component_name: str, py_file: Path) -> types.ModuleType | None:
    """Load a Python module from a file path.

    Args:
        component_name: Name of the component for module naming
        py_file: Path to the Python file

    Returns:
        Loaded module, or None if loading failed

    """
    try:
        module_name = f"nexus.{component_name}.ws.{py_file.stem}"
        spec = importlib.util.spec_from_file_location(module_name, py_file)

        if spec is None or spec.loader is None:
            logger.warning("Failed to create module spec, skipping", file=str(py_file))
            return None

        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    except Exception as e:  # noqa: BLE001
        logger.warning(
            "Failed to import for component",
            filename=py_file.name,
            component=component_name,
            error=str(e),
            exc_info=True,
        )
        return None


def _load_spec_file(spec_path: Path, py_file: Path) -> dict[str, Any] | None:
    """Load an AsyncAPI spec from a YAML or JSON file.

    Args:
        spec_path: Path to the spec file (can be a package resource path)
        py_file: Path to the Python file (for logging)

    Returns:
        Parsed spec dictionary, or None if loading failed

    """
    try:
        # Read content - handle both regular Path and package resource paths
        content = spec_path.read_text() if hasattr(spec_path, "read_text") else Path(spec_path).read_text()

        if spec_path.suffix in (".yaml", ".yml"):
            return yaml.safe_load(content)  # type: ignore[no-any-return]
        if spec_path.suffix == ".json":
            return json.loads(content)  # type: ignore[no-any-return]

        logger.warning("Unknown spec file format, skipping", format=spec_path.suffix, filename=py_file.name)
        return None
    except Exception as e:  # noqa: BLE001
        logger.warning("Failed to load spec from path", spec_path=str(spec_path), error=str(e), exc_info=True)
        return None


def _scan_ws_directory(component_name: str, ws_dir: Path, project_root: Path) -> dict[Path, tuple[Any, dict[str, Any]]]:
    """Scan a ws/ directory for handler files and load their specs.

    Uses automatic path mapping convention:
    src/nexus/{component}/ws/{handler}.py -> schemas/{component}/websocket-{handler}.yaml

    Args:
        component_name: Name of the component
        ws_dir: Path to the ws/ directory
        project_root: Path to the project root

    Returns:
        Dictionary mapping py_file paths to (module, spec_dict) tuples

    Raises:
        ValueError: If a handler file has no corresponding spec file

    """
    specs: dict[Path, tuple[Any, dict[str, Any]]] = {}

    for py_file in ws_dir.glob("*.py"):
        if py_file.name == "__init__.py":
            continue

        logger.debug("Processing file for component", filename=py_file.name, component=component_name)

        # Derive spec path from handler filename (automatic mapping)
        handler_stem = py_file.stem
        expected_spec_path = _handler_to_spec_path(component_name, handler_stem)

        if not expected_spec_path.exists():
            rel_handler = py_file.relative_to(project_root)
            rel_spec = expected_spec_path.relative_to(project_root)
            msg = (
                f"\n{'=' * 70}\n"
                f"WebSocket Configuration Error: Missing Spec File\n"
                f"{'=' * 70}\n\n"
                f"Handler file has no corresponding AsyncAPI spec:\n\n"
                f"  • Handler: {rel_handler}\n"
                f"  • Expected spec: {rel_spec}\n\n"
                f"{'─' * 70}\n"
                f"How to fix:\n\n"
                f"  Option 1: Create the spec file at the expected path\n"
                f"            Supported extensions: .yaml, .yml, .json\n\n"
                f"  Option 2: Remove the handler file if it's no longer needed\n\n"
                f"{'─' * 70}\n"
                f"Path mapping convention:\n"
                f"  Handler: src/nexus/{{component}}/ws/{{name}}.py\n"
                f"  Spec:    schemas/{{component}}/websocket-{{name}}.{{yaml|yml|json}}\n"
                f"{'=' * 70}\n"
            )
            raise SafeValueError(msg)

        if not expected_spec_path.is_file():
            msg = f"Expected spec path {expected_spec_path} exists but is not a file"
            raise SafeValueError(msg)

        module = _load_module_from_file(component_name, py_file)
        if module is None:
            continue

        spec_dict = _load_spec_file(expected_spec_path, py_file)
        if spec_dict is None:
            continue

        specs[py_file] = (module, spec_dict)

        if component_name not in _HANDLER_MODULE_CACHE:
            _HANDLER_MODULE_CACHE[component_name] = {}
        for channel_name in spec_dict.get("channels", {}):
            _HANDLER_MODULE_CACHE[component_name][channel_name] = module
            logger.debug("Cached module for channel in component", channel=channel_name, component=component_name)

        logger.debug(
            "Loaded spec from file for handler with channels",
            spec_filename=expected_spec_path.name,
            handler_filename=py_file.name,
            channel_count=len(spec_dict.get("channels", {})),
        )

    return specs


def _is_scannable_component_dir(component_dir: Path) -> bool:
    """Check if a directory should be scanned as a component.

    Args:
        component_dir: Path to check

    Returns:
        True if the directory should be scanned

    """
    if not component_dir.is_dir():
        return False
    if component_dir.name in ("__pycache__", "core", "api"):
        return False
    ws_dir = component_dir / "ws"
    return ws_dir.exists() and ws_dir.is_dir()


def scan_handler_specs() -> dict[str, dict[str, Any]]:
    """Scan component ws/*.py files and merge their specs.

    Uses automatic path mapping convention:
    src/nexus/{component}/ws/{handler}.py -> schemas/{component}/websocket-{handler}.yaml

    Discovery pattern:
    - src/nexus/{component}/ws/*.py -> component name from parent directory
    - Spec path is automatically derived from handler filename
    - Multiple .py files per component are merged into single spec

    Fail-fast validation:
    - Handler file without corresponding spec file = ValueError
    - Spec file without corresponding handler file = ValueError

    Returns:
        Dictionary mapping component names to their merged AsyncAPI specs

    Raises:
        ValueError: If handler/spec pairing is incomplete

    Examples:
        >>> specs = scan_handler_specs()
        >>> "example" in specs
        True
        >>> isinstance(specs["example"], dict)
        True
        >>> "channels" in specs["example"]
        True

    """
    # Clear global caches to ensure clean state
    # This prevents stale data in dynamic reload scenarios
    _SPEC_CACHE.clear()
    _HANDLER_MODULE_CACHE.clear()

    current_file = Path(__file__)
    nexus_dir = current_file.parent.parent.parent  # src/nexus/
    project_root = nexus_dir.parent.parent

    # First, collect all components with ws/ directories
    components_with_ws: set[str] = set()
    for component_dir in nexus_dir.iterdir():
        if _is_scannable_component_dir(component_dir):
            components_with_ws.add(component_dir.name)

    # Check for orphan specs (specs without corresponding handlers)
    orphans = _find_orphan_specs(project_root, components_with_ws)
    if orphans:
        orphan_details = []
        for spec_path, _component_name, handler_path in orphans:
            # Use relative paths for cleaner output
            rel_spec = spec_path.relative_to(project_root)
            rel_handler = handler_path.relative_to(project_root)
            orphan_details.append(f"  • Spec: {rel_spec}\n    Expected handler: {rel_handler}")

        msg = (
            f"\n{'=' * 70}\n"
            f"WebSocket Configuration Error: Orphan Spec File(s) Detected\n"
            f"{'=' * 70}\n\n"
            f"Found {len(orphans)} spec file(s) without corresponding handler(s):\n\n"
            + "\n\n".join(orphan_details)
            + "\n\n"
            f"{'─' * 70}\n"
            f"How to fix:\n\n"
            f"  Option 1: Create the missing handler file\n"
            f"            The handler filename must match the spec filename:\n"
            f"            websocket-{{name}}.yaml → {{name}}.py\n\n"
            f"  Option 2: Remove the orphan spec file if it's no longer needed\n\n"
            f"  Option 3: If this component should not have WebSocket handlers,\n"
            f"            remove its ws/ directory\n"
            f"{'─' * 70}\n"
            f"Path mapping convention:\n"
            f"  Handler: src/nexus/{{component}}/ws/{{name}}.py\n"
            f"  Spec:    schemas/{{component}}/websocket-{{name}}.{{yaml|yml|json}}\n"
            f"{'=' * 70}\n"
        )
        raise SafeValueError(msg)

    component_specs: dict[str, dict[str, Any]] = {}

    for component_dir in nexus_dir.iterdir():
        if not _is_scannable_component_dir(component_dir):
            continue

        component_name = component_dir.name
        ws_dir = component_dir / "ws"
        logger.debug("Scanning ws/ directory for component", component=component_name)

        specs = _scan_ws_directory(component_name, ws_dir, project_root)
        if not specs:
            logger.debug("No valid specs found in ws/ directory for component, skipping", component=component_name)
            continue

        try:
            merged_spec = _merge_component_specs(component_name, specs)
            component_specs[component_name] = merged_spec
            _SPEC_CACHE[component_name] = merged_spec

            logger.info(
                "Registered component with channels from file(s)",
                component=component_name,
                channel_count=len(merged_spec.get("channels", {})),
                file_count=len(specs),
            )
        except ValueError:
            logger.exception("Failed to merge specs for component", component=component_name)

    logger.info("Discovered component(s) with AsyncAPI specs", component_count=len(component_specs))
    return component_specs


def get_spec_from_cache(component_name: str) -> dict[str, Any] | None:
    """Get a loaded spec from the global cache.

    Args:
        component_name: Name of the component

    Returns:
        Spec dict if found, None otherwise

    """
    return _SPEC_CACHE.get(component_name)


def _find_request_message_type(channel_def: dict[str, Any]) -> str | None:
    """Find the request message type from a channel definition.

    Args:
        channel_def: Channel definition from spec

    Returns:
        Request message type name, or None if not found

    """
    messages = channel_def.get("messages", {})
    for msg_name in messages:
        msg_ref: str = messages[msg_name].get("$ref", "")
        if msg_ref.startswith("#/components/messages/"):
            actual_msg_name: str = msg_ref.rsplit("/", maxsplit=1)[-1]
            if actual_msg_name.endswith("Request"):
                return actual_msg_name
    return None


def _validate_handler_func(
    handler_func: Callable[..., Any] | None,
    handler_func_name: str,
    channel_name: str,
    component_name: str,
    *,
    is_receive_only: bool,
) -> None:
    """Validate handler function existence and callability.

    Args:
        handler_func: The handler function or None
        handler_func_name: Name of the handler function
        channel_name: Name of the channel
        component_name: Name of the component
        is_receive_only: Whether this is a receive-only channel

    Raises:
        ValueError: If handler is required but missing or not callable

    """
    if handler_func is None:
        if is_receive_only:
            logger.info(
                "No handler function for receive-only channel (not required)",
                handler_func=handler_func_name,
                channel=channel_name,
            )
        else:
            msg = (
                f"Handler function '{handler_func_name}' not found for bidirectional "
                f"channel '{channel_name}' in component '{component_name}'"
            )
            raise SafeValueError(msg)


def _handler_accepts_connection_id(handler_func: Callable[..., Any] | None) -> bool:
    """Check if handler function accepts connection_id parameter.

    Args:
        handler_func: The handler function or None

    Returns:
        True if handler accepts connection_id or _connection_id parameter

    """
    if handler_func is None:
        return False
    handler_sig = inspect.signature(handler_func)
    return "connection_id" in handler_sig.parameters or "_connection_id" in handler_sig.parameters


def _validate_channel_and_get_request_type(
    spec: dict[str, Any],
    channel_name: str,
    *,
    is_receive_only: bool,
) -> str | None:
    """Validate channel exists and return request message type.

    Args:
        spec: AsyncAPI specification dictionary
        channel_name: Name of the channel
        is_receive_only: Whether this is a receive-only channel

    Returns:
        Request message type name, or None for receive-only channels

    Raises:
        ValueError: If channel not found or request message type missing for bidirectional

    """
    channels = spec.get("channels", {})
    if channel_name not in channels:
        msg = f"Channel '{channel_name}' not found in spec"
        raise SafeValueError(msg)

    channel_def = channels[channel_name]
    request_msg_type = _find_request_message_type(channel_def)

    if not request_msg_type and not is_receive_only:
        msg = f"No request message type found for channel '{channel_name}'"
        raise SafeValueError(msg)

    if is_receive_only:
        if request_msg_type:
            logger.debug("Receive-only channel has Request message (will be ignored)", channel=channel_name)
        else:
            logger.info("Receive-only channel configured without Request message", channel=channel_name)

    return request_msg_type


def _get_client_address(websocket: WebSocket) -> str:
    """Get client address string from WebSocket connection.

    Args:
        websocket: WebSocket connection

    Returns:
        Client address in "host:port" format

    """
    client_host = websocket.client.host if websocket.client else "unknown"
    client_port = websocket.client.port if websocket.client else 0
    return f"{client_host}:{client_port}"


async def _cancel_background_task(
    background_task: asyncio.Task[None] | None,
    channel_name: str,
    connection_id: str,
) -> None:
    """Cancel a background task safely.

    Args:
        background_task: Task to cancel, or None
        channel_name: Channel name for logging
        connection_id: Connection ID for logging

    """
    if background_task is None:
        return

    background_task.cancel()
    try:
        await background_task
    except asyncio.CancelledError:  # NOSONAR - Expected when we initiate cancellation
        logger.debug(
            "Background task cancelled for channel, connection", channel=channel_name, connection_id=connection_id
        )
    except Exception:
        logger.exception("Error while cancelling background task for channel", channel=channel_name)


async def _handle_receive_only_channel(
    background_task: asyncio.Task[None] | None,
    on_connect_func: Callable[..., Any] | None,
    channel_name: str,
    normalized_channel_name: str,
    connection_id: str,
) -> None:
    """Handle a receive-only channel connection.

    Args:
        background_task: Background task sending events
        on_connect_func: on_connect handler function
        channel_name: Channel name
        normalized_channel_name: Normalized channel name
        connection_id: Connection ID

    Raises:
        ValueError: If on_connect handler is missing

    """
    logger.info("Starting receive-only channel, connection", channel=channel_name, connection_id=connection_id)

    if on_connect_func is None:
        msg = (
            f"Receive-only channel '{channel_name}' requires on_connect_{normalized_channel_name} handler. "
            f"Receive-only channels must have a way to send events to clients."
        )
        raise SafeValueError(msg)

    if background_task is not None:
        await background_task
        logger.info("Background task completed for receive-only channel, closing connection", channel=channel_name)


async def _process_message(
    websocket: WebSocket,
    raw_message: dict[str, Any],
    request_msg_type: str,
    channel_name: str,
    hooks: WebSocketHooks,
    handler_func: Callable[..., Any],
    connection_id: str,
    lifecycle_conn_id: uuid.UUID,
    *,
    handler_accepts_conn_id: bool,
) -> bool:
    """Process a single bidirectional message through the hook/handler pipeline.

    Args:
        websocket: WebSocket connection
        raw_message: Raw message from client
        request_msg_type: Request message type for validation
        channel_name: Channel name
        hooks: Hook handlers
        handler_func: Channel handler function
        connection_id: Connection ID
        lifecycle_conn_id: Lifecycle manager connection ID for activity tracking
        handler_accepts_conn_id: Whether handler accepts connection_id

    Returns:
        True if should continue processing, False if should break the loop

    """
    # Validate request message
    try:
        validated_message = await hooks.before_receive(raw_message, request_msg_type, channel_name)
    except ValidationError as e:
        error_response = await hooks.on_validation_error(e, channel_name)
        return await _send_error_response(websocket, error_response, channel_name)

    # Execute after_receive hook
    try:
        processed_message = await hooks.after_receive(validated_message, channel_name)
    except Exception as e:
        logger.exception("Error in after_receive hook on channel", channel=channel_name)
        error_response = await hooks.on_handler_error(e, channel_name)
        return await _send_error_response(websocket, error_response, channel_name)

    # Handle message
    try:
        if handler_accepts_conn_id:
            handler_response = await handler_func(processed_message, connection_id)
        else:
            handler_response = await handler_func(processed_message)
    except Exception as e:
        logger.exception("Handler error on channel", channel=channel_name)
        error_response = await hooks.on_handler_error(e, channel_name)
        return await _send_error_response(websocket, error_response, channel_name)

    # Execute before_send hook
    try:
        final_response = await hooks.before_send(handler_response, channel_name)
    except Exception as e:
        logger.exception("Error in before_send hook on channel", channel=channel_name)
        error_response = await hooks.on_handler_error(e, channel_name)
        return await _send_error_response(websocket, error_response, channel_name)

    # Send response
    try:
        await websocket.send_json(final_response)
        # Update activity timestamp on successful send
        lifecycle_manager = get_connection_lifecycle_manager()
        lifecycle_manager.update_activity(lifecycle_conn_id)
        return True
    except WebSocketDisconnect:
        logger.debug("Client disconnected during send on channel", channel=channel_name)
        return False


async def _run_bidirectional_message_loop(
    websocket: WebSocket,
    channel_name: str,
    request_msg_type: str,
    hooks: WebSocketHooks,
    handler_func: Callable[..., Any],
    connection_id: str,
    *,
    handler_accepts_conn_id: bool,
    lifecycle_conn_id: uuid.UUID,
) -> None:
    """Run the bidirectional message loop.

    Args:
        websocket: WebSocket connection
        channel_name: Channel name
        request_msg_type: Request message type for validation
        hooks: Hook handlers
        handler_func: Channel handler function
        handler_accepts_conn_id: Whether handler accepts connection_id
        connection_id: Connection ID
        lifecycle_conn_id: Lifecycle manager connection ID

    """
    lifecycle_manager = get_connection_lifecycle_manager()

    while True:
        try:
            raw_message = await _receive_message(websocket, channel_name)
            if raw_message is None:
                break
            # Update activity timestamp - any message indicates connection is alive
            lifecycle_manager.update_activity(lifecycle_conn_id)
        except ValidationError as e:
            # Update activity - even invalid messages mean connection is alive
            lifecycle_manager.update_activity(lifecycle_conn_id)
            error_response = await hooks.on_validation_error(e, channel_name)
            if not await _send_error_response(websocket, error_response, channel_name):
                break
            continue

        should_continue = await _process_message(
            websocket,
            raw_message,
            request_msg_type,
            channel_name,
            hooks,
            handler_func,
            connection_id,
            lifecycle_conn_id,
            handler_accepts_conn_id=handler_accepts_conn_id,
        )
        if not should_continue:
            break


def create_websocket_endpoint(
    channel_name: str, spec: dict[str, Any], component_name: str
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
        spec: Loaded AsyncAPI specification dictionary
        component_name: Name of the component (e.g., "example")

    Returns:
        Async function compatible with FastAPI WebSocket route

    Examples:
        >>> spec = {"channels": {...}, "components": {...}}
        >>> endpoint = create_websocket_endpoint("coffee", spec, "example")
        >>> # Use with: router.add_websocket_route("/ws/example/v1/coffee", endpoint)

    """
    is_receive_only = is_receive_only_channel(spec, channel_name)
    request_msg_type = _validate_channel_and_get_request_type(spec, channel_name, is_receive_only=is_receive_only)

    # Get handler module from cache (populated during spec scanning)
    handler_module = _HANDLER_MODULE_CACHE.get(component_name, {}).get(channel_name)

    if handler_module is None:
        # This should never happen - cache is populated during spec scanning
        msg = f"Module not found in cache for component '{component_name}', channel '{channel_name}'. "
        raise RuntimeError(msg)

    hooks = discover_hooks(handler_module, component_name)
    normalized_channel_name = normalize_channel_name(channel_name)

    # Get handler function
    handler_func_name = f"handle_{normalized_channel_name}"
    handler_func = getattr(handler_module, handler_func_name, None)
    _validate_handler_func(
        handler_func, handler_func_name, channel_name, component_name, is_receive_only=is_receive_only
    )
    handler_accepts_conn_id = _handler_accepts_connection_id(handler_func)

    # Get on_connect function
    on_connect_func_name = f"on_connect_{normalized_channel_name}"
    on_connect_func = getattr(handler_module, on_connect_func_name, None)

    connection_manager = get_connection_manager()
    lifecycle_manager = get_connection_lifecycle_manager()

    async def websocket_endpoint(websocket: WebSocket) -> None:
        """WebSocket endpoint handler."""
        await websocket.accept()
        connection_id_str = str(uuid.uuid4())
        client_address = _get_client_address(websocket)

        # Track connection in both managers
        # connection_manager: simple tracking for metrics
        # lifecycle_manager: health monitoring with ping/pong
        connection_manager.add_connection(connection_id_str, client_address, channel_name)
        lifecycle_conn_id = lifecycle_manager.add_connection(
            channel=channel_name,
            client_ip=client_address,
            websocket=websocket,
            metadata={"component": component_name},
        )
        lifecycle_manager.activate_connection(lifecycle_conn_id)
        _connection_id_context.set(connection_id_str)

        # Start background task if on_connect handler exists
        background_task: asyncio.Task[None] | None = None
        if on_connect_func is not None and callable(on_connect_func):
            background_task = asyncio.create_task(on_connect_func(websocket, connection_id_str))
            logger.debug(
                "Started background task for channel, connection", channel=channel_name, connection_id=connection_id_str
            )

        try:
            if is_receive_only:
                await _handle_receive_only_channel(
                    background_task, on_connect_func, channel_name, normalized_channel_name, connection_id_str
                )
            else:
                await _run_bidirectional_message_loop(
                    websocket,
                    channel_name,
                    request_msg_type,  # type: ignore[arg-type]
                    hooks,
                    handler_func,  # type: ignore[arg-type]
                    connection_id_str,
                    handler_accepts_conn_id=handler_accepts_conn_id,
                    lifecycle_conn_id=lifecycle_conn_id,
                )
        except WebSocketDisconnect:
            logger.debug("Client disconnected from channel", channel=channel_name)
        except Exception:
            logger.exception("Unexpected error on channel", channel=channel_name)
        finally:
            await _cancel_background_task(background_task, channel_name, connection_id_str)
            connection_manager.remove_connection(connection_id_str)
            lifecycle_manager.remove_connection(lifecycle_conn_id, reason="normal_close")

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
