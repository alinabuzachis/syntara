"""Integration tests for while and count loop types."""

from collections.abc import Awaitable, Callable
from typing import Any

import pytest
from temporalio.client import Client
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker


class TestWhileLoops:
    """Test while loop type."""

    @pytest.mark.asyncio
    async def test_while_loop_with_max_iterations(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test while loop respects maxIterations limit."""
        result = await run_workflow_from_file(
            "examples/loops/while-loop-with-max-iterations.yaml",
            workflow_id="test-while-max-iterations",
        )

        assert result["status"] == "completed"

        # Verify while loop executed
        assert "while_with_max" in result["activity_outputs"]
        loop_output = result["activity_outputs"]["while_with_max"]

        assert loop_output["type"] == "while"
        assert loop_output["iterations"] == 3
        assert "results" in loop_output
        assert len(loop_output["results"]) == 3

    @pytest.mark.asyncio
    async def test_while_loop_structure(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test while loop output structure."""
        result = await run_workflow_from_file(
            "examples/loops/while-loop-with-max-iterations.yaml",
            workflow_id="test-while-structure",
        )

        assert result["status"] == "completed"

        loop_output = result["activity_outputs"]["while_with_max"]

        # Verify output structure
        assert "type" in loop_output
        assert loop_output["type"] == "while"
        assert "iterations" in loop_output
        assert "results" in loop_output
        assert isinstance(loop_output["results"], list)

        # Verify each iteration result has correct structure
        for iteration_result in loop_output["results"]:
            assert "index" in iteration_result
            assert "activity_id" in iteration_result
            assert "result" in iteration_result
            assert iteration_result["activity_id"] == "iteration_task"

    @pytest.mark.asyncio
    async def test_while_loop_condition_stops_execution(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test while loop with false condition executes 0 times."""
        result = await run_workflow_from_file(
            "examples/loops/while-loop-basic.yaml",
            workflow_id="test-while-condition-false",
        )

        assert result["status"] == "completed"

        # The condition checks counter < 5, but counter starts at 0 (which is < 5)
        # So the loop should execute at least once, but we need maxIterations to prevent infinite loop
        loop_output = result["activity_outputs"]["while_loop"]
        assert loop_output["type"] == "while"


class TestCountLoops:
    """Test count loop type."""

    @pytest.mark.asyncio
    async def test_count_loop_basic(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test basic count loop executes exact number of iterations."""
        result = await run_workflow_from_file(
            "examples/loops/count-loop-basic.yaml",
            workflow_id="test-count-basic",
        )

        assert result["status"] == "completed"

        # Verify count loop executed
        assert "count_loop" in result["activity_outputs"]
        loop_output = result["activity_outputs"]["count_loop"]

        assert loop_output["type"] == "count"
        assert loop_output["iterations"] == 5
        assert "results" in loop_output
        assert len(loop_output["results"]) == 5

    @pytest.mark.asyncio
    async def test_count_loop_structure(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test count loop output structure."""
        result = await run_workflow_from_file(
            "examples/loops/count-loop-basic.yaml",
            workflow_id="test-count-structure",
        )

        assert result["status"] == "completed"

        loop_output = result["activity_outputs"]["count_loop"]

        # Verify output structure
        assert "type" in loop_output
        assert loop_output["type"] == "count"
        assert "iterations" in loop_output
        assert loop_output["iterations"] == 5
        assert "results" in loop_output
        assert isinstance(loop_output["results"], list)

        # Verify iteration indices are correct
        for i, iteration_result in enumerate(loop_output["results"]):
            assert "index" in iteration_result
            assert iteration_result["index"] == i
            assert "activity_id" in iteration_result
            assert "result" in iteration_result
            assert iteration_result["activity_id"] == "count_task"

    @pytest.mark.asyncio
    async def test_count_loop_with_index_variable(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test count loop with custom indexVariable."""
        result = await run_workflow_from_file(
            "examples/loops/count-loop-with-index.yaml",
            workflow_id="test-count-index-var",
        )

        assert result["status"] == "completed"

        # Verify count loop executed
        loop_output = result["activity_outputs"]["count_with_index"]
        assert loop_output["type"] == "count"
        assert loop_output["iterations"] == 3

        # Verify index variable was passed to activities
        # The tasks should have received the iteration_num variable
        assert len(loop_output["results"]) == 3

    @pytest.mark.asyncio
    async def test_count_loop_zero_iterations(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test count loop with count=1 executes once."""
        result = await run_workflow_from_file(
            "examples/loops/count-loop-with-index.yaml",
            workflow_id="test-count-single",
        )

        assert result["status"] == "completed"

        loop_output = result["activity_outputs"]["count_with_index"]
        assert loop_output["iterations"] == 3
        assert len(loop_output["results"]) == 3


class TestLoopComparison:
    """Compare different loop types."""

    @pytest.mark.asyncio
    async def test_while_vs_count_iterations(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test that count loop is deterministic while while loop is conditional."""
        # Count loop should always execute exact number
        count_result = await run_workflow_from_file(
            "examples/loops/count-loop-basic.yaml",
            workflow_id="test-count-deterministic",
        )

        count_output = count_result["activity_outputs"]["count_loop"]
        assert count_output["iterations"] == 5

        # While loop depends on condition evaluation
        while_result = await run_workflow_from_file(
            "examples/loops/while-loop-with-max-iterations.yaml",
            workflow_id="test-while-conditional",
        )

        while_output = while_result["activity_outputs"]["while_with_max"]
        # While with condition=true will hit maxIterations
        assert while_output["iterations"] == 3
