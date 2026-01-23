"""Generic Valkey Stream client for arbitrary event data.

This module provides a flexible, generic interface for publishing and reading
arbitrary dictionary data to/from Valkey Streams. Unlike EventPublisher which
is tied to specific StreamingEvent objects, StreamClient accepts any dict data.

Usage:
    from nexus.core.valkey.stream import StreamClient

    # Recommended: Use as async context manager for automatic cleanup
    async with StreamClient() as client:
        # Publish arbitrary data
        event_id = await client.publish(
            stream_id="user_actions",
            data={"user_id": "123", "action": "login"}
        )

        # Read events from beginning
        async for event in client.events("user_actions"):
            print(event)

        # Replay last 10 events from current head
        async for event in client.events("user_actions", replay=10):
            print(event)

    # Alternative: Manual lifecycle management
    client = StreamClient()
    await client.connect()
    try:
        event_id = await client.publish("stream", {"key": "value"})
    finally:
        await client.disconnect()
"""

import asyncio
import json
import logging
from collections.abc import AsyncGenerator, Callable
from types import TracebackType
from typing import Any

import valkey.asyncio as valkey
from valkey.exceptions import ConnectionError as ValkeyConnectionError
from valkey.exceptions import ResponseError

from nexus.core.config.base import get_settings

logger = logging.getLogger(__name__)

# Error message constants
_CLIENT_NOT_CONNECTED_ERROR = "Client not connected"
_STREAM_ID_EMPTY_ERROR = "stream_id cannot be empty"


