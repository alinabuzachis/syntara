"""Agent Orchestrator client for agent invocation.

This client provides integration with the Agent Orchestrator service (spec 002),
enabling agentic activity execution within workflows.
"""

import asyncio
import http
import logging
from enum import Enum
from types import TracebackType
from typing import Any, cast
from uuid import uuid4

import httpx

# Configure logger
logger = logging.getLogger(__name__)


class ErrorCode(str, Enum):
    """Structured error codes for programmatic error handling."""

    # Connection errors
    CONNECTION_FAILED = "CONNECTION_FAILED"
    TIMEOUT = "TIMEOUT"

    # HTTP errors
    HTTP_CLIENT_ERROR = "HTTP_CLIENT_ERROR"  # 4xx
    HTTP_SERVER_ERROR = "HTTP_SERVER_ERROR"  # 5xx

    # Response validation errors
    MISSING_FIELD = "MISSING_FIELD"
    INVALID_STATUS = "INVALID_STATUS"
    MISSING_RESULT = "MISSING_RESULT"
    MISSING_ERROR_MESSAGE = "MISSING_ERROR_MESSAGE"

    # Other errors
    INVALID_RESPONSE = "INVALID_RESPONSE"
    UNEXPECTED_ERROR = "UNEXPECTED_ERROR"


class AgentOrchestratorError(Exception):
    """Base exception for Agent Orchestrator client errors.

    Attributes:
        code: Structured error code for programmatic handling
        message: Human-readable error message
        details: Optional additional error details

    """

    def __init__(
        self,
        message: str,
        code: ErrorCode = ErrorCode.UNEXPECTED_ERROR,
        details: str | None = None,
    ) -> None:
        """Initialize error with code and details.

        Args:
            message: Human-readable error message
            code: Structured error code
            details: Optional error details

        """
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details


class AgentOrchestratorConnectionError(AgentOrchestratorError):
    """Exception raised when connection to Agent Orchestrator fails."""

    def __init__(self, message: str, details: str | None = None) -> None:
        """Initialize connection error.

        Args:
            message: Human-readable error message
            details: Optional error details

        """
        super().__init__(message, code=ErrorCode.CONNECTION_FAILED, details=details)


