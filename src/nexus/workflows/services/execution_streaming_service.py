"""Streaming service components for WebSocket event streaming.

Provides WebSocket event streaming from Valkey streams for workflow executions.
"""

import logging
from collections.abc import Callable
from functools import lru_cache
from typing import Any, cast
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlmodel.ext.asyncio.session import AsyncSession
from starlette.websockets import WebSocket

from nexus.core.database.session import AsyncSessionLocal
from nexus.core.models.base.error import ErrorData
from nexus.core.websocket.base_handler import BaseWebSocketStreamingHandler
from nexus.core.websocket.close_codes import POLICY_VIOLATION
from nexus.core.websocket.exceptions import EventsExpiredError, StreamingValidationError
from nexus.workflows.models.execution import TERMINAL_EXECUTION_STATUSES, Execution, ExecutionStatus

logger = logging.getLogger(__name__)


# Constants for stream naming
def get_execution_stream_id(execution_id: UUID) -> str:
    """Get Valkey stream ID for an execution.

    DRY helper to ensure consistent stream naming across the application.

    Args:
        execution_id: UUID of the execution

    Returns:
        Valkey stream ID (e.g., "execution:UUID:events")

    """
    return f"execution:{execution_id}:events"


# Custom exceptions for execution streaming errors
class ExecutionStreamingNotFoundError(StreamingValidationError):
    """Execution does not exist in database (WebSocket streaming context)."""

    def __init__(self, execution_id: UUID) -> None:
        """Initialize execution streaming not found error."""
        error_data = ErrorData(
            type="https://api.nexus.com/errors/execution-not-found",
            title="Execution Not Found",
            detail=f"Execution {execution_id} not found in database",
            code="EXECUTION_NOT_FOUND",
            retryable=False,
            instance=f"/executions/{execution_id}",
        )
        super().__init__(error_data, POLICY_VIOLATION)


class WebSocketStreamingHandler(BaseWebSocketStreamingHandler):
    """Handler for streaming execution events from Valkey to WebSocket clients.

    Extends BaseWebSocketStreamingHandler with execution-specific validation
    and streaming logic.
    """

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        """Initialize WebSocket streaming handler.

        Args:
            session_factory: Async session factory for database access (required).

        """
        super().__init__(session_factory=session_factory, channel_name="executions")
        logger.info("WebSocketStreamingHandler initialized")

    async def create_session_state(self, **params: Any) -> dict[str, Any]:  # noqa: ANN401
        """Validate execution streaming request and create session state.

        Args:
            **params: Must contain 'execution_id' (UUID)

        Returns:
            Session state dict with execution_id and execution_status

        Raises:
            ExecutionStreamingNotFoundError: If execution does not exist
            StreamingValidationError: If execution_id is missing or invalid

        """
        # Extract and validate execution_id
        execution_id = params.get("execution_id")
        if not execution_id:
            error_data = ErrorData(
                type="https://api.nexus.com/errors/missing-parameter",
                title="Missing Required Parameter",
                detail="execution_id is required for streaming",
                code="MISSING_PARAMETER",
                retryable=False,
                instance="/executions",
            )
            raise StreamingValidationError(error_data, POLICY_VIOLATION)

        if not isinstance(execution_id, UUID):
            error_data = ErrorData(
                type="https://api.nexus.com/errors/invalid-parameter",
                title="Invalid Parameter Type",
                detail=f"execution_id must be a UUID, got {type(execution_id).__name__}",
                code="INVALID_PARAMETER",
                retryable=False,
                instance="/executions",
            )
            raise StreamingValidationError(error_data, POLICY_VIOLATION)

        execution_status = await self._check_execution_exists(execution_id)
        return {
            "execution_id": execution_id,
            "execution_status": execution_status,
        }

    def get_stop_condition(self, session_state: dict[str, Any]) -> Callable[[dict[str, Any]], bool]:  # noqa: ARG002
        """Return stop condition for execution streaming.

        Args:
            session_state: Session state dict with execution data

        Returns:
            Function that stops on final_snapshot message

        """
        return lambda e: e.get("type") == "final_snapshot"

    def get_resource_id(self, session_state: dict[str, Any]) -> str:
        """Get execution ID as resource ID.

        Args:
            session_state: Session state dict with execution_id

        Returns:
            String representation of execution_id

        """
        return str(session_state["execution_id"])

    async def wait_for_stream_ready(self, stream_id: str, session_state: dict[str, Any]) -> None:
        """Wait for execution stream to be created.

        Args:
            stream_id: Valkey stream ID
            session_state: Session state dict with execution_id and execution_status

        Raises:
            EventsExpiredError: If execution is terminal but stream doesn't exist
            WaitForStreamTimeoutError: If timeout waiting for stream creation

        """
        execution_id = session_state["execution_id"]
        execution_status = session_state["execution_status"]

        if execution_status in TERMINAL_EXECUTION_STATUSES:
            # Execution finished but stream doesn't exist - events expired
            logger.warning("Execution %s is %s but the Valkey stream has expired", execution_id, execution_status.value)
            raise EventsExpiredError(
                resource_id=str(execution_id),
                resource_status=execution_status.value,
                resource_type="execution",
            )

        # Execution still running - wait for stream to be created
        await self._wait_for_stream_creation(
            stream_id=stream_id,
            resource_id=str(execution_id),
            resource_status=execution_status.value,
            resource_type="execution",
        )

    async def _check_execution_exists(self, execution_id: UUID) -> ExecutionStatus:
        """Check if execution exists in database and return its status.

        Args:
            execution_id: UUID of the execution to check

        Returns:
            ExecutionStatus if execution exists

        Raises:
            ExecutionStreamingNotFoundError: If execution does not exist
            Exception: If database query fails

        """
        if self._session_factory is None:
            msg = "Session factory is required but was not provided"
            raise RuntimeError(msg)

        async with self._session_factory() as db_session:
            stmt = select(Execution).where(Execution.id == execution_id)  # type: ignore[arg-type]
            result = await db_session.execute(stmt)
            execution = result.scalar_one_or_none()

            if execution is None:
                logger.warning("Execution %s not found in database", execution_id)
                raise ExecutionStreamingNotFoundError(execution_id)

            logger.debug("Execution %s found with status: %s", execution_id, execution.status)
            return cast("ExecutionStatus", execution.status)


