"""Duration calculation utilities for workflow wait nodes."""

from typing import Any


def compute_wait_seconds(config: dict[str, Any]) -> int:
    """Compute total wait duration in seconds from a wait node config dict.

    Args:
        config: Dict with optional keys: days, hours, minutes, seconds.
            Missing keys default to 0.

    Returns:
        Total duration in seconds (may be zero or negative if inputs are invalid).

    """
    days: int = config.get("days", 0)
    hours: int = config.get("hours", 0)
    minutes: int = config.get("minutes", 0)
    seconds: int = config.get("seconds", 0)
    return (days * 86400) + (hours * 3600) + (minutes * 60) + seconds
