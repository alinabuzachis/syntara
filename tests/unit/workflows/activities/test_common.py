"""Unit tests for common activity utilities."""

from datetime import timedelta

import pytest

from nexus.workflows.workflow_engine.activities.common import (
    ActivityExecutionError,
    build_retry_policy,
    parse_timeout,
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
                "initialInterval": "PT1S",
                "maxInterval": "PT1M",
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
                "initialInterval": "PT2S",
                "maxInterval": "PT2M",
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
                "initialInterval": "PT5S",
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
                "initialInterval": "PT1S",
                "maxInterval": "PT10S",
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
                    "initialInterval": "PT1S",
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


class TestParseTimeout:
    """Test ISO 8601 duration parsing."""

    @pytest.mark.parametrize(
        ("duration", "expected_seconds"),
        [
            ("PT30S", 30),  # Seconds only
            ("PT5M", 300),  # Minutes only
            ("PT2H", 7200),  # Hours only
            ("PT1H30M", 5400),  # Hours and minutes
            ("PT1H30M15S", 5415),  # All components
            ("PT90S", 90),  # 90 seconds
            ("PT120M", 7200),  # 120 minutes = 2 hours
        ],
    )
    def test_parse_valid_durations(self, duration: str, expected_seconds: float) -> None:
        """Test parsing valid ISO 8601 duration formats."""
        result = parse_timeout(duration)
        assert result.total_seconds() == expected_seconds

    @pytest.mark.parametrize(
        ("duration", "error_match"),
        [
            ("5M", "Invalid ISO 8601 duration"),  # Missing PT prefix
            ("PT5D", "Invalid ISO 8601 duration"),  # Days not supported
            ("PT", "no time components found"),  # Empty duration
            ("PTXS", "no time components found"),  # Invalid number
        ],
    )
    def test_parse_invalid_durations(self, duration: str, error_match: str) -> None:
        """Test parsing invalid duration formats raises ValueError."""
        with pytest.raises(ValueError, match=error_match):
            parse_timeout(duration)

    @pytest.mark.parametrize(
        ("duration", "unit"),
        [
            ("PT10000H", "hours"),  # Exceeds MAX_DURATION_HOURS (8760)
            ("PT600000M", "minutes"),  # Exceeds MAX_DURATION_MINUTES (525600)
            ("PT40000000S", "seconds"),  # Exceeds MAX_DURATION_SECONDS (31536000)
        ],
    )
    def test_duration_exceeds_maximum(self, duration: str, unit: str) -> None:
        """Test error when duration exceeds maximum for any unit."""
        with pytest.raises(ValueError, match=rf"Duration exceeds maximum.*{unit}"):
            parse_timeout(duration)

    def test_duration_at_max_hours_allowed(self) -> None:
        """Test duration at maximum hours is allowed."""
        # 8760 hours is exactly 1 year, should be allowed
        result = parse_timeout("PT8760H")
        assert result == timedelta(hours=8760)

    def test_duration_zero_not_allowed(self) -> None:
        """Test zero duration raises error."""
        with pytest.raises(ValueError, match="no time components found"):
            parse_timeout("PT0S")

    def test_unlimited_duration_when_limit_is_zero(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test that setting max_duration_* to 0 disables validation (unlimited)."""
        # Monkeypatch the constants module to use unlimited duration limits
        monkeypatch.setattr(
            "nexus.workflows.workflow_engine.constants.MAX_DURATION_HOURS",
            0,
        )
        monkeypatch.setattr(
            "nexus.workflows.workflow_engine.constants.MAX_DURATION_MINUTES",
            0,
        )
        monkeypatch.setattr(
            "nexus.workflows.workflow_engine.constants.MAX_DURATION_SECONDS",
            0,
        )

        # These should now be accepted (previously would raise ValueError)
        result_hours = parse_timeout("PT100000H")  # 100,000 hours
        assert result_hours == timedelta(hours=100000)

        result_minutes = parse_timeout("PT1000000M")  # 1,000,000 minutes
        assert result_minutes == timedelta(minutes=1000000)

        result_seconds = parse_timeout("PT100000000S")  # 100,000,000 seconds
        assert result_seconds == timedelta(seconds=100000000)


class TestActivityExecutionError:
    """Test base exception class."""

    def test_exception_inheritance(self) -> None:
        """Test ActivityExecutionError is a subclass of Exception.

        This validates that the exception can be caught as Exception and
        follows Python's exception hierarchy.
        """
        assert issubclass(ActivityExecutionError, Exception)
