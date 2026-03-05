"""Unit tests for common activity utilities."""

from datetime import timedelta

import pytest

from nexus.core.exceptions import SafeValueError
from nexus.workflows.workflow_engine.activities.common import (
    DEFAULT_RETRYABLE_ERROR_CODES,
    ActivityExecutionError,
    build_retry_policy,
    extract_error_code,
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
        """Test invalid backoff strategy raises SafeValueError."""
        with pytest.raises(SafeValueError, match="Unsupported backoff strategy"):
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


class TestDefaultRetryableErrorCodes:
    """Test default retryable error codes constant."""

    def test_default_codes_exist(self) -> None:
        """Test that default retryable codes constant is defined."""
        assert DEFAULT_RETRYABLE_ERROR_CODES is not None
        assert isinstance(DEFAULT_RETRYABLE_ERROR_CODES, list)
        assert len(DEFAULT_RETRYABLE_ERROR_CODES) > 0

    def test_default_codes_include_transient_errors(self) -> None:
        """Test that default codes include common transient server errors."""
        # Verify it includes standard transient errors
        assert 500 in DEFAULT_RETRYABLE_ERROR_CODES  # Internal Server Error
        assert 502 in DEFAULT_RETRYABLE_ERROR_CODES  # Bad Gateway
        assert 503 in DEFAULT_RETRYABLE_ERROR_CODES  # Service Unavailable
        assert 504 in DEFAULT_RETRYABLE_ERROR_CODES  # Gateway Timeout
        assert 429 in DEFAULT_RETRYABLE_ERROR_CODES  # Too Many Requests
        assert 408 in DEFAULT_RETRYABLE_ERROR_CODES  # Request Timeout

    def test_default_codes_exclude_client_errors(self) -> None:
        """Test that default codes don't include client errors."""
        # Client errors should NOT be retryable by default
        assert 400 not in DEFAULT_RETRYABLE_ERROR_CODES  # Bad Request
        assert 401 not in DEFAULT_RETRYABLE_ERROR_CODES  # Unauthorized
        assert 403 not in DEFAULT_RETRYABLE_ERROR_CODES  # Forbidden
        assert 404 not in DEFAULT_RETRYABLE_ERROR_CODES  # Not Found


class TestExtractErrorCode:
    """Test error code extraction from error messages."""

    def test_http_status_code_401(self) -> None:
        """Test extraction of HTTP 401 status code."""
        error_msg = "Error code: 401 - {'error': {'message': 'User not found.', 'code': 401}}"
        assert extract_error_code(error_msg) == 401

    def test_http_status_code_with_status_prefix(self) -> None:
        """Test extraction with 'status code' prefix."""
        error_msg = "status code: 404 - Not Found"
        assert extract_error_code(error_msg) == 404

    def test_exit_code_pattern(self) -> None:
        """Test extraction of process exit code."""
        error_msg = "Exit code: 127 - Command not found"
        assert extract_error_code(error_msg) == 127

    def test_exited_with_code_pattern(self) -> None:
        """Test 'exited with code' pattern."""
        error_msg = "Process exited with code 1"
        assert extract_error_code(error_msg) == 1

    def test_exited_without_code_keyword(self) -> None:
        """Test 'exited with' pattern without 'code' keyword."""
        error_msg = "Script exited with 126"
        assert extract_error_code(error_msg) == 126

    def test_code_with_colon(self) -> None:
        """Test simple 'code:' pattern."""
        error_msg = "Failed with code: 500"
        assert extract_error_code(error_msg) == 500

    def test_code_with_equals(self) -> None:
        """Test 'code=' pattern."""
        error_msg = "Error code=503"
        assert extract_error_code(error_msg) == 503

    def test_code_in_json_like_format(self) -> None:
        """Test code in JSON-like format with quotes."""
        error_msg = "AgentError: Execution error: Error code': 403"
        assert extract_error_code(error_msg) == 403

    def test_case_insensitive_matching(self) -> None:
        """Test case-insensitive pattern matching."""
        error_msg = "ERROR CODE: 400"
        assert extract_error_code(error_msg) == 400

    def test_no_error_code_returns_none(self) -> None:
        """Test that messages without error codes return None."""
        error_msg = "Connection timeout"
        assert extract_error_code(error_msg) is None

    def test_first_match_is_returned(self) -> None:
        """Test that first matching code is returned when multiple codes present."""
        error_msg = "Error code: 401 with exit code: 1"
        assert extract_error_code(error_msg) == 401  # First match

    def test_real_world_agent_error(self) -> None:
        """Test extraction from real agent error message."""
        error_msg = (
            "AgentError: Execution error: Error code: 401 - {'error': {'message': 'User not found.', 'code': 401}}"
        )
        assert extract_error_code(error_msg) == 401
