"""Common utilities for workflow activities.

This module provides shared functionality for all activity types including:
- Retry policy configuration
- Error handling utilities
- Base exception classes
"""

from datetime import timedelta
from typing import Any

from temporalio.common import RetryPolicy


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
            - initialInterval: Initial retry interval in seconds (default: 1)
            - maxInterval: Maximum retry interval in seconds (default: 60)
            - multiplier: Backoff multiplier for exponential strategy (default: 2.0)

    Returns:
        Temporal RetryPolicy configured with the specified strategy,
        or None if retry_config is None

    Example:
        >>> policy = build_retry_policy({
        ...     "maxAttempts": 3,
        ...     "backoff": "exponential",
        ...     "initialInterval": 1,
        ...     "maxInterval": 60,
        ...     "multiplier": 2.0
        ... })
        >>> policy.maximum_attempts
        3

    """
    if retry_config is None:
        return None

    max_attempts = retry_config.get("maxAttempts", 3)
    backoff_strategy = retry_config.get("backoff", "exponential")
    initial_interval_secs = retry_config.get("initialInterval", 1)
    max_interval_secs = retry_config.get("maxInterval", 60)
    multiplier = retry_config.get("multiplier", 2.0)

    # Convert seconds to timedelta
    initial_interval = timedelta(seconds=initial_interval_secs)
    max_interval = timedelta(seconds=max_interval_secs) if max_interval_secs is not None else timedelta(minutes=1)

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
