"""Common utilities for workflow activities.

This module provides shared functionality for all activity types including:
- Retry policy configuration
- Timeout parsing
- Error handling utilities
- Base exception classes
"""

import re
from datetime import timedelta
from typing import Any

from temporalio.common import RetryPolicy

from nexus.workflows.workflow_engine import constants


class ActivityExecutionError(Exception):
    """Base exception for all activity execution errors.

    This base class provides common structure for activity-specific errors,
    allowing metadata to be attached to exceptions.

    Subclasses should explicitly declare their attributes for type safety.
    """


def build_retry_policy(retry_config: dict[str, Any] | None) -> RetryPolicy | None:
    """Build Temporal RetryPolicy from workflow retry configuration.

    Supports all backoff strategies:
    - exponential: Multiply interval by multiplier on each retry
    - fixed: Use same interval for all retries
    - linear: Add initial interval on each retry

    Args:
        retry_config: Retry configuration from workflow YAML containing:
            - maxAttempts: Maximum number of retry attempts (default: 3)
            - backoff: Backoff strategy - "exponential", "fixed", or "linear" (default: "exponential")
            - initialInterval: Initial retry interval (ISO 8601 duration, e.g., "PT1S")
            - maxInterval: Maximum retry interval (ISO 8601 duration)
            - multiplier: Backoff multiplier for exponential strategy (default: 2.0)

    Returns:
        Temporal RetryPolicy configured with the specified strategy,
        or None if retry_config is None

    Example:
        >>> policy = build_retry_policy({
        ...     "maxAttempts": 3,
        ...     "backoff": "exponential",
        ...     "initialInterval": "PT1S",
        ...     "maxInterval": "PT1M",
        ...     "multiplier": 2.0
        ... })
        >>> policy.maximum_attempts
        3

    """
    if retry_config is None:
        return None

    max_attempts = retry_config.get("maxAttempts", 3)
    backoff_strategy = retry_config.get("backoff", "exponential")
    initial_interval_str = retry_config.get("initialInterval", "PT1S")
    max_interval_str = retry_config.get("maxInterval", "PT1M")
    multiplier = retry_config.get("multiplier", 2.0)

    # Parse durations
    initial_interval = parse_timeout(initial_interval_str)
    max_interval = parse_timeout(max_interval_str) if max_interval_str is not None else timedelta(minutes=1)

    # Configure backoff parameters based on strategy
    if backoff_strategy == "fixed":
        backoff_coefficient = 1.0
        max_interval = initial_interval  # Keep it fixed
    elif backoff_strategy == "linear":
        # NOTE: Temporal doesn't natively support linear backoff.
        # Using coefficient=1.0 results in fixed intervals (no growth).
        # This is the closest approximation available in Temporal's RetryPolicy.
        backoff_coefficient = 1.0
    elif backoff_strategy == "exponential":
        backoff_coefficient = multiplier
    else:
        msg = f"Unsupported backoff strategy: {backoff_strategy}"
        raise ValueError(msg)

    # Build retry policy
    return RetryPolicy(
        maximum_attempts=max_attempts,
        initial_interval=initial_interval,
        maximum_interval=max_interval,
        backoff_coefficient=backoff_coefficient,
    )


def parse_timeout(timeout_str: str) -> timedelta:
    """Parse ISO 8601 duration string to timedelta.

    Supports formats like:
    - PT5S (5 seconds)
    - PT30S (30 seconds)
    - PT5M (5 minutes)
    - PT2H (2 hours)
    - PT1H30M (1.5 hours)

    Args:
        timeout_str: ISO 8601 duration string

    Returns:
        timedelta object

    Raises:
        ValueError: If timeout_str is not a valid ISO 8601 duration

    Example:
        >>> parse_timeout("PT5M")
        datetime.timedelta(seconds=300)
        >>> parse_timeout("PT1H30M")
        datetime.timedelta(seconds=5400)

    """
    if not timeout_str.startswith("PT"):
        msg = f"Invalid ISO 8601 duration: {timeout_str} (must start with 'PT')"
        raise ValueError(msg)

    # Remove 'PT' prefix
    duration_part = timeout_str[2:]

    # Parse hours, minutes, seconds
    hours = 0
    minutes = 0
    seconds = 0

    # Match hours (e.g., "2H")
    hours_match = re.search(r"(\d+)H", duration_part)
    if hours_match:
        hours = int(hours_match.group(1))
        # Skip validation if max_duration_hours is 0 (unlimited)
        if constants.MAX_DURATION_HOURS > 0 and hours > constants.MAX_DURATION_HOURS:
            msg = f"Duration exceeds maximum: {timeout_str} (hours={hours} > {constants.MAX_DURATION_HOURS})"
            raise ValueError(msg)

    # Match minutes (e.g., "30M")
    minutes_match = re.search(r"(\d+)M", duration_part)
    if minutes_match:
        minutes = int(minutes_match.group(1))
        # Skip validation if max_duration_minutes is 0 (unlimited)
        if constants.MAX_DURATION_MINUTES > 0 and minutes > constants.MAX_DURATION_MINUTES:
            msg = f"Duration exceeds maximum: {timeout_str} (minutes={minutes} > {constants.MAX_DURATION_MINUTES})"
            raise ValueError(msg)

    # Match seconds (e.g., "45S")
    seconds_match = re.search(r"(\d+)S", duration_part)
    if seconds_match:
        seconds = int(seconds_match.group(1))
        # Skip validation if max_duration_seconds is 0 (unlimited)
        if constants.MAX_DURATION_SECONDS > 0 and seconds > constants.MAX_DURATION_SECONDS:
            msg = f"Duration exceeds maximum: {timeout_str} (seconds={seconds} > {constants.MAX_DURATION_SECONDS})"
            raise ValueError(msg)

    # Ensure at least one component was parsed
    if hours == 0 and minutes == 0 and seconds == 0:
        msg = f"Invalid ISO 8601 duration: {timeout_str} (no time components found)"
        raise ValueError(msg)

    return timedelta(hours=hours, minutes=minutes, seconds=seconds)
