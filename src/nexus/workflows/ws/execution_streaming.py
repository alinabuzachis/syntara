"""Workflows WebSocket handler for streaming execution activity updates.

Thin proxy handler that delegates to ExecutionStreamingService for actual streaming logic.
"""

import logging
from uuid import UUID

from fastapi import WebSocket
from pydantic import ValidationError

from nexus.core.websocket.close_codes import UNSUPPORTED_DATA
from nexus.workflows.models.query_params import ExecutionStreamingQueryParams
from nexus.workflows.services.execution_streaming_service import get_execution_streaming_service

logger = logging.getLogger(__name__)

# AsyncAPI specification path (relative to project root)
SPEC_PATH = "src/nexus/schemas/workflows/websocket-execution_streaming.yaml"


def handle_executions(_message: dict[str, object], _connection_id: str) -> dict[str, str]:
    """Return empty dict as dummy handler for framework.

    This function is required for the WebSocket framework to discover this module,
    but it won't be called since 'executions' is a receive-only channel.

    Args:
        _message: Incoming message (unused)
        _connection_id: Connection ID (unused)

    Returns:
        Empty dict

    """
    return {}


async def on_connect_executions(websocket: WebSocket, connection_id: str) -> None:
    """WebSocket connection handler for execution activity streaming.

    Thin proxy that delegates to ExecutionStreamingService for actual streaming logic.

    Args:
        websocket: The WebSocket connection
        connection_id: Unique connection identifier

    """
    # Extract execution_id from WebSocket path
    # Path format: /ws/workflows/v1/executions/{execution_id}
    path_parts = websocket.url.path.split("/")
    execution_id_str = path_parts[-1]

    try:
        execution_id = UUID(execution_id_str)
    except ValueError:
        logger.exception("Invalid execution_id in path: %s", execution_id_str)
        await websocket.close(code=UNSUPPORTED_DATA, reason="Invalid execution ID")
        return

    # Validate query parameters
    try:
        params = ExecutionStreamingQueryParams(**dict(websocket.query_params))
        replay = params.replay
    except ValidationError as e:
        logger.warning("Invalid query parameters: %s", e)
        # Extract first error message for user-friendly reason
        error_msg = e.errors()[0]["msg"] if e.errors() else "Invalid query parameters"
        await websocket.close(code=UNSUPPORTED_DATA, reason=error_msg)
        return

    # Delegate to streaming service
    # Check app.state first (allows test injection), fallback to singleton
    streaming_service = getattr(websocket.app.state, "execution_streaming_service", None)
    if streaming_service is None:
        streaming_service = get_execution_streaming_service()

    await streaming_service.stream_events_to_websocket(
        websocket=websocket,
        execution_id=execution_id,
        replay=replay,
        connection_id=connection_id,
    )
