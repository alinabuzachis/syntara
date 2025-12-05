"""Streaming service components for WebSocket event streaming.

Provides WebSocket event streaming from Valkey streams.
"""

import asyncio
import logging
from datetime import UTC, datetime
from functools import lru_cache
from typing import cast
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlmodel.ext.asyncio.session import AsyncSession
from starlette.websockets import WebSocket

from nexus.agent_orchestrator.models.invocation import Invocation, InvocationStatus
from nexus.api.db.session import AsyncSessionLocal
from nexus.core.models.base.error import ErrorData
from nexus.core.valkey.stream import StreamClient
from nexus.core.websocket.close_codes import INTERNAL_ERROR, NORMAL_CLOSURE, POLICY_VIOLATION
from nexus.core.websocket.manager import get_connection_lifecycle_manager

logger = logging.getLogger(__name__)


# Constants for stream naming
def get_invocation_stream_id(invocation_id: UUID) -> str:
    """Get Valkey stream ID for an invocation.

    DRY helper to ensure consistent stream naming across the application.

    Args:
        invocation_id: UUID of the invocation

    Returns:
        Valkey stream ID (e.g., "invocation:UUID:events")

    """
    return f"invocation:{invocation_id}:events"


# Custom exceptions for WebSocket streaming errors
class StreamingValidationError(Exception):
    """Base exception for streaming validation errors.

    These exceptions are caught by stream_events_to_websocket() and converted
    to appropriate WebSocket error responses.
    """

    def __init__(self, error_data: ErrorData, close_code: int) -> None:
        """Initialize streaming validation error.

        Args:
            error_data: RFC 9457 compliant error data
            close_code: WebSocket close code

        """
        self.error_data = error_data
        self.close_code = close_code
        super().__init__(error_data.detail)


class InvocationNotFoundError(StreamingValidationError):
    """Invocation does not exist in database."""

    def __init__(self, invocation_id: UUID) -> None:
        """Initialize invocation not found error."""
        error_data = ErrorData(
            type="https://api.nexus.com/errors/invocation-not-found",
            title="Invocation Not Found",
            detail=f"Invocation {invocation_id} not found in database",
            code="INVOCATION_NOT_FOUND",
            retryable=False,
            instance=f"/invocations/{invocation_id}",
        )
        super().__init__(error_data, POLICY_VIOLATION)


class EventsExpiredError(StreamingValidationError):
    """Streaming events have expired."""

    def __init__(self, invocation_id: UUID, invocation_status: InvocationStatus) -> None:
        """Initialize events expired error."""
        error_data = ErrorData(
            type="https://api.nexus.com/errors/events-expired",
            title="Streaming Events Expired",
            detail=(
                f"Streaming events have expired. Events are only retained for a limited time. "
                f"Invocation status: {invocation_status.value}"
            ),
            code="EVENTS_EXPIRED",
            retryable=False,
            instance=f"/invocations/{invocation_id}",
        )
        super().__init__(error_data, NORMAL_CLOSURE)


class StreamTimeoutError(StreamingValidationError):
    """Timeout waiting for stream creation."""

    def __init__(self, invocation_id: UUID, invocation_status: InvocationStatus) -> None:
        """Initialize stream timeout error."""
        error_data = ErrorData(
            type="https://api.nexus.com/errors/timeout-error",
            title="Streaming Timeout",
            detail=f"Timeout waiting for streaming to start. Invocation status: {invocation_status.value}",
            code="STREAM_TIMEOUT",
            retryable=True,
            instance=f"/invocations/{invocation_id}",
        )
        super().__init__(error_data, INTERNAL_ERROR)


