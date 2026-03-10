"""Segment telemetry client registry.

Provides a singleton registry for the Segment Analytics client following
the WorkerRegistry pattern used in temporal_worker.py.
"""

from __future__ import annotations

from functools import lru_cache
from typing import TYPE_CHECKING, Any

import segment.analytics as segment_analytics  # type: ignore[import-untyped]
import structlog

if TYPE_CHECKING:
    from nexus.telemetry.events.base import BaseTelemetryEvent

logger = structlog.stdlib.get_logger(__name__)


class TelemetryClientRegistry:
    """Registry for managing Segment Analytics client lifecycle without global variables."""

    def __init__(self) -> None:
        """Initialize the registry."""
        self._client: segment_analytics.Client | None = None
        self._entitlement_id: str = "unknown"

    def initialize(
        self,
        write_key: str,
        host: str = "https://api.segment.io",
        entitlement_id: str = "unknown",
    ) -> None:
        """Initialize the Segment client.

        Should be called once at Temporal Worker startup.

        Args:
            write_key: Segment write API key.
            host: Segment API endpoint URL.
            entitlement_id: Nexus installation identifier for anonymized tracking.

        """
        if self._client is not None:
            logger.warning("TelemetryClientRegistry already initialized")
            return

        self._entitlement_id = entitlement_id
        self._client = segment_analytics.Client(
            write_key=write_key,
            host=host,
            gzip=True,
            max_queue_size=20000,
            max_retries=10,
            timeout=30,
            upload_interval=0.5,
            upload_size=100,
            on_error=self._error_handler,
        )
        logger.info("Telemetry client initialized", entitlement_id=entitlement_id)

    def get_client(self) -> segment_analytics.Client:
        """Get the initialized Segment client instance.

        Returns:
            The Segment Analytics client.

        Raises:
            RuntimeError: If the registry has not been initialized.

        """
        if self._client is None:
            msg = "TelemetryClientRegistry not initialized. Call initialize() first."
            raise RuntimeError(msg)
        return self._client

    def send_event(self, event: BaseTelemetryEvent) -> None:
        """Send a telemetry event to Segment (fire-and-forget).

        Args:
            event: Telemetry event to send.

        """
        try:
            client = self.get_client()
            segment_event = event.to_segment_event()

            logger.info(
                "Sending telemetry event",
                event_name=segment_event.get("event"),
                workflow_execution_id=getattr(event, "workflow_execution_id", None),
            )

            client.track(
                user_id=self._entitlement_id,
                event=segment_event["event"],
                properties=segment_event.get("properties", {}),
            )
        except Exception:
            logger.exception("Failed to send telemetry event (fire-and-forget)")

    def flush(self) -> None:
        """Flush pending events to Segment.

        Should be called at Temporal Worker shutdown.
        """
        if self._client:
            logger.info("Flushing pending telemetry events")
            self._client.flush()

    def is_initialized(self) -> bool:
        """Check if the registry has been initialized.

        Returns:
            True if the Segment client has been initialized.

        """
        return self._client is not None

    @property
    def entitlement_id(self) -> str:
        """Get the configured entitlement_id.

        Returns:
            The Nexus installation identifier.

        """
        return self._entitlement_id

    @staticmethod
    def _error_handler(error: Exception, items: list[Any]) -> None:
        """Handle Segment SDK errors (fire-and-forget, log only).

        Args:
            error: The error that occurred.
            items: The items that failed to send.

        """
        logger.warning(
            "Segment SDK error (fire-and-forget)",
            error=str(error),
            item_count=len(items),
        )


@lru_cache(maxsize=1)
def _get_telemetry_registry() -> TelemetryClientRegistry:
    """Get the singleton TelemetryClientRegistry instance.

    lru_cache provides thread-safe singleton without global mutable state.
    The registry itself manages the mutable client reference.

    Returns:
        The shared TelemetryClientRegistry instance.

    """
    return TelemetryClientRegistry()


def get_telemetry_registry() -> TelemetryClientRegistry:
    """Get the telemetry client registry.

    Returns:
        The TelemetryClientRegistry singleton.

    """
    return _get_telemetry_registry()
