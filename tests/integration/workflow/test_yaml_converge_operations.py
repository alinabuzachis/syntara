"""Integration tests for converge operations in workflows.

Tests the converge activity type which waits for multiple activities to complete
and aggregates their outputs.
"""

from collections.abc import Awaitable, Callable
from datetime import timedelta
from typing import Any
from uuid import uuid4

import pytest
from temporalio.client import Client, WorkflowFailureError
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

from nexus.workflows.workflow_engine.dynamic_workflow import DynamicWorkflow
from nexus.workflows.workflow_engine.yaml_workflow_parser import parse_workflow_yaml


class TestConvergeOperations:
    """Test converge activity operations."""

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("workflow_file", "workflow_id", "converge_activity_id", "strategy", "expected_branches", "min_results"),
        [
            (
                "examples/converge/converge-all-strategy.yaml",
                "test-converge-all",
                "converge_all",
                "all",
                ["task1", "task2", "task3"],
                3,
            ),
        ],
    )
    async def test_converge_strategies(
        self,
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
        workflow_file: str,
        workflow_id: str,
        converge_activity_id: str,
        strategy: str,
        expected_branches: list[str] | None,
        min_results: int,
    ) -> None:
        """Test converge with 'all' strategy (the only supported strategy)."""
        result = await run_workflow_from_file(
            workflow_file,
            workflow_id=workflow_id,
        )

        assert result["status"] == "completed"
        assert converge_activity_id in result["activity_outputs"]

        converge_output = result["activity_outputs"][converge_activity_id]
        assert converge_output["type"] == "converge"
        assert converge_output["strategy"] == strategy

        # Verify minimum number of results
        converge_results = converge_output["results"]
        assert len(converge_results) >= min_results

        # If specific branches are expected, verify they exist
        if expected_branches:
            for branch in expected_branches:
                assert branch in converge_results

    @pytest.mark.asyncio
    async def test_converge_with_sequential_activities(
        self,
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test converge after sequential activities complete."""
        result = await run_workflow_from_file(
            "examples/converge/converge-sequential.yaml",
            workflow_id="test-converge-sequential",
        )

        assert result["status"] == "completed"
        converge_output = result["activity_outputs"]["converge_sequential"]

        # All three sequential tasks should be in results
        assert len(converge_output["results"]) == 3
        assert "seq1" in converge_output["results"]
        assert "seq2" in converge_output["results"]
        assert "seq3" in converge_output["results"]

    @pytest.mark.asyncio
    async def test_converge_with_nested_parallel_branches(
        self,
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test converge with nested parallel execution."""
        result = await run_workflow_from_file(
            "examples/converge/converge-nested-parallel.yaml",
            workflow_id="test-converge-nested",
        )

        assert result["status"] == "completed"
        converge_output = result["activity_outputs"]["converge_groups"]

        # All four branches should be present
        assert len(converge_output["results"]) == 4
        assert all(branch in converge_output["results"] for branch in ["branch1a", "branch1b", "branch2a", "branch2b"])

    @pytest.mark.asyncio
    async def test_converge_missing_branch_id(
        self,
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test converge referencing a branch that doesn't exist or hasn't completed."""
        result = await run_workflow_from_file(
            "examples/converge/converge-missing-branch.yaml",
            workflow_id="test-converge-missing-branch",
        )

        # Converge should complete but only include existing branches
        assert result["status"] == "completed"
        converge_output = result["activity_outputs"]["converge_missing"]

        # Only the existing task should be in results
        assert "existing_task" in converge_output["results"]
        assert "nonexistent_task" not in converge_output["results"]

    @pytest.mark.asyncio
    async def test_converge_with_aggregate_outputs(
        self,
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test converge aggregating outputs from multiple branches."""
        result = await run_workflow_from_file(
            "examples/converge/converge-aggregate-outputs.yaml",
            workflow_id="test-converge-aggregate",
        )

        assert result["status"] == "completed"
        converge_output = result["activity_outputs"]["converge_aggregate"]

        # Verify aggregated outputs
        assert "results" in converge_output
        assert len(converge_output["results"]) == 3

        # Each result should have the task output
        for task_id in ["data_task1", "data_task2", "data_task3"]:
            assert task_id in converge_output["results"]
            assert "stdout" in converge_output["results"][task_id]

    @pytest.mark.asyncio
    async def test_converge_validation_missing_converge_definition(
        self,
        temporal_client: Client,
    ) -> None:
        """Test that converge activity fails validation if converge definition is missing."""
        workflow_def = {
            "schemaVersion": "1.0.0",
            "version": 1,
            "metadata": {"name": "invalid-converge", "description": "Test"},
            "triggers": [{"type": "manual"}],
            "workflow": {
                "activities": [
                    {
                        "id": "task1",
                        "type": "task",
                        "task": {"executor": "script", "config": {"language": "bash", "code": "echo test"}},
                    },
                    {
                        "id": "invalid_converge",
                        "type": "converge",
                        # Missing 'converge' definition
                    },
                ]
            },
        }

        # This should fail during workflow execution
        with pytest.raises(WorkflowFailureError):
            await temporal_client.execute_workflow(
                DynamicWorkflow.run,
                args=[workflow_def, "test-exec-001", None],
                id="test-invalid-converge",
                task_queue="nexus-workflow-queue",
                execution_timeout=timedelta(seconds=1),
            )

    @pytest.mark.asyncio
    async def test_converge_with_post_converge_activities(
        self,
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test that activities after converge wait for converge to complete."""
        result = await run_workflow_from_file(
            "examples/converge/converge-with-post-converge-activities.yaml",
            workflow_id="test-converge-post-activities",
        )

        assert result["status"] == "completed"

        # Verify converge completed
        assert "aggregate_data" in result["activity_outputs"]
        converge_output = result["activity_outputs"]["aggregate_data"]
        assert converge_output["type"] == "converge"
        assert converge_output["strategy"] == "all"

        # Verify all parallel tasks completed
        assert "fetch_data_a" in converge_output["results"]
        assert "fetch_data_b" in converge_output["results"]
        assert "fetch_data_c" in converge_output["results"]

        # Verify post-converge activities executed
        assert "process_aggregated_data" in result["activity_outputs"]
        process_output = result["activity_outputs"]["process_aggregated_data"]
        assert "Processing aggregated data from all sources" in process_output["stdout"]
        assert "All parallel tasks have completed" in process_output["stdout"]

        assert "send_notification" in result["activity_outputs"]
        notification_output = result["activity_outputs"]["send_notification"]
        assert "All data fetching and aggregation complete" in notification_output["stdout"]

        # Verify execution order: parallel tasks -> converge -> post-converge activities
        # All parallel tasks should be in activity_outputs
        assert "fetch_data_a" in result["activity_outputs"]
        assert "fetch_data_b" in result["activity_outputs"]
        assert "fetch_data_c" in result["activity_outputs"]

        # The post-converge activities should only execute after converge completes
        # This is implicitly tested by the workflow completing successfully


class TestConvergeTimeout:
    """Test converge timeout behavior."""

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("workflow_file", "workflow_id", "converge_activity_id", "should_fail", "expected_post_converge"),
        [
            (
                "examples/converge/converge-timeout-fail.yaml",
                "test-converge-timeout-fail",
                "converge_with_timeout",
                True,
                None,
            ),
            (
                "examples/converge/converge-timeout-continue.yaml",
                "test-converge-timeout-continue",
                "converge_with_timeout_continue",
                False,
                "post_converge_task",
            ),
        ],
    )
    async def test_converge_timeout_behavior(
        self,
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
        workflow_file: str,
        workflow_id: str,
        converge_activity_id: str,
        *,
        should_fail: bool,
        expected_post_converge: str | None,
    ) -> None:
        """Test converge with timeout behavior (fail vs continue)."""
        if should_fail:
            # Test workflow that should fail on timeout
            with pytest.raises(WorkflowFailureError) as exc_info:
                await run_workflow_from_file(
                    workflow_file,
                    workflow_id=workflow_id,
                    execution_timeout=timedelta(seconds=5),
                )

            # Verify it's a timeout-related failure
            exception = exc_info.value
            found_timeout_error = False
            current: BaseException | None = exception
            while current is not None:
                if isinstance(current, TimeoutError) or "timeout" in str(current).lower():
                    found_timeout_error = True
                    break
                current = getattr(current, "__cause__", None)

            assert found_timeout_error, f"Expected TimeoutError in exception chain, got: {exception}"
        else:
            # Test workflow that should continue on timeout
            result = await run_workflow_from_file(
                workflow_file,
                workflow_id=workflow_id,
                execution_timeout=timedelta(seconds=5),
            )

            assert result["status"] == "completed"

            # Verify converge executed
            assert converge_activity_id in result["activity_outputs"]
            converge_output = result["activity_outputs"][converge_activity_id]

            # Converge should have timed out but continued
            assert converge_output["type"] == "converge"
            assert converge_output["strategy"] == "all"

            # Only fast_task should be in results (slow_task timed out)
            assert "results" in converge_output
            assert "fast_task" in converge_output["results"]

            # Verify post-converge task executed if expected
            if expected_post_converge:
                assert expected_post_converge in result["activity_outputs"]
                post_output = result["activity_outputs"][expected_post_converge]
                assert "Post-converge task executed after timeout" in post_output["stdout"]

    @pytest.mark.asyncio
    async def test_converge_timeout_template_resolution(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,
        temporal_worker: Worker,  # noqa: ARG002
    ) -> None:
        """Test converge timeout template expression resolution.

        This test verifies:
        - Converge timeout can be specified as template expression
        - Template is resolved to actual value before use
        - Workflow executes successfully with resolved timeout
        """
        workflow_yaml = """
schemaVersion: 1.0.0
version: 1
metadata:
  name: converge-timeout-template-test
  description: Test converge timeout with template expression
triggers:
  - type: manual
inputs:
  converge_timeout:
    type: integer
    description: Converge timeout in seconds
workflow:
  activities:
    - id: parallel_tasks
      type: parallel
      branches:
        - id: task1
          type: task
          task:
            executor: script
            config:
              language: bash
              code: echo "Task 1"
        - id: task2
          type: task
          task:
            executor: script
            config:
              language: bash
              code: echo "Task 2"
    - id: converge_with_template_timeout
      type: converge
      converge:
        branches:
          - task1
          - task2
        strategy: all
        timeout: ${input.converge_timeout}
        onTimeout: continue
"""
        workflow_def = parse_workflow_yaml(workflow_yaml)

        # Run workflow with input-specified timeout
        handle = await temporal_client.start_workflow(
            DynamicWorkflow.run,
            args=[
                workflow_def.model_dump(mode="json", by_alias=True),
                "test-converge-template",
                {"converge_timeout": 30},
            ],
            id=f"test-converge-template-{uuid4()}",
            task_queue="test-workflow-queue",
        )

        result = await handle.result()

        # Verify workflow completed successfully
        assert result["status"] == "completed"
        assert "converge_with_template_timeout" in result["activity_outputs"]

        # Verify converge executed with resolved timeout
        converge_output = result["activity_outputs"]["converge_with_template_timeout"]
        assert converge_output["type"] == "converge"
        assert converge_output["strategy"] == "all"
        assert "task1" in converge_output["results"]
        assert "task2" in converge_output["results"]