class WebSocketStreamingHandler:
    """Handler for streaming events from Valkey to WebSocket clients.

    Manages WebSocket connections, coordinates with Valkey streams,
    and handles error conditions during streaming.
    """

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        """Initialize WebSocket streaming handler.

        Args:
            session_factory: Async session factory for database access (required).

        """
        self._session_factory = session_factory
        logger.info("WebSocketStreamingHandler initialized")

    async def _check_invocation_exists(self, invocation_id: UUID) -> InvocationStatus:
        """Check if invocation exists in database and return its status.

        Args:
            invocation_id: UUID of the invocation to check

        Returns:
            InvocationStatus if invocation exists

        Raises:
            InvocationNotFoundError: If invocation does not exist
            Exception: If database query fails

        """
        async with self._session_factory() as db_session:
            stmt = select(Invocation).where(Invocation.id == invocation_id)  # type: ignore[arg-type]
            result = await db_session.execute(stmt)
            invocation = result.scalar_one_or_none()

            if invocation is None:
                logger.warning("Invocation %s not found in database", invocation_id)
                raise InvocationNotFoundError(invocation_id)

            logger.debug("Invocation %s found with status: %s", invocation_id, invocation.status)
            return cast("InvocationStatus", invocation.status)

    async def _wait_for_stream_creation(
        self,
        stream_id: str,
        invocation_id: UUID,
        invocation_status: InvocationStatus,
        max_wait_seconds: int = 30,
    ) -> None:
        """Wait for stream to be created in Valkey.

        Args:
            stream_id: Valkey stream ID to wait for
            invocation_id: UUID of the invocation
            invocation_status: Current status of the invocation
            max_wait_seconds: Maximum time to wait for stream creation

        Raises:
            StreamTimeoutError: If timeout waiting for stream creation

        """
        logger.info(
            "Stream %s does not exist yet, waiting for creation (invocation status: %s)",
            stream_id,
            invocation_status.value,
        )

        wait_interval = 0.5
        total_waited = 0.0

        async with StreamClient() as client:
            while total_waited < max_wait_seconds:
                await asyncio.sleep(wait_interval)
                total_waited += wait_interval

                info = await client.info(stream_id)
                if info["exists"]:
                    logger.info("Stream %s created after %.1fs", stream_id, total_waited)
                    return

            # Timeout waiting for stream
            logger.error("Timeout waiting for stream %s to be created", stream_id)
            raise StreamTimeoutError(invocation_id, invocation_status)

    def _determine_replay_parameters(
        self, replay_count: str, last_event_id: str | None
    ) -> tuple[str | None, int | None]:
        """Determine streaming replay parameters based on client request.

        Args:
            replay_count: Number of historical events to replay ("all", "0", or numeric string)
            last_event_id: Specific event ID to resume from (takes precedence)

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

    async def stream_events_to_websocket(
        self,
        websocket: WebSocket,
        invocation_id: UUID,
        replay_count: str = "10",
        last_event_id: str | None = None,
        connection_id: str | None = None,
    ) -> None:
        """Stream events from Valkey to WebSocket client using StreamClient.

        Args:
            websocket: WebSocket connection
            invocation_id: UUID of the invocation to stream
            replay_count: Number of historical events to replay (default: "10")
            last_event_id: Specific event ID to resume from
            connection_id: Connection identifier for logging

        """
        # Add connection to lifecycle manager
        lifecycle_manager = get_connection_lifecycle_manager()
        client_ip = f"{websocket.client.host}:{websocket.client.port}" if websocket.client else "unknown"
        lifecycle_conn_id = lifecycle_manager.add_connection(
            channel="invocations",
            client_ip=client_ip,
            resource_id=str(invocation_id),
            metadata={"replay_count": replay_count, "last_event_id": last_event_id},
        )

        conn_id = connection_id or str(invocation_id)[:8]
        logger.info("Starting event streaming for invocation %s (connection %s)", invocation_id, conn_id)

        try:
            # Activate connection after successful setup
            lifecycle_manager.activate_connection(lifecycle_conn_id)

            # Step 1: Check if invocation exists in database
            invocation_status = await self._check_invocation_exists(invocation_id)

            # Terminal statuses indicate invocation has finished
            terminal_statuses = {InvocationStatus.COMPLETED, InvocationStatus.FAILED, InvocationStatus.CANCELLED}

            stream_id = get_invocation_stream_id(invocation_id)

            # Step 2: Check if stream exists and handle based on invocation status
            async with StreamClient() as client:
                info = await client.info(stream_id)

                if not info["exists"]:
                    # Stream doesn't exist - different handling based on invocation status
                    if invocation_status in terminal_statuses:
                        # Invocation finished but stream doesn't exist - events expired
                        logger.warning(
                            "Invocation %s is %s but stream has expired", invocation_id, invocation_status.value
                        )
                        raise EventsExpiredError(invocation_id, invocation_status)  # noqa: TRY301
                    # Invocation still running - wait for stream to be created
                    await self._wait_for_stream_creation(stream_id, invocation_id, invocation_status)

            # Step 3: Determine streaming replay parameters
            start_id, replay = self._determine_replay_parameters(replay_count, last_event_id)

            # Step 4: Stream events to client
            async with StreamClient() as client:
                logger.info("Starting event stream for invocation %s", invocation_id)
                async for event in client.events(
                    stream_id=stream_id,
                    start_id=start_id,
                    replay=replay,
                    should_stop=lambda e: e.get("event_type") in ("completion", "error", "cancelled"),
                    block_ms=1000,
                    count=10,
                ):
                    # Send event to WebSocket client
                    await websocket.send_json(event)

                    # Update ping timestamp - sending events indicates connection is alive
                    # This works in conjunction with the ping/pong monitoring started by endpoint_factory
                    lifecycle_manager.update_ping(lifecycle_conn_id)

                    # Update metadata with last event ID
                    event_id = event.get("event_id")
                    if event_id:
                        lifecycle_manager.update_metadata(lifecycle_conn_id, "last_event_id", event_id)

                    event_type = event.get("event_type")
                    logger.debug("Sent %s event to %s", event_type, conn_id)

            # Stream completed normally
            await websocket.close(code=NORMAL_CLOSURE, reason="Streaming complete")
            logger.info("Event streaming completed for invocation %s", invocation_id)

        except StreamingValidationError as e:
            # Handle validation errors by sending error event to client
            logger.warning("Streaming validation error for %s: %s", conn_id, e)
            error_event = {
                "event_type": "error",
                "invocation_id": str(invocation_id),
                "timestamp": datetime.now(UTC).isoformat(),
                "event_id": None,  # Validation errors don't have Valkey event_id (not resumable)
                "data": e.error_data.to_dict(),
            }
            await websocket.send_json(error_event)
            await websocket.close(code=e.close_code, reason=e.error_data.title)

        except Exception as e:
            # Handle unexpected errors
            logger.exception("Error streaming events to %s", conn_id)

            # Try to send error to client if possible
            try:
                error_data = ErrorData(
                    type="https://api.nexus.com/errors/internal-error",
                    title="Internal Server Error",
                    detail=f"An unexpected error occurred during streaming: {e!s}",
                    code="INTERNAL_ERROR",
                    retryable=True,
                    instance=f"/invocations/{invocation_id}",
                )
                error_event = {
                    "event_type": "error",
                    "invocation_id": str(invocation_id),
                    "timestamp": datetime.now(UTC).isoformat(),
                    "event_id": None,  # System errors don't have Valkey event_id (not resumable)
                    "data": error_data.to_dict(),
                }
                await websocket.send_json(error_event)
                await websocket.close(code=INTERNAL_ERROR, reason="Internal error")
            except Exception:
                # If we can't send error, just log it
                logger.exception("Failed to send error to client")

            raise

        finally:
            # Always cleanup connection when done
            lifecycle_manager.remove_connection(lifecycle_conn_id, reason="normal_close")


class StreamingService:
    """Streaming service for WebSocket event delivery.

    Provides WebSocket streaming of events from Valkey streams.
    """

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        """Initialize streaming service.

        Args:
            session_factory: Async session factory for database access (required).

        """
        self.websocket_handler = WebSocketStreamingHandler(session_factory=session_factory)
        logger.info("StreamingService initialized")

    async def stream_events_to_websocket(
        self,
        websocket: WebSocket,
        invocation_id: UUID,
        replay_count: str = "10",
        last_event_id: str | None = None,
        connection_id: str | None = None,
    ) -> None:
        """Stream events from Valkey to WebSocket client."""
        await self.websocket_handler.stream_events_to_websocket(
            websocket=websocket,
            invocation_id=invocation_id,
            replay_count=replay_count,
            last_event_id=last_event_id,
            connection_id=connection_id,
        )


@lru_cache(maxsize=1)
def get_streaming_service() -> StreamingService:
    """Get the StreamingService singleton using lru_cache.

    lru_cache provides thread-safe singleton without global mutable state.
    Clear cache in tests: get_streaming_service.cache_clear()

    Returns:
        The shared StreamingService instance

    """
    return StreamingService(session_factory=AsyncSessionLocal)
