"""Integration tests for condition activity type with then/else branches."""

from collections.abc import Awaitable, Callable
from typing import Any

import pytest
from temporalio.client import Client
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker


class TestConditionActivity:
    """Test condition activity type with then/else branches."""

    @pytest.mark.asyncio
    async def test_condition_then_branch_executes(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test that then branch executes when condition is true."""
        result = await run_workflow_from_file(
            "examples/condition/basic-condition-then-else.yaml",
            workflow_id="test-condition-then",
            inputs={"age": 25},  # age >= 18, should execute then branch
        )

        assert result["status"] == "completed"

        # Verify then branch executed
        assert "adult_message" in result["activity_outputs"]
        adult_output = result["activity_outputs"]["adult_message"]
        assert "You are an adult" in adult_output["stdout"]
        assert "Access granted" in adult_output["stdout"]

        # Verify else branch did NOT execute
        assert "minor_message" not in result["activity_outputs"]

        # Verify condition activity output structure
        assert "age_check" in result["activity_outputs"]
        condition_output = result["activity_outputs"]["age_check"]
        assert condition_output["type"] == "condition"
        assert condition_output["branch"] == "then"
        assert "adult_message" in condition_output["results"]

    @pytest.mark.asyncio
    async def test_condition_else_branch_executes(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test that else branch executes when condition is false."""
        result = await run_workflow_from_file(
            "examples/condition/basic-condition-then-else.yaml",
            workflow_id="test-condition-else",
            inputs={"age": 15},  # age < 18, should execute else branch
        )

        assert result["status"] == "completed"

        # Verify else branch executed
        assert "minor_message" in result["activity_outputs"]
        minor_output = result["activity_outputs"]["minor_message"]
        assert "You are a minor" in minor_output["stdout"]
        assert "Access denied" in minor_output["stdout"]

        # Verify then branch did NOT execute
        assert "adult_message" not in result["activity_outputs"]

        # Verify condition activity output structure
        assert "age_check" in result["activity_outputs"]
        condition_output = result["activity_outputs"]["age_check"]
        assert condition_output["type"] == "condition"
        assert condition_output["branch"] == "else"
        assert "minor_message" in condition_output["results"]

    @pytest.mark.asyncio
    async def test_condition_with_multiple_then_activities(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test condition with multiple activities in then branch."""
        result = await run_workflow_from_file(
            "examples/condition/condition-with-multiple-branches.yaml",
            workflow_id="test-condition-multi-then",
            inputs={"score": 75},  # score >= 60, should execute then branch
        )

        assert result["status"] == "completed"

        # Verify both then activities executed
        assert "pass_notification" in result["activity_outputs"]
        assert "certificate" in result["activity_outputs"]

        pass_output = result["activity_outputs"]["pass_notification"]
        assert "Congratulations" in pass_output["stdout"]

        cert_output = result["activity_outputs"]["certificate"]
        assert "Certificate generated" in cert_output["stdout"]
        assert "Grade: PASS" in cert_output["stdout"]

        # Verify else activities did NOT execute
        assert "fail_notification" not in result["activity_outputs"]
        assert "retry_info" not in result["activity_outputs"]

    @pytest.mark.asyncio
    async def test_condition_with_multiple_else_activities(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test condition with multiple activities in else branch."""
        result = await run_workflow_from_file(
            "examples/condition/condition-with-multiple-branches.yaml",
            workflow_id="test-condition-multi-else",
            inputs={"score": 45},  # score < 60, should execute else branch
        )

        assert result["status"] == "completed"

        # Verify both else activities executed
        assert "fail_notification" in result["activity_outputs"]
        assert "retry_info" in result["activity_outputs"]

        fail_output = result["activity_outputs"]["fail_notification"]
        assert "Sorry, you did not pass" in fail_output["stdout"]

        retry_output = result["activity_outputs"]["retry_info"]
        assert "You can retake the test" in retry_output["stdout"]

        # Verify then activities did NOT execute
        assert "pass_notification" not in result["activity_outputs"]
        assert "certificate" not in result["activity_outputs"]

    @pytest.mark.asyncio
    async def test_condition_without_else_branch_true(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test condition without else branch when condition is true."""
        result = await run_workflow_from_file(
            "examples/condition/condition-no-else-branch.yaml",
            workflow_id="test-condition-no-else-true",
            inputs={"enable_feature": True},
        )

        assert result["status"] == "completed"

        # Verify then branch executed
        assert "enable_feature" in result["activity_outputs"]
        feature_output = result["activity_outputs"]["enable_feature"]
        assert "Feature enabled" in feature_output["stdout"]
        assert "Initializing feature" in feature_output["stdout"]

    @pytest.mark.asyncio
    async def test_condition_without_else_branch_false(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test condition without else branch when condition is false."""
        result = await run_workflow_from_file(
            "examples/condition/condition-no-else-branch.yaml",
            workflow_id="test-condition-no-else-false",
            inputs={"enable_feature": False},
        )

        assert result["status"] == "completed"

        # Verify then branch did NOT execute
        assert "enable_feature" not in result["activity_outputs"]

        # Verify condition activity shows skipped else
        assert "feature_check" in result["activity_outputs"]
        condition_output = result["activity_outputs"]["feature_check"]
        assert condition_output["type"] == "condition"
        assert condition_output["branch"] == "else"
        assert condition_output.get("skipped") is True

    @pytest.mark.asyncio
    async def test_condition_with_boolean_input(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test condition with boolean input."""
        result = await run_workflow_from_file(
            "examples/condition/condition-no-else-branch.yaml",
            workflow_id="test-condition-boolean",
            inputs={"enable_feature": True},
        )

        assert result["status"] == "completed"
        assert "enable_feature" in result["activity_outputs"]

    @pytest.mark.asyncio
    async def test_condition_output_structure(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test that condition activity output has correct structure."""
        result = await run_workflow_from_file(
            "examples/condition/basic-condition-then-else.yaml",
            workflow_id="test-condition-structure",
            inputs={"age": 20},
        )

        assert result["status"] == "completed"

        # Verify condition output structure
        condition_output = result["activity_outputs"]["age_check"]
        assert "type" in condition_output
        assert condition_output["type"] == "condition"
        assert "branch" in condition_output
        assert condition_output["branch"] in ["then", "else"]
        assert "results" in condition_output
        assert isinstance(condition_output["results"], dict)
