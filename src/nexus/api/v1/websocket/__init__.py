"""WebSocket router for dynamic endpoint registration.

This module provides the WebSocket router that automatically discovers and registers
WebSocket endpoints based on AsyncAPI specifications and handler modules.
"""

import logging
from pathlib import Path
from typing import Any

import yaml
from fastapi import APIRouter

from nexus.core.websocket.endpoint_factory import create_websocket_endpoint, scan_handler_specs
from nexus.core.websocket.interceptor import ValidationInterceptor, get_registry

logger = logging.getLogger(__name__)


def build_websocket_router(spec_path: str | Path | None = None) -> APIRouter:  # noqa: C901, PLR0915
    """Build an APIRouter with all WebSocket endpoints.

    This function creates a FastAPI router with WebSocket endpoints dynamically
    generated from AsyncAPI specifications. It supports two modes:

    1. Explicit spec path: Use the provided spec to create endpoints
    2. Auto-discovery: Scan all handlers for SPEC_PATH and create endpoints

    Interceptors are used to validate channel mappings and can be extended
    for additional bootstrap-time checks.

    Args:
        spec_path: Optional path to AsyncAPI spec. If None, auto-discovers from handlers.

    Returns:
        Configured APIRouter with all WebSocket endpoints

    Examples:
        >>> # Auto-discovery mode
        >>> router = build_websocket_router()
        >>>
        >>> # Explicit spec mode
        >>> router = build_websocket_router("path/to/spec.yaml")

    """
    router = APIRouter(tags=["WebSocket"])

    # Get the global interceptor registry
    interceptor_registry = get_registry()
    validation_interceptor = ValidationInterceptor()
    interceptor_registry.register(validation_interceptor)

    # Collect specs to process
    specs_to_process: dict[Path, Any] = {}

    if spec_path:
        # Explicit mode: use provided spec
        spec_path = Path(spec_path)
        if not spec_path.exists():
            logger.error("Spec file not found: %s", spec_path)
            return router

        with spec_path.open() as f:
            specs_to_process[spec_path] = yaml.safe_load(f)

        logger.info("Using explicit spec: %s", spec_path)
    else:
        # Auto-discovery mode: scan handlers
        handler_specs = scan_handler_specs()

        if not handler_specs:
            logger.warning("No handlers with SPEC_PATH found. WebSocket endpoints not registered.")
            return router

        # Load unique specs
        for handler_name, handler_spec_path in handler_specs.items():
            if handler_spec_path not in specs_to_process:
                try:
                    with handler_spec_path.open() as f:
                        specs_to_process[handler_spec_path] = yaml.safe_load(f)
                    logger.info("Loaded spec from handler '%s': %s", handler_name, handler_spec_path)
                except Exception:
                    logger.exception("Failed to load spec for handler '%s'", handler_name)

    # Prepare specs for interceptors (component_name -> spec)
    specs_by_component: dict[str, Any] = {}
    for spec_path_obj, spec_data in specs_to_process.items():
        component_name = spec_path_obj.stem
        specs_by_component[component_name] = spec_data

    # Notify interceptors that bootstrap is starting
    interceptor_registry.on_bootstrap_start(specs_by_component)

    # Create endpoints for all channels in all specs
    endpoint_count = 0
    success_count = 0
    failure_count = 0

    for spec_path_obj, spec_data in specs_to_process.items():
        component_name = spec_path_obj.stem
        channels = spec_data.get("channels", {})

        for channel_name, channel_def in channels.items():
            address = channel_def.get("address")
            if not address:
                logger.warning(
                    "Channel '%s' in %s has no address, skipping",
                    channel_name,
                    spec_path_obj,
                )
                continue

            # Notify interceptors before endpoint creation
            interceptor_registry.before_endpoint_creation(component_name, channel_name, channel_def)

            try:
                # Create WebSocket endpoint
                endpoint = create_websocket_endpoint(channel_name, spec_path_obj)

                # Register endpoint
                router.add_websocket_route(address, endpoint)

                logger.info(
                    "Registered WebSocket endpoint: %s (channel: %s)",
                    address,
                    channel_name,
                )
                endpoint_count += 1
                success_count += 1

                # Notify interceptors after successful endpoint creation
                interceptor_registry.after_endpoint_creation(component_name, channel_name, endpoint, success=True)

            except Exception as e:
                logger.exception(
                    "Failed to create endpoint for channel '%s'",
                    channel_name,
                )
                failure_count += 1

                # Notify interceptors after failed endpoint creation
                interceptor_registry.after_endpoint_creation(component_name, channel_name, None, success=False, error=e)

    # Notify interceptors that bootstrap is complete
    bootstrap_results = {
        "total_endpoints": endpoint_count,
        "success_count": success_count,
        "failure_count": failure_count,
        "specs_processed": len(specs_to_process),
    }
    interceptor_registry.on_bootstrap_complete(bootstrap_results)

    logger.info("Registered %d WebSocket endpoint(s)", endpoint_count)
    return router
