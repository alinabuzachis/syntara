"""Setup logging."""

import json
from logging import getLevelName
from typing import Any

import structlog
from structlog.processors import JSONRenderer
from structlog.typing import (
    EventDict,
    WrappedLogger,
)

from nexus.core.config.base import get_settings


class NexusLogRecordRenderer(JSONRenderer):
    """Renderer that outputs either JSON or plain text format depending on settings."""

    def __init__(self, output_format: str = "json", **kwargs: Any) -> None:  # noqa: ANN401
        """Initialize renderer with output format.

        Args:
            output_format: Either 'json' or 'text'
            **kwargs: Additional arguments passed to JSONRenderer

        """
        super().__init__(**kwargs)
        self.output_format = output_format

    def __call__(self, _: WrappedLogger, __: str, event_dict: EventDict) -> str | bytes:
        """Render event dictionary as JSON or plain text depending on settings."""
        if self.output_format == "text":
            return self._render_text(event_dict)
        return self._render_json(event_dict)

    def _make_serializable(self, obj: object) -> object:
        """Recursively convert non-JSON-serializable objects to strings using __repr__."""
        if isinstance(obj, (str, int, float, bool, type(None))):
            return obj
        if isinstance(obj, dict):
            return {k: self._make_serializable(v) for k, v in obj.items()}
        if isinstance(obj, (list, tuple)):
            return [self._make_serializable(item) for item in obj]
        # Try JSON serialization first, fall back to __repr__ if it fails
        try:
            json.dumps(obj)
            return obj
        except (TypeError, ValueError):
            return repr(obj)

    def _render_json(self, event_dict: EventDict) -> str:
        serializable_dict = self._make_serializable(event_dict)
        return str(self._dumps(serializable_dict, **self._dumps_kw))

    def _render_text(self, event_dict: EventDict) -> str:
        """Render event dictionary as plain text."""
        parts = []

        # Add timestamp if available
        if "timestamp" in event_dict:
            parts.append(f"[{event_dict['timestamp']}]")

        # Add log level
        if "level" in event_dict:
            parts.append(f"[{event_dict['level'].upper()}]")

        # Add the main event message
        if "event" in event_dict:
            parts.append(str(event_dict["event"]))

        # Add other fields (excluding timestamp, level, and event)
        excluded_keys = {"timestamp", "level", "event"}
        for key, value in event_dict.items():
            if key not in excluded_keys:
                parts.append(f"{key}={self._make_serializable(value)}")

        return " ".join(parts)


def configure_structlog() -> None:
    """Configure structlog with JSON or text output."""
    settings = get_settings()
    log_level: int = getLevelName(settings.log_level)
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            NexusLogRecordRenderer(output_format=settings.output_format),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(log_level),
        logger_factory=structlog.stdlib.LoggerFactory(),
    )
