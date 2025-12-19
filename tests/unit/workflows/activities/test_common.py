"""Unit tests for common activity utilities."""

from datetime import timedelta

import pytest

from nexus.workflows.workflow_engine.activities.common import (
    ActivityExecutionError,
    build_retry_policy,
)


class TestBuildRetryPolicy:
    """Test retry policy building for all strategies."""

    def test_none_config_returns_none(self) -> None:
        """Test that None config returns None policy."""
        policy = build_retry_policy(None)
        assert policy is None

    def test_exponential_backoff_default(self) -> None:
        """Test exponential backoff with default values."""
        policy = build_retry_policy(
            {
                "maxAttempts": 3,
                "backoff": "exponential",
                "initialInterval": 1,
                "maxInterval": 60,
            }
        )
        assert policy is not None
        assert policy.maximum_attempts == 3
        assert policy.initial_interval == timedelta(seconds=1)
        assert policy.maximum_interval == timedelta(minutes=1)
        assert policy.backoff_coefficient == 2.0  # default

    def test_exponential_backoff_custom_multiplier(self) -> None:
        """Test exponential backoff with custom multiplier."""
        policy = build_retry_policy(
            {
                "maxAttempts": 5,
                "backoff": "exponential",
                "initialInterval": 2,
                "maxInterval": 120,
                "multiplier": 3.0,
            }
        )
        assert policy is not None
        assert policy.maximum_attempts == 5
        assert policy.backoff_coefficient == 3.0

    def test_fixed_backoff(self) -> None:
        """Test fixed backoff configuration."""
        policy = build_retry_policy(
            {
                "maxAttempts": 4,
                "backoff": "fixed",
                "initialInterval": 5,
            }
        )
        assert policy is not None
        assert policy.maximum_attempts == 4
        assert policy.initial_interval == timedelta(seconds=5)
        assert policy.maximum_interval == timedelta(seconds=5)  # Same as initial
        assert policy.backoff_coefficient == 1.0  # No growth

    def test_linear_backoff_fallback(self) -> None:
        """Test linear backoff falls back to fixed (Temporal limitation)."""
        policy = build_retry_policy(
            {
                "maxAttempts": 3,
                "backoff": "linear",
                "initialInterval": 1,
                "maxInterval": 10,
            }
        )
        assert policy is not None
        assert policy.maximum_attempts == 3
        # Linear is approximated as fixed (coefficient=1.0)
        assert policy.backoff_coefficient == 1.0

    def test_invalid_strategy_raises_error(self) -> None:
        """Test invalid backoff strategy raises ValueError."""
        with pytest.raises(ValueError, match="Unsupported backoff strategy"):
            build_retry_policy(
                {
                    "maxAttempts": 3,
                    "backoff": "invalid_strategy",
                    "initialInterval": 1,
                }
            )

    def test_default_values_used_when_missing(self) -> None:
        """Test default values are used for missing fields."""
        policy = build_retry_policy({})
        assert policy is not None
        assert policy.maximum_attempts == 3  # default
        assert policy.initial_interval == timedelta(seconds=1)  # PT1S default
        assert policy.maximum_interval == timedelta(minutes=1)  # PT1M default
        assert policy.backoff_coefficient == 2.0  # default multiplier


class TestActivityExecutionError:
    """Test base exception class."""

    def test_exception_inheritance(self) -> None:
        """Test ActivityExecutionError is a subclass of Exception.

        This validates that the exception can be caught as Exception and
        follows Python's exception hierarchy.
        """
        assert issubclass(ActivityExecutionError, Exception)
