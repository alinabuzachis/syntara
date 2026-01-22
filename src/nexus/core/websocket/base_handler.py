"""Base handler for streaming events from Valkey to WebSocket clients.

Provides a template method pattern for implementing WebSocket streaming handlers.
"""

import logging
from abc import ABC, abstractmethod
from collections.abc import Callable
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlmodel.ext.asyncio.session import AsyncSession
from starlette.websockets import WebSocket

if TYPE_CHECKING:
    from uuid import UUID

from nexus.core.models.base.error import ErrorData
from nexus.core.valkey.stream import StreamClient
from nexus.core.websocket.close_codes import INTERNAL_ERROR, NORMAL_CLOSURE
from nexus.core.websocket.exceptions import StreamingValidationError
from nexus.core.websocket.manager import get_connection_lifecycle_manager

logger = logging.getLogger(__name__)


class BaseWebSocketStreamingHandler(ABC):
    """Base handler for streaming events from Valkey to WebSocket clients.

    This abstract base class implements the Template Method pattern to provide
    a reusable framework for WebSocket streaming. Subclasses must implement
    the template methods to customize behavior for their specific use cases.

    The base class handles:
    - Connection lifecycle management
    - Error handling patterns
    - WebSocket utilities
    - Common streaming logic

    Subclasses must implement:
    - create_session_state: Validate the streaming request and create session state
    - get_stop_condition: Define when to stop streaming
    - get_resource_id: Get resource ID for connection tracking
    """

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession] | None = None,
        channel_name: str = "default",
    ) -> None:
        """Initialize base WebSocket streaming handler.

        Args:
            session_factory: Async session factory for database access (optional).
            channel_name: Channel name for connection lifecycle manager.

        """
        self._session_factory = session_factory
        self._channel_name = channel_name
        logger.info("%s initialized with channel: %s", self.__class__.__name__, channel_name)

    # ============ Template Methods (Must Override) ============

    @abstractmethod
    async def create_session_state(self, **params: Any) -> dict[str, Any]:  # noqa: ANN401
        """Validate request and create session state for this streaming session.

        This method should perform all validation checks required before streaming
        can begin. If validation fails, it should raise a StreamingValidationError
        or a subclass thereof.

        The returned session state dict is passed to other template methods and contains
        all the validated data needed for streaming. Each WebSocket connection gets
        its own session state dict to avoid shared state issues.

        Args:
            **params: Parameters passed to stream_events_to_websocket

        Returns:
            Session state dict containing validated data (e.g., resource_id, status, etc.)

        Raises:
            StreamingValidationError: If validation fails

        """

    @abstractmethod
    def get_stop_condition(self, session_state: dict[str, Any]) -> Callable[[dict[str, Any]], bool]:
        """Return function that determines when to stop streaming.

        Args:
            session_state: Session state dict from create_session_state

        Returns:
            Function that takes an event dict and returns True to stop streaming,
            False to continue. Example: lambda e: e.get("event_type") == "completion"

        """

    @abstractmethod
    def get_resource_id(self, session_state: dict[str, Any]) -> str:
        """Get resource ID for connection lifecycle manager.

        Args:
            session_state: Session state dict from create_session_state

        Returns:
            Resource ID string (e.g., invocation_id, task_id, etc.)

        """

    # ============ Optional Hooks (Can Override) ============

    async def wait_for_stream_ready(
        self, stream_id: str, session_state: dict[str, Any]
    ) -> None:  # NOSONAR - async required for subclass overrides
        """Wait for stream to be ready.

        Default implementation raises an error. Override this if your streaming
        use case needs to wait for stream creation (e.g., polling until stream exists).

        Note: This method is async to allow subclass overrides to perform async operations
        (e.g., polling, waiting). The base implementation doesn't await anything, which is
        expected and acceptable.

        Args:
            stream_id: Valkey stream ID
            session_state: Session state dict from create_session_state

        Raises:
            StreamingValidationError: If stream is not ready

        """
        error_data = ErrorData(
            type="https://api.nexus.com/errors/valkey-stream-not-found",
            title="Valkey Stream Not Found",
            detail=f"Valkey stream {stream_id} does not exist",
            code="VALKEY_STREAM_NOT_FOUND",
            retryable=False,
            instance=f"/{self._channel_name}/{self.get_resource_id(session_state)}",
        )
        raise StreamingValidationError(error_data, INTERNAL_ERROR)

    def get_replay_parameters(
        self,
        replay_count: str,
        last_event_id: str | None,
        session_state: dict[str, Any],  # noqa: ARG002
    ) -> tuple[str | None, int | None]:
        """Determine replay parameters.

        Default implementation provides standard replay logic:
        - last_event_id takes precedence (resume from specific event)
        - "all" -> replay from beginning (start_id="0-0")
        - "0" -> only new events (start_id="$")
        - numeric -> replay last N events (replay=N)

        Override if you need custom replay logic.

        Args:
            replay_count: Number of historical events to replay ("all", "0", or numeric string)
            last_event_id: Specific event ID to resume from (takes precedence)
            session_state: Session state dict from create_session_state

        Returns:
            Tuple of (start_id, replay) where:
                - start_id: Stream position to start from ("0-0", "$", specific ID, or None)
                - replay: Number of events to replay from end (or None if using start_id)

        """
        start_id = None
        replay = None

        if last_event_id:
            # last_event_id takes precedence - explicit resume position
            start_id = "0-0" if last_event_id == "0" else last_event_id
        elif replay_count == "all":
            # Start from beginning
            start_id = "0-0"
        elif replay_count == "0":
            # Only new events - use "$" special marker
            start_id = "$"
        else:
            # Replay last N events
            try:
                replay = int(replay_count)
            except (ValueError, TypeError):
                logger.warning("Invalid replay_count '%s', defaulting to 10", replay_count)
                replay = 10

        return start_id, replay

    def get_connection_metadata(self, session_state: dict[str, Any], **params: Any) -> dict[str, Any]:  # noqa: ARG002, ANN401
        """Get metadata for connection lifecycle manager.

        Default implementation returns replay parameters. Override to include
        additional metadata.

        Args:
            session_state: Session state dict from create_session_state
            **params: Parameters passed to stream_events_to_websocket

        Returns:
            Metadata dict for connection lifecycle manager

        """
        return {
            "replay_count": params.get("replay_count", "10"),
            "last_event_id": params.get("last_event_id"),
        }

    # ============ Core Streaming Logic (Don't Override) ============

    async def stream_events_to_websocket(
        self,
        websocket: WebSocket,
        stream_id: str,
        replay_count: str = "10",
        last_event_id: str | None = None,
        connection_id: str | None = None,
        **params: Any,  # noqa: ANN401
    ) -> None:
        """Stream events from Valkey to WebSocket client.

        This method orchestrates the entire streaming lifecycle:
        1. Create session state (via create_session_state)
        2. Add connection to lifecycle manager
        3. Activate connection
        4. Wait for stream ready if needed (via wait_for_stream_ready)
        5. Determine replay parameters (via get_replay_parameters)
        6. Stream events from Valkey
        7. Transform and send each event (via transform_event)
        8. Handle errors appropriately
        9. Cleanup connection

        Args:
            websocket: WebSocket connection
            stream_id: Valkey stream ID to read from
            replay_count: Number of historical events to replay (default: "10")
            last_event_id: Specific event ID to resume from
            connection_id: Connection identifier for logging
            **params: Additional parameters passed to template methods

        """
        # Initialize variables for error handling and cleanup
        session_state: dict[str, Any] | None = None
        lifecycle_conn_id: UUID | None = None
        lifecycle_manager = get_connection_lifecycle_manager()
        conn_id = connection_id or "unknown"

        try:
            # Step 1: Create session state (validates and creates per-connection state)
            session_state = await self.create_session_state(**params)

            # Add connection to lifecycle manager
            client_ip = f"{websocket.client.host}:{websocket.client.port}" if websocket.client else "unknown"

            resource_id = self.get_resource_id(session_state)
            metadata = self.get_connection_metadata(
                session_state, replay_count=replay_count, last_event_id=last_event_id, **params
            )

            lifecycle_conn_id = lifecycle_manager.add_connection(
                channel=self._channel_name,
                client_ip=client_ip,
                resource_id=resource_id,
                metadata=metadata,
            )

            conn_id = connection_id or resource_id[:8]
            logger.info("Starting event streaming (connection %s)", conn_id)

            # Activate connection after successful setup
            lifecycle_manager.activate_connection(lifecycle_conn_id)

            # Step 2: Check if stream exists
            async with StreamClient() as client:
                info = await client.info(stream_id)

                if not info["exists"]:
                    # Stream doesn't exist - wait for it to be ready
                    await self.wait_for_stream_ready(stream_id, session_state)

            # Step 3: Determine streaming replay parameters
            start_id, replay = self.get_replay_parameters(replay_count, last_event_id, session_state)

            # Step 4: Stream events to client
            stop_condition = self.get_stop_condition(session_state)
            async with StreamClient() as client:
                logger.info("Starting event stream (connection %s)", conn_id)
                async for event in client.events(
                    stream_id=stream_id,
                    start_id=start_id,
                    replay=replay,
                    should_stop=stop_condition,
                    block_ms=1000,
                    count=10,
                ):
                    # Send event to WebSocket client
                    await websocket.send_json(event)

                    event_type = event.get("event_type")
                    logger.debug("Sent %s event to %s", event_type, conn_id)

            # Stream completed normally
            await self._close_websocket(websocket, NORMAL_CLOSURE, "Streaming complete")
            logger.info("Event streaming completed (connection %s)", conn_id)

        except Exception as e:
            # Handle errors
            await self._handle_error(e, websocket, conn_id, session_state)
            raise

        finally:
            # Always cleanup connection when done (if it was added)
            if lifecycle_conn_id is not None:
                lifecycle_manager.remove_connection(lifecycle_conn_id, reason="normal_close")

    # ============ Protected Utilities ============

    async def _handle_error(
        self, error: Exception, websocket: WebSocket, conn_id: str, session_state: dict[str, Any] | None
    ) -> None:
        """Handle errors during streaming.

        Args:
            error: The exception that occurred
            websocket: WebSocket connection
            conn_id: Connection ID for logging
            session_state: Session state dict from create_session_state
                (None if error occurred during create_session_state)

        """
        if isinstance(error, StreamingValidationError):
            # Handle validation errors by sending error event to client
            logger.warning("Streaming validation error for %s: %s", conn_id, error)
            resource_id = self.get_resource_id(session_state) if session_state else "unknown"
            await self._send_error_event(websocket, error.error_data, resource_id)
            await self._close_websocket(websocket, error.close_code, error.error_data.title)
        else:
            # Handle unexpected errors
            logger.exception("Error streaming events to %s", conn_id)

            # Try to send error to client if possible
            try:
                resource_id = self.get_resource_id(session_state) if session_state else "unknown"
                error_data = ErrorData(
                    type="https://api.nexus.com/errors/internal-error",
                    title="Internal Server Error",
                    detail=f"An unexpected error occurred during streaming: {error!s}",
                    code="INTERNAL_ERROR",
                    retryable=True,
                    instance=f"/{self._channel_name}/{resource_id}",
                )
                await self._send_error_event(websocket, error_data, resource_id)
                await self._close_websocket(websocket, INTERNAL_ERROR, "Internal error")
            except Exception:
                # If we can't send error, just log it
                logger.exception("Failed to send error to client")

    async def _send_error_event(self, websocket: WebSocket, error_data: ErrorData, resource_id: str) -> None:
        """Send error event to WebSocket client.

        Args:
            websocket: WebSocket connection
            error_data: RFC 9457 compliant error data
            resource_id: Resource identifier for the error event

        """
        error_event = {
            "event_type": "error",
            "resource_id": resource_id,
            "timestamp": datetime.now(UTC).isoformat(),
            "event_id": None,  # Errors don't have Valkey event_id (not resumable)
            "data": error_data.to_dict(),
        }
        await websocket.send_json(error_event)

    async def _close_websocket(self, websocket: WebSocket, code: int, reason: str) -> None:
        """Close WebSocket connection.

        Args:
            websocket: WebSocket connection
            code: WebSocket close code
            reason: Human-readable close reason

        """
        await websocket.close(code=code, reason=reason)
