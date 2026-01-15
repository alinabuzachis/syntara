"""Client for sending signals to Temporal workflows.

This module provides a centralized client for agent orchestrator services
to send activity completion signals (both success and failure) to workflows.
"""

import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import httpx

logger = logging.getLogger(__name__)


class WorkflowSignalClient:
    """Client for sending activity signals to Temporal workflows.

    This client handles both success and failure signals, providing a
    consistent interface for agent orchestrator services to communicate
    activity results back to workflows.
    """

    @staticmethod
    async def send_success_signal(
        callback_url: str,
        invocation_id: UUID,
        result: dict[str, Any],
    ) -> None:
        """Send success signal to workflow with agent execution result.

        Args:
            callback_url: Workflow callback URL
            invocation_id: Invocation UUID
            result: Agent execution result containing content and metadata

        Raises:
            httpx.HTTPStatusError: If workflow rejects the signal
            httpx.RequestError: If connection fails
            httpx.TimeoutException: If request times out

        """
        signal_payload = {
            "signal_data": {
                "id": str(invocation_id),
                "status": "completed",
                "result": {
                    "content": result.get("content"),
                    "response_metadata": result.get("response_metadata", {}),
                },
                "timestamp": datetime.now(UTC).isoformat(),
                "agent_type": "GenericAgent",
            }
        }

        logger.info(
            "SUCCESS SIGNAL: Sending to %s (invocation %s)",
            callback_url,
            invocation_id,
        )

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                callback_url,
                json=signal_payload,
                headers={"Content-Type": "application/json"},
            )
            logger.info(
                "SUCCESS SIGNAL: HTTP response received (invocation %s, status_code=%s)",
                invocation_id,
                response.status_code,
            )
            response.raise_for_status()

        logger.info(
            "SUCCESS SIGNAL: Sent successfully for invocation %s to %s",
            invocation_id,
            callback_url,
        )

    @staticmethod
    async def send_failure_signal(
        callback_url: str | None,
        invocation_id: UUID,
        error: Exception,
    ) -> None:
        """Send failure signal to workflow (best-effort).

        This method swallows all exceptions to avoid cascading failures.
        Failure signals are informational and should not block error handling.

        Args:
            callback_url: Workflow callback URL (None to skip)
            invocation_id: Invocation UUID
            error: Exception that caused the failure

        """
        if not callback_url:
            logger.debug(
                "No callback_url for invocation %s, skipping failure signal",
                invocation_id,
            )
            return

        signal_payload = {
            "signal_data": {
                "id": str(invocation_id),
                "status": "failed",
                "error": {
                    "message": str(error),
                    "error_type": type(error).__name__,
                },
                "timestamp": datetime.now(UTC).isoformat(),
                "agent_type": "GenericAgent",
            }
        }

        logger.info(
            "FAILURE SIGNAL: Sending to %s (invocation %s, error_type=%s)",
            callback_url,
            invocation_id,
            type(error).__name__,
        )

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    callback_url,
                    json=signal_payload,
                    headers={"Content-Type": "application/json"},
                )
                logger.info(
                    "FAILURE SIGNAL: HTTP response received (invocation %s, status_code=%s)",
                    invocation_id,
                    response.status_code,
                )
                response.raise_for_status()

            logger.info(
                "FAILURE SIGNAL: Sent successfully for invocation %s to %s",
                invocation_id,
                callback_url,
            )
        except (httpx.RequestError, httpx.HTTPStatusError, httpx.TimeoutException):
            logger.exception(
                "Failed to send failure signal for invocation %s to %s",
                invocation_id,
                callback_url,
            )
            # Don't raise - failure signal is best-effort
        except Exception:
            logger.exception(
                "Unexpected error sending failure signal for invocation %s",
                invocation_id,
            )
            # Don't raise - failure signal is best-effort