class StreamClient:
    """Generic Valkey Stream client for publishing and reading arbitrary event data.

    This client provides a simple, flexible interface for working with Valkey Streams
    without being tied to specific event schemas. It automatically handles JSON
    serialization/deserialization and provides both publish and async generator-based
    reading capabilities.

    Recommended usage is as an async context manager for automatic resource cleanup.

    Attributes:
        _client: Valkey async client instance
        _settings: Application settings for Valkey configuration

    """

    def __init__(self) -> None:
        """Initialize stream client with configuration from settings."""
        self._client: valkey.Valkey | None = None
        self._settings = get_settings()

    async def __aenter__(self) -> "StreamClient":
        """Async context manager entry - establishes connection."""
        self.connect()
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        """Async context manager exit - closes connection."""
        await self.disconnect()

    def connect(self) -> None:
        """Establish connection to Valkey with connection pooling.

        Creates a Valkey client with configured host, port, database, password,
        and connection pool size. Connection is lazy - actual network I/O happens
        on first operation (e.g., xadd, xread).

        Raises:
            ValkeyConnectionError: If client initialization fails

        """
        if self._client is None:
            try:
                self._client = valkey.Valkey(
                    host=self._settings.valkey_host,
                    port=self._settings.valkey_port,
                    db=self._settings.valkey_db,
                    password=(
                        self._settings.valkey_password.get_secret_value() if self._settings.valkey_password else None
                    ),
                    decode_responses=True,
                    max_connections=self._settings.valkey_connection_pool_size,
                )
                logger.info("Connected to Valkey stream client")
            except ValkeyConnectionError:
                logger.exception("Failed to connect to Valkey")
                raise
            except OSError as e:
                logger.exception("Network error connecting to Valkey")
                msg = f"Network error: {e}"
                raise ValkeyConnectionError(msg) from e

    async def disconnect(self) -> None:
        """Close Valkey connection and cleanup resources.

        Properly closes the client connection and releases pool resources.
        Safe to call multiple times.
        """
        if self._client:
            try:
                await self._client.aclose()
                self._client = None
                logger.info("Disconnected from Valkey stream client")
            except (ValkeyConnectionError, OSError) as e:
                logger.warning("Error during Valkey disconnect: %s", e)
                # Don't raise on disconnect errors - already cleaning up
                self._client = None

    async def publish(self, stream_id: str, data: dict[str, Any]) -> str:
        """Publish arbitrary event data to a Valkey stream.

        Automatically serializes the data dictionary to JSON and publishes it
        to the specified stream using XADD. The entire dict is stored in a
        single 'data' field for simplicity.

        Args:
            stream_id: The stream identifier (stream key in Valkey)
            data: Arbitrary dictionary data to publish

        Returns:
            The Valkey-generated event ID (e.g., "1234567890123-0")

        Raises:
            ValkeyConnectionError: If connection to Valkey fails
            json.JSONDecodeError: If data cannot be serialized to JSON
            ResponseError: If XADD operation fails
            ValueError: If stream_id is empty

        Example:
            >>> async with StreamClient() as client:
            ...     event_id = await client.publish(
            ...         stream_id="user_actions",
            ...         data={"user_id": "123", "action": "login", "timestamp": "2024-01-01T10:00:00Z"}
            ...     )
            ...     print(event_id)
            "1704103200000-0"

        """
        if not stream_id:
            msg = _STREAM_ID_EMPTY_ERROR
            raise ValueError(msg)

        if not self._client:
            self.connect()

        try:
            # Serialize the entire data dict to JSON for storage
            json_data = json.dumps(data)

            # XADD to stream - store in 'data' field
            # Using '*' for auto-generated ID
            if self._client is None:
                msg = _CLIENT_NOT_CONNECTED_ERROR
                raise ValkeyConnectionError(msg)  # noqa: TRY301
            event_id = await self._client.xadd(stream_id, {"data": json_data})

            # Set TTL on stream key for automatic cleanup
            # Each publish resets the TTL, so streams expire after inactivity period
            await self._client.expire(stream_id, self._settings.valkey_stream_ttl_seconds)

            logger.debug(
                "Published event to stream '%s': %s (TTL: %ds)",
                stream_id,
                event_id,
                self._settings.valkey_stream_ttl_seconds,
            )
            return str(event_id)  # Explicitly cast to str for type safety

        except json.JSONDecodeError:
            logger.exception("Failed to serialize data for stream '%s'", stream_id)
            raise
        except ResponseError:
            logger.exception("Valkey error publishing to stream '%s'", stream_id)
            raise
        except ValkeyConnectionError:
            logger.exception("Connection error publishing to stream '%s'", stream_id)
            raise
        except OSError as e:
            logger.exception("Network error publishing to stream '%s'", stream_id)
            msg = f"Network error: {e}"
            raise ValkeyConnectionError(msg) from e

    def _validate_events_params(self, stream_id: str, start_id: str | None, replay: int | None) -> None:
        """Validate parameters for the events method.

        Args:
            stream_id: The stream identifier to read from
            start_id: Starting position in stream
            replay: Number of events to replay from current head

        Raises:
            ValueError: If parameters are invalid

        """
        if not stream_id:
            msg = _STREAM_ID_EMPTY_ERROR
            raise ValueError(msg)

        if start_id is not None and replay is not None:
            msg = "Cannot specify both start_id and replay - they are mutually exclusive"
            raise ValueError(msg)

        if replay is not None and replay <= 0:
            msg = "replay must be a positive integer"
            raise ValueError(msg)

    async def _determine_start_position(self, stream_id: str, start_id: str | None, replay: int | None) -> str:
        """Determine the starting position for reading events.

        Args:
            stream_id: The stream identifier to read from
            start_id: Explicit starting position (takes priority)
            replay: Number of events to replay from current head

        Returns:
            The starting event ID for XREAD

        Raises:
            ValkeyConnectionError: If client not connected
            ResponseError: If stream operation fails (other than non-existence)

        """
        if self._client is None:
            msg = _CLIENT_NOT_CONNECTED_ERROR
            raise ValkeyConnectionError(msg)

        # Honor explicit start_id first
        if start_id is not None:
            return start_id

        # Calculate starting position from replay count
        if replay is not None:
            # Cap replay at 1000 to prevent excessive memory usage
            replay = min(replay, 1000)

            try:
                # Fetch count+1 events to determine proper starting position
                # XREAD returns events AFTER the given ID, so we need to account for this
                # by fetching one extra event
                events = await self._client.xrevrange(stream_id, count=replay + 1)

                if not events:
                    # Stream is empty, start from beginning
                    return "0-0"
                if len(events) > replay:
                    # Got count+1 events, use the oldest as start
                    # This will give us exactly 'replay' events when XREAD processes
                    return str(events[-1][0])
                # Got replay or fewer events, start from beginning to include all
                return "0-0"
            except ResponseError as e:
                if "no such key" in str(e).lower():
                    # Stream doesn't exist yet, start from beginning
                    return "0-0"
                logger.exception("Error calculating replay position for stream '%s'", stream_id)
                raise

        # Default to beginning
        return "0-0"

    def _process_event_batch(
        self,
        stream_id: str,
        result: list[tuple[str, list[tuple[str, dict[str, str]]]]],
        should_stop: Callable[[dict[str, Any]], bool] | None,
    ) -> tuple[str | None, list[dict[str, Any]], bool]:
        """Process a batch of events from XREAD result.

        Args:
            stream_id: The stream identifier
            result: The XREAD result containing events
            should_stop: Optional callback to determine when to stop reading

        Returns:
            Tuple of (last_event_id, list_of_deserialized_events, should_stop_triggered)
            - last_event_id: The ID of the last processed event (or None if no events)
            - list_of_deserialized_events: Events including the stop event if triggered
            - should_stop_triggered: True if should_stop condition was met

        """
        last_id: str | None = None
        events: list[dict[str, Any]] = []

        # Result format: [(stream_name, [(event_id, {field: value}), ...])]
        for _stream_name, event_list in result:
            for event_id, fields in event_list:
                last_id = event_id

                # Deserialize the JSON data
                try:
                    data = json.loads(fields.get("data", "{}"))
                    # Add Valkey-generated event_id to enable client resumption
                    data["event_id"] = event_id
                except json.JSONDecodeError:
                    logger.exception("Failed to deserialize event %s from stream '%s'", event_id, stream_id)
                    # Skip malformed events
                    continue

                events.append(data)

                # Check if we should stop after adding this event
                if should_stop and should_stop(data):
                    logger.debug("Stopping event stream '%s' at %s (should_stop returned True)", stream_id, event_id)
                    # Return events including the stop event, signal to stop
                    return last_id, events, True

        return last_id, events, False

    async def _read_event_stream(
        self,
        stream_id: str,
        current_id: str,
        should_stop: Callable[[dict[str, Any]], bool] | None,
        block_ms: int,
        count: int,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Read events from stream in a loop.

        Args:
            stream_id: The stream identifier
            current_id: Starting event ID
            should_stop: Optional callback to determine when to stop
            block_ms: Milliseconds to block waiting for new events
            count: Maximum number of events to read per batch

        Yields:
            Deserialized event data dictionaries

        Raises:
            ValkeyConnectionError: If connection fails
            ResponseError: If stream read operation fails
            OSError: If network error occurs

        """
        if self._client is None:
            msg = _CLIENT_NOT_CONNECTED_ERROR
            raise ValkeyConnectionError(msg)

        try:
            while True:
                # Read batch of events from stream
                result = await self._client.xread({stream_id: current_id}, count=count, block=block_ms)

                # If no events returned, continue waiting
                if not result:
                    await asyncio.sleep(0)
                    continue

                # Process batch and check for stop condition
                last_id, events, stop_triggered = self._process_event_batch(stream_id, result, should_stop)

                # Update current_id to continue from last processed event
                if last_id:
                    current_id = last_id

                # Yield all events from batch
                for event in events:
                    yield event

                # Stop after yielding if should_stop was triggered
                if stop_triggered:
                    return

        except ResponseError:
            logger.exception("Valkey error reading from stream '%s'", stream_id)
            raise
        except ValkeyConnectionError:
            logger.exception("Connection error reading from stream '%s'", stream_id)
            raise
        except OSError as e:
            logger.exception("Network error reading from stream '%s'", stream_id)
            msg = f"Network error: {e}"
            raise ValkeyConnectionError(msg) from e

    async def events(
        self,
        stream_id: str,
        start_id: str | None = None,
        replay: int | None = None,
        should_stop: Callable[[dict[str, Any]], bool] | None = None,
        block_ms: int = 1000,
        count: int = 100,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Read events from a stream as an async generator.

        Yields events one by one starting from the specified position. Automatically
        deserializes JSON data. Supports multiple termination mechanisms:
        - Manual: caller can break from loop at any time
        - Conditional: provide should_stop function for automatic termination
        - External: use asyncio.Event or other signaling mechanisms

        Position can be specified in two mutually exclusive ways:
        - start_id: Explicit stream position (honored first)
        - replay: Read last N events from current head (used if start_id not provided)

        Note: This method does NOT automatically disconnect when done since:
        - Multiple generators might be running concurrently
        - The client may be reused for multiple operations
        Use the context manager pattern or manually call disconnect() when finished.

        Args:
            stream_id: The stream identifier to read from
            start_id: Starting position in stream. If provided, replay is ignored.
            replay: Number of events to replay from current head. Only used if start_id
                   is not provided. Retrieves last N events and starts from there.
            should_stop: Optional callback to determine when to stop reading.
                        Called with each event dict, stops when returns True.
            block_ms: Milliseconds to block waiting for new events (default 1000)
            count: Maximum number of events to read per batch (default 100)

        Yields:
            Dict[str, Any]: Deserialized event data dictionaries

        Raises:
            ValkeyConnectionError: If connection to Valkey fails
            json.JSONDecodeError: If event data cannot be deserialized
            ResponseError: If stream read operation fails
            ValueError: If stream_id is empty or both start_id and replay provided

        Example:
            >>> async with StreamClient() as client:
            ...     # Read from beginning
            ...     async for event in client.events("user_actions"):
            ...         print(event)
            ...
            ...     # Replay last 10 events
            ...     async for event in client.events("user_actions", replay=10):
            ...         print(event)
            ...
            ...     # Start from specific ID
            ...     async for event in client.events("user_actions", start_id="1234567890-0"):
            ...         print(event)
            ...
            ...     # Manual termination
            ...     async for event in client.events("user_actions"):
            ...         if event.get("action") == "logout":
            ...             break
            ...
            ...     # Conditional termination
            ...     async for event in client.events(
            ...         "user_actions",
            ...         should_stop=lambda e: e.get("type") == "end"
            ...     ):
            ...         process_event(event)

        """
        # Validate parameters
        self._validate_events_params(stream_id, start_id, replay)

        # Ensure connection
        if not self._client:
            self.connect()

        # Determine starting position
        current_id = await self._determine_start_position(stream_id, start_id, replay)

        # Read and yield events from stream
        async for event in self._read_event_stream(stream_id, current_id, should_stop, block_ms, count):
            yield event

    async def info(self, stream_id: str) -> dict[str, Any]:
        """Get metadata information about a stream.

        Retrieves stream statistics including length, first/last event IDs,
        and existence status.

        Args:
            stream_id: The stream identifier to inspect

        Returns:
            Dictionary containing stream metadata:
                - length: Number of events in stream
                - last_event_id: ID of most recent event (or None if empty)
                - first_event_id: ID of first event (or None if empty)
                - exists: Whether the stream exists

        Raises:
            ValkeyConnectionError: If connection to Valkey fails
            ResponseError: If stream info operation fails (other than non-existence)
            ValueError: If stream_id is empty

        Example:
            >>> async with StreamClient() as client:
            ...     info = await client.info("user_actions")
            ...     print(f"Stream has {info['length']} events")
            ...     if info['exists']:
            ...         print(f"First: {info['first_event_id']}, Last: {info['last_event_id']}")

        """
        if not stream_id:
            msg = _STREAM_ID_EMPTY_ERROR
            raise ValueError(msg)

        if not self._client:
            self.connect()

        try:
            if self._client is None:
                msg = _CLIENT_NOT_CONNECTED_ERROR
                raise ValkeyConnectionError(msg)  # noqa: TRY301

            info = await self._client.xinfo_stream(stream_id)
            return {
                "length": info["length"],
                "last_event_id": info["last-generated-id"],
                "first_event_id": info["first-entry"][0] if info["first-entry"] else None,
                "exists": True,
            }
        except ResponseError as e:
            # Stream doesn't exist
            if "no such key" in str(e).lower():
                return {
                    "length": 0,
                    "last_event_id": None,
                    "first_event_id": None,
                    "exists": False,
                }
            # Other error
            logger.exception("Valkey error getting info for stream '%s'", stream_id)
            raise
        except ValkeyConnectionError:
            logger.exception("Connection error getting info for stream '%s'", stream_id)
            raise
        except OSError as e:
            logger.exception("Network error getting info for stream '%s'", stream_id)
            msg = f"Network error: {e}"
            raise ValkeyConnectionError(msg) from e

    async def delete(self, stream_id: str) -> bool:
        """Delete a stream immediately.

        Removes the stream and all its events from Valkey. Useful for cleanup
        in tests or when streams need to be explicitly removed before their TTL expires.

        Args:
            stream_id: The stream identifier to delete

        Returns:
            True if stream was deleted, False if it didn't exist

        Raises:
            ValkeyConnectionError: If connection to Valkey fails
            ValueError: If stream_id is empty

        Example:
            >>> async with StreamClient() as client:
            ...     # Create and publish to stream
            ...     await client.publish("test_stream", {"key": "value"})
            ...     # Delete stream
            ...     deleted = await client.delete("test_stream")
            ...     print(deleted)  # True
            ...     # Try deleting non-existent stream
            ...     deleted = await client.delete("nonexistent")
            ...     print(deleted)  # False

        """
        if not stream_id:
            msg = _STREAM_ID_EMPTY_ERROR
            raise ValueError(msg)

        if not self._client:
            self.connect()

        try:
            if self._client is None:
                msg = _CLIENT_NOT_CONNECTED_ERROR
                raise ValkeyConnectionError(msg)  # noqa: TRY301

            deleted_count: int = await self._client.delete(stream_id)
            logger.debug("Deleted stream '%s': %s", stream_id, deleted_count > 0)
            return deleted_count > 0

        except ValkeyConnectionError:
            logger.exception("Connection error deleting stream '%s'", stream_id)
            raise
        except OSError as e:
            logger.exception("Network error deleting stream '%s'", stream_id)
            msg = f"Network error: {e}"
            raise ValkeyConnectionError(msg) from e