class AgentOrchestratorClient:
    """Client for Agent Orchestrator invocation.

    Provides methods to invoke agents and receive completed results.

    Attributes:
        base_url: Base URL for Agent Orchestrator API (e.g., http://localhost:8000/api/v1)
        timeout: Default timeout for HTTP requests in seconds
        max_retries: Maximum number of retry attempts for transient failures
        retry_backoff_base: Base delay for exponential backoff (seconds)

    """

    def __init__(
        self,
        base_url: str = "http://localhost:8000/api/v1",
        timeout: float = 30.0,
        max_retries: int = 3,
        retry_backoff_base: float = 1.0,
    ) -> None:
        """Initialize Agent Orchestrator client.

        Args:
            base_url: Base URL for Agent Orchestrator API
            timeout: Default timeout for HTTP requests in seconds
            max_retries: Maximum number of retry attempts
            retry_backoff_base: Base delay for exponential backoff

        """
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.max_retries = max_retries
        self.retry_backoff_base = retry_backoff_base

        # Create async HTTP client with timeout configuration
        self.http_client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=httpx.Timeout(timeout),
            follow_redirects=True,
        )

        logger.info("Initialized Agent Orchestrator client: %s", self.base_url)

    async def close(self) -> None:
        """Close the HTTP client and clean up resources."""
        await self.http_client.aclose()
        logger.debug("Closed Agent Orchestrator client")

    async def __aenter__(self) -> "AgentOrchestratorClient":
        """Async context manager entry."""
        return self

    async def __aexit__(
        self,
        _exc_type: type[BaseException] | None,
        _exc_val: BaseException | None,
        _exc_tb: TracebackType | None,
    ) -> None:
        """Async context manager exit."""
        await self.close()

    def _is_retryable_error(self, error: Exception) -> bool:
        """Check if an error should trigger a retry.

        Args:
            error: The exception to check

        Returns:
            True if the error is retryable, False otherwise

        """
        # Retry on connection and timeout errors
        if isinstance(error, (httpx.ConnectError, httpx.TimeoutException)):
            return True

        # Retry on 5xx server errors (transient), not 4xx client errors (permanent)
        if isinstance(error, httpx.HTTPStatusError):
            return error.response.status_code >= http.HTTPStatus.INTERNAL_SERVER_ERROR

        return False

    def _validate_invocation_response(self, result: dict[str, Any]) -> None:
        """Validate invocation response has required fields and valid state.

        Raises:
            AgentOrchestratorError: If response is invalid or incomplete

        """
        # Check required fields exist
        invocation_id = result.get("id")
        if not invocation_id:
            msg = "Agent Orchestrator response missing or invalid 'id'"
            raise AgentOrchestratorError(msg, code=ErrorCode.MISSING_FIELD, details=str(result))

        status = result.get("status")
        if not status:
            msg = f"Agent Orchestrator response missing 'status' (invocation_id={invocation_id})"
            raise AgentOrchestratorError(msg, code=ErrorCode.MISSING_FIELD, details=str(result))

        # Validate terminal status
        if status not in ("completed", "failed", "cancelled"):
            msg = f"Agent Orchestrator response has non-terminal status '{status}' (invocation_id={invocation_id})"
            raise AgentOrchestratorError(msg, code=ErrorCode.INVALID_STATUS, details=str(result))

        # For completed invocations, result should exist
        if status == "completed" and "result" not in result:
            msg = f"Completed invocation missing 'result' (invocation_id={invocation_id})"
            raise AgentOrchestratorError(msg, code=ErrorCode.MISSING_RESULT, details=str(result))

        # For failed invocations, error_message should exist
        if status == "failed" and not result.get("error_message"):
            msg = f"Failed invocation missing 'error_message' (invocation_id={invocation_id})"
            raise AgentOrchestratorError(msg, code=ErrorCode.MISSING_ERROR_MESSAGE, details=str(result))

    async def invoke_agent(
        self,
        prompt: str,
        user_id: str,
        session_id: str | None = None,
        agent: str | None = None,
        model: str | None = None,
        input_data: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
        correlation_id: str | None = None,
        timeout_seconds: float | None = None,
    ) -> dict[str, Any]:
        """Invoke Agent Orchestrator and return the completed invocation.

        Args:
            prompt: Natural language prompt for the agent
            user_id: User identifier for authentication and audit
            session_id: Optional session ID for tracking conversation context (auto-generated if not provided)
            agent: Optional agent identifier for routing (included in metadata)
            model: Optional model identifier to use
            input_data: Optional input data for the agent
            metadata: Optional additional metadata
            correlation_id: Optional correlation ID for tracking (auto-generated if not provided)
            timeout_seconds: Optional timeout override in seconds (uses client default if not provided)

        Returns:
            dict: Full invocation response containing id, status, result, error_message, etc.

        Raises:
            AgentOrchestratorConnectionError: If connection fails after retries
            AgentOrchestratorError: For other invocation errors

        """
        # Generate IDs if not provided
        correlation_id = correlation_id or (metadata or {}).get("correlation_id") or str(uuid4())
        session_id = session_id or str(uuid4())

        logger.info(
            "Invoking agent (correlation_id=%s, prompt_len=%d, agent=%s, model=%s)",
            correlation_id,
            len(prompt),
            agent,
            model,
        )

        # Build request payload
        payload = {
            "prompt": prompt,
            "createdBy": user_id,
            "sessionId": session_id,
            "contextData": {
                k: v
                for k, v in {
                    "correlation_id": correlation_id,
                    "input_data": input_data,
                    "model": model,
                    "agent": agent,
                    "metadata": metadata,
                }.items()
                if v is not None
            },
        }

        # Invoke with retry logic for transient failures
        last_error: Exception | None = None

        # Use provided timeout or fall back to client default
        request_timeout = timeout_seconds if timeout_seconds is not None else self.timeout

        for attempt in range(1, self.max_retries + 1):
            try:
                logger.debug("Attempt %d/%d (correlation_id=%s)", attempt, self.max_retries, correlation_id)

                # Make the invocation with timeout override
                response = await self.http_client.post(
                    "/invocations",
                    json=payload,
                    timeout=request_timeout,
                )
                response.raise_for_status()
                result = response.json()

                # Validate response
                self._validate_invocation_response(result)

                logger.info(
                    "Invocation completed (correlation_id=%s, id=%s, status=%s)",
                    correlation_id,
                    result["id"],
                    result["status"],
                )
                return cast("dict[str, Any]", result)

            except Exception as e:
                # Determine if we should retry
                is_last_attempt = attempt == self.max_retries
                should_retry = self._is_retryable_error(e) and not is_last_attempt

                if not should_retry:
                    # Raise immediately for non-retryable errors or exhausted retries
                    if isinstance(e, (httpx.ConnectError, httpx.TimeoutException)):
                        msg = f"Failed to connect after {self.max_retries} attempts"
                        raise AgentOrchestratorConnectionError(msg, details=str(e)) from e
                    if isinstance(e, httpx.HTTPStatusError):
                        is_server_error = e.response.status_code >= http.HTTPStatus.INTERNAL_SERVER_ERROR
                        code = ErrorCode.HTTP_SERVER_ERROR if is_server_error else ErrorCode.HTTP_CLIENT_ERROR
                        msg = f"HTTP {e.response.status_code} error"
                        raise AgentOrchestratorError(msg, code=code, details=e.response.text) from e
                    if isinstance(e, AgentOrchestratorError):
                        raise
                    # Other errors
                    msg = f"{type(e).__name__}: {e}"
                    raise AgentOrchestratorError(msg, code=ErrorCode.UNEXPECTED_ERROR, details=str(e)) from e

                # Retry with exponential backoff
                last_error = e
                backoff = self.retry_backoff_base * (2 ** (attempt - 1))
                logger.warning(
                    "Retryable error (attempt %d/%d), retrying in %.1fs (correlation_id=%s): %s",
                    attempt,
                    self.max_retries,
                    backoff,
                    correlation_id,
                    str(e),
                )
                await asyncio.sleep(backoff)

        # Safeguard: Should never reach here due to is_last_attempt check above
        msg = "Unexpected error: exited retry loop without returning"
        raise AgentOrchestratorError(
            msg,
            code=ErrorCode.UNEXPECTED_ERROR,
            details=str(last_error) if last_error else None,
        ) from last_error
