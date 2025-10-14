"""Integration tests for edge cases in workflows.

Tests edge cases including expression resolution, output mapping,
duration parsing, and condition evaluation.
"""

from collections.abc import Awaitable, Callable
from typing import Any

import pytest
from temporalio.client import Client
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker


class TestExpressionResolution:
    """Test expression resolution edge cases."""

    @pytest.mark.asyncio
    async def test_multiple_placeholders(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test resolving expression with multiple ${} placeholders."""
        result = await run_workflow_from_file(
            "examples/edge_cases/expression_resolution.yaml",
            workflow_id="test-expression-resolution",
            inputs={"firstName": "John", "lastName": "Doe"},
        )

        assert result["status"] == "completed"

        # Verify first task resolved multiple placeholders
        task1_output = result["activity_outputs"]["test_multiple_placeholders"]
        assert "Hello, John Doe!" in task1_output["stdout"]

        # Verify variable reference resolution
        task2_output = result["activity_outputs"]["test_variable_reference"]
        assert "Timeout: 30 seconds" in task2_output["stdout"]

        # Verify activity output reference resolution
        task3_output = result["activity_outputs"]["test_activity_output_reference"]
        assert "Previous output was:" in task3_output["stdout"]


class TestOutputMapping:
    """Test output mapping edge cases."""

    @pytest.mark.asyncio
    async def test_json_parsing_in_output_mapping(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test output mapping with JSON parsing."""
        result = await run_workflow_from_file(
            "examples/edge_cases/output_mapping_json.yaml",
            workflow_id="test-output-mapping-json",
        )

        assert result["status"] == "completed"

        # Verify JSON was parsed in output mapping
        generate_output = result["activity_outputs"]["generate_json"]
        assert "parsed_data" in generate_output["output"]
        parsed_data = generate_output["output"]["parsed_data"]
        assert isinstance(parsed_data, dict)
        assert parsed_data["user"] == "Alice"
        assert parsed_data["age"] == 30
        assert parsed_data["active"] is True

        # Verify nested JSON fields were used in subsequent task
        use_output = result["activity_outputs"]["use_parsed_data"]
        assert "User: Alice" in use_output["stdout"]
        assert "Age: 30" in use_output["stdout"]


class TestConditionEvaluation:
    """Test condition evaluation edge cases."""

    @pytest.mark.asyncio
    async def test_condition_comparisons(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test condition evaluation with various comparison operators."""
        result = await run_workflow_from_file(
            "examples/edge_cases/condition_comparisons.yaml",
            workflow_id="test-condition-comparisons",
        )

        assert result["status"] == "completed"

        # All conditions should evaluate to true, so all tasks should execute
        assert "test_numeric_greater_than" in result["activity_outputs"]
        assert "test_numeric_equality" in result["activity_outputs"]
        assert "test_string_inequality" in result["activity_outputs"]
        assert "test_numeric_less_than" in result["activity_outputs"]
        assert "test_numeric_greater_equal" in result["activity_outputs"]
        assert "test_numeric_less_equal" in result["activity_outputs"]

        # Verify none were skipped
        for activity_id in [
            "test_numeric_equality",
            "test_string_inequality",
            "test_numeric_less_than",
            "test_numeric_greater_equal",
            "test_numeric_less_equal",
        ]:
            output = result["activity_outputs"][activity_id]
            assert "skipped" not in output or output["skipped"] is False


class TestRetryPolicy:
    """Test retry policy edge cases."""

    @pytest.mark.asyncio
    async def test_retry_policy_with_exponential_backoff(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test task with retry policy and exponential backoff."""
        result = await run_workflow_from_file(
            "examples/edge_cases/retry_policy.yaml",
            workflow_id="test-retry-policy",
        )

        assert result["status"] == "completed"
        assert "task_with_retry" in result["activity_outputs"]

        task_output = result["activity_outputs"]["task_with_retry"]
        assert "Task executed successfully" in task_output["stdout"]