class ExecutionStreamingService:
    """Streaming service for execution WebSocket event delivery.

    Provides WebSocket streaming of execution events from Valkey streams.
    """

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        """Initialize streaming service.

        Args:
            session_factory: Async session factory for database access (required).

        """
        self.websocket_handler = WebSocketStreamingHandler(session_factory=session_factory)
        logger.info("ExecutionStreamingService initialized")

    async def stream_events_to_websocket(
        self,
        websocket: WebSocket,
        execution_id: UUID,
        replay: str | None = None,
        connection_id: str | None = None,
    ) -> None:
        """Stream events from Valkey to WebSocket client.

        Args:
            websocket: WebSocket connection
            execution_id: UUID of the execution to stream
            replay: Optional replay parameter:
                   - None: Live streaming only (new events after connection)
                   - "0": Replay from beginning (includes initial snapshot)
                   - event_id: Replay from specific Valkey stream ID
            connection_id: Connection identifier for logging

        """
        stream_id = get_execution_stream_id(execution_id)

        # Convert single replay parameter to replay_count and last_event_id
        # for BaseWebSocketStreamingHandler compatibility
        if replay is None:
            # Live streaming only
            replay_count = "0"
            last_event_id = None
        else:
            # Replay from beginning or specific event_id
            replay_count = "0"  # Not used when last_event_id is provided
            last_event_id = replay

        await self.websocket_handler.stream_events_to_websocket(
            websocket=websocket,
            stream_id=stream_id,
            replay_count=replay_count,
            last_event_id=last_event_id,
            connection_id=connection_id,
            execution_id=execution_id,
        )


@lru_cache(maxsize=1)
def get_execution_streaming_service() -> ExecutionStreamingService:
    """Get the ExecutionStreamingService singleton using lru_cache.

    lru_cache provides thread-safe singleton without global mutable state.
    Clear cache in tests: get_execution_streaming_service.cache_clear()

    Returns:
        The shared ExecutionStreamingService instance

    """
    return ExecutionStreamingService(session_factory=AsyncSessionLocal)
