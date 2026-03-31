"""Setup logging."""

import json
import logging
from logging import Formatter
from typing import Any

import structlog
from structlog.processors import JSONRenderer
from structlog.typing import (
    EventDict,
    WrappedLogger,
)

from nexus.core.config.base import get_settings

settings = get_settings()


class NexusLogRecordRenderer(JSONRenderer):
    """Renderer that outputs JSON."""

    def __init__(self, **kwargs: Any) -> None:  # noqa: ANN401
        """Initialize renderer.

        Args:
            **kwargs: Additional arguments passed to JSONRenderer

        """
        super().__init__(**kwargs)

    def __call__(self, _: WrappedLogger, __: str, event_dict: EventDict) -> str | bytes:
        """Render event dictionary as JSON."""
        return self._render_json(event_dict)

    def _make_serializable(self, obj: object) -> object:
        """Recursively convert non-JSON-serializable objects to strings using __repr__."""
        if isinstance(obj, str | int | float | bool | type(None)):
            return obj
        if isinstance(obj, dict):
            return {k: self._make_serializable(v) for k, v in obj.items()}
        if isinstance(obj, list | tuple):
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


def build_nexus_shared_formatters() -> list[Any]:
    """Build shared formatters for stdlib logging for structured logs."""
    return [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.ExtraAdder(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.format_exc_info,
    ]


def build_nexus_formatter() -> Formatter:
    """Configure Nexus log formatter."""
    if settings.log_output_format == "text":
        return build_nexus_text_formatter()
    return build_nexus_json_formatter()


def build_nexus_text_formatter() -> Formatter:
    """Build a simple text formatter for plain text logging."""
    return structlog.stdlib.ProcessorFormatter(
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.dev.ConsoleRenderer(colors=False),
        ],
        foreign_pre_chain=build_nexus_shared_formatters(),
    )


def build_nexus_json_formatter() -> Formatter:
    """Build a JSON formatter using NexusLogRecordRenderer."""
    return structlog.stdlib.ProcessorFormatter(
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            NexusLogRecordRenderer(),
        ],
        foreign_pre_chain=build_nexus_shared_formatters(),
    )


def configure_structlog() -> None:
    """Configure structlog and stdlib logging for structured logs."""
    handler = logging.StreamHandler()
    handler.setFormatter(build_nexus_formatter())

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(settings.log_level)

    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            *build_nexus_shared_formatters(),
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
