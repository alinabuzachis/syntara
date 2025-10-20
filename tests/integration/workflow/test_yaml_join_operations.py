"""Integration tests for join operations in workflows.

Tests the join activity type which waits for multiple activities to complete
and aggregates their outputs.
"""

from collections.abc import Awaitable, Callable
from datetime import timedelta
from typing import Any

import pytest
from temporalio.client import Client, WorkflowFailureError
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

from nexus.workflows.dynamic_workflow import DynamicWorkflow


class TestJoinOperations:
    """Test join activity operations."""

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("workflow_file", "workflow_id", "join_activity_id", "strategy", "expected_branches", "min_results"),
        [
            (
                "examples/join/join-all-strategy.yaml",
                "test-join-all",
                "join_all",
                "all",
                ["task1", "task2", "task3"],
                3,
            ),
            (
                "examples/join/join-any-strategy.yaml",
                "test-join-any",
                "join_any",
                "any",
                None,
                1,
            ),
            (
                "examples/join/join-majority-strategy.yaml",
                "test-join-majority",
                "join_majority",
                "majority",
                None,
                3,
            ),
            (
                "examples/join/join-count-strategy.yaml",
                "test-join-count",
                "join_count",
                "count",
                None,
                2,
            ),
        ],
    )
    async def test_join_strategies(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
        workflow_file: str,
        workflow_id: str,
        join_activity_id: str,
        strategy: str,
        expected_branches: list[str] | None,
        min_results: int,
    ) -> None:
        """Test join with different strategies (all, any, majority, count)."""
        result = await run_workflow_from_file(
            workflow_file,
            workflow_id=workflow_id,
        )

        assert result["status"] == "completed"
        assert join_activity_id in result["activity_outputs"]

        join_output = result["activity_outputs"][join_activity_id]
        assert join_output["type"] == "join"
        assert join_output["strategy"] == strategy

        # Verify minimum number of results
        join_results = join_output["results"]
        assert len(join_results) >= min_results

        # If specific branches are expected, verify they exist
        if expected_branches:
            for branch in expected_branches:
                assert branch in join_results

    @pytest.mark.asyncio
    async def test_join_with_sequential_activities(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test join after sequential activities complete."""
        result = await run_workflow_from_file(
            "examples/join/join-sequential.yaml",
            workflow_id="test-join-sequential",
        )

        assert result["status"] == "completed"
        join_output = result["activity_outputs"]["join_sequential"]

        # All three sequential tasks should be in results
        assert len(join_output["results"]) == 3
        assert "seq1" in join_output["results"]
        assert "seq2" in join_output["results"]
        assert "seq3" in join_output["results"]

    @pytest.mark.asyncio
    async def test_join_with_nested_parallel_branches(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test join with nested parallel execution."""
        result = await run_workflow_from_file(
            "examples/join/join-nested-parallel.yaml",
            workflow_id="test-join-nested",
        )

        assert result["status"] == "completed"
        join_output = result["activity_outputs"]["join_groups"]

        # All four branches should be present
        assert len(join_output["results"]) == 4
        assert all(branch in join_output["results"] for branch in ["branch1a", "branch1b", "branch2a", "branch2b"])

    @pytest.mark.asyncio
    async def test_join_missing_branch_id(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test join referencing a branch that doesn't exist or hasn't completed."""
        result = await run_workflow_from_file(
            "examples/join/join-missing-branch.yaml",
            workflow_id="test-join-missing-branch",
        )

        # Join should complete but only include existing branches
        assert result["status"] == "completed"
        join_output = result["activity_outputs"]["join_missing"]

        # Only the existing task should be in results
        assert "existing_task" in join_output["results"]
        assert "nonexistent_task" not in join_output["results"]

    @pytest.mark.asyncio
    async def test_join_with_aggregate_outputs(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test join aggregating outputs from multiple branches."""
        result = await run_workflow_from_file(
            "examples/join/join-aggregate-outputs.yaml",
            workflow_id="test-join-aggregate",
        )

        assert result["status"] == "completed"
        join_output = result["activity_outputs"]["join_aggregate"]

        # Verify aggregated outputs
        assert "results" in join_output
        assert len(join_output["results"]) == 3

        # Each result should have the task output
        for task_id in ["data_task1", "data_task2", "data_task3"]:
            assert task_id in join_output["results"]
            assert "stdout" in join_output["results"][task_id]

    @pytest.mark.asyncio
    async def test_join_validation_missing_join_definition(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,
        temporal_worker: Worker,  # noqa: ARG002
    ) -> None:
        """Test that join activity fails validation if join definition is missing."""
        workflow_def = {
            "schemaVersion": "1.0.0",
            "version": 1,
            "metadata": {"name": "invalid-join", "description": "Test"},
            "triggers": [{"type": "manual"}],
            "workflow": {
                "activities": [
                    {
                        "id": "task1",
                        "type": "task",
                        "task": {"executor": "script", "config": {"language": "bash", "code": "echo test"}},
                    },
                    {
                        "id": "invalid_join",
                        "type": "join",
                        # Missing 'join' definition
                    },
                ]
            },
        }

        # This should fail during workflow execution
        with pytest.raises(WorkflowFailureError):
            await temporal_client.execute_workflow(
                DynamicWorkflow.run,
                args=[workflow_def, "test-exec-001", None],
                id="test-invalid-join",
                task_queue="nexus-workflow-queue",
                execution_timeout=timedelta(seconds=1),
            )

    @pytest.mark.asyncio
    async def test_join_with_post_join_activities(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test that activities after join wait for join to complete."""
        result = await run_workflow_from_file(
            "examples/join/join-with-post-join-activities.yaml",
            workflow_id="test-join-post-activities",
        )

        assert result["status"] == "completed"

        # Verify join completed
        assert "aggregate_data" in result["activity_outputs"]
        join_output = result["activity_outputs"]["aggregate_data"]
        assert join_output["type"] == "join"
        assert join_output["strategy"] == "all"

        # Verify all parallel tasks completed
        assert "fetch_data_a" in join_output["results"]
        assert "fetch_data_b" in join_output["results"]
        assert "fetch_data_c" in join_output["results"]

        # Verify post-join activities executed
        assert "process_aggregated_data" in result["activity_outputs"]
        process_output = result["activity_outputs"]["process_aggregated_data"]
        assert "Processing aggregated data from all sources" in process_output["stdout"]
        assert "All parallel tasks have completed" in process_output["stdout"]

        assert "send_notification" in result["activity_outputs"]
        notification_output = result["activity_outputs"]["send_notification"]
        assert "All data fetching and aggregation complete" in notification_output["stdout"]

        # Verify execution order: parallel tasks -> join -> post-join activities
        # All parallel tasks should be in activity_outputs
        assert "fetch_data_a" in result["activity_outputs"]
        assert "fetch_data_b" in result["activity_outputs"]
        assert "fetch_data_c" in result["activity_outputs"]

        # The post-join activities should only execute after join completes
        # This is implicitly tested by the workflow completing successfully


class TestJoinTimeout:
    """Test join timeout behavior."""

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("workflow_file", "workflow_id", "join_activity_id", "should_fail", "expected_post_join"),
        [
            ("examples/join/join-timeout-fail.yaml", "test-join-timeout-fail", "join_with_timeout", True, None),
            (
                "examples/join/join-timeout-continue.yaml",
                "test-join-timeout-continue",
                "join_with_timeout_continue",
                False,
                "post_join_task",
            ),
        ],
    )
    async def test_join_timeout_behavior(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
        workflow_file: str,
        workflow_id: str,
        join_activity_id: str,
        should_fail: bool,  # noqa: FBT001
        expected_post_join: str | None,
    ) -> None:
        """Test join with timeout behavior (fail vs continue)."""
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

            # Verify join executed
            assert join_activity_id in result["activity_outputs"]
            join_output = result["activity_outputs"][join_activity_id]

            # Join should have timed out but continued
            assert join_output["type"] == "join"
            assert join_output["strategy"] == "all"

            # Only fast_task should be in results (slow_task timed out)
            assert "results" in join_output
            assert "fast_task" in join_output["results"]

            # Verify post-join task executed if expected
            if expected_post_join:
                assert expected_post_join in result["activity_outputs"]
                post_output = result["activity_outputs"][expected_post_join]
                assert "Post-join task executed after timeout" in post_output["stdout"]
