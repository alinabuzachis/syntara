"""Unit tests for DynamicWorkflow-specific helper methods.

These tests cover duration parsing, output mappings, and retry policy building.
Expression resolution logic is tested in test_expression_resolver.py.
"""

# ruff: noqa: SLF001
# SLF001: These tests specifically test private methods (_parse_duration, _process_output_mappings, etc.)
# PLR2004: Test assertions use literal values which is standard practice in unit tests
# FBT001: Test parameters include boolean values for parameterized tests

import pytest

from nexus.api.workflows.dynamic_workflow import DynamicWorkflow
from nexus.api.workflows.models.workflow_definition import (
    Activity,
    RetryPolicy,
    TaskDefinition,
)


class TestDurationParsing:
    """Test ISO 8601 duration parsing edge cases."""

    @pytest.mark.parametrize(
        ("duration", "error_match"),
        [
            ("5M", "Invalid ISO 8601 duration"),  # Missing PT prefix
            ("PT5D", "Unsupported duration format"),  # Days not supported
        ],
    )
    def test_parse_duration_invalid(self, duration: str, error_match: str) -> None:
        """Test parsing invalid duration formats raises ValueError."""
        workflow = DynamicWorkflow()

        with pytest.raises(ValueError, match=error_match):
            workflow._parse_duration(duration)

    @pytest.mark.parametrize(
        ("duration", "expected_seconds"),
        [
            ("PT30S", 30),  # Seconds
            ("PT5M", 300),  # Minutes
            ("PT2H", 7200),  # Hours
            ("PT1H30M", 5400),  # Combined hours and minutes
            ("PT1H30M15S", 5415),  # All components
            ("PT90S", 90),  # 90 seconds
        ],
    )
    def test_parse_duration_valid(self, duration: str, expected_seconds: float) -> None:
        """Test parsing valid duration formats."""
        workflow = DynamicWorkflow()
        result = workflow._parse_duration(duration)
        assert result.total_seconds() == expected_seconds


class TestOutputMappings:
    """Test output mapping processing."""

    def test_process_output_mappings_json_parsing(self) -> None:
        """Test output mapping with JSON parsing."""
        workflow = DynamicWorkflow()
        result = {"stdout": '{"key": "value"}', "stderr": "", "return_code": 0}
        mappings = {"parsed": "$.stdout"}

        processed = workflow._process_output_mappings(result, mappings)
        assert processed["output"]["parsed"] == {"key": "value"}

    def test_process_output_mappings_non_json(self) -> None:
        """Test output mapping with non-JSON string."""
        workflow = DynamicWorkflow()
        result = {"stdout": "plain text", "stderr": "", "return_code": 0}
        mappings = {"text": "$.stdout"}

        processed = workflow._process_output_mappings(result, mappings)
        assert processed["output"]["text"] == "plain text"

    def test_process_output_mappings_non_string(self) -> None:
        """Test output mapping with non-string value."""
        workflow = DynamicWorkflow()
        result = {"data": 123, "return_code": 0}
        mappings = {"number": "$.data"}

        processed = workflow._process_output_mappings(result, mappings)
        assert processed["output"]["number"] == 123

    def test_process_output_mappings_missing_field(self) -> None:
        """Test output mapping with missing field."""
        workflow = DynamicWorkflow()
        result = {"stdout": "test", "return_code": 0}
        mappings = {"missing": "$.nonexistent"}

        processed = workflow._process_output_mappings(result, mappings)
        assert "missing" not in processed["output"]


class TestRetryPolicy:
    """Test retry policy building."""

    def test_build_retry_policy_none(self) -> None:
        """Test building retry policy when none configured."""
        workflow = DynamicWorkflow()
        activity = Activity(
            id="test",
            type="task",
            task=TaskDefinition(executor="script", config={"language": "bash", "code": "echo test"}),
        )

        policy = workflow._build_retry_policy(activity)
        assert policy is None

    def test_build_retry_policy_basic(self) -> None:
        """Test building basic retry policy."""
        workflow = DynamicWorkflow()
        activity = Activity(
            id="test",
            type="task",
            task=TaskDefinition(executor="script", config={"language": "bash", "code": "echo test"}),
            retryPolicy=RetryPolicy(maxAttempts=3, initialInterval="PT1S"),
        )

        policy = workflow._build_retry_policy(activity)
        assert policy is not None
        assert policy.maximum_attempts == 3

    def test_build_retry_policy_with_max_interval(self) -> None:
        """Test building retry policy with max interval."""
        workflow = DynamicWorkflow()
        activity = Activity(
            id="test",
            type="task",
            task=TaskDefinition(executor="script", config={"language": "bash", "code": "echo test"}),
            retryPolicy=RetryPolicy(maxAttempts=5, initialInterval="PT1S", maxInterval="PT30S"),
        )

        policy = workflow._build_retry_policy(activity)
        assert policy is not None
        assert policy.maximum_interval is not None

    def test_build_retry_policy_with_exponential_backoff(self) -> None:
        """Test building retry policy with exponential backoff."""
        workflow = DynamicWorkflow()
        activity = Activity(
            id="test",
            type="task",
            task=TaskDefinition(executor="script", config={"language": "bash", "code": "echo test"}),
            retryPolicy=RetryPolicy(maxAttempts=5, initialInterval="PT1S", backoff="exponential", multiplier=2.0),
        )

        policy = workflow._build_retry_policy(activity)
        assert policy is not None
        assert policy.backoff_coefficient == 2.0
